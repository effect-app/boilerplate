<!-- Space: SA -->
<!-- Parent: Architecture -->
<!-- Parent: Architecture (shared) -->
<!-- Title: Import / Naming Rules -->

# Import / Naming Rules

## Goals

- Keep module graphs small for editor responsiveness, bundling, and typechecking.
- Avoid loading full domain trees when only one submodule is needed.

## Rules

1. Do not use `export *` barrels at domain roots.
2. Do not use self re-exports like `export * as X from "./X.js"`.
3. Import from the smallest module path possible (e.g. `#Domain/WorkflowA/models` for a single submodule, not a domain-wide barrel).
4. Local sibling imports are fine and usually preferred (`./models.js`, `./services/X.js`, `./resources/X.js`) when the consumer lives in the same module tree.
5. Prefer `import * as X` aliases instead of `{ X as Y }` renames.
6. Keep namespace names explicit and context-aware when needed.
7. Do not destructure helpers from namespace modules (avoid `const { copy } = Utils`, `const { pipe } = Fn`).
   Import helpers directly from their module instead.
8. Domain-level and workflow-level `services.ts` barrels are removed. Import concrete service modules directly.
9. `DBContext` is a workflow persistence facade, not a general foreign-repo import path.
   - Within the same workflow, keep local sibling imports (`./services/OrderRepo.js`). A local namespace import (`import * as DB from "./services/DBContext.js"`) is acceptable only when several repos and the DB layer from that same workflow are used together.
   - Cross-workflow DB coordination means a parent/coordinator has multiple workflow DB contexts in scope. In that case import each workflow facade as a namespace, e.g. `import * as WorkflowADB from "../WorkflowA/services/DBContext.js"` and `import * as WorkflowBDB from "../WorkflowB/services/DBContext.js"`.
   - Do not import another workflow's `DBContext` from inside a workflow just to reach one repo. Move the coordination to a parent/coordinator, or import a concrete non-repo service from its owning module when that dependency is truly not DB aggregation.
10. **One umbrella alias per `src` root — no per-file or per-symbol aliases.** Each module root exposes a single `#<Root>/*` subpath alias per top-level `src` directory (`#WorkflowA/*` → `src/WorkflowA/*`, `#models/*`, `#resources/*`, …), declared once in the manifest's `imports` field and mirrored in every `tsconfig*.json` `paths`. Do **not** add narrow aliases like `#services/ImportOne`, `#ImportOne/*`, or `#messages/ImportOne` that point into a subtree the umbrella already covers — they duplicate the umbrella and silently rot when files move. Reach moved code through the umbrella (`#WorkflowA/services/ImportOne`, `#WorkflowA/ImportOne/models`). The frontend follows the same shape: one nuxt alias per aliased `api/src/<root>` (`#WorkflowA` → `../api/src/WorkflowA`).
11. **A refactor that moves or renames a module goes all the way through.** Update _every_ reference in the same change — internal `#` aliases, relative paths, the manifest's `imports` field, all `tsconfig*.json` `paths`, the manifest's `exports` field used by external consumers (e2e, frontend), and the consumers themselves. Then **delete** the old aliases and re-exports. Never leave a back-compat shim: no alias still pointing at the pre-move location, no `./OldName/*` export forwarding to the new path, no re-export "for consumers". A move is complete only when `grep` for the old path returns zero hits across `api`, `e2e`, and `frontend`.

## When the workflow-namespace form applies

"Cross-workflow" means the target lives in a _different_ workflow than the consumer. Practically, this is:

- **Sibling workflow** (e.g. `Domain/WorkflowA` importing from `Domain/WorkflowB`).
- **Parent reaching into a child workflow** (e.g. `Domain/services/Export.ts` importing from `Domain/WorkflowA/models`).

In both cases use the workflow-prefixed namespace form (`WorkflowAModels`, `WorkflowBCore`, …). For DB/repo code, use `WorkflowADB` / `WorkflowBDB` only in coordinator code that has multiple workflow DB contexts in scope.

The workflow-namespace form does **not** apply to:

- **Same workflow** — local sibling imports (`./models.js`, `./services/X.js`) are preferred (rule 4). E.g. inside `Domain/WorkflowA/` use `import { OrderRepo } from "./services/OrderRepo.js"`, not `* as WorkflowADB from ...`.
- **Child reaching outward to a parent / shared scope** — keep named imports. E.g. inside `Domain/WorkflowA/` importing from `../services/OrderHelpers.js` stays `import { orderHelpers } from "../services/OrderHelpers.js"`. Wrapping parent helpers in a `DomainDB`/`DomainModels` namespace inside a file that already lives under `Domain/...` adds noise without disambiguating anything.

