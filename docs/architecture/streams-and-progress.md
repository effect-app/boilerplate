# Streams and Realtime Progress

Long-running mutations (imports, mass re-label, bulk re-pick, validate-and-import flows) should report progress to the user while they run instead of leaving the UI in an indeterminate "Wird ausgeführt..." spinner. The pattern is a **stream command**: the server declares the request as `stream: true`, returns a `Stream<Progress, E, R>`, and the client uses `Command.withDefaultToastStream` to render progress inline in the toast.

Companions:
- [command-pattern.md](./command-pattern.md) — `.fn()` / `CommandButton` baseline.
- [query-shape-list-vs-get.md](./query-shape-list-vs-get.md) — shaping the emitted progress payload.

## Default progress shape

Use `OperationProgress` (`api/src/models/Operations.ts`) when the operation has a known total and processes items:

```ts
export class OperationProgress extends S.Opaque<OperationProgress, OperationProgress.Encoded>()(
  S.Struct({
    completed: S.NonNegativeInt,
    total: S.NonNegativeInt
  })
) {}
```

Co-located with `Operation` (the persisted record) and the `ImportOperationFailure` / `OperationSuccess` tagged union used for terminal results.

Custom progress shapes are fine when the default `{ completed, total }` doesn't fit (e.g. a phase-string + percentage). The client-side `operationProgress` helper only knows the default shape — if you emit a different shape, write a workflow-specific helper next to it.

## Server: declare the request as a stream

```ts
// api/src/Mako/Standard/resources/Overview.ts
export class RetryLabel extends Req.Command<RetryLabel>()(
  "RetryLabel",
  {},
  { stream: true, success: OperationProgress },
  (queryKey) => [
    { filters: { queryKey } },
    { filters: { queryKey: makeQueryKey(List) } }
  ]
) {}
```

