<!-- Space: SA -->
<!-- Parent: Scanner Wiki -->
<!-- Parent: Architecture -->
<!-- Parent: Architecture (shared) -->
<!-- Title: Query Shape: List vs Get -->

# Query Shape: List vs Get

Default rule: if a page needs **one** entity, expose a `Get` (or `Find`) endpoint for that entity. Do not load `List` and `.find()` the one you want on the client.

Companion to [resource-and-controller-layout.md](./resource-and-controller-layout.md) (naming) and [database-query-guidelines.md](./database-query-guidelines.md) (server-side projection).

## Good vs bad at a glance

| Prefer | Avoid |
|---|---|
| `Get` / `Find` on the resource, taking the id as input | `List` followed by `.find(_ => _.id === knownId)` on the client |
| Payload shape sized to the consumer (only the fields actually rendered) | Sharing a fat `List` row schema with every consumer because "it's already there" |
| Single-concern queries — one endpoint, one read | Piggybacking unrelated fields onto `List` so other pages can re-derive state |
| Mutations name the queryKey they invalidate | Hoping a fat `List` cache covers every downstream computed |

## Why client-side `.find` is bad

1. **Over-fetch on the wire.** Pulling N carts to display one cart's `pickedBy.displayName` ships N×(every field on every cart) when the page renders one name. Mobile/scanner clients pay this every navigation.
2. **Couples unrelated screens.** Adding a field for one consumer bloats the row everywhere that already pulls the list. Removing a field is a coordinated change instead of a local one.
3. **Cache footprint and invalidation surface.** Mutations on any sibling entity invalidate the whole list and refetch all rows. A `Get(id)` keyed by id only refetches the one row the user actually has.
4. **Hides intent.** `latestCarts.value.carts.find(...)` reads as "give me everything, I'll filter" — the real intent is "give me this one." The endpoint should say so.
5. **Encourages denormalisation creep.** "While we're here, also include `packingStation` on every spot so the packer page can read it" — every `List` becomes a join graph that no individual screen needs.

## Concrete cases that drove this rule

### Spot detail on the packer page

Before: `PackSpots.List` returned every spot **with** `packingStation: PackingStationDetail`. The packer page loaded the whole list to read one spot's `packingStation.scaleIp`. See commit `fd29db78d`.

After:

- `PackSpots.SpotState` keeps the list-row fields (id, name, inUse).
- `PackSpots.Get({ spotId }) → PackingStationDetail` for the single-spot read.
- The packer page calls `Get` with the claimed `spotId`; the spots-list page still uses `List` and renders `packingStation` on each card (the list page genuinely shows all spots).

Result: packer page does one slim read instead of fetching the full spot list, and the list page is unchanged because its consumer really does need every row.

### Current cart on the packer page

Before: each packer index page (`dropshipping`, `bauhaus`, `standard`) loaded `PackCarts.List` (every cart, with every order, item count, blocked state, etc.) just to compute `currentCart` and render `currentCart.pickedBy.displayName` (+ `name`, + `palletPositions` in some workflows).

After:

- Each `PackCarts` resource exposes a slim `CartSummary` (`id`, `name`, `pickedBy`, + `palletPositions` for Standard).
- `PackCarts.Get({ cartId: OneOrMoreCarts }) → CartSummary`.
- Packer pages call `Get` with the claimed `cartId` and drop the `currentCart` computed entirely.

The fat `List` is still appropriate for the carts-list screen, which renders every cart. It is the wrong shape for the packer screen, which renders one.

## When `List + .find` is acceptable

- The page already needs the full list for its primary rendering (e.g. the carts-list page itself). Reusing the same data for an incidental lookup is fine.
- The list is bounded and small (e.g. a literal enum or a config that genuinely fits on one screen).
- A short-lived dev/admin tool where shipping fast beats slimming the payload.

If none of those apply, add a `Get` / `Find`.

## When to extend `List` instead of adding a `Get`

Add fields to the list row only when **every list consumer** benefits. If only one consumer needs the field, give it its own `Get` and keep the list lean. "Both pages happen to want it" is not a reason — they should still be served by separate queries unless the list page itself renders the field.

## Backend pattern

Slim view schema co-located with the resource:

```ts
export class CartSummary extends S.Opaque<CartSummary>()(S.Struct({
  id: OneOrMoreCarts,
  name: NonEmptyString255,
  pickedBy: NullOr(UserViewFromId)
})) {}

export class Get extends Req.Query<Get>()(
  "Get",
  { cartId: OneOrMoreCarts },
  { success: CartSummary, allowRoles: ["user"] }
) {}
```

Handler does a focused query — not a full `List` followed by `.find` on the server (the same anti-pattern, one tier deeper):

