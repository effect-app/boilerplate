# Import / Naming Rules

## Goals

- Keep module graphs small for editor responsiveness, bundling, and typechecking.
- Avoid loading full company/domain trees when only one submodule is needed.

## Rules

1. Do not use `export *` barrels at company roots.
2. Do not use self re-exports like `export * as X from "./X.js"`.
3. Import from the smallest module path possible (e.g. `#Mako/Standard/models` for a single submodule, not a company-wide barrel).
4. Local sibling imports are fine and usually preferred (`./models.js`, `./services/X.js`, `./resources/X.js`) when the consumer lives in the same module tree.
5. Prefer `import * as X` aliases instead of `{ X as Y }` renames.
6. Keep namespace names explicit and context-aware when needed.
7. Do not destructure helpers from namespace modules (avoid `const { copy } = Utils`, `const { pipe } = Fn`).
   Import helpers directly from their module instead.
8. Company-level and workflow-level `services.ts` barrels are removed. Import concrete service modules directly.
9. For **cross-workflow** DB/repo imports, use `import * as XDB from ".../services/DBContext.js"` (where the target is a sibling workflow or a child workflow). `DBContext` files re-export workflow repos, so repo/persistence-layer consumers should use `XDB.OrderRepo`, `XDB.CartRepo`, and `XDB.DBContext`.
   - Within the same workflow, keep local sibling imports (`./services/OrderRepo.js`).
   - When importing **upward** from a workflow into a parent/shared scope (e.g. `EasyLife/Standard/...` importing `../services/CartRepo.js`), keep named imports — don't wrap parent helpers in a workflow namespace inside files that already live under that scope.
     Direct imports from concrete service modules still make sense for non-repo services like `Dashboard`, `Mailer`, or `Import`.

## When the workflow-namespace form applies

"Cross-workflow" means the target lives in a _different_ workflow than the consumer. Practically, this is:

- **Sibling workflow** (e.g. `Mako/Bauhaus` importing from `Mako/Standard`, or `EasyLife/Standard` ↔ `EasyLife/Dropshipping`).
- **Parent reaching into a child workflow** (e.g. `EasyLife/services/Export.ts` importing from `EasyLife/Standard/models`).

In both cases use the workflow-prefixed namespace form (`StandardModels`, `BauhausDB`, …).

The workflow-namespace form does **not** apply to:

- **Same workflow** — local sibling imports (`./models.js`, `./services/X.js`) are preferred (rule 4). E.g. inside `EasyLife/Standard/` use `import { OrderRepo } from "./services/OrderRepo.js"`, not `* as StandardDB from ...`.
- **Child reaching outward to a parent / shared scope** — keep named imports. E.g. inside `EasyLife/Standard/` importing from `../services/CartHelpers.js` stays `import { cartHelpers } from "../services/CartHelpers.js"`. Wrapping parent helpers in an `EasyLifeDB`/`EasyLifeModels` namespace inside a file that already lives under `EasyLife/...` adds noise without disambiguating anything.

The `ts-plugin-prefer-namespace-import` refactor enforces this directionality automatically — it only offers the conversion for sibling or parent-into-child imports.

## Naming Conventions for Namespace Imports

Inside the same workflow, prefer local sibling named imports:

- `import { Order } from "./models.js"`
- `import { OrderRepo } from "./services/OrderRepo.js"`

A short namespace alias (`import * as DB from "./services/DBContext.js"`) is acceptable **only when the file imports from a single workflow** (its own) and several repos from the same `DBContext` are used together. The moment a second workflow appears in scope, rename the local one to the explicit workflow-aware form (`StandardDB`, `BauhausDB`) so both sides are unambiguous. Named imports from `./...` are preferred otherwise.

Across workflows, keep the workflow in the namespace:

- `import * as StandardModels from "#Mako/Standard/models"`
- `import * as StandardDB from "#Mako/Standard/services/DBContext"`
- `import * as StandardCore from "#Mako/Standard/core"`
- `import * as StandardEvents from "#Mako/Standard/events"`
- `import * as MakoStandardModels from "#Mako/Standard/models"`

Use short names only for local context. When multiple workflows are in scope, prefer explicit workflow-aware names like `StandardModels`, `BauhausDB`, `DropshippingModels`, `ManufacturingDB`.

If a symbol name collides, keep the symbol unchanged and resolve the collision via the namespace, for example `StandardCore.Orders` vs `BauhausCore.Orders`.
Avoid renaming individual imports in application code like `OrderInput as StandardOrderInput` or `Orders as StandardOrders`.
If a collision appears, rename or add the namespace, not the imported symbol.