- `stream: true` flips the request from "single-response RPC" to "stream of responses".
- `success: OperationProgress` is the schema of **each emitted value**, not a single terminal result. The stream ends when the underlying work finishes.
- The fourth argument is the query-invalidation map (see [command-pattern.md § Query invalidation via `clientFor`](./command-pattern.md#query-invalidation-via-clientfor)).

### Controller / service: return a `Stream`

Two patterns cover almost every case:

**`Stream.unwrap` + a long-running Effect that pushes through a queue.** Use when the body that produces progress is already an Effect and only needs to surface progress at known checkpoints:

```ts
RetryLabel: () =>
  Stream.unwrap(
    CurrentUser.get.pipe(
      Effect.flatMap((user) =>
        orderRepo.queryAndSavePure(/* ... */)
      ),
      Effect.tap(() => Invalidation.InvalidationSet.use((_) => _.add(makeQueryKey(List)))),
      Effect.map((items) => /* return Stream<OperationProgress, E> */)
    )
  )
```

**`Stream.callback` for callback-style emission.** Use when the work runs through an existing service that takes an `onProgress` callback:

```ts
const userImport = (streams: readonly { content: string | File; name: string }[]) => {
  const id = StringId.make()
  return Stream.callback<OperationProgress, InvalidStateError | …, CurrentSettings>((queue) =>
    importStream(id, streams, (p) => Effect.sync(() => Queue.offerUnsafe(queue, p)))
      .pipe(
        Effect.tap(/* error post-processing */),
        Effect.ensuring(publish),
        importing.withPermits(1),
        Effect.asVoid,
        Effect.onExit(Exit.match({
          onSuccess: () => Queue.end(queue),
          onFailure: (cause) => Queue.failCause(queue, cause)
        }))
      )
  )
}
```

Key points:
- The work is `Effect.forkChild` / `withPermits(1)` / `forkDaemonReport` so concurrent invocations are bounded.
- `Effect.onExit` translates the underlying Exit into `Queue.end` (success) / `Queue.failCause` (error). Without this the stream never terminates on failure.
- `Effect.ensuring(publish)` flushes any final state regardless of outcome.

### `Operations` service — when the work must outlive the request

A stream command's fiber dies when the client disconnects. For background work that must keep running (and that you want to recover after a reload), wrap it with `Operations.run`:

```ts
// api/src/services/Operations.ts
const op = yield* operations.run(
  (opId) =>
    importEffect(items, (progress) => operations.update(opId, progress))
      .pipe(Effect.withSpan("Import")),
  NonEmptyString2k("Import"),
  importId
)
// op: { id: OperationId, fiber: Fiber<A, E> }
```

`Operations.run`:
- Forks a daemon fiber via `RequestFiberSet.forkDaemonReportUnexpected` (survives request lifetime).
- Persists the operation row via `OperationsRepo` (`addOp`).
- On exit, writes a terminal `OperationSuccess` or `OperationFailure` row via `finishOp`.
- Cleans up rows older than 1 hour on a `Schedule.fixed(Duration.minutes(20))` schedule.

`operations.update(opId, progress)` writes `progress: OperationProgress` to the `Operation` row mid-flight. Clients can either:
- Subscribe to the stream returned by the command for live updates, **or**
- Poll `operations.find(opId)` if the page is re-entered after a refresh.

The stream + `Operations.run` are independent — many imports do both: emit progress on the stream **and** persist it so a tab refresh can pick up the in-progress operation.

## Client: `Command.withDefaultToastStream`

```ts
const retryLabel = overviewClient.RetryLabel.mutate.wrap()(
  Command.withDefaultToastStream({ progress: operationProgress })
)
```

```vue
<CommandButton :command="retryLabel" />
```

- `.mutate.wrap()` is the right entry for passthrough streams (no extra side effects). For streams that need confirmation / navigation, use `.fn()` and `yield* …mutate` inside a generator — the generator returns the stream and `Command.withDefaultToastStream` consumes it.
- `Command.withDefaultToastStream` accepts the same options as `Command.withDefaultToast` plus a `progress` mapper.
- `progress: operationProgress` reads the emitted value out of the `AsyncResult` and renders it as toast text + a progress bar.

### The `operationProgress` helper

```ts
// frontend/utils/operationProgress.ts
type Progress = string | { readonly text: string; readonly percentage: number }

export function operationProgress<A, E>(
  result: AsyncResult.AsyncResult<A, E>
): Progress | undefined {
  if (!AsyncResult.isSuccess(result) || !result.waiting) return undefined
  const p = result.value
  if (!isOperationProgress(p)) return undefined
  const text = `${p.completed}/${p.total}`
  return p.total === 0 ? text : { text, percentage: Math.round((p.completed / p.total) * 100) }
}
```

- Returns `undefined` when the stream hasn't emitted yet or has completed — the toast falls back to the default waiting / success / error text.
- Returns a string when `total === 0` (unbounded progress) — toast shows the text without a bar.
- Returns `{ text, percentage }` when the total is known — toast shows a determinate bar.

For custom progress shapes, write a sibling helper with the same `(result) => Progress | undefined` signature.

### `Command.withDefaultToastStream` and auth retry

The local `Command.withDefaultToastStream` wrapper in `frontend/composables/client.ts` adds auth-retry transparently for both the upstream Effect and each emitted stream value — use the re-exported `Command` from `~/composables/client`, not the raw `baseClient.Command`. The wrapper is already in scope when you import `Command` at the top of a `.vue`.

## Emitting a terminal result alongside progress

Sometimes the stream needs to carry both intermediate progress events **and** a final payload that the client renders differently (a summary card, a CSV download link, a navigation target). Model the emitted value as a **tagged union** so progress and the terminal result are distinguishable on the wire.

### Schema

Co-locate the progress / final tagged structs with the resource and combine them via `S.TaggedUnion`:

```ts
// api/src/Mako/Standard/resources/Overview.ts
export class ImportProgress extends S.Opaque<ImportProgress, ImportProgress.Encoded>()(
  S.TaggedStruct("ImportProgress", {
    completed: S.NonNegativeInt,
    total: S.NonNegativeInt
  })
) {}

export class ImportFinal extends S.Opaque<ImportFinal, ImportFinal.Encoded>()(
  S.TaggedStruct("ImportFinal", {
    importedCount: S.NonNegativeInt,
    skippedCount: S.NonNegativeInt,
    issues: S.Array(OperationResultImportIssue).withConstructorDefault,
    operationId: OperationId
  })
) {}

export const ImportEvent = S.TaggedUnion([ImportProgress, ImportFinal])
export type ImportEvent = S.Schema.Type<typeof ImportEvent>

export class Import extends Req.Command<Import>()(
  "Import",
  { files: S.NonEmptyArray(FileInput) },
  { stream: true, success: ImportEvent },
  (queryKey) => [{ filters: { queryKey } }, { filters: { queryKey: makeQueryKey(List) } }]
) {}
```

Why `S.TaggedUnion` (not `S.Union`):
- Gives free `ImportEvent.isA.ImportProgress(event)` / `ImportEvent.isA.ImportFinal(event)` type guards in templates (see [vue-conventions.md § TaggedUnion type guards in templates](./vue-conventions.md#taggedunion-type-guards-in-templates)).
- Makes the discriminator a real field on the wire, not a positional assumption.
- Extending the union (a third event tag) is a local change — no `_tag === "..."` chains to update.

### Server: emit progress, then exactly one final

```ts
Import: ({ files }) =>
  Stream.callback<ImportEvent, ImportFailure | …, R>((queue) =>
    Effect.gen(function*() {
      const opId = yield* operations.addOp(StringId.make(), "Import", makeImportId(files))

      let completed = 0
      const total = files.reduce((sum, f) => sum + estimateRows(f), 0)

      const { issues, importedCount, skippedCount } = yield* importFiles(files, {
        onProgress: (delta) => Effect.sync(() => {
          completed += delta
          Queue.offerUnsafe(queue, ImportProgress.make({ completed, total }))
        })
      })

      Queue.offerUnsafe(queue, ImportFinal.make({
        importedCount,
        skippedCount,
        issues,
        operationId: opId
      }))
    }).pipe(
      Effect.onExit(Exit.match({
        onSuccess: () => Queue.end(queue),
        onFailure: (cause) => Queue.failCause(queue, cause)
      }))
    )
  )
```

Invariant: emit zero-or-more `ImportProgress`, then **exactly one** `ImportFinal`, then `Queue.end`. If the work fails, `Queue.failCause` short-circuits — don't emit a synthetic `ImportFinal` with an error count, surface the failure as a typed error on the stream's `E` channel instead.

### Client: split the stream into progress + final ref

`Command.withDefaultToastStream` only knows about progress shapes. For a union, write a small splitter so the toast keeps showing `{ completed, total }` while a ref holds the final result for the page to render.

```ts
// frontend/utils/operationProgress.ts (or a sibling file co-located with the page)
export function importProgress<E>(
  result: AsyncResult.AsyncResult<ImportEvent, E>
): Progress | undefined {
  if (!AsyncResult.isSuccess(result) || !result.waiting) return undefined
  const ev = result.value
  if (!ImportEvent.isA.ImportProgress(ev)) return undefined  // ignore the final on the toast
  const text = `${ev.completed}/${ev.total}`
  return ev.total === 0 ? text : { text, percentage: Math.round((ev.completed / ev.total) * 100) }
}
```

Page-level wiring:

```ts
const importFinal = ref<ImportFinal | null>(null)

const importFiles = importClient.Import.fn(
  function*(input: typeof importClient.Import.Input) {
    yield* importClient.Import.mutate(input).pipe(
      Stream.tap((ev) =>
        ImportEvent.isA.ImportFinal(ev)
          ? Effect.sync(() => { importFinal.value = ev })
          : Effect.void
      ),
      Stream.runDrain
    )
  },
  Command.withDefaultToastStream({ progress: importProgress })
)
```

Template renders the final summary when present, using the TaggedUnion guard for the field-level type narrowing:

```vue
<CommandButton :command="importFiles" :input="{ files }" />

<v-card v-if="importFinal">
  <div>Imported: {{ importFinal.importedCount }}</div>
  <div>Skipped: {{ importFinal.skippedCount }}</div>
  <ImportIssueList :issues="importFinal.issues" />
  <v-btn :to="`/import/${importFinal.operationId}`">Details</v-btn>
</v-card>
```

### Rules of thumb

- **One final per run.** If you find yourself wanting two terminal events, add a third tag and a state machine, don't fire two `ImportFinal`s.
- **Don't conflate progress and final shape.** Sharing fields between `ImportProgress` and `ImportFinal` (e.g. both carry `completed`) tempts consumers to read them generically — keep them disjoint so the type guard does its job.
- **Errors on the `E` channel, not as a tag.** A `ImportFailed` member of the union is wrong: the stream's failure channel already models that, and putting it in the success union breaks toast / error reporting in `withDefaultToastStream`.
- **Final ref lives on the page, not in the command.** The command body uses `Stream.tap` to write into a page-owned ref. Don't try to make the command's `result` carry the final — `result` reflects the whole stream, not the last emitted value.

## When to reach for a stream command

- The work takes more than ~3 seconds and has a meaningful "progress" the user benefits from seeing.
- The work emits intermediate results the user reads (validation errors per row, import summaries per file).
- The work must run to completion **even if the user navigates away** — pair the stream with `Operations.run` so the row persists.

For sub-second mutations, plain `.fn()` + `Command.withDefaultToast()` is fine — adding a stream just costs an extra round-trip and a flickering progress bar.

## Anti-patterns

- **Polling `Operations.find(opId)` instead of subscribing to the stream.** The stream already pushes; polling adds latency and load. Only fall back to polling for "page re-opened after refresh, pick up where we left off".
- **Stream that never ends on failure.** If you `Stream.callback`, you **must** wire `Effect.onExit` to `Queue.failCause` — otherwise the toast hangs forever on errors.
- **Emitting raw counts as a `number` schema.** Use `OperationProgress` (`{ completed, total }`) so the client renders a determinate bar. Naked numbers force every consumer to invent its own formatter.
- **Forgetting `Effect.ensuring(publish)` / cleanup hooks.** Long imports hold permits (`withPermits(1)`); on failure / cancellation they need to release them or subsequent invocations deadlock.
- **Mixing stream commands and non-stream commands in `Promise.all`.** Stream commands aren't promises; sequence them with `yield*` in a single command body if they must run together.

## Concrete instances

- `api/src/Mako/services/Import.ts` — full import pipeline (`Stream.callback` + `Operations.run` + emailer side channel for failures).
- `api/src/services/PickImport.ts` — OnePick / MultiPick validate-and-import (`operations.run` + per-item `operations.update`).
- `api/src/Mako/Standard/Overview.Controllers.ts` (`RetryLabel`) — `Stream.unwrap` over a queryAndSave pipeline.
- `frontend/workflows/mako/components/StandardImport.vue`, `frontend/workflows/empasa/components/Manufacturing/Import.vue`, `frontend/workflows/easy-life/components/Import.vue` — client wiring with `Command.withDefaultToastStream({ progress: operationProgress })`.
