<!-- Space: SA -->
<!-- Parent: Architecture -->
<!-- Parent: Architecture (shared) -->
<!-- Title: Query Shape: List vs Get -->

# Query Shape: List vs Get

Default rule: if a page needs **one** entity, expose a `Get` (or `Find`) endpoint for that entity. Do not load `List` and `.find()` the one you want on the client.

Companion to [resource-and-controller-layout.md](./resource-and-controller-layout.md) (naming) and [database-query-guidelines.md](./database-query-guidelines.md) (server-side projection).

## Good vs bad at a glance

| Prefer                                                                  | Avoid                                                                            |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `Get` / `Find` on the resource, taking the id as input                  | `List` followed by `.find(_ => _.id === knownId)` on the client                  |
| Payload shape sized to the consumer (only the fields actually rendered) | Sharing a fat `List` row schema with every consumer because "it's already there" |
| Single-concern queries — one endpoint, one read                         | Piggybacking unrelated fields onto `List` so other pages can re-derive state     |
| Repository reads/writes derive invalidation automatically               | Hoping a fat `List` cache covers every downstream computed                       |

## Why client-side `.find` is bad

1. **Over-fetch on the wire.** Pulling N orders to display one order's `owner.displayName` ships N×(every field on every order) when the page renders one name. Mobile clients pay this every navigation.
2. **Couples unrelated screens.** Adding a field for one consumer bloats the row everywhere that already pulls the list. Removing a field is a coordinated change instead of a local one.
3. **Cache footprint and invalidation surface.** Mutations on any sibling entity invalidate the whole list and refetch all rows. A `Get(id)` keyed by id only refetches the one row the user actually has.
4. **Hides intent.** `latestOrders.value.orders.find(...)` reads as "give me everything, I'll filter" — the real intent is "give me this one." The endpoint should say so.
5. **Encourages denormalisation creep.** "While we're here, also include `detail` on every row so the detail page can read it" — every `List` becomes a join graph that no individual screen needs.

## Concrete cases that drove this rule

### Entity detail on the detail page

Before: `Items.List` returned every row **with** `detail: Detail`. The detail page loaded the whole list to read one row's `detail.value`.

After:

- `Items.ListRow` keeps the list-row fields (id, name, state).
- `Items.Get({ itemId }) → Detail` for the single-row read.
- The detail page calls `Get` with the claimed `itemId`; the items-list page still uses `List` and renders `detail` on each card (the list page genuinely shows all rows).

Result: the detail page does one slim read instead of fetching the full list, and the list page is unchanged because its consumer really does need every row.

### Current entity on the work page

Before: each work index page loaded `Orders.List` (every order, with every child, item count, blocked state, etc.) just to compute `currentOrder` and render `currentOrder.owner.displayName` (+ `name`, + `positions` in some workflows).

After:

- The `Orders` resource exposes a slim `OrderSummary` (`id`, `name`, `owner`, + `positions` where needed).
- `Orders.Get({ orderId }) → OrderSummary`.
- Work pages call `Get` with the claimed `orderId` and drop the `currentOrder` computed entirely.

The fat `List` is still appropriate for the orders-list screen, which renders every order. It is the wrong shape for the work screen, which renders one.

## When `List + .find` is acceptable

- The page already needs the full list for its primary rendering (e.g. the orders-list page itself). Reusing the same data for an incidental lookup is fine.
- The list is bounded and small (e.g. a literal enum or a config that genuinely fits on one screen).
- A short-lived dev/admin tool where shipping fast beats slimming the payload.

If none of those apply, add a `Get` / `Find`.

## When to extend `List` instead of adding a `Get`

Add fields to the list row only when **every list consumer** benefits. If only one consumer needs the field, give it its own `Get` and keep the list lean. "Both pages happen to want it" is not a reason — they should still be served by separate queries unless the list page itself renders the field.

## Backend pattern

Slim view schema co-located with the resource:

```ts
export class OrderSummary extends S.Opaque<OrderSummary>()(S.Struct({
  id: OrderId,
  name: NonEmptyString255,
  owner: NullOr(UserViewFromId)
})) {}

export class Get extends Req.Query<Get>()(
  "Get",
  { orderId: OrderId },
  { success: OrderSummary, allowRoles: ["user"] }
) {}
```

Handler does a focused query — not a full `List` followed by `.find` on the server (the same anti-pattern, one tier deeper):

```ts
*Get({ orderId }) {
  const [orders, stats] = yield* Effect.all([
    orderRepo.query(Q.where("id", "in", orderId)),
    getOrderStats(...orderId)
  ], { concurrency: "inherit" })
  if (!Array.isReadonlyArrayNonEmpty(orders)) {
    return yield* new NotFoundError({ type: "Order", id: orderId })
  }
  const primary = orders.find((_) => !_.linked) ?? orders[0]!
  const linked = orders.filter((_) => _.id !== primary.id)
  const name = NonEmptyString255(
    `${primary.name}${linked.length ? `, ${linked.map((_) => _.name).join(", ")}` : ""}`
  )
  const owner = stats.ownerId ? yield* resolveUser(stats.ownerId) : null
  return OrderSummary.make({ id: orderId, name, owner })
}
```

Naming: follow [resource-and-controller-layout.md](./resource-and-controller-layout.md). Sharper rule than "may return null":

