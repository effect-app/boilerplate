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
9. For **cross-workflow** DB/repo imports, use `import * as XDB from ".../services/DBContext.js"` (where the target is a sibling workflow or a child workflow). `DBContext` files re-export workflow repos, so repo/persistence-layer consumers should use `XDB.OrderRepo`, `XDB.CartRepo`, and `XDB.DBContext`.
   - Within the same workflow, keep local sibling imports (`./services/OrderRepo.js`).
   - When importing **upward** from a workflow into a parent/shared scope (e.g. `Domain/WorkflowA/...` importing `../services/CartRepo.js`), keep named imports — don't wrap parent helpers in a workflow namespace inside files that already live under that scope.
     Direct imports from concrete service modules still make sense for non-repo services like `Dashboard`, `Mailer`, or `Import`.

## When the workflow-namespace form applies

"Cross-workflow" means the target lives in a _different_ workflow than the consumer. Practically, this is:

- **Sibling workflow** (e.g. `Domain/WorkflowA` importing from `Domain/WorkflowB`).
- **Parent reaching into a child workflow** (e.g. `Domain/services/Export.ts` importing from `Domain/WorkflowA/models`).

In both cases use the workflow-prefixed namespace form (`WorkflowAModels`, `WorkflowBDB`, …).

The workflow-namespace form does **not** apply to:

- **Same workflow** — local sibling imports (`./models.js`, `./services/X.js`) are preferred (rule 4). E.g. inside `Domain/WorkflowA/` use `import { OrderRepo } from "./services/OrderRepo.js"`, not `* as WorkflowADB from ...`.
- **Child reaching outward to a parent / shared scope** — keep named imports. E.g. inside `Domain/WorkflowA/` importing from `../services/CartHelpers.js` stays `import { cartHelpers } from "../services/CartHelpers.js"`. Wrapping parent helpers in a `DomainDB`/`DomainModels` namespace inside a file that already lives under `Domain/...` adds noise without disambiguating anything.

The `ts-plugin-prefer-namespace-import` refactor enforces this directionality automatically — it only offers the conversion for sibling or parent-into-child imports.

## Naming Conventions for Namespace Imports

Inside the same workflow, prefer local sibling named imports:

- `import { Order } from "./models.js"`
- `import { OrderRepo } from "./services/OrderRepo.js"`

A short namespace alias (`import * as DB from "./services/DBContext.js"`) is acceptable **only when the file imports from a single workflow** (its own) and several repos from the same `DBContext` are used together. The moment a second workflow appears in scope, rename the local one to the explicit workflow-aware form (`WorkflowADB`, `WorkflowBDB`) so both sides are unambiguous. Named imports from `./...` are preferred otherwise.

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

Exports must not bake the owning module, workflow, or domain name into their identifier. The import path and (for cross-workflow consumers) the namespace alias already provide that context — repeating it in the symbol creates noise like `Domain.DomainCartBridge`, `WorkflowA.WorkflowAOrder`, `OtherDomain.OtherDomainPrintService`.

- Inside `Domain/services/CartBridge.ts` → `export class CartBridge`, not `DomainCartBridge`.
- Inside `Domain/WorkflowA/models.ts` → `export const Partner`, not `WorkflowACompany`; `export const Carriers`, not `WorkflowACarriers`.
- Inside `OtherDomain/services/PrintService.ts` → `export class PrintService`, not `OtherDomainPrintService`.

Consumers in the same workflow use the bare name. Cross-workflow consumers reach for it through the namespace (`Domain.CartBridge`, `OtherDomain.PrintService`). Same-file collisions (e.g. a service class plus its `Work` Layer export) are the only case where an internal disambiguator like `WorkService` is acceptable; do not introduce module-prefixed names just to avoid the disambiguator.

### DI tag strings are the exception

The naming rule above governs the **class/symbol name** — never bake the workflow or domain into it. The `Context.Service` **tag string** (the runtime DI identifier passed to `Context.Tag(...)`) is a separate axis and follows the opposite rule when disambiguation is needed:

- **Class name** (what you `import`): always bare — `CartRepo`, never `WorkflowACartRepo`.
- **DI tag string** (runtime identity): **workflow** prefix when two workflows in the same process expose the same concept — `"WorkflowACartRepo"` vs `"WorkflowBCartRepo"` vs `"SubWorkflowCartRepo"` all coexist in a single domain process. **Domain** prefixes do not belong in the tag: a process only runs one domain, so unprefixed tags like `"Import"`, `"Work"`, and `"ExternalSystem"` are sufficient — no `"DomainImport"`.

The class name is disambiguated by the import path + namespace alias (`WorkflowADB.CartRepo` vs `WorkflowBDB.CartRepo`). The tag string has no such context at runtime, so it must carry the workflow itself.

## Examples

### Good: smallest-path import with workflow DB namespace

```ts
import { Dashboard } from "#Domain/services/Dashboard"
import * as WorkflowAModels from "#Domain/WorkflowA/models"
import * as WorkflowADB from "#Domain/WorkflowA/services/DBContext"
```

### Good: local sibling imports inside one module tree

```ts
import { ImportOrdersBwc } from "./rootSchemas.js"
import { Dashboard } from "./services/Dashboard.js"
import { Reset } from "./services/Reset.js"
```

### Good: cross-workflow namespace imports

```ts
import * as WorkflowBCore from "../WorkflowB/core.js"
import * as WorkflowBDB from "../WorkflowB/services/DBContext.js"
import * as WorkflowACore from "../WorkflowA/core.js"
import * as WorkflowADB from "../WorkflowA/services/DBContext.js"
```

### Avoid: renamed named imports for module aliases

```ts
import { DBContext as WorkflowBDBContext, OrderRepo as WorkflowBOrderRepo } from "../WorkflowB/services/DBContext.js" // avoid
import { Orders as WorkflowAOrders } from "../WorkflowA/core.js" // avoid
import { OrderInput as WorkflowAOrderInput } from "../WorkflowA/events.js" // avoid
```

Prefer:

```ts
import * as WorkflowBDB from "../WorkflowB/services/DBContext.js"
import * as WorkflowACore from "../WorkflowA/core.js"
import type * as WorkflowAEvents from "../WorkflowA/events.js"
```

### Avoid: importing workflow repos from individual service files

All three below are cross-workflow imports (consumer lives in a different workflow than the target). Use the workflow-namespace form from the parent `DBContext.js` instead.

```ts
import { CartRepo as SubWorkflowACartRepo } from "../../SubWorkflowA/services/CartRepo.js" // avoid (cross-workflow named)
import { DBContext as SubWorkflowBDBContext } from "../../SubWorkflowB/services/DBContext.js" // avoid (cross-workflow rename)
import { OrderRepo } from "../WorkflowA/services/OrderRepo.js" // avoid (cross-workflow sibling — consumer is NOT inside WorkflowA/)
```

Prefer:

```ts
import * as SubWorkflowADB from "../../SubWorkflowA/services/DBContext.js"
import * as SubWorkflowBDB from "../../SubWorkflowB/services/DBContext.js"
```

### Good: bundle yielded repos by workflow when several are in scope

```ts
const subWorkflowA = {
  deliveryNoteRepo: yield * SubWorkflowADB.DeliveryNoteRepo,
  cartRepo: yield * SubWorkflowADB.CartRepo
}
const subWorkflowB = { pickItemRepo: yield * SubWorkflowBDB.PickItemRepo }
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
