<!-- Space: SA -->
<!-- Parent: Architecture -->
<!-- Title: Durable Workflows & DurableDeferred -->

# Durable Workflows & DurableDeferred

Cross-project rules for building durable workflows on `effect/unstable/workflow`
(`Workflow.make`, `Activity.make`, `DurableDeferred`, `WorkflowEngine`). These
rules are not application-specific; they apply to any effect-app codebase that
persists workflow execution across restarts.

## Mental model

Use a durable workflow only when the operation has a meaningful continuation to
recover: multiple independently persisted steps, an external side effect, or a
wait for a callback/operator. A synchronous command containing one idempotent
repository mutation should remain an ordinary Effect. Wrapping that mutation in
one activity records a journal but does not create an additional recovery
boundary, while still imposing activity-schema and deployed-history compatibility.

A workflow body is **re-executed from the top on every resume**. It is not a
coroutine that parks on a line and wakes up there. Each `Activity` and each
`DurableDeferred` it has already completed is _replayed from durable storage_
(returns its recorded result instantly, side effects not re-run); the first
not-yet-completed suspension point is where real work resumes.

Consequences that drive every rule below:

- **Anything outside an `Activity` runs on every replay.** Pure derivation is
  fine; observable side effects are not. Put side effects in activities so they
  are recorded and skipped on replay.
- **Suspension unwinds the body via a synthetic interrupt.** A
  `DurableDeferred.await` that hasn't resolved throws an interrupt that unwinds
  the whole body. This is why `Effect.ensuring` is the wrong tool for terminal
  cleanup (see Compensation).
- **The engine instance must be shared** between the side that runs the
  workflow (`execute`) and the side that resolves deferreds
  (`DurableDeferred.done`). Export one `Layer` constant and let Layer
  memoization hand both sides the same instance.

### Repository dependencies from workflow bodies

