# Resource and Controller Layout

Convention for ordering declarations in resource files and controllers. Apply to every `**/resources/*.ts` and `*.Controllers.ts` file.

## Naming

Request classes use the following name patterns. Pick the most specific one that fits.

| Pattern | Use | Examples |
|---|---|---|
| `List` | Sole list query in the resource. | `List` |
| `List*` | Additional list queries; suffix disambiguates. | `ListByCDC`, `ListLogin`, `ListOrders` |
| `Get` | Sole singular query (e.g. by-id). **Non-nullable success schema.** Missing row → typed `NotFoundError` (most cases) or `Effect.die` (only when input is not user-controllable). | `Get` |
| `Get*` | Additional singular queries; suffix names the read. Same non-nullable rule. | `GetById`, `GetCloseList`, `GetSettings`, `GetLabelPreview` |
| `Find` / `Find*` | Singular query that may return `null` / no result. Absence is part of the normal contract. | `Find`, `FindByGTIN`, `FindActiveCart` |

`Get` vs `Find` split is **non-nullable success vs nullable success**. How missing rows surface from a `Get` depends on who picked the input: typed `NotFoundError` when the user could plausibly have picked a stale/invalid key, `Effect.die` only when the input is not user-controllable (tenant enum, own dashboard's own workflow). See [query-shape-list-vs-get.md](./query-shape-list-vs-get.md#backend-pattern) for the full rule.
| `<Verb>` | Commands. Verb first, alphabetical within commands. | `ChangeBlocked`, `Close`, `RetryLabel`, `Update` |

Do not name queries with bare nouns (`Settings`, `Orders`) or with `Preview*` prefixes. Use `Get*`/`List*`/`Find*` so the request kind is visible at the call site.

## Resource file order

1. Imports.
2. `// codegen:start ... // codegen:end` header block (contains `const Req = TaggedRequestFor(...)`). Do not move.
3. Request classes, in this order:
   1. `List`
   2. `List*` — alphabetical
   3. `Get`
   4. `Get*` — alphabetical
   5. `Find`
   6. `Find*` — alphabetical
   7. Commands — alphabetical
4. Helper classes (`S.Opaque`, `S.TaggedStruct`, `S.TaggedError`, `S.Class`, plain `S.Struct` views, etc.) live **immediately before** the first request that references them. If a helper is shared by several requests, place it before the first user in the new order. Helpers not referenced by any request stay grouped near their domain.
5. Comments above a class travel with that class.
6. Trailing `// codegen:start {preset: model} ... // codegen:end` block and `export namespace ...` declarations stay at the bottom.

The class body is preserved byte-for-byte during a reorder. No reformatting.

## Controller file order

Inside `return match({ ... })`, handler keys follow the same order as the resource. Exactly one blank line between handler blocks; no blank line before the closing `})`.

Everything outside the `match({...})` object (imports, layer deps, `*effect` setup, helper functions) is untouched.

## When adding a new request

1. Pick the name pattern from the table above.
2. Place the class in the resource at the correct slot.
3. Place any helper class immediately before its first user in that order.
4. Add the matching handler in the controller at the same slot, with a blank line separator.
5. Run `pnpm check` from the repo root.

## Mechanical reorder of an existing file

For a refactoring pass:

1. Identify each top-level `export class` block (request or helper) from `export class` to its terminating `}`. Comments directly above the class belong to that block.
2. Classify each request as query (`extends Req.Query<...>`) or command (`extends Req.Command<...>`).
3. Map each helper to its first-user request by name reference inside the request body.
4. Emit blocks in the order above. Verify the count of `extends Req.\(Query\|Command\)` matches before and after.
5. For controllers, reorder handler keys inside `match({...})`, insert single blank lines, verify handler count.
