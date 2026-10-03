<!-- Space: SA -->
<!-- Parent: Architecture -->
<!-- Parent: Architecture (shared) -->
<!-- Title: Streams and Realtime Progress -->

# Streams and Realtime Progress

Long-running mutations (imports, mass re-label, bulk re-run, validate-and-import flows) should report progress to the user while they run instead of leaving the UI in an indeterminate "Wird ausgeführt..." spinner. The pattern is a **stream command**: the server declares the request as `stream: true`, returns a `Stream<Progress, E, R>`, and the client uses `Command.withDefaultToastStream` to render progress inline in the toast.

Durable workflows that are triggered by a foreground user action should normally expose a progress stream too. If the workflow can take long enough that the user waits for it, or if it performs multiple external steps (external system, mail, storage), model those steps as progress events instead of making the user stare at a generic waiting toast. Use a plain one-shot command only when the workflow is genuinely quick, invisible/background-only, or the user is not expected to wait for it.

Companions:

- [command-pattern.md](./command-pattern.md) — `.fn()` / `CommandButton` baseline.
- [query-shape-list-vs-get.md](./query-shape-list-vs-get.md) — shaping the emitted progress payload.

## Default progress shape

Use `OperationProgress` (`api/src/models/Operations.ts`) when the operation has a known total and processes items:

```ts
export class OperationProgress
  extends S.Opaque<OperationProgress, OperationProgress.Encoded>()(
    S.Struct({
      completed: S.NonNegativeInt,
      total: S.NonNegativeInt
    })
  )
{}
```

Co-located with `Operation` (the persisted record) and the `ImportOperationFailure` / `OperationSuccess` tagged union used for terminal results.

Custom progress shapes are fine when the default `{ completed, total }` doesn't fit (e.g. a phase-string + percentage). The client-side `operationProgress` helper only knows the default shape — if you emit a different shape, write a workflow-specific helper next to it.

## Server: declare the request as a stream

```ts
// api/src/<workflow>/resources/Overview.ts
export class RetryLabel extends Req.Command<RetryLabel>()(
  "RetryLabel",
  {},
  { stream: true, success: OperationProgress }
) {}
```

- `stream: true` flips the request from "single-response RPC" to "stream of responses".
- `success: OperationProgress` is the schema of **each emitted value**, not a single terminal result. The stream ends when the underlying work finishes.
- Query invalidation is derived from recorded repository dependencies. Do **not**
  reintroduce manual `queryInvalidation`, `invalidatesQueries` 4th-args, or
  `InvalidationSet.use` for normal resource refreshes — see
  [command-pattern.md](./command-pattern.md#repository-derived-query-invalidation-is-the-default).
- Repository writes are accumulated independently of per-value RPC metadata and published when the finite HTTP response stream settles. Success, failure, and client interruption all flush writes already performed. The long-lived `/events` SSE stream is deliberately excluded.
- Settlement-only publication is the default. An application can opt into realtime stream publication so accumulated writes drain before every emitted HTTP stream chunk and once more when the stream exits; the option can also be scoped to selected long-running stream routes.
- On the originating client, `makeStreamMutation2` flushes derived write-deps **once** when the first write set is visible on a stream value, then again when the stream settles. Server invalidation keys stay settlement-only — flushing them per chunk refetches live list queries on each emitted item. Screens that must show item-level progress during the open stream should still render the stream payload in-page (a count emitted mid-stream is a batch cursor, not a live counter).

Realtime publication makes other clients converge while a long operation is still running and bounds lost freshness when a stream never reaches a clean terminal state. It also increases SSE traffic and downstream query reloads, exposes intermediate committed states, and ties publication frequency to transport chunks rather than domain transactions. Prefer settlement-only for short streams or all-or-nothing operations. Use realtime mode when intermediate repository writes are intentionally visible and useful; frontend invalidation buffering should still absorb bursts according to each screen's responsiveness needs.

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
      Effect.map((items) => /* return Stream<OperationProgress, E> */)
    )
  )