## Naming Conventions for Exports

Exports must not bake the owning module, workflow, or company name into their identifier. The import path and (for cross-workflow consumers) the namespace alias already provide that context — repeating it in the symbol creates noise like `Mako.MakoCartBridge`, `Dropshipping.DropshippingOrder`, `Empasa.EmpasaPrintService`.

- Inside `Mako/services/CartBridge.ts` → `export class CartBridge`, not `MakoCartBridge`.
- Inside `EasyLife/Dropshipping/models.ts` → `export const Partner`, not `DropshippingCompany`; `export const Carriers`, not `DropshippingCarriers`.
- Inside `Empasa/services/PrintService.ts` → `export class PrintService`, not `EmpasaPrintService`.

Consumers in the same workflow use the bare name. Cross-workflow consumers reach for it through the namespace (`Mako.CartBridge`, `Empasa.PrintService`). Same-file collisions (e.g. a service class plus its `Work` Layer export) are the only case where an internal disambiguator like `WorkService` is acceptable; do not introduce module-prefixed names just to avoid the disambiguator.

### DI tag strings are the exception

The naming rule above governs the **class/symbol name** — never bake the workflow or company into it. The `Context.Service` **tag string** (the runtime DI identifier passed to `Context.Tag(...)`) is a separate axis and follows the opposite rule when disambiguation is needed:

- **Class name** (what you `import`): always bare — `CartRepo`, never `StandardCartRepo`.
- **DI tag string** (runtime identity): **workflow** prefix when two workflows in the same process expose the same concept — `"StandardCartRepo"` vs `"BauhausCartRepo"` vs `"MultiPickCartRepo"` all coexist in a single Mako process. **Company** prefixes do not belong in the tag: a process only runs one company (Empasa, Mako, or EasyLife), so `"Import"`, `"Work"`, and `"Abas"` are sufficient — no `"EmpasaImport"`, `"MakoImport"`, `"EasyLifeImport"`.

The class name is disambiguated by the import path + namespace alias (`StandardDB.CartRepo` vs `BauhausDB.CartRepo`). The tag string has no such context at runtime, so it must carry the workflow itself.

## Examples

### Good: smallest-path import with workflow DB namespace

```ts
import { Dashboard } from "#Mako/services/Dashboard"
import * as StandardModels from "#Mako/Standard/models"
import * as StandardDB from "#Mako/Standard/services/DBContext"
```

### Good: local sibling imports inside one module tree

```ts
import { ImportOrdersBwc } from "./rootSchemas.js"
import { Dashboard } from "./services/Dashboard.js"
import { Reset } from "./services/Reset.js"
```

### Good: cross-workflow namespace imports

```ts
import * as BauhausCore from "../Bauhaus/core.js"
import * as BauhausDB from "../Bauhaus/services/DBContext.js"
import * as StandardCore from "../Standard/core.js"
import * as StandardDB from "../Standard/services/DBContext.js"
```

### Avoid: renamed named imports for module aliases

```ts
import { DBContext as BauhausDBContext, OrderRepo as BauhausOrderRepo } from "../Bauhaus/services/DBContext.js" // avoid
import { Orders as StandardOrders } from "../Standard/core.js" // avoid
import { OrderInput as StandardOrderInput } from "../Standard/events.js" // avoid
```

Prefer:

```ts
import * as BauhausDB from "../Bauhaus/services/DBContext.js"
import * as StandardCore from "../Standard/core.js"
import type * as StandardEvents from "../Standard/events.js"
```

### Avoid: importing workflow repos from individual service files

All three below are cross-workflow imports (consumer lives in a different workflow than the target). Use the workflow-namespace form from the parent `DBContext.js` instead.

```ts
import { CartRepo as MultiPickCartRepo } from "../../MultiPick/services/CartRepo.js" // avoid (cross-workflow named)
import { DBContext as OnePickDBContext } from "../../OnePick/services/DBContext.js" // avoid (cross-workflow rename)
import { OrderRepo } from "../Standard/services/OrderRepo.js" // avoid (cross-workflow sibling — consumer is NOT inside Standard/)
```

Prefer:

```ts
import * as MultiPickDB from "../../MultiPick/services/DBContext.js"
import * as OnePickDB from "../../OnePick/services/DBContext.js"
```

### Good: bundle yielded repos by workflow when several are in scope

```ts
const multiPick = {
  deliveryNoteRepo: yield * MultiPickDB.DeliveryNoteRepo,
  cartRepo: yield * MultiPickDB.CartRepo
}
const onePick = { pickItemRepo: yield * OnePickDB.PickItemRepo }
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