Workflow bodies run in their own execution context, disconnected from the HTTP
request's repository-dependency recorder. Repository writes inside a workflow
therefore cannot be recorded into the caller's request directly. If the app
supports repository-derived query invalidation, bridge this in the workflow
wrapper: install a hub-backed recorder inside every workflow body, record the
events into an attached caller before RPC metadata is emitted, and publish the
accumulated writes directly when each execution segment settles (including
suspension and resume boundaries) when no caller is attached. Callers should not
pass dependency channels. See
[streams-and-progress.md § Data dependencies from durable workflows](./streams-and-progress.md#data-dependencies-from-durable-workflows).

## Idempotency keys & resuming in-progress workflows

`Workflow.make({ idempotencyKey })` derives the **execution id**. Two
`execute` calls with the same key collapse onto the same execution; a different
key starts a fresh one that replays every activity from scratch.

Design the key deliberately around _what counts as the same attempt_:

```ts
// Per user-triggered attempt: fold a requestId into the key so each attempt is
// its own execution, but let the caller decide whether to reuse an in-flight id.
idempotencyKey: ;
;(({ context, orderId, requestId }) =>
  `${context.tenantId}:${orderId}:${requestId}`)
```

### The resume decision lives in the caller, not the workflow

To **resume an in-flight run** rather than start a new one, the caller must
reconstruct the prior execution id and ask the engine whether it is still
alive:

```ts
const active = aggregate.activeRequest // persisted on the aggregate
if (active === null) return freshRequestId()
const execId = yield
  * MyWorkflow.executionId({ ...payload, requestId: active.requestId })
const poll = yield * engine.poll(MyWorkflow, execId)
// Suspended proves it is in flight.
if (Option.isSome(poll) && poll.value._tag === "Suspended") {
  return active.requestId
}
// Complete is terminal and may be cleared by the aggregate owner after reloading.
if (Option.isSome(poll) && poll.value._tag === "Complete") {
  return freshRequestId()
}
// For flows where activeRequest is the domain lock, None is ambiguous:
// a running execution may not have produced a stored reply yet.
if (Option.isNone(poll) && reuseActiveWhenPollMissing) return active.requestId
return freshRequestId() // None (engine wiped) or Complete → start over
```

Rules distilled:

- **Persist the active requestId on the aggregate.** Without it you have no
  payload to reconstruct `executionId(...)`, so you cannot poll or resume.
- **Discriminate shared ownership slots.** If the same aggregate field can hold
  owners for different workflow intents, persist the workflow/action kind
  alongside the `requestId`. Resume/retry/stop commands must join only the owner
  for their intent, while a non-null owner can still block conflicting intents.
  When adding this discriminator to already-persisted rows, do not hide the old
  shape with decoding defaults. Handle it in the model JitM or an explicit data
  migration. If the old owner cannot be classified safely, clear/drop it rather
  than guessing the wrong workflow; make that choice only with a rollout guard
  that verifies no relevant workflow executions/owners are still active in
  production.
- **Reuse on `Suspended`.** For workflows where `activeRequest` is also the
  domain lock, reuse on `None` too: the engine may return no reply while the
  execution is still running. This attaches the second command to the same
  execution id instead of minting a duplicate.
- **Progress streams are live, not event logs.** A second subscriber using the
  same `requestId` receives future progress and completion, but may not see
  progress events emitted before it subscribed.
- **Guard the pre-claim race in the workflow.** Two requests can both read
  `activeRequest = null` before either saves the lock. The claim activity must
  return "not claimed" when another request now owns the aggregate, and the
  workflow must stop before visible side effects.
- **Completed or failed runs start fresh.** Once polling returns `Complete`,
  mint a fresh id and rely on replay-safe activities.
- **Terminal owners may leave stale domain locks.** When `activeRequest` is also
  a persisted ownership lock, a fresh execution may clear the old slot only
  after reconstructing the previous execution id, polling it, seeing `Complete`,
  and reloading the aggregate to prove the exact same owner is still present.
  Do not clear on `None`: it can mean "no stored result yet" for an in-flight
  execution, not just "the execution is gone". Prefer a small helper that polls
  and clears the completed owner; branch on `missing`, `suspended`, and
  `complete` directly only when the caller needs custom behavior.
- **Do not reclaim ambiguous owners by age alone.** Parked, suspended,
  user-waiting, or otherwise ambiguous states must not be reclaimed only
  because they are old unless the workflow has a known short non-parked window.
  If such a short-window reclaim is valid, make it reachable from the read/UI
  path as well as the start command, and gate any force-abort/finalize action to
  the same stale, unparked owner predicate. When that reclaim starts a new owner
  or clears the old one, interrupt the previous workflow execution before
  writing the replacement owner state.
- **The workflow body must be replay-safe regardless**, because a fresh
  execution re-runs every activity. Activities guard their own read-modify-write
  (see below) so re-running is a no-op when state already advanced.

## DurableDeferred: the write-once-slot trap

A `DurableDeferred` is the suspension primitive for "publish a request, park
until something elsewhere resolves it." It is backed by a storage slot at
`${executionId}/${deferredName}`. **The slot is write-once**: the first
`done()` wins, a second `done()` to the same slot is a silent no-op.

Therefore:

> **A workflow that awaits more than once MUST use a distinct deferred _name_
> per await site.**

Reuse the same name across two awaits and the second await reads the first
round's value (or never resumes if the first hasn't fired). Use a factory that
prefixes a stable per-site key:

```ts
const makeRetryDeferred = (step: string, attempt: number) =>
  DurableDeferred.make(`Retry-${step}-${attempt}`, spec)

// sequential awaits in one body → one name each:
const first = makeRetryDeferred("createDocument", 1)
const second = makeRetryDeferred("uploadDocument", 1)

// awaiting in a loop → key by durable data so the name is stable across replays:
const perItem = makeRetryDeferred(`provider-${itemId}`, attempt)
```

The key must be **stable across replays** (derive it from durable data like an
id, never from iteration order or a timestamp), and **unique within one
execution**.

### Token routing vs schema: the two halves of `done()`

`DurableDeferred.done(self, { token, exit })` uses its two arguments for
_different_ purposes, and conflating them causes subtle bugs:

- **`token`** carries the workflow + execution + deferred-name. **Routing uses
  the token** — the engine writes `${executionId}/${deferredName}` decoded from
  it. The resolver does **not** need to know which per-site name was minted.
- **`self`** (the def) is used **only to encode the exit's schema.**

This is what lets a generic resolver complete many differently-named per-site
deferreds with **one canonical def**:

```ts
// Resolver side — does not know the await-site name; the token carries it.
Retry: ;
;((msg) =>
  DurableDeferred.done(RetryDone, {
    token: msg.token,
    exit: resultToExit(msg.result)
  }))
```

The catch: **both ends must use identical schemas.** The canonical def
(`RetryDone`) and every per-site def from the factory must share one `spec`
literal — centralise it so they cannot drift:

```ts
const spec = { success: RetryDecision, error: RetryError } as const
export const RetryDone = DurableDeferred.make("Retry", spec) // resolver encodes with this
export const makeDeferred = (k: string) =>
  DurableDeferred.make(`Retry-${k}`, spec) // body awaits these
```

Keep `Exit`/`Cause` off the wire — reply messages carry a bounded
`Result<Output, string>` and the drain converts to an `Exit` at the boundary.

### Completing context-aware deferreds from controllers

If the workflow derives its execution id from the business payload **plus**
captured request context, a controller that wakes a parked workflow must use
the matching completion helper instead of manually recomputing
`Workflow.executionId(...)` and `DurableDeferred.tokenFromExecutionId(...)`.
The helper folds the current request context into the execution id the same way
`Workflow.execute(...)` does, then completes the exact deferred slot carried by
the context-aware payload.

## The async round-trip pattern

Use DurableDeferred when a workflow needs an answer from an independently
triggered resolver (operator retry, webhook, external callback) and must
survive a restart while waiting.

For direct worker RPCs where the workflow itself initiates the call, prefer a
normal `Activity` around the RPC. The activity result is recorded by the
workflow engine and replay does not re-send the RPC.

```
workflow body                         resolver
─────────────                         ────────
token = DurableDeferred.token(def)
Activity "publish":
  persist "in progress" state
  publish Request{ ..., token }  ───────────►  resolver eventually decides
await(def)  ── suspends, body unwinds ──       resolver calls DurableDeferred.done(CanonicalDef,
   resumes when slot is written ◄───────────────────   { token, exit: resultToExit(result) })
Activity "apply reply": persist terminal state
```

Notes:

- **Mint the token before the publish activity** and pass it _into_ the
  request. On replay the publish activity is skipped, but `token(def)` is pure
  and stable, so the await still targets the right slot.
- **`done()` may be called on any instance.** The drain that received the reply
  resolves the deferred against the shared engine; the original execution
  resumes wherever it next runs.
- **Persist a visible "in progress" state inside the publish activity** before
  parking, so the UI/aggregate reflects the pending round-trip even while the
  workflow is suspended.

### Explicit domain parking must prove ownership before awaiting

For manual retry flows that park by writing `aggregate.activeRequest.parked`
and then await a per-attempt `DurableDeferred`, the park activity must return
whether it actually wrote the parked marker. Do **not** silently no-op and then
await anyway:

```ts
const parked = yield * markParkedForRetry(step, attempt, error)
if (!parked) return yield * originalFailure

const decision = yield * DurableDeferred.await(makeRetryDeferred(step, attempt))
if (decision.action === "abort") return yield * originalFailure

const cleared = yield * clearParkedRetry(step, attempt)
if (!cleared) return yield * originalFailure
```

The durable activity names for this handshake must carry the same stable identity
that the guards validate: request-owned step/reason plus loop key and `attempt`
where applicable. In particular, if a retry can park the same step or batch more
than once in one execution, `park`, `check parked`, `clear`, and `check cleared`
activity names must include `attempt`. Otherwise a later retry can reuse an
earlier completed activity result and skip the fresh ownership guard.

Ownership checks (`activeRequest.requestId`, parked `step`, parked `attempt`)
are stale-workflow guards. If they fail, the current execution no longer owns
the aggregate state it would expose to the UI. Waiting would create an orphaned
deferred with no persisted retry handle, and continuing would let a stale run
perform side effects. Treat ownership loss as terminal for that execution and
let the current aggregate owner decide the next action.

### Retry transient database activity operations

Durable activities do not automatically retry typed failures. When an activity
reads or writes the workflow-owned aggregate and then intentionally collapses
infrastructure errors, retry transient `PersistenceError` /
`OptimisticConcurrencyException` failures locally and only defect after
exhaustion. Use a retry helper around the read/save inside the activity.

For request-scope workflow coordination reads/writes that sit outside an
`Activity`, wrap the repo call in the same transient-retry helper before a
deliberate `.orDie`:

```ts
const activeRequestId = orderRepo
  .query(Q.where("id", orderId), Q.one)
  .pipe(
    withTransientRetry,
    Effect.map((_) => _.activeRequest?.requestId ?? null),
    Effect.orDie
  )
```

Both patterns are for transient persistence failures: request timeouts,
throttling, 5xxs, dropped sockets, and optimistic races where the activity can
re-read and re-apply the same mutation. Do not wrap business failures or
external-provider decisions in these helpers. A single transient store blip
should not become a terminal defect that strands `activeRequest`, but a real
validation failure should still surface normally.

### Do not change schemas for deployed activity names

Activity results are durable data keyed by workflow execution, activity name,
and attempt. On replay/resume, the engine skips a completed activity and decodes
its stored `Exit` with the **current** activity success/error schemas.

That means retrofitting `success: S.Boolean` onto an activity name that may
already have completed in production as the default `Void` schema is not
replay-safe. A suspended old execution can resume under the new code and try to
decode the old stored `Void` result as `Boolean`.

For deployed workflows, keep existing activity names and schemas compatible.
There are two safe migration shapes:

1. Keep the old activity name/schema and add a **read-only** boolean checker.
2. Replace the old yield with a v2 activity whose body is idempotent against the
   state the old activity may already have written.

Do not yield both an old side-effect activity and a new v2 side-effect activity.
If an old execution already completed the old activity, replay skips the old
activity and then executes the new v2 activity because it has a fresh name.
That repeats the side effect unless v2 first detects the old persisted state and
no-ops.

Keeping the old activity definition in source does not by itself preserve
compatibility. The engine only decodes stored activity history for commands the
current workflow code actually reaches. If current code still yields the old
activity, its name and schemas must stay compatible. If current code replaces
that yield with a v2 activity, the old activity result is unused history; the v2
body must recover by reading durable domain state written by v1.

The v2 replacement shape is appropriate for local aggregate claim writes that
re-read ownership first, return success when `activeRequest.requestId` already
matches, return false for a foreign owner, and only re-stamp the same lock when
absent. It is also acceptable for aggregate-creation work only when the v2 body
can detect the old created aggregate by deterministic id and avoid rebuilding it
from current live inputs. It is not appropriate for external calls, durable
event publishes, or effects that cannot be cleanly recognized as already done.
For not-yet-deployed workflows, returning `Boolean` directly from the
parking/clearing activities is fine.

For new durable activity/deferred/clock names, avoid repeating the surrounding
workflow or aggregate noun when the file/workflow already supplies that context:
prefer the stable action plus the identity needed for replay (`createAndClaimV2`,
`checkParkOwner-${reason}-${batchIndex}-${attempt}`). Do not rename existing
deployed names for readability alone; a durable name is part of persisted
workflow history, so a rename needs the same compatibility plan as a schema
change.

This matches the general guidance from durable workflow systems:

- Temporal requires replay to produce the same command sequence; changing
  Activity/Child Workflow ids, or adding/removing/reordering calls to
  Activities, Timers, Child Workflows, Signals, etc. needs workflow versioning
  or patching ([Workflow Definition](https://docs.temporal.io/workflow-definition),
  [TypeScript versioning](https://docs.temporal.io/develop/typescript/workflows/versioning)).
- Azure Durable Functions treats activity name/input/output changes and adding
  calls to activities, timers, sub-orchestrations, or external events as
  breaking for in-flight orchestrations unless mitigated by orchestration
  versioning or side-by-side deployments
  ([Versioning in Durable Functions](https://learn.microsoft.com/en-us/azure/durable-task/durable-functions/durable-functions-versioning)).

If old executions are not pinned to old worker code, migrations must be
replay-safe in today's code: either preserve the old command/schema or replace
it with a v2 command that is self-idempotent against v1's persisted effects.

#### Migration patterns for old `Void` activities

If an activity already ran in production without an explicit `success` schema,
do not retrofit `success: S.Boolean` under the same name.

Safe pattern 1: keep the old activity name/schema, then add a new **read-only**
boolean checker activity:

```ts
yield * markParkedForRetry // old deployed activity; still returns Void

const ownsParkedRetry = yield * Activity.make({
  name: `checkParkedRetryOwner-${step}-${attempt}`,
  success: S.Boolean,
  execute: Effect.gen(function*() {
    const order = yield* getOrder
    return order.activeRequest?.requestId === payload.requestId
      && order.activeRequest.parked?.step === step
      && order.activeRequest.parked.attempt === attempt
  })
})
if (!ownsParkedRetry) return yield * originalFailure
```

Use this only when the old activity is intentionally still the side-effect step
for new executions too, and the added activity merely verifies persisted state.
Do not make the added activity repeat the old work.

This is rarely the right shape for replacing a side-effect step. Prefer pattern
2 when the new activity can recognize the old persisted result and no-op.

Safe pattern 2: replace the old yield with a v2 activity name that owns the new
boolean result and detects work already done by v1:

```ts
const parked = yield * Activity.make({
  name: `parkForRetryV2-${step}-${attempt}`,
  success: S.Boolean,
  execute: Effect.gen(function*() {
    const order = yield* getOrder
    const activeRequest = order.activeRequest
    if (
      activeRequest?.requestId === payload.requestId
      && activeRequest.parked?.step === step
      && activeRequest.parked.attempt === attempt
    ) return true
    if (activeRequest?.requestId !== payload.requestId) return false

    yield* saveOrder(Order.copy(order, {
      activeRequest: {
        ...activeRequest,
        parked: { step, attempt, error, at: new Date() }
      }
    }))
    return true
  })
})
if (!parked) return yield * originalFailure
```

Use this only when re-running the activity body under the new name is safe: the
engine will not find old history for `parkForRetryV2-*`, so it will execute the
body even if `parkForRetry-*` completed earlier. The v2 body must first look
for the state that v1 would have written and return without repeating that work
when it is already present.

Do not keep yielding v1 in this shape. Keeping the v1 definition around as dead
code has no replay effect; it is only useful as temporary reference material.

## Activities: idempotent read-modify-write

Because a fresh execution (or any replay path) re-runs an activity's body, each
activity must be safe to run when state has already moved on. The pattern: an
activity **re-reads the aggregate, filters for the precondition state, and
no-ops if it has drifted**:

```ts
Activity.make({
  name: "callExternalProvider",
  execute: Effect.gen(function*() {
    const order = yield* getOrder
    if (!order.items.some((i) => i.state._tag === "ready")) return // already advanced → no-op
    // ... flip to a processing state, do the work, persist result
  })
})
```

Trade-off to be aware of: a silent `.some(...)` no-op also masks genuine
misconfiguration (the precondition never held). Hardening options when
concurrent external mutation becomes a real risk:

1. **Retry transient persistence before defecting.** Do not wrap repository
   reads/saves in a naked `.orDie` inside activities that sit after an external
   side effect. Re-read the aggregate, re-apply the state mutation, and retry
   transient `PersistenceError` / `OptimisticConcurrencyException` / typed
   transient `DatabaseError` failures locally; only defect after exhaustion so
   the outer command/workflow does not replay the external call.
2. **Split external result capture from persistence when possible.** An
   activity result is durable only after the activity finishes and the engine
   journals it. If an activity calls an external system and then saves the
   aggregate, a crash after external success but before the journal can still
   re-run the external call. When the provider result can be reused, return it
   from the external-call activity, then persist it in a separate activity;
   after the first activity is journaled, persistence retries no longer call the
   provider.
3. **A processing-state lock in the domain model.** First activity flips the
   aggregate into an `assignedToWorkflow`/`Processing` state; other endpoints
   refuse to mutate while it holds. Strongest guarantee, but touches every
   writer and needs release-on-failure.

> The idempotency key only prevents two _concurrent workflow executions_ for
> the same key. It does **not** lock the aggregate against other endpoints that
> mutate it between activities. That is what the guards / options above are for.

### Observable side effects belong in the activity that owns the step

Publishing progress, emitting events, writing audit rows, and other observable
side effects must be inside an `Activity`, not in the workflow body between
activities. The workflow body re-executes on every resume; direct side effects
there can replay and duplicate. An activity result is recorded, so the side
effect is skipped on replay together with that step.

Do not create separate "publish-only" activities when an existing step activity
already owns the work. Put the progress/event publish inside the step activity,
next to the state transition or external call it describes:

```ts
const callExternalProvider = Activity.make({
  name: "callExternalProvider",
  execute: Effect.gen(function*() {
    const order = yield* getOrder
    if (!order.items.some((i) => i.state._tag === "ready")) return

    yield* progressHub.publish({
      requestId,
      progress: Step.make({ step: "callExternalProvider" })
    })
    // flip processing state, call provider, persist result
  })
})

yield * callExternalProvider
```

If the workflow body needs to iterate, use identifiers derived from durable
data (transaction id, item id), not loop indexes. Pass that stable context into
the existing item activity and publish there:

```ts
const refundItem = (item: Item, total: number) =>
  Activity.make({
    name: `refundItem-${item.transactionId.id}`,
    execute: Effect.gen(function*() {
      yield* progressHub.publish({
        requestId,
        progress: Refunding.make({ transactionId: item.transactionId, total })
      })
      yield* provider.refund(item.transactionId)
    })
  })
```

Parallelize only the independent side effect. If every item branch writes the
same aggregate, serialize that write path, for example by chaining the write
after the external side effect and guarding it with a local one-permit
semaphore. That semaphore only coordinates concurrent fibers in the current
workflow run; it is not a durable lock, so the write activity must still be
idempotent and ownership-checked. Otherwise concurrent read-modify-write saves
can overwrite each other and lose part of the ledger.

## Compensation, not `ensuring`, for terminal cleanup

To release a lock (or run any cleanup) **only when the workflow truly ends**,
use `Workflow.withCompensation` — **not** `Effect.ensuring`.

```ts
const releaseLock = releaseActiveRequest(payload.requestId)
const claimed = yield * claimLock(payload.requestId).pipe(
  Workflow.withCompensation(() => releaseLock) // fires on terminal FAILURE only after claim succeeds
)
if (!claimed) return yield * new InvalidStateError("Already running")

// ... activities ...
yield * releaseLock // success path: explicit, at the end
```

Why `Effect.ensuring` is wrong: every `DurableDeferred.await` that suspends
unwinds the body via a synthetic interrupt. `ensuring` fires on _that_ unwind
too — so a lock guarded by `ensuring` would be released mid-flight every time
the workflow parks on a round-trip. `withCompensation` runs on terminal failure;
the success path releases explicitly as its last step.

Attach the compensation to the lock-acquire step, not to the whole workflow
body. `Workflow.withCompensation` registers its finalizer only after the wrapped
effect succeeds; wrapping the whole body registers cleanup too late to cover a
mid-body terminal failure.

Make the release itself idempotent and **ownership-checked** — only clear the
slot if it still belongs to this attempt, so a later attempt that already took
over is not wiped:

```ts
if (order.activeRequest?.requestId === payload.requestId) {
  yield * saveOrder(Order.copy(order, { activeRequest: null }))
}
```

(A heavier alternative — replay every activity in reverse to restore the
original state — is rarely worth it; persisting the failed exit for inspection
usually is.)

## Passing request-scoped flags into a workflow

A workflow body **cannot read request-scoped `Reference`s / `FiberRef`s** (e.g.
an E2E-flags reference) — it runs detached from the request fiber, possibly on
another instance after a resume. Anything the request knows that the workflow
needs must be **read in the controller and passed as a payload field**:

```ts
const flags = { skipExternal: yield * E2EFlags.externalShortCircuit } // request fiber reads the Reference
yield * Workflow.execute({ orderId, groupId, flags }) // passed in as payload
```

Stable request context, such as `tenantId` and `locale`, follows the same rule:
read it before `execute()` and pass it as a durable payload object. Do not pass
request-local caches into the payload. Any request-scoped context used for
cross-cutting concerns (e.g. store etags) must be recreated around each
activity, because the original request scope is gone when the workflow resumes
after a process restart.

## Zombie executions: a terminal-but-unresolved run that never dies

A durable execution can get stuck **forever failing on replay** while looking
finished to everything that watches it. A live incident: an execution retried
roughly 26 times/minute for **days**, emitting
`Existing <Type> <id> record changed` optimistic-concurrency errors, long after
the aggregate it operated on had reached a terminal state.

### What the OCC error actually is

`Existing <Type> <id> record changed` is effect-app's
`OptimisticConcurrencyException`. For the Cosmos store, a batch write throws it
with `id: "batch"` when a **transactional batch** returns HTTP 412: any item in
the batch carried an `_etag` `ifMatch` precondition that no longer matched the
row. `"batch"` is a label for a batch-level conflict, not a special record —
the real check is each item's own `_etag`.

### Why "every activity re-reads fresh" does not save you

The intuition "each activity reads the aggregate fresh, so the etag is current"
is right for a _live_ run but wrong for a stuck replay:

- **The store delays and batches writes** to save RUs. The `_etag` is captured
  at read time but the write flushes later; a concurrent mutation in that window
  makes the deferred `ifMatch` stale.
- **Decisively, a wedged execution is not doing live work — it is replaying a
  journal.** The engine re-runs the body from the top, replaying recorded
  activity results. Any write it still attempts reflects the aggregate _as it
  was when the journal was written_, but the aggregate has since moved on (all
  the way to a different etag lineage). A write keyed to the old state can never
  satisfy the precondition against the new state, so it fails **every time**,
  forever. See [Mental model](#mental-model).

### Why it never terminates

In the cluster store the execution is a row set in `cluster_messages` /
`cluster_replies` (Postgres/MSSQL) or the `*cluster` container (Cosmos). The
zombie had a `run` message whose `WithExit` reply was a `Failure`, every message
`processed = true`, and **every reply `acked = false`**. An unacked terminal
reply is never consumed, so the cluster keeps re-poking the entity to redeliver
it → replay → OCC → repeat. Nothing clears it because the original initiator
that would ack the reply is long gone.

### Terminating one by hand

There is no code path that re-derives this from source — it is orphaned durable
state — so a redeploy just resumes it. Delete its rows in the **cluster** store
(not the app store), scoped to the exact entity, e.g. for SQL backends:

```sql
BEGIN;
DELETE FROM cluster_replies WHERE request_id IN (
  SELECT request_id FROM cluster_messages
  WHERE entity_type = 'Workflow/<name>' AND entity_id = '<executionId>'
);
DELETE FROM cluster_messages
WHERE entity_type = 'Workflow/<name>' AND entity_id = '<executionId>';
DELETE FROM cluster_locks WHERE address LIKE '%<executionId>%';
COMMIT;
```

This is safe only once you have confirmed the real work already completed (the
aggregate is in its terminal state); you are deleting a wedged journal that
replays finished work, not live progress.

### Making these visible in workflow monitoring

A zombie can be invisible in workflow monitoring for two compounding reasons:

- The dead-letter scan only considers `processed = FALSE` messages; a zombie's
  are all processed.
- The summary scan reads the most-recent `SUMMARY_MESSAGE_QUERY_LIMIT` rows by
  id/`_ts` DESC; a zombie's rows can be old and age out of the window.

The fix is a **failed-run backfill** — every message of any entity whose `run`
reply is a `Failure`, regardless of age or `processed` — plus an
**attention-first ordering** so failed / dead-letter / parked entities sort
ahead of healthy ones and survive the snapshot limit. A broken execution must
never be hidden just because it is old.

## Checklist for a new durable workflow

- [ ] Idempotency key models exactly "the same attempt"; a per-attempt id is
      folded in if you need resume-vs-restart control.
- [ ] Caller persists the active requestId on the aggregate and polls the engine
      (`Suspended` → reuse; `None` may also reuse when the aggregate lock is the
      source of truth; `Complete` → fresh) before `execute`.
- [ ] Every `await` site has a **distinct, replay-stable** deferred name.
- [ ] Manual retry park/check/clear activity names include the same identity
      tuple as their ownership guards, including retry `attempt` when the same
      step or batch can park more than once in one execution.
- [ ] Canonical def + per-site defs share one `spec` literal.
- [ ] `done()` is called with the request's `token` for routing; the drain uses
      one canonical def for schema only.
- [ ] Reply wire shape is a bounded `Result`, not `Exit`/`Cause`.
- [ ] Every activity is an idempotent read-modify-write that no-ops when state
      has drifted.
- [ ] Side effects live inside activities, never in the bare body.
- [ ] Terminal cleanup uses `Workflow.withCompensation`; the success path
      releases explicitly. Release is ownership-checked.
- [ ] Request-scoped flags are read in the controller and passed as payload.
- [ ] One shared `WorkflowEngine` layer for both `execute` and `done` sides.
