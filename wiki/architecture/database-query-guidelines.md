<!-- Space: SA -->
<!-- Parent: Scanner Wiki -->
<!-- Parent: Architecture -->
<!-- Parent: Architecture (shared) -->
<!-- Title: Database Query Guidelines -->

# Database Query Guidelines

Default rule: push filtering, counting, pagination, projection, and simple derivations into the repository query. Do not pull full documents into memory unless the endpoint truly needs them.

## Good vs bad at a glance

| Prefer | Avoid |
|---|---|
| `Q.count`, relation `count()`, `any()`, `every()`, `sum()`, `distinctCount()` | Loading full rows, then using `.length`, `.some`, `.every`, `new Set(...)`, or manual sums |
| `Q.page({ take: ... })` at query time | Loading an unbounded result set and slicing/filtering later |
| `Q.project(...)` with `Struct.pick(...)` / `mapFields(...)` | Fetching full documents when only a few fields are needed |
| `Q.projectComputed(..., Q.computed(...))` | Fetching nested arrays just to derive booleans, counts, ids, weights, or totals |
| One source of truth for a condition | Re-checking the same condition again in JS/TS after the DB already narrowed the set |

## 1. Count and page in the database

If you only need cardinality, ask the database for cardinality.

### Good

```ts
userRepo.query(
  Q.where("resource.spotId", req.spotId),
  Q.page({ take: 1 }),
  Q.count
)
```

See `api/src/<workflow>/PackSpots.Controllers.ts`.

### Also good

```ts
Q.relation("items").count()
Q.relation("items").count(Q.where("state._tag", "in", ["picked", "packed", "out-of-stock"]))
Q.relation("items").any(Q.where("state._tag", "packed"))
Q.relation("items").every(Q.where("state._tag", "picked"))
```

See:

- `api/src/<workflow-a>/Overview.Controllers.ts`
- `api/src/<workflow-b>/Overview.Controllers.ts`
- `api/src/<workflow-c>/Overview.Controllers.ts`

### Bad

```ts
const orders = yield* orderRepo.query(...)
const hasPickingItem = orders.some((o) => o.items.some((i) => i.state._tag === "picking"))
```

Problems:

- loads more rows than needed
- loads nested `items` arrays just to answer an existence question
- duplicates query intent in application code

Current example: `api/src/<workflow>/PickCarts.Controllers.ts`.

### Rule

- Use `Q.count` when the response is a count.
- Use `Q.page({ take: ... })` when the caller does not need the full result set.
- Use relation aggregates (`count`, `any`, `every`, `sum`, `distinctCount`) instead of materializing child collections.

## 2. Project the minimum shape

If the caller only needs a few fields, only select those fields.

### Good

```ts
orderRepo.query(
  Q.where("state._tag", "in", ["initial", "valid", "packed"]),
  Q.project(Order.mapFields(Struct.pick(["carrier", "state"])), "project")
)
```

See `api/src/<workflow>/services/Dashboard.ts`.

### Also good

```ts
Q.project(WorkflowModels.Order.mapFields(Struct.pick(["id"])), "project")
```

See `api/src/<workflow>/services/Reset.ts`.

### Bad

```ts
const orders = yield* orderRepo.query(Q.where(...))
return orders.map((o) => ({ id: o.id, state: o.state }))
```

Problems:

- transfers full documents for a small view
- couples the endpoint to fields it does not need
- makes future document growth hurt read performance

### Rule

- Start from the response shape.
- Encode that shape in `Q.project(...)`.
- Treat full-document reads as the exception, not the default.

## 3. Prefer computed projections for derived fields

If a list view needs derived fields, compute them in the query.

### Good

```ts
Q.projectComputed(
  S.Struct({
    articleCount: NonNegativeInt,
    allItemsPicked: S.Boolean,
    weight: Kilogram,
    articleIds: S.Array(ArticleId)
  }),
  Q.computed({
    articleCount: Q.relation("items").count(),
    allItemsPicked: Q.relation("items").every(Q.where("state._tag", "picked")),
    weight: Q.relation("items").sumExpr(
      Q.expr.mul(Q.expr.field("weight.amount"), Q.expr.field("tradeUnit.amount"))
    ),
    articleIds: Q.relation("items").collectDistinct("articleId")
  })
)
```

See:

- `api/src/<workflow-a>/Overview.Controllers.ts`
- `api/src/<workflow-b>/Overview.Controllers.ts`
- `api/src/<workflow-c>/Overview.Controllers.ts`