```

**`Stream.callback` for callback-style emission.** Use when the work runs through an existing service that takes an `onProgress` callback:

```ts
const userImport = (streams: readonly { content: string | File; name: string }[]) => {
  const id = StringId.make()
  return Stream.callback<OperationProgress, InvalidStateError | …, CurrentUser>((queue) =>
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

### Durable workflow progress hubs

Foreground durable workflows that publish live progress by `requestId` should
use an in-memory PubSub hub instead of polling run-state. Keep the wire progress
schema co-located with the resource, but let a small helper own the common
envelope:

```ts
export interface WorkflowTerminalEvent {
  readonly _tag: "Parked"
  readonly requestId: NonEmptyString255
  readonly step: WorkflowStep
  readonly attempt: PositiveInt
  readonly error: string
}

export class WorkflowProgressHub
  extends Context.Service<WorkflowProgressHub>()("WorkflowProgressHub", {
    make: makeProgressHub<
      NonEmptyString255,
      WorkflowProgress,
      WorkflowTerminalEvent
    >()
  })
{
  static Default = Layer.effect(this, this.make)
}
```

The helper exposes:

- `publish({ requestId, progress })` for values sent to the client stream.
- `publishTerminal(event)` for side-channel terminal events such as parked
  retries.
- `subscribe(requestId)` and `subscribeTerminal(requestId)` for controller
  adapters such as `streamRunProgress`.

### Data dependencies from durable workflows

Repository-derived query invalidation relies on the request-scoped
`DataDependencyRecorder`. Durable workflow bodies run in a separate workflow
execution context, so repository writes inside the workflow cannot record into
the HTTP request's recorder directly. Bridge this in the workflow wrapper:

1. Install a hub-backed `DataDependencyRecorder` inside the durable workflow
   body.
2. Publish read/write dependency events keyed by `requestId`, or by the
   workflow execution id when no request id exists.
3. While the caller effect is running, record the matching events into the
   caller's request recorder and let the normal RPC wrapper emit the metadata.
4. When no caller subscription remains, publish the workflow's accumulated
   writes directly when that execution segment settles. This covers discarded,
   suspended, resumed, and otherwise detached workflow execution without also
   publishing a duplicate for an attached caller.

Callers do not pass dependency channels. Stream controllers continue to
subscribe only to progress:

```ts
streamRunProgress({
  prepare,
  subscribe: (requestId) => progressHub.subscribe(requestId),
  done: WorkflowProgressDone.make({})
})
```

Plain one-shot workflow commands use the same bridge. Their dependency metadata
is recorded before `Workflow.execute` returns, so the final RPC response carries
the accumulated writes just like any other command.

The caller bridge is live, not a durable event log. A later subscriber may miss
old progress and dependency metadata, but detached workflow writes also produce
a generic SSE invalidation at execution-segment settlement. This is a cache
invalidation signal, not an ordered domain-event stream: clients refetch current
repository state rather than replaying workflow changes.

### `Operations` service — when the work must outlive the request

A stream command's fiber dies when the client disconnects. For background work that must keep running (and that you want to recover after a reload), wrap it with `Operations.run`:

```ts
// api/src/services/Operations.ts
const op = yield * operations.run(
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

The stream + `Operations.run` are independent — many imports do both: emit progress on the stream **and** persist it so a tab refresh can resume the in-progress operation.

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
  if (p.total === 0) return undefined
  const text = `${p.completed}/${p.total}`
  return { text, percentage: Math.round((p.completed / p.total) * 100) }
}
```

- Returns `undefined` when the stream hasn't emitted yet or has completed — the toast falls back to the default waiting / success / error text.
- Returns `undefined` while `total === 0` — the operation has not discovered a displayable total yet, so the toast stays on the default waiting text instead of showing `0/0`.
- Returns `{ text, percentage }` when the total is known — toast shows `completed/total` with a determinate bar.

For custom progress shapes, write a sibling helper with the same `(result) => Progress | undefined` signature.

### `Command.withDefaultToastStream` and auth retry

The local `Command.withDefaultToastStream` wrapper in `frontend/composables/client.ts` adds auth-retry transparently for both the upstream Effect and each emitted stream value — use the re-exported `Command` from `~/composables/client`, not the raw `baseClient.Command`. The wrapper is already in scope when you import `Command` at the top of a `.vue`.

## Emitting a terminal result alongside progress

Sometimes the stream needs to carry both intermediate progress events **and** a final payload that the client renders differently (a summary card, a CSV download link, a navigation target). Model the emitted value as a **tagged union** so progress and the terminal result are distinguishable on the wire.

### Schema

Co-locate the progress / final tagged structs with the resource and combine them via `S.TaggedUnion`:

```ts
// api/src/<workflow>/resources/Overview.ts
export class ImportProgress
  extends S.Opaque<ImportProgress, ImportProgress.Encoded>()(
    S.TaggedStruct("ImportProgress", {
      completed: S.NonNegativeInt,
      total: S.NonNegativeInt
    })
  )
{}

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
  { stream: true, success: ImportEvent }
) {}
```

Why `S.TaggedUnion` (not `S.Union`):

- Gives free `ImportEvent.guards.ImportProgress(event)` / `ImportEvent.guards.ImportFinal(event)` type guards in templates (see [vue-conventions.md § TaggedUnion type guards in templates](./vue-conventions.md#taggedunion-type-guards-in-templates)).
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
  if (!ImportEvent.guards.ImportProgress(ev)) return undefined // ignore the final on the toast
  if (ev.total === 0) return undefined
  const text = `${ev.completed}/${ev.total}`
  return { text, percentage: Math.round((ev.completed / ev.total) * 100) }
}
```

Page-level wiring:

```ts
const importFinal = ref<ImportFinal | null>(null)

const importFiles = importClient.Import.fn(
  function*(input: typeof importClient.Import.Input) {
    yield* importClient.Import.mutate(input).pipe(
      Stream.tap((ev) =>
        ImportEvent.guards.ImportFinal(ev)
          ? Effect.sync(() => {
            importFinal.value = ev
          })
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

- **Polling `Operations.find(opId)` instead of subscribing to the stream.** The stream already pushes; polling adds latency and load. Only fall back to polling for "page re-opened after refresh, resume where we left off".
- **Relying on query invalidation for in-page progress of a `stream: true` command.** The toast and any page-owned stream ref update per chunk; list queries stay on their last snapshot until the stream settles. If the only CTA lives behind those queries, an externally started job looks stuck until it parks or the page reloads.
- **Stream that never ends on failure.** If you `Stream.callback`, you **must** wire `Effect.onExit` to `Queue.failCause` — otherwise the toast hangs forever on errors.
- **Emitting raw counts as a `number` schema.** Use `OperationProgress` (`{ completed, total }`) so the client renders a determinate bar. Naked numbers force every consumer to invent its own formatter.
- **Forgetting `Effect.ensuring(publish)` / cleanup hooks.** Long imports hold permits (`withPermits(1)`); on failure / cancellation they need to release them or subsequent invocations deadlock.
- **Mixing stream commands and non-stream commands in `Promise.all`.** Stream commands aren't promises; sequence them with `yield*` in a single command body if they must run together.
- **Polling DB / run-state for same-process progress.** When the producing workflow and the subscriber run in the **same process**, push updates through an in-process `PubSub` hub, not by polling run-state or the database. Reserve polling for the cross-process / page-reopened-after-refresh fallback.

## Concrete instances

- `api/src/<workflow>/services/Import.ts` — full import pipeline (`Stream.callback` + `Operations.run` + emailer side channel for failures).
- `api/src/<workflow>/Overview.Controllers.ts` (`RetryLabel`) — `Stream.unwrap` over a query-and-save pipeline.
- `frontend/workflows/<workflow>/components/Import.vue` — client wiring with `Command.withDefaultToastStream({ progress: operationProgress })`.
