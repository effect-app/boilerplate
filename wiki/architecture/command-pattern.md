<!-- Space: SA -->
<!-- Parent: Architecture -->
<!-- Parent: Architecture (shared) -->
<!-- Title: Command Pattern for Mutations -->

# Command Pattern for Mutations

Use a Command for any user-triggered mutation that needs loading state, confirmation, toasts, or side effects after the write. The Command encapsulates **the whole procedure from start to finish** — confirmation, mutation, success-side state changes, navigation.

Companions:

- [command-input-validation.md](./command-input-validation.md) — gate the trigger at the caller; command body assumes valid input.
- [list-layout.md](./list-layout.md) — per-item commands inside the body slot.

## Core rule: compose Effects, not Commands

Commands are **not** designed to be composable. They model a single user intent end-to-end. If you find yourself wanting to chain `.handle()` calls, **extract the shared step as an Effect / function / mutation** and `yield*` it inside each command body. Don't wrap one command in another.

```ts
// BAD — composing commands
const closeAndNotify = () => {
  cmdClose.handle()
  cmdNotify.handle()
}

// GOOD — extract the shared work as Effects, compose them inside one command
const closeAndNotify = client.Close.fn(
  function*(input) {
    yield* client.Close.mutate(input)
    yield* notifyEffect(input.id)
  },
  Command.withDefaultToast()
)
```

## Fundamental rules