```ts
*Get({ cartId }) {
  const [carts, stats] = yield* Effect.all([
    cartRepo.query(Q.where("id", "in", cartId)),
    getCartStats(...cartId)
  ], { concurrency: "inherit" })
  if (!Array.isReadonlyArrayNonEmpty(carts)) {
    return yield* new NotFoundError({ type: "Cart", id: cartId })
  }
  const primary = carts.find((_) => !_.link) ?? carts[0]!
  const linked = carts.filter((_) => _.id !== primary.id)
  const name = NonEmptyString255(
    `${primary.name}${linked.length ? `, ${linked.map((_) => _.name).join(", ")}` : ""}`
  )
  const pickedBy = stats.pickedById ? yield* resolveUser(stats.pickedById) : null
  return CartSummary.make({ id: cartId, name, pickedBy })
}
```

Naming: follow [resource-and-controller-layout.md](./resource-and-controller-layout.md). Sharper rule than "may return null":

- **`Get`** — the caller has a key they believe is valid (their own claim, a route param they navigated from, a tenant-scoped enum). The success schema is **non-nullable**. How a missing row surfaces depends on who chose the key:
  - **Typed `NotFoundError` (most cases).** The key came from the user — a route param, a scanned barcode, a stale link, an id pasted from elsewhere. The row may legitimately not exist or have been deleted between page load and click. The caller catches it and renders a 404 / toast.
  - **`Effect.die` (only when the input is not user-controllable).** The key is a tenant/workflow enum the dashboard itself picked, or a value derived from server state the user can't influence. Absence here means a code or config bug, not a user-facing miss.
- **`Find`** — the caller is probing (search-by-name, optional lookup, polling for a row that may not exist yet). The success schema is `NullOr(...)` and the absence is part of the normal contract — the caller renders an empty state, not an error.

`Get` + `die` is the **exception**, not the default. If you can't articulate why the input is impossible for the user to influence, use `Get` + `NotFoundError`. Per-row absences a user could legitimately trigger are `Find` only when the *consumer's UX* treats absence as a normal outcome (e.g. "no active cart yet"); if absence should read as "that thing is gone / never existed," it's `Get` + `NotFoundError`.

## Frontend pattern

Pass the id input as plain object if it is stable for the page lifetime, or as a `computed` if it can change (the query then refetches on input change):

```ts
// stable id (claim guarded at route entry, no partial release on this page)
const [, packingStation] = await packSpotsClient.Get.suspense({
  spotId: store.user.resource.spotId
})

// reactive id (cart claim can shrink via partial release)
const cartIdInput = computed(() => ({ cartId: cartId.value }))
const [, currentCart] = await packCartsClient.Get.suspense(cartIdInput)
```

Do not destructure the list result and then re-derive the single value:

```ts
// BAD
const [, latestCarts] = await packCartsClient.List.suspense()
const currentCart = computed(() =>
  latestCarts.value.carts.find((_) => sameIds(_.id, cartId.value))
)
```

### Workflow stats on the dashboard pages

Before: each workflow dashboard (`bauhaus`, `dropshipping`, `easy-life`, `manufacturing`, `multi-pick`, `standard`) called `Work.List` — which made the server compute stats for **every** workflow on every install — and then `.find(_._tag === "X")` to keep one entry.

After:

- `Work.Get({ workType }) → WorkInfo` (non-nullable).
- The `Work` service interface added `findByType(workType)` alongside the bulk `get`. Each tenant implementation dispatches `findByType` to its single per-workflow compute and falls through to `null` for unsupported types.
- The controller flips `null` → `Effect.die` because a caller asking for a workflow the tenant doesn't run is a defect, not a user-facing miss.
- The home page that renders every workflow still uses `Work.List`.

Lessons that fed back into this doc:

- **The slim shape on the wire doesn't help if the server still computes everything.** Splitting `Get` out at the resource level forces the service to expose a per-entity primitive too. A bulk `get` that the `Get` handler picks one entry from is the same anti-pattern, one layer deeper — same shape as the BAD example under "Backend pattern."
- **One shared resource can serve per-tenant services.** `Work` is a single resource; tenant-specific compute lives in the `Work` service layer, picked at startup. Per-tenant data does not require per-tenant resources.
- **Defect vs absence drives the `Get` / `Find` choice** (see the rule above). The first cut of this refactor used `Find` for unsupported workTypes; that was wrong because the caller is the tenant's own dashboard — it always knows which workflows it has.

## Project once at the query, not in every consumer

If a payload needs a derived field (a label, a `groupId`, a denormalised title for a select-input), apply the projection **once** via the query's `select` option. The page-level ref then holds the projected shape; downstream computeds and child components consume it directly.

```ts
// BAD — every Actions instance recomputes `title` on each render
const [, latestPackagings] = await packagingClient.List.suspense()
const packagingItems = computed(() =>
  latestPackagings.value.map((p) => ({ ...p, title: packagingLabel(p) }))
)
```

```ts
// GOOD — projection lives at the query source
const [, latestPackagings] = await packagingClient.List.suspense(undefined, {
  select: (_) => _.map((p) => ({ ...p, title: packagingLabel(p) }))
})
// child receives `:packagings="latestPackagings"`, types it as `PackagingOption[]`
```

Why:

1. **Single projection site.** The mapper runs once per cache update, not on every render of every consumer.
2. **Type carries the projection.** Child props declare the projected type (`PackagingOption`), so children can't accidentally re-derive it or forget required fields.
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