- **`Get`** — the caller has a key they believe is valid (their own claim, a route param they navigated from, a tenant-scoped enum). The success schema is **non-nullable**. How a missing row surfaces depends on who chose the key:
  - **Typed `NotFoundError` (most cases).** The key came from the user — a route param, a scanned code, a stale link, an id pasted from elsewhere. The row may legitimately not exist or have been deleted between page load and click. The caller catches it and renders a 404 / toast.
  - **`Effect.die` (only when the input is not user-controllable).** The key is a tenant/workflow enum the dashboard itself chose, or a value derived from server state the user can't influence. Absence here means a code or config bug, not a user-facing miss.
- **`Find`** — the caller is probing (search-by-name, optional lookup, polling for a row that may not exist yet). The success schema is `NullOr(...)` and the absence is part of the normal contract — the caller renders an empty state, not an error.

`Get` + `die` is the **exception**, not the default. If you can't articulate why the input is impossible for the user to influence, use `Get` + `NotFoundError`. Per-row absences a user could legitimately trigger are `Find` only when the _consumer's UX_ treats absence as a normal outcome (e.g. "no active order yet"); if absence should read as "that thing is gone / never existed," it's `Get` + `NotFoundError`.

## Frontend pattern

Pass the id input as plain object if it is stable for the page lifetime, or as a `computed` if it can change (the query then refetches on input change):

```ts
// stable id (claim guarded at route entry, no partial release on this page)
const [, item] = await itemClient.Get.suspense({
  itemId: session.user.claimId
})

// reactive id (claim can shrink via partial release)
const orderIdInput = computed(() => ({ orderId: orderId.value }))
const [, currentOrder] = await orderClient.Get.suspense(orderIdInput)
```

Do not destructure the list result and then re-derive the single value:

```ts
// BAD
const [, latestOrders] = await orderClient.List.suspense()
const currentOrder = computed(() =>
  latestOrders.value.orders.find((_) => sameIds(_.id, orderId.value))
)
```

### Workflow stats on the dashboard pages

Before: each workflow dashboard called `Work.List` — which made the server compute stats for **every** workflow on every install — and then `.find(_._tag === "X")` to keep one entry.

After:

- `Work.Get({ workType }) → WorkInfo` (non-nullable).
- The `Work` service interface added `findByType(workType)` alongside the bulk `get`. Each tenant implementation dispatches `findByType` to its single per-workflow compute and falls through to `null` for unsupported types.
- The controller flips `null` → `Effect.die` because a caller asking for a workflow the tenant doesn't run is a defect, not a user-facing miss.
- The home page that renders every workflow still uses `Work.List`.

Lessons that fed back into this doc:

- **The slim shape on the wire doesn't help if the server still computes everything.** Splitting `Get` out at the resource level forces the service to expose a per-entity primitive too. A bulk `get` that the `Get` handler selects one entry from is the same anti-pattern, one layer deeper — same shape as the BAD example under "Backend pattern."
- **One shared resource can serve per-tenant services.** `Work` is a single resource; tenant-specific compute lives in the `Work` service layer, resolved at startup. Per-tenant data does not require per-tenant resources.
- **Defect vs absence drives the `Get` / `Find` choice** (see the rule above). The first cut of this refactor used `Find` for unsupported workTypes; that was wrong because the caller is the tenant's own dashboard — it always knows which workflows it has.

## Project once at the query, not in every consumer

If a payload needs a derived field (a label, a `groupId`, a denormalised title for a select-input), apply the projection **once** via the query's `select` option. The page-level ref then holds the projected shape; downstream computeds and child components consume it directly.

```ts
// BAD — every Actions instance recomputes `title` on each render
const [, latestGroups] = await groupClient.List.suspense()
const groupItems = computed(() =>
  latestGroups.value.map((p) => ({ ...p, title: groupLabel(p) }))
)
```

```ts
// GOOD — projection lives at the query source
const [, latestGroups] = await groupClient.List.suspense(undefined, {
  select: (_) => _.map((p) => ({ ...p, title: groupLabel(p) }))
})
// child receives `:groups="latestGroups"`, types it as `GroupOption[]`
```

Why:

1. **Single projection site.** The mapper runs once per cache update, not on every render of every consumer.
2. **Type carries the projection.** Child props declare the projected type (`GroupOption`), so children can't accidentally re-derive it or forget required fields.
3. **Cache stability.** TanStack memoises the `select` output, so reference identity is preserved across consumer re-renders that don't touch the query.
4. **Co-located with the fetch.** A reader of the parent sees the shape transformation right next to the request that produced it; no need to chase a `computed` elsewhere.

Use it for:

- Adding display-only fields (`title`, `label`) consumed by autocompletes / selects.
- Re-keying list items for component identity (`groupId`, `subGroupId` augmentations).
- Filtering / sorting the cache snapshot for a specific page (when the API gives you the broader set on purpose).

Keep `select` pure and cheap. Do not call effects, do not read other refs — `select` is invoked synchronously inside the cache layer.

## Checklist when adding a screen that reads "the current X"

1. Is there already a `Get` / `Find` on the resource? Use it.
2. If not, is there a `List` that ships the field you need? Add a `Get`, do not pull `List`.
3. Define a slim view schema for the `Get` — only the fields this screen renders, plus the id.
4. If a future screen renders the same shape, reuse the view. If a future screen needs more, give it its own `Get` rather than fattening the existing view.