The `ts-plugin-prefer-namespace-import` refactor enforces this directionality automatically — it only offers the conversion for sibling or parent-into-child imports.

## Naming Conventions for Namespace Imports

Inside the same workflow, prefer local sibling named imports:

- `import { Order } from "./models.js"`
- `import { OrderRepo } from "./services/OrderRepo.js"`

A short namespace alias (`import * as DB from "./services/DBContext.js"`) is acceptable **only when the file imports from a single workflow** (its own) and several repos from the same `DBContext` are used together. The moment a second workflow DB context appears in scope, the file should be coordinator code and both sides use explicit workflow-aware names (`WorkflowADB`, `WorkflowBDB`). Named imports from `./...` are preferred otherwise.

Across workflows, keep the workflow in the namespace:

- `import * as WorkflowAModels from "#Domain/WorkflowA/models"`
- `import * as WorkflowADB from "#Domain/WorkflowA/services/DBContext"`
- `import * as WorkflowACore from "#Domain/WorkflowA/core"`
- `import * as WorkflowAEvents from "#Domain/WorkflowA/events"`
- `import * as DomainWorkflowAModels from "#Domain/WorkflowA/models"`

Use short names only for local context. When multiple workflows are in scope, prefer explicit workflow-aware names like `WorkflowAModels`, `WorkflowBDB`, `WorkflowCModels`, `WorkflowDDB`.

If a symbol name collides, keep the symbol unchanged and resolve the collision via the namespace, for example `WorkflowACore.Orders` vs `WorkflowBCore.Orders`.
Avoid renaming individual imports in application code like `OrderInput as WorkflowAOrderInput` or `Orders as WorkflowAOrders`.
If a collision appears, rename or add the namespace, not the imported symbol.

## Naming Conventions for Exports

Exports must not bake the owning module, workflow, or domain name into their identifier. The import path and (for cross-workflow consumers) the namespace alias already provide that context — repeating it in the symbol creates noise like `Domain.DomainOrderBridge`, `WorkflowA.WorkflowAOrder`, `OtherDomain.OtherDomainRenderService`.

- Inside `Domain/services/OrderBridge.ts` → `export class OrderBridge`, not `DomainOrderBridge`.
- Inside `Domain/WorkflowA/models.ts` → `export const Partner`, not `WorkflowACompany`; `export const Regions`, not `WorkflowARegions`.
- Inside `OtherDomain/services/Rendering.ts` → `export class Rendering`, not `OtherDomainRenderService`.

### Name services by what they do, not what they are

Service class and file names describe a **responsibility**, not a structural category. Drop the `Service` suffix — it only says what a class _is_, not what it _does_.

| Avoid                    | Prefer                          | Reason                  |
| ------------------------ | ------------------------------- | ----------------------- |
| `OrderImportService`     | `OrderImporter` or `Import`     | Names the action        |
| `ReportRenderingService` | `ReportRenderer` or `Rendering` | Names the action        |
| `OrderBridgeService`     | `OrderBridge`                   | The suffix adds nothing |
| `UserManagementService`  | `UserManagement`                | Already a noun phrase   |

Any service module in `services/` is by definition a service. Appending `Service` is redundant. Use a noun (`OrderBridge`, `Dashboard`, `Reset`) or a verb-noun (`OrderImporter`, `ReportRenderer`) that makes the responsibility clear at the call site.

Consumers in the same workflow use the bare name. Cross-workflow consumers reach for it through the namespace (`Domain.OrderBridge`, `OtherDomain.Rendering`). Same-file collisions (e.g. a service class plus its `Work` Layer export) are the only case where an internal disambiguator like `WorkService` is acceptable; do not introduce module-prefixed names just to avoid the disambiguator.

### DI tag strings are the exception

The naming rule above governs the **class/symbol name** — never bake the workflow or domain into it. The `Context.Service` **tag string** (the runtime DI identifier passed to `Context.Tag(...)`) is a separate axis and follows the opposite rule when disambiguation is needed:

- **Class name** (what you `import`): always bare — `OrderRepo`, never `WorkflowAOrderRepo`.
- **DI tag string** (runtime identity): **workflow** prefix when two workflows in the same process expose the same concept — `"WorkflowAOrderRepo"` vs `"WorkflowBOrderRepo"` vs `"SubWorkflowOrderRepo"` all coexist in a single domain process. **Domain** prefixes do not belong in the tag: a process only runs one domain, so unprefixed tags like `"Import"`, `"Work"`, and `"ExternalSystem"` are sufficient — no `"DomainImport"`.

The class name is disambiguated by the import path + namespace alias (`WorkflowADB.OrderRepo` vs `WorkflowBDB.OrderRepo`). The tag string has no such context at runtime, so it must carry the workflow itself.

## Language conventions

All code — identifiers, file names, comments, inline documentation, and architecture docs — must be written in **English**.

User-facing copy (text a user reads in the UI: confirmation dialogs, toast messages, labels, error messages displayed to users) must be available in **German**. Prefer `intl.formatMessage(...)` so copy can be updated without touching code, but a hardcoded German string is acceptable when the message is stable and context-local.

```ts
// Preferred — copy via intl, easy to update without changing code
yield * Command.confirmOrInterrupt(
  intl.formatMessage({
    id: "order.release.confirm",
    defaultMessage: "Auftrag freigeben?"
  })
)

// Also acceptable — stable, context-local German string
yield * Command.confirmOrInterrupt("Auftrag freigeben?")
```

The split is: **code = English, copy = German**.

## Examples

### Good: smallest-path import

```ts
import { Dashboard } from "#Domain/services/Dashboard"
import * as WorkflowAModels from "#Domain/WorkflowA/models"
```

### Good: local sibling imports inside one module tree

```ts
import { ImportOrders } from "./rootSchemas.js"
import { Dashboard } from "./services/Dashboard.js"
import { Reset } from "./services/Reset.js"
```

### Good: cross-workflow namespace imports in coordinator code

```ts
import * as WorkflowACore from "../WorkflowA/core.js"
import * as WorkflowADB from "../WorkflowA/services/DBContext.js"
import * as WorkflowBCore from "../WorkflowB/core.js"
import * as WorkflowBDB from "../WorkflowB/services/DBContext.js"
```

### Avoid: renamed named imports for module aliases

```ts
import { Orders as WorkflowAOrders } from "../WorkflowA/core.js" // avoid
import { OrderInput as WorkflowAOrderInput } from "../WorkflowA/events.js" // avoid
import { DBContext as WorkflowBDBContext, OrderRepo as WorkflowBOrderRepo } from "../WorkflowB/services/DBContext.js" // avoid
```

Prefer:

```ts
import * as WorkflowACore from "../WorkflowA/core.js"
import type * as WorkflowAEvents from "../WorkflowA/events.js"
import * as WorkflowBDB from "../WorkflowB/services/DBContext.js"
```

### Avoid: reaching into another workflow DBContext from workflow code

All three below live inside a workflow and reach into another workflow's persistence layer. Move the DB coordination to a parent/coordinator that imports both workflow DBContexts, or use a concrete non-repo service if this is not DB aggregation.

```ts
import { OrderRepo as SubWorkflowAOrderRepo } from "../../SubWorkflowA/services/OrderRepo.js" // avoid (cross-workflow named)
import { DBContext as SubWorkflowBDBContext } from "../../SubWorkflowB/services/DBContext.js" // avoid (cross-workflow rename)
import { OrderRepo } from "../WorkflowA/services/OrderRepo.js" // avoid (cross-workflow sibling — consumer is NOT inside WorkflowA/)
```

Prefer in parent/coordinator code:

```ts
import * as SubWorkflowADB from "../../SubWorkflowA/services/DBContext.js"
import * as SubWorkflowBDB from "../../SubWorkflowB/services/DBContext.js"
```

### Good: bundle yielded repos by workflow when several are in scope

```ts
const subWorkflowA = {
  documentRepo: yield * SubWorkflowADB.DocumentRepo,
  orderRepo: yield * SubWorkflowADB.OrderRepo
}
const subWorkflowB = { itemRepo: yield * SubWorkflowBDB.ItemRepo }
```

### Avoid: namespace destructuring after import

```ts
import * as Utils from "effect-app/utils"
const { copy } = Utils // avoid
```

Prefer:

```ts
import { copy } from "effect-app/utils"
```

If a lint rule conflicts with this convention, prefer configuring lint to allow direct named imports for helper functions from small utility modules (instead of forcing namespace+destructure patterns).