### Bad

```ts
Q.project(S.Struct({ items: ... }), "project").pipe(
  Effect.map((rows) => rows.map(({ items, ...row }) => ({
    ...row,
    articleCount: items.length,
    articleIds: [...new Set(items.map((i) => i.articleId))]
  })))
)
```

Problems:

- ships `items` only to throw them away
- repeats aggregation logic in every controller
- makes list endpoints scale with child collection size

### Rule

- Use computed projections for booleans, counts, distinct ids, totals, and simple expressions.
- Keep fallback in-memory code only where the query DSL cannot express the operation yet.
- When a fallback is unavoidable, still project the smallest possible intermediate shape.

## 4. Remove duplicate condition checks

A query should narrow the dataset once. Avoid re-validating the same predicate by scanning the returned rows again.

### Bad

```ts
yield* orderRepo
  .query(
    Q.where("state._tag", "picking"),
    Q.and("state.cartId", "includes-any", cartId)
  )
  .pipe(
    Effect.filterOrFail(
      (orders) => orders.some((o) => o.items.some((i) => i.state._tag === "picking")),
      () => new InvalidStateError("...")
    )
  )
```

Problems:

- top-level query says `picking`
- application code then scans every returned order again
- correctness depends on two conditions staying aligned

### Better

Encode the child predicate directly in the query and limit the read:

```ts
yield* orderRepo
  .query(
    Q.where("state._tag", "picking"),
    Q.and("state.cartId", "includes-any", cartId),
    Q.and(Q.whereSome("items", Q.where("state._tag", "picking"))),
    Q.page({ take: 1 })
  )
```

If the DSL can express the predicate entirely in the query, do that and drop the follow-up scan.
Use `Q.projectComputed(...)` only when the caller actually needs the derived boolean in the response shape.

## 5. Project discriminated-union state per branch

A state machine's branches usually carry different fields. Project each branch independently — don't fetch the whole union just because one tag needs an extra field.

### Good

```ts
const shipmentGetPalletStateProjection = S.Union([
  PalletInitialState.mapFields(Struct.pick(["_tag", "dimensions"])),
  PalletReadyState.mapFields(Struct.pick(["_tag", "dimensions", "palletLabel"])),
  PalletLabelCreatedState.mapFields(Struct.pick(["_tag", "dimensions", "palletLabel"])),
  PalletPrintedState.mapFields(Struct.pick(["_tag", "dimensions", "palletLabel"]))
])
```

See `api/src/<workflow>/ShipList.Controllers.ts` (`Get`, `ReprintLabel`, `ReprintTransferList`).

Each branch lists only the fields the render path reads on that tag. `_tag` is always picked so union discrimination still works after decode.

### Rule

- Build the branch list from "what does the consumer read when `_tag === X`?", not "what's in the schema."
- Always include the discriminator (`_tag`).
- Inline `S.Union([...])` inside the parent projection — no need to export it unless reused.

## 6. Replace `repo.get(id)` with a projected query

`repo.get(id)` reads the full document. If the handler only touches a few fields — or only needs the row to exist — use `repo.query(Q.where("id", id), Q.one, Q.project(...))`.

### Good (existence check only)

```ts
// verify shipment exists — no field is read afterward
yield* shipmentRepo.query(
  Q.where("id", shipmentId),
  Q.one,
  Q.project(S.toEncoded(Shipment.mapFields(Struct.pick(["id"]))), "project")
)
```

See `api/src/<workflow>/ShipList.Controllers.ts` (`PrintTransferList`).

### Good (narrow read)

```ts
const shipment = yield* shipmentRepo.query(
  Q.where("id", shipmentId),
  Q.one,
  Q.project(shipmentGetProjection, "project")
)
```

### Bad

```ts
const shipment = yield* shipmentRepo.get(shipmentId)
// only `shipment.cdcAddress.city` and `shipment.state.labelUrl` are used below
```

Problems:

- pulls every nested array (orderIds, full pallet list, full state) from Cosmos
- runs the full document decoder — including any `S.transform` that fans out to resolvers (e.g. `UserFromId` → `GetUserById` per `createdBy`)
- couples the handler to fields it never reads

### Rule

- Default to `Q.where("id", x), Q.one, Q.project(...)`.
- Keep `repo.get` for cases that genuinely need the whole document (writes that load → modify → save, or callers that hand the row to a generic renderer).

## 7. Use `raw:` + `S.toEncoded(View)` to skip the decode round-trip

