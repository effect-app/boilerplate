<!-- Space: SA -->
<!-- Parent: Architecture -->
<!-- Parent: Architecture (shared) -->
<!-- Title: Tagged State Machines -->

# Tagged State Machines

Use tagged unions for domain lifecycle state. If a field is only meaningful while
an aggregate is in a particular state, put that field on that state member.
Avoid root-level sidecars that try to shadow or explain the state machine.

## Core rule

State-specific facts live inside the tagged state that owns them:

```ts
class OrderCancelling extends S.Opaque<OrderCancelling>()(
  S.TaggedStruct("cancelling", {
    previous: OrderCancellableState,
    refundedLabels: S.Array(ProcessingStates.Label)
  })
) {}

class OrderCancelled extends S.Opaque<OrderCancelled>()(
  S.TaggedStruct("cancelled", {
    refundedLabels: S.Array(ProcessingStates.Label)
  })
) {}
```

Do not put the same fact on the root aggregate unless it is invariant across all
states:

```ts
// BAD: only cancellation uses this, but every order now appears to have it
class Order extends S.Opaque<Order>()(
  S.Struct({
    state: OrderState,
    refundedLabels: S.Array(ProcessingStates.Label)
  })
) {}
```

## Why this matters

Root sidecars make the model lie. They imply the field is valid for every state,
force unrelated imports/views/projections to account for it, and let code read it
without proving the aggregate is in the right lifecycle branch.

Tagged state fields give us:

- **Type narrowing.** `order.state._tag === "cancelled"` proves
  `refundedLabels` exists.
- **Honest persistence.** The stored document explains why the data exists.
- **Safer commands.** Guards can reject or transition based on one state value,
  instead of reconciling root fields with state fields.
- **Cleaner input schemas.** Import/request payloads can select durable business
  fields without accidentally inheriting workflow-internal sidecars.
- **Better migrations.** A state migration can be targeted at one tag instead of
  introducing global defaults for records that never needed the field.

## When a root field is correct

Use a root field when it is identity, ownership, or data that is meaningful in
all or nearly all states:

- `id`
- tenant/customer identifiers
- immutable imported facts
- current address, when every lifecycle branch reads the same address
- aggregate-wide relationships such as `items`

If the sentence is "this field is used when the order is cancelling" or "this
field records why validation failed", it belongs on a state member.

## Retry and workflow data

Durable workflow progress is usually state-machine data. A retry ledger, failed
attempt, external transaction id, parked step, or cancellation audit should live
where the retry can prove it is still applicable.

Preferred shapes:

- `state: Processing | Failed | Done`, when the whole aggregate is in that phase.
- `state.processing: Processing | Failed | null`, when the aggregate remains in
  a parent state but one step is in progress.
- `state.previous`, when a temporary state such as `cancelling` must remember
  where it came from.

Avoid "temporary" root fields for workflow internals. They tend to survive
longer than intended and become accidental API contract.

When a long-running operation applies to several parent states without changing
their lifecycle meaning or owned data, a machine child `processing` state can be
appropriate. When the operation changes queue visibility, valid actions, or the
data the aggregate must retain, model it as a root state. Cancellation is the
canonical example: root `cancelling` owns only the items needed to finish, the
operation claim, and operation-specific progress such as a refund ledger.
Normal parent handlers are then unrepresentable instead of guarded at runtime;
filtering UI actions is not the integrity boundary.

## Building the next state in a handler

A machine handler's job is to produce the next tagged state. Two conventions keep
that free of noise.

**Read the acting user through a combinator, not by hand.** Most states record who
caused the transition, so handlers need the acting user's id. Don't re-derive it
inline (`Effect.map(UserProfile, (p) => …p.sub)`) or wrap each state in a tiny
`to<State>` constructor helper. Use the combinators from `#core/machine`:

```ts
// requires the user; R = UserProfile
ClaimForProcessing: ({ event, target }) =>
  withActingUser((byUserId) => target.full.processing(ProcessingState.make({ groupId: event.groupId, byUserId }))),

// tolerates an absent profile (system/saga-driven), passing null; R = never
ValidateSucceeded: ({ target }) =>
  withActingUserOrNull((byUserId) => target.full.valid(ValidState.make({ byUserId }))),
```

Inside a multi-step generator handler, read it directly instead:
`const byUserId = yield* UserProfile.sub` (or `UserProfile.subOrNull`). Keep a
`to<State>` helper **only** when it assembles a compound/multi-field state that is
reused (e.g. a `{ processing, state }` pair) — not for a bare constructor + user
read.

**Build from a spread; constructors drop what they don't declare.** `.make()` /
`.makeFrom()` **silently strip any property the target schema doesn't declare**, so
you never have to hand-copy an event's fields one by one. Spread the event (via
`dropTag`, so its `_tag` doesn't collide with the target's) and let extras fall
away:

```ts
// instead of: ProcessedState.make({ label: state.label, byUserId, context: event.context, sourceId: event.sourceId })
ProcessedState.make({ label: state.label, byUserId, ...dropTag(event) })
```

A later key still overrides an earlier spread, so ordering carries meaning: put
`...dropTag(event)` after `...state` when the event should win. Renamed or computed
fields (`foo: event.bar`, `x: fn(event.y)`) stay explicit — a spread only carries
same-named passthroughs.

## Code review checklist

- Does every non-root field have a clear owning `_tag`?
- If a new root field is added, can it be explained without mentioning one
  specific lifecycle state?
- Are guards checking the state tag before reading state-specific fields?
- Are projections/input schemas using `Struct.pick(...)` allow-lists rather than
  `Struct.omit(...)` from the full persisted model?
- Will old documents decode through an explicit, tag-targeted migration instead
  of a silent global default?

## Restoring instance/static helpers after a `TaggedUnion` flip

When a model becomes a `TaggedUnion([...])`, the per-branch classes no longer
carry the shared helpers (`copy`, `isCountable`, …). Re-attach them on the union
with `extendM` so callers keep `Model.copy(item, overrides)` etc.:

```ts
export const Item = extendM(
  TaggedUnion([ItemEmpty, ItemReady, /* ... */]),
  () => ({
    copy: (self, overrides) => /* ... */,
    isCountable: (self) => /* ... */
  })
)
```

Do this in the same change as the `TaggedUnion` flip — otherwise every call site
that used the old instance/static helpers breaks.

## Resource views over tagged models

Frontend resource views must preserve the state guarantees of the model they
represent. Define one view member from each corresponding model member with
`mapFields` (or `<Model>.to.mapFields` when the model has an encoded-key or
resolver transformation), then form a tagged union from only the members the
endpoint can return.

Do not rebuild members from a shared field bag such as `XSharedFields` or
`XViewFields`. That duplicates the model and lets model/view drift compile. A
view should instead make its boundary differences explicit:

```ts
class OrderProcessingView extends S.Opaque<OrderProcessingView>()(
  OrderProcessing.to.mapFields(flow(
    Struct.omit(["byUser", "transferredBy"]),
    Struct.assign({ items: S.Array(ItemView) })
  ))
) {}
```

Additional rules:

- Model state determines cardinality. If `todo` must not own an item, use an
  empty tuple; if `processing`/`done` owns one or more, use `NonEmptyArray`. Do not
  widen a state field to optional or nullable to accommodate a database projection.
- State-owned workflow fields belong on the tagged members that can use them,
  not on a shared order struct. Processing `items` and `selectedRows`, and a
  workflow's `activeRequest`, must be absent from lifecycle states where they
  have no meaning. Repository JitMs strip legacy broad fields and backfill
  required owner-state fields before decoding.
- Do not widen an earlier state's child union to represent an in-progress next
  phase. If partial processing mixes todo and done rows, model an explicit
  `processing` parent state with that mixed union. Keep `OrderTodoItems`
  todo-only, and transition back to `todo` when the last item is removed.
- Omit state-owned persistence details that have no meaning for the consumer.
  For example, a cancelled-order frontend view should omit cancellation item
  records rather than exposing them as an optional array.
- Do not add `withConstructorDefault` to view-only fields. A view member may
  inherit existing defaults from the model schema it derives from; preserving
  the model's encode/decode codec is more important than stripping harmless
  constructor metadata.
- A user-bearing view may retain `byUser: UserViewFromId` and map the encoded
  key to `byUserId`. Do not flatten a user that the frontend actually renders.
- A processing endpoint exports processing views; a done endpoint exports done
  views. Do not expose the whole persisted union and ask the frontend to ignore
  irrelevant members.
- Database projection schemas should be derived from the view members. Do not
  flatten a tagged union into an object with a union-valued `_tag`.
- Do not repair projection results with `coalesce*` helpers. A legacy stored
  shape belongs in the repository JitM/migration layer, while the view retains
  the model's valid state shape.
- When an offline migration precedes deployment, production handlers assume the
  canonical post-migration state. A legacy row that cannot be promoted because
  a newly-required discriminator cannot be recovered must fail migration for
  manual inspection; do not carry a compatibility transition into runtime code.
- A JitM may preserve a legacy in-progress shape when doing so is lossless. If
  conversion would discard information or requires inventing an unrecoverable
  discriminator, fail hard and route the row to manual inspection. Migration
  tooling must emit formatted schema issues plus the row id and actual value,
  not serialized schema AST internals.
- Do not use `decodeUnknown*` / `encodeUnknown*` to bridge a projection and a
  view. Fix the projection type so `_tag` narrows the result normally.
- Frontend code consumes the resource view type. It must not import persisted
  models or manufacture fake domain states to make rendering helpers work.

When a generic query overload can return one row or many rows at the type level,
handle that distinction explicitly rather than asserting the result. Query
cardinality and tagged-state narrowing should remain visible to TypeScript.