1. **`.handle()` is fire-and-forget.** Returns a `RuntimeFiber`, not a `Promise`. Never `await` it, never `.then()` it.
2. **No wrapper functions around `.handle()`.** The button event binds to `.handle()` directly, or use `CommandButton`. Wrappers lose loading state and produce "assumed success" patterns (state reset before mutation succeeds). For the narrow set of cases where a wrapper is unavoidable, see [§ When `.handle()` in a wrapper is acceptable](#when-handle-in-a-wrapper-is-acceptable).
3. **Side effects live inside the command body.** Closing dialogs, resetting refs, navigation — all `yield*`'d after the mutation. They only run on success.
4. **`CommandButton` is the default trigger.** Manual `<v-btn>` with `:loading="cmd.waiting" :disabled="cmd.blocked" @click="cmd.handle(…)"` is a last-resort fallback (form submits, non-button elements).
5. **No `run()`, no `Promise`, no `async/await`.** Think `Effect.gen` / `Effect.fn` and `yield*`.

## Red flags in code review

- `await cmd.handle(...)` — Fiber, not Promise.
- `.then()` anywhere in command code.
- `run(client.X(...))` — should be a command.
- `.handle()` that is **not** the only statement in an event chain. 99% of the time it's the first **and** last call. State mutations after it = assumed success.
- State mutations outside the command body (closing dialogs, resetting refs in the click handler).
- `<v-btn>` with `:loading="cmd.waiting"` / `:disabled="cmd.blocked"` / `@click="cmd.handle(...)"` that could be `<CommandButton>`.
- Hardcoded text between `<CommandButton>…</CommandButton>` when an intl label exists (self-close: `<CommandButton … />`).

## `.fn()` vs `.mutate.wrap()`

| Use                                             | Form                                                   | Why                                                                                |
| ----------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| Side effects, confirmation, post-mutation logic | `.fn(function*() { ... }, Command.withDefaultToast())` | Generator reads top-to-bottom; sync code doesn't need `Effect.sync(...)` wrapping. |
| Simple passthrough — no custom logic            | `.mutate.wrap(Command.withDefaultToast())`             | One-liner, no body needed.                                                         |

```ts
// GOOD: passthrough
const createAndNotify = itemsClient.CreateItem.mutate.wrap(
  Command.withDefaultToast()
)

// GOOD: side effects
const reset = meClient.Reset.fn(
  function*() {
    yield* meClient.Reset.mutate
    window.location.reload()
  },
  Command.withDefaultToast()
)
```

Prefer generators over combinator chains (`Effect.tap`, `Effect.andThen`, `Effect.flatMap`). Generators are linear and don't need `Effect.sync(...)` for plain assignments.

## Command shape

Commands returned by `.fn()` / `.mutate.wrap()` expose:

```ts
{
  handle: ;
  ;((arg: I) => RuntimeFiber) // fire-and-forget
  waiting: ComputedRef<boolean> // this command is executing → :loading
  blocked: ComputedRef<boolean> // this command OR a related one is executing → :disabled
  result: ComputedRef<Result<A, E>> // last execution outcome
  allowed: ComputedRef<boolean> // gate via `allowed()` option; CommandButton hides when false
  action: ComputedRef<string> // i18n action label
  label: ComputedRef<string> // i18n button label
}
```

### `waiting` vs `blocked`

- `waiting` → **this** command is running. Use for `:loading` (spinner on the clicked button only).
- `blocked` → this command **or any related command** is running. Use for `:disabled` (block overlapping actions).

Share blocking across related commands via `blockKey` / `waitKey` options. `CommandButton` already wires `waiting`/`blocked` — don't re-bind them manually.

### Options

```ts
{
  state?:        () => State                    // snapshot at invocation; injected into i18n vars
  waitKey?:      (id: string, ...args) => string // share waiting state across commands
  blockKey?:     (id: string, ...args) => string // share disabled state across commands
  allowed?:      () => boolean                  // permission gate; CommandButton hides when false
  i18nCustomKey?: string                        // override the i18n key
}
```

`state` is captured at `.handle()` time and frozen for the duration. It's also surfaced in i18n messages as template variables, so a single action key can render different toasts depending on context:

```ts
"action.OrderList.UpdateStatus":
  "{mode, select, single {Set status} all {Reset all statuses} other {Update status}}"
```

`waitKey`/`blockKey` with dynamic keys enable per-item state in lists (see `Command.family()` below).

## `CommandButton`

Self-closing, label-from-intl is the default form:

```vue
<!-- GOOD -->
<CommandButton :command="myCommand" :input="inputValue" color="primary" />

<!-- BAD: hardcoded text overrides the intl label -->
<CommandButton :command="myCommand" :input="inputValue">Apply</CommandButton>

<!-- BAD: re-binding what CommandButton already handles -->
<CommandButton :command="cmd" :disabled="cmd.blocked" :loading="cmd.waiting" />

<!-- GOOD: :disabled for *additional* conditions only -->
<CommandButton :command="importFiles" :input="files" :disabled="files.length === 0" />
```

- Accepts all `v-btn` props (`variant`, `color`, `size`, `block`).
- Icon-only: pass `empty`.
  ```vue
  <CommandButton
    :command="updateStatus"
    :input="{ orderId, action }"
    :icon="mdiSwapVertical"
    size="x-small"
    empty
  />
  ```
- Optional input (command may take args or none): pass `:input="undefined"` and make the generator parameter optional.

### Accessibility

`CommandButton` uses `aria-disabled`, not the native `disabled` attribute. Clicks on a disabled button are silently ignored at the component level (intentional accessibility choice).

### Visibility gate

If `allowed: () => …` is set in command options, `CommandButton` renders nothing when it returns `false`. No `v-if` needed in the template.

### `CommandButton` does NOT emit `@success`

`@success="..."` on `CommandButton` is **silently ignored**. Move post-mutation side effects inside the command body — they only run on success there anyway, which is what you usually wanted.

```ts
// GOOD — only reached when the mutation succeeded
const cmd = client.Action.fn(
  function*(input) {
    yield* client.Action.mutate(input)
    dialogOpen.value = false
  },
  Command.withDefaultToast()
)
```

### Manual `<v-btn>` binding (last resort)

Form submit buttons or non-button elements (cards, rows) sometimes need manual binding. Always split `:loading` and `:disabled`:

```vue
<v-btn :loading="cmd.waiting" :disabled="cmd.blocked" @click="cmd.handle({ input })">
  {{ cmd.label }}
</v-btn>
```

For non-button clickable containers, conditional `v-on` is correct — it controls cursor (pointer vs default), which `:disabled` alone doesn't:

```vue
<v-card :disabled="cmd.blocked" v-on="canClick ? { click: () => cmd.handle(args) } : {}" />
```

## Confirmation

Prefer `Command.confirmOrInterrupt()` — uses the command's i18n action name as the default title:

```ts
const pause = orderClient.Pause.fn(
  function*(input) {
    yield* Command.confirmOrInterrupt() // uses i18n action label
    yield* orderClient.Pause.mutate(input)
  },
  Command.withDefaultToast()
)

const deleteUser = userClient.DeleteUser.fn(
  function*() {
    yield* Command.confirmOrInterrupt("Really delete user?") // custom message
    yield* userClient.DeleteUser.mutate({ userId })
  },
  Command.withDefaultToast()
)
```

Custom-button dialogs use `alertAddEffectOrInterrupt`:

```ts
yield * alertAddEffectOrInterrupt(
  { title: "Delete?", body: "This cannot be undone." },
  { name: "Delete", color: "red", returnValue: true },
  { name: "Cancel", color: "grey", returnValue: false }
)
```

`confirmDialogOrInterrupt(body, title)` is the legacy two-arg form — still works, but prefer `Command.confirmOrInterrupt` for new code.

## Error handling

`Effect.catchTag` for specific errors:

```ts
const toggle = Command.fn("toggleFavorite", {
  state: () => ({ isFavorite: isFavorite.value })
})(function*(_, { state }) {
  if (state.isFavorite) {
    yield* client.Remove({ tickerId }).pipe(
      Effect.catchTag("NotFoundError", () => Effect.void)
    )
  } else {
    yield* client.Add({ tickerId })
  }
})
```

## Service-based tools inside command bodies

Effect services — `Router.push`, `I18n.formatMessage`, `Toast`, `Command` — are available natively. No hook imports, no `Effect.promise` wrapping:

```ts
const claim = itemClient.Claim.fn(
  function*() {
    yield* itemClient.Claim.mutate
    yield* Router.push({ name: "my-list" })
  },
  Command.withDefaultToast()
)
```

## `Command.family()` — per-item commands in lists

When you render commands in a `v-for` loop and need independent loading/disabled state per item, use `Command.family()`. It memoises a command instance per key (WeakMap with structural arg compare; GC'd when unreferenced).

```ts
const deleteUser = Command.family((userId: UserId) =>
  Command.fn(deleteUserByIdMutation)(
    function*() {
      yield* Command.confirmOrInterrupt("Really delete user?")
      yield* deleteUserByIdMutation({ userId })
    },
    Command.withDefaultToast()
  )
)
```

```vue
<CommandButton :command="deleteUser(item.id)" />
```

Without `family()`, every row shares the same `waiting`/`blocked` — clicking one row spins all rows.

## `stableToastId` — replace, don't stack

Replace previous toasts instead of stacking them — useful for inline-edit fields that fire repeatedly:

```ts
Command.fn(updateMutation, { waitKey: (id) => `${id}.${item}.name` })(
  function*() {
    yield* updateMutation(item, { name: newName })
  },
  Command.withDefaultToast({ stableToastId: (id) => `${id}.${item}.name` })
)
```

- `stableToastId: true` — uses the command id.
- `stableToastId: string` — fixed id.
- `stableToastId: (id, ...args) => string` — dynamic.

## `withDefaultToast` options

```ts
Command.withDefaultToast({
  stableToastId?: string | true | ((id, ...args) => string | undefined)
  errorRenderer?: (error, action, ...args) => string | undefined
  onWaiting?:     null | string | ((id, ...args) => string | null)   // null suppresses waiting toast
  onSuccess?:     null | string | ((result, action, ...args) => string | null) // null suppresses success
})
```

Defaults (in `frontend/composables/intl.ts`):

- `handle.waiting` → `"Running..."`
- `handle.success` → `"{action} succeeded"`
- `handle.with_errors` → `"{action} failed"`
- `handle.confirmation` → `"Confirm: {action}?"`

## Standalone `Command.fn(mutation)` / `useAllowed`

When you don't have a `client.Action.fn(...)` (e.g. composing mutations from hooks), pass the mutation as the first arg so the command inherits its id/type context:

```ts
const deleteUser = Command.fn(deleteUserByIdMutation)(
  function*() {
    yield* Command.confirmOrInterrupt("Are you sure?")
    yield* deleteUserByIdMutation({ userId })
  },
  Command.withDefaultToast()
)
```

For permission-gated commands, use `useAllowed().allowed(...)` as a separate `v-if`:

```ts
const retryLabelIsAllowed = useAllowed().allowed(OverviewRsc.RetryLabel)
const retryLabel = overviewClient.RetryLabel.fn(
  function*(input) {
    yield* overviewClient.RetryLabel.mutate(input)
  },
  Command.withDefaultToast()
)
```

```vue
<CommandButton v-if="retryLabelIsAllowed" :command="retryLabel" :input="…" />
```

The legacy `useAllowed().addIsAllowedToMutation(...)` wrapper around `useAndHandleMutation` is retired.

## When `.handle()` in a wrapper is acceptable

The rule "no wrapper functions around `.handle()`" has narrow, well-defined exceptions:

- **Drag-and-drop handlers.** Clearing drag refs via `onDragEnd()` before `.handle()` is plumbing, not assumed-success state.
- **Reactive watchers** (`watch(...)`). No click event to bind a `CommandButton` to.
- **Debounced operations.** `_.debounce(() => cmd.handle(input), 500)` — can't use `CommandButton`.
- **Called from inside another command body.** Almost always wrong — extract the shared step as an Effect instead (see [§ Core rule](#core-rule-compose-effects-not-commands)). Acceptable only when the inner call truly is its own user-intent that happens to fire from inside another command.
- **Form submit handlers.** Bound to `<v-form @submit.prevent="onSubmit">` because the event source is the form, not a button.

```ts
const onSubmit = () => {
  if (!isFormValid.value) return // local validation guard OK
  createPortfolio.handle({ input: formStore.value })
}
```

The wrappers that **aren't** acceptable are the ones that exist only to mutate refs around `.handle()` (close dialog, reset form, build input from refs). Push that logic into the command body.

## Input shape: prefer validated input over reading refs in the body

The rule lives in [command-input-validation.md](./command-input-validation.md): a gating computed types the command input, the trigger is hidden/disabled when input is incomplete, and the body works with the narrow validated type.

Two genuine reasons to read a ref **inside** the body instead:

1. **Page-stable refs** (`props.order.id`, `effectiveRegion`). Stable for the page lifetime; the user isn't filling them in. Keep the `:input` payload focused on the user's actual choice.
2. **Non-UI triggers** — external event handlers, SSE events, job retries — where the caller can't pre-validate. Surface a typed `InvalidStateError` instead of a silent `return`.

Reading user-filled form refs in the body (`selectedItem.value`, `quantity.value`) is **not** in this list. Push the gating into the child component and have it emit the full payload — see the "Dialogs and child components: emit the full payload" section of `command-input-validation.md`.

## `.fn()` TypeScript gotchas

### Input type annotation

Use `typeof client.Action.Input`:

```ts
const addOrder = orderClient.AddOrder.fn(
  function*(input: typeof orderClient.AddOrder.Input) {
    yield* orderClient.AddOrder.mutate(input)
    yield* Router.push({ name: "my-list" })
  },
  Command.withDefaultToast()
)
```

### Void-input commands

Omit the parameter; call `.handle()` with no args (not `.handle({})`):

```ts
const claim = itemClient.Claim.fn(
  function*() {
    yield* itemClient.Claim.mutate
    yield* Router.push({ name: "my-list" })
  },
  Command.withDefaultToast()
)
// template: @click="claim.handle()"
```

### Baking page-stable input into the body

When the input is page-stable (a prop), bake it in and let `.handle()` take no args:

```ts
const retryLabel = orderClient.RetryLabel.fn(
  function*() {
    yield* orderClient.RetryLabel.mutate({
      id: props.item.orderId
    })
    yield* props.getOrder
  },
  Command.withDefaultToast()
)
// template: @click="retryLabel.handle()"
```

This is the "page-stable ref" exception above, not "read form state in body".

## Sequential mutations in a loop

`yield*` in a `for` loop replaces the old `await run(exec(...))` chain:

```ts
const markDoneCmd = itemClient.MarkDone.fn(
  function*(position: number) {
    if (markAll.value) {
      for (const a of latestItems.value.tasks) {
        yield* itemClient.MarkDone.mutate({
          itemId: a.itemId,
          position: S.NonNegativeInt(position)
        })
      }
      markAll.value = false
    } else {
      yield* itemClient.MarkDone.mutate({
        itemId: selectedItem.value!.itemId,
        position: S.NonNegativeInt(position)
      })
    }
    showDetailDialog.value = false
  },
  Command.withDefaultToast()
)
```

## Streams and realtime progress

For long-running mutations (imports, bulk re-label, bulk re-run) declare the request as a **stream command** on the server and use `Command.withDefaultToastStream` on the client. The toast updates in place with the progress; the mutation completes when the stream ends.

See [streams-and-progress.md](./streams-and-progress.md) for the full pattern, server / client / view-schema details, and the `operationProgress` helper.

Quick version:

```ts
// resource
export class RetryLabel extends Req.Command<RetryLabel>()(
  "RetryLabel",
  {},
  { stream: true, success: OperationProgress }
) {}

// frontend
const retryLabel = overviewClient.RetryLabel.mutate.wrap()(
  Command.withDefaultToastStream({ progress: operationProgress })
)
```

```vue
<CommandButton :command="retryLabel" />
```

## Repository-derived query invalidation is the default

Queries record the repositories they read, and successful commands return the
repositories they wrote. The client automatically invalidates every live query
whose recorded reads intersect those writes. This works across resource/RPC
namespaces and adapter boundaries; matching names or imports are not
required. A workflow prelude can forward repository dependencies from durable
workflow activities to the originating command.

### Do not reintroduce manual query-key lists

**Never** add any of the following for normal resource work (new or edited
commands included):

- `Req.Command` 4th-arg `invalidatesQueries` callbacks
  (e.g. `() => [SomeQuery]`, `(queryKey) => [queryKey]`)
- client/page `queryInvalidation` options on mutations
- `clientFor(Resource, invalidationMap)` wiring
- `InvalidationSet.add` / `Invalidates` annotations for repository-backed
  projections

That includes multi-repository projections and adapter-facing queries: if a
query goes through `repo.query` / `find` / `all` and the command writes those
repositories (or a durable workflow that records the same writes), the
intersection is enough. Do not "help" derived invalidation with a hand-maintained
query list — agents and humans reintroducing those lists is a regression.

There is **no** default namespace invalidation of a command's own resource key.
Same-resource lists refresh because they share repository reads with the
command's writes, not because someone listed `(queryKey) => [queryKey]`.

### Unobservable dependencies

Manual query-key invalidation is only for dependencies the recorder cannot see
(in-memory signals, external systems, pure semantic fan-out with no tracked
read/write). Prefer recording a `DataDependencies.signal(...)` (read on the
query, write on the command) so derived invalidation still applies. Do not add
a query-key list "just in case," for `GetMe`, for "refresh the list after
save," or because another resource's projection looks virtual.

If you believe a case is truly unobservable after checking the handler's repo
access, stop and confirm before adding any explicit invalidation API — do not
copy a 4th-arg callback from older code or library docs.

### Auth/user state after mutations

When a command writes the user repository, live `GetMe` queries are invalidated
automatically. Do not add an explicit `GetMe` invalidation or manually assign
session user in the page to predict the new user state.

The client mutation invalidates/refetches affected queries before the command
body continues to success-side effects such as navigation. Route guards and
headers should observe the refreshed `GetMe` cache / layout session instead of a local
optimistic write.

### `disableQueryInvalidation` for background saves

Some commands are background saves whose writes should not trigger query
refetches (e.g. debounced auto-save of edited rows). Set
`disableQueryInvalidation: true` in the Command config to suppress **all**
invalidation sources — residual manual keys (if any), server-returned
`metadata.invalidateQueries`, and repository-derived write-dependency matching.

```ts
export class SaveItems extends Req.Command<SaveItems>()(
  "SaveItems",
  { orderId: OrderId, items: S.Array(Rows) },
  { allowRoles: ["user"], disableQueryInvalidation: true }
) {}
```

This is a blunt instrument. It stops the mutation from refetching _any_ live
query, so only use it when the command's writes are genuinely irrelevant to
the currently displayed data (the UI will refresh them through another path,
e.g. a subsequent explicit action or route change).

#### Alternative: `DataDependencyRecorder` suppression (not yet implemented)

The conceptually purer approach is to suppress write-recording at the source
instead of filtering downstream. Wrap the handler in a context that provides a
no-op `DataDependencyRecorder`, so `orderRepo.save(...)` calls inside it don't
record writes and repository-derived invalidation never fires. Not implemented
yet — revisit if a second use case needs "suppress derived invalidation only".

## i18n: action keys are mandatory

When adding a new API action (request class), add a translation in `frontend/composables/intl.ts` for each supported locale. Without it, toasts show the raw key (e.g. `OrderList.RetryLabel succeeded`).

Key format: `"action.{moduleName}.{ActionClassName}"`. `moduleName` comes from the resource's `meta.moduleName`.

### `_isLabel` for dual button-vs-toast text

Most actions need a short label for the button and a longer one for the toast. Use ICU `_isLabel` select:

```ts
"action.OrderList.Abort":
  "{_isLabel, select, true {Abort} other {Abort order list}}",

// same text for both → plain string is fine
"action.OrderList.MarkOutOfStock": "Mark out of stock",

// combine with other ICU vars
"action.Overview.ChangeBlocked":
  "{blocked, select, true {Block} other {Unblock}} item",
```

The command system sets `_isLabel = true` when rendering as a button label, `false` for toasts. Use the select form when:

- The toast needs more context than the button (short button label → longer toast).
- Different verb form (`"Import"` button → `"Importing"` toast).
- The button label would be too long.

## Migration cheatsheet

### Old `useAndHandleMutation + run()`

```ts
// BEFORE
const [loading, exec] = legacy.useAndHandleMutation(client.Action, "Action")
// run(exec({ args }))

// AFTER — simple passthrough
const action = client.Action.mutate.wrap(Command.withDefaultToast())
// action.handle({ args })

// AFTER — with side effects
const action = client.Action.fn(
  function*(input: typeof client.Action.Input) {
    yield* client.Action.mutate(input)
    // side effects
  },
  Command.withDefaultToast()
)
```

### Combinator chain → generator

```ts
// BEFORE
const cancelList = orderClient.Abort.mutate.wrap(
  (mutate) =>
    confirmDialogOrInterrupt("Are you sure?", "Abort?").pipe(
      Effect.andThen(mutate),
      Effect.andThen(() => Router.push({ name: "list" }))
    ),
  Command.withDefaultToast()
)

// AFTER — generator reads top-to-bottom
const cancelList = orderClient.Abort.fn(
  function*() {
    yield* Command.confirmOrInterrupt()
    yield* orderClient.Abort.mutate
    yield* Router.push({ name: "list" })
  },
  Command.withDefaultToast()
)
```

`andThen` no longer auto-flattens in Effect v4. If you still write combinator chains, use `flatMap` for Effect-returning callbacks, `map` for plain values. Prefer generators and the question doesn't come up.

## Common mistakes

### State reset after `.handle()` (assumed success)

```ts
// BAD — resets even if mutation failed
const onAdd = () => {
  command.handle({ orderId })
  selected.value = []
  dialogOpen.value = false
}

// GOOD — inside the body, only runs on success
const addOrder = client.AddOrder.fn(
  function*(input) {
    yield* client.AddOrder.mutate(input)
    selected.value = []
    dialogOpen.value = false
  },
  Command.withDefaultToast()
)
```

### `void run(...).then(toast)`

```ts
// BAD — toast fires on the promise, not the Effect's success
void run(updateStatus({ orderId, action })).then(() => toast.success("Updated"))
// GOOD — toast is the command's job
const updateStatus = client.UpdateStatus.mutate.wrap(
  Command.withDefaultToast()
)
updateStatus.handle({ orderId, action })
```

### `await cmd.handle(...)` in user code

`.handle()` returns a Fiber. Don't await it. The legacy `await run(cmd.handle(...))` still resolves in sequential loops, but the right fix is to pull the loop inside the command body (see [§ Sequential mutations](#sequential-mutations-in-a-loop)).