When the handler's response *is* the projected shape, decoding the query result into a `View` only to re-encode it for the wire is wasted work — and any resolver-backed transform (e.g. `UserFromId` → DB lookup per user id) fires during that decode.

### Good

```ts
// resources/PackList.ts
export class OrderView extends S.Opaque<OrderView>()(S.Struct({
  ...Struct.omit(Order.fields, ["state"]),
  state: S.Union([...]),
  packages: S.Array(S.Union([PackageView, BuildingBlockView])).withConstructorDefault
})) {}

// controllers
List: {
  raw: (_) =>
    Effect.gen(function*() {
      const items = yield* orderRepo.query(
        Q.where(...),
        Q.project(S.toEncoded(OrderView), "project")
      )
      return { items }
    })
}
```

See `api/src/<workflow>/PackList.Controllers.ts` and `Order.Controllers.ts` (`Get`).

`Q.project(S.toEncoded(OrderView), "project")` tells Cosmos to return rows already shaped to the encoded `OrderView`. `raw:` on the handler returns them straight to the transport — no decode pass, so resolver-backed transforms never run.

### Bad

```ts
const order = yield* orderRepo.query(Q.where("id", id), Q.one)
return { ...order, carrier: Order.carrier(order) }
```

Problems:

- decodes the row into the full `Order` schema — every transform fires (including `User.resolver` for each `package.createdBy`)
- re-encodes to ship over RPC
- response shape ends up coupled to whatever the full `Order` decodes to

### Rule

- If the response shape == the projected shape, pair `Q.project(S.toEncoded(View), "project")` with `raw:` handlers.
- If the handler genuinely needs the decoded form (e.g. it inspects branded values or runs domain logic on the row), keep the normal decode path.
- Watch for resolver-backed transforms in the schema (`UserFromId`, anything with a `.resolver`). They are the strongest signal that `raw:` + encoded projection pays off.

## 8. `mapFields` drops parent `encodeKeys` — re-apply

A schema may rename a field on encode (`createdBy` ⇄ `createdById` in the Cosmos document). `mapFields(Struct.pick(...))` produces a new schema and **does not carry over** the parent's `S.encodeKeys` mapping. Without re-applying, the projected decoder looks for `createdBy` in the raw doc, finds nothing, and fails.

### Good

```ts
BuildingBlockPallet
  .to
  .mapFields(flow(
    Struct.pick(["id", "createdBy", "createdAt", "packSpotId", "state"])
  ))
  .pipe(S.encodeKeys({ createdBy: "createdById" }))
```

See `api/src/<workflow>/BuildingBlockPallet.Controllers.ts` and `ShipList.Controllers.ts`.

### Rule

- Whenever you `mapFields(Struct.pick(...))` on a schema with `encodeKeys`, re-apply the relevant mappings on the projected schema.
- Only the keys that survived the `pick` need re-mapping.

## 9. Helpers that take projected rows should accept `Pick<T, ...>`

Static helpers (`Model.render`, `Model.palletNo`, etc.) often only read a couple of fields. Type them as `Pick<Model, "fieldA" | "fieldB">` so projected shapes still satisfy them without casts.

### Good

```ts
static readonly render = (
  pallet: Pick<BuildingBlockPallet, "createdBy" | "packSpotId">,
  cdcAddress: Address,
  palletNo: number
) => ...
```

See `api/src/<workflow>/models/packages.ts`.

### Rule

- When a helper is read-only and touches a subset of fields, widen the input to `Pick<...>`.
- Otherwise the helper forces every caller to pass the full document, defeating the projection.

## Review checklist

Before merging a repo query, ask:

1. Can this count/existence check stay in the database?
2. Can this endpoint page earlier?
3. Can I project fewer fields?
4. Can I replace in-memory aggregation with `Q.projectComputed(...)`?
5. Am I scanning rows in JS/TS for something the query already knows?
6. Is the query result shape exactly the response shape, or at least the smallest useful intermediate shape?
7. If the row carries a state union, am I projecting each branch independently?
8. Am I calling `repo.get` when a projected `repo.query(..., Q.one, Q.project(...))` would do — or when the handler only needs existence?
9. Does the response shape equal the projected shape? If so, use `raw:` + `Q.project(S.toEncoded(View))` so no decode runs (skips resolver fanout like `UserFromId`).
10. Did `mapFields(Struct.pick(...))` drop a parent `S.encodeKeys` mapping I need to re-apply?
11. Do the static helpers I call on the projected row accept `Pick<...>`, or are they forcing the full document?
