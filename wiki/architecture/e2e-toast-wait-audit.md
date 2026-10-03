# E2E toast-wait audit

Class of bug: an e2e test fires an RPC-triggering click, then navigates or reads list state, but the RPC has not yet propagated. This document tracks the audit shape that followed, the helper changes that came out of it, and the exceptions that remain.

Settle-signal helpers live in [`e2e/helpers/act.ts`](../../e2e/helpers/act.ts) (`handleToast`, `handleToastFailure`, `waitForResponse`) and [`e2e/helpers/command.ts`](../../e2e/helpers/command.ts). Ranking in `act.ts` doc-comment: visible state change > URL change > toast > response > transient busy state.

## Outcome

Every audit-listed bare-click site now waits for the appropriate signal. The default path is now `command(resource).click()` (or `this.command(...)` in a POM, or the `command` fixture in a spec), which:

1. Locates the trigger via `scope.getByRole("button", { name: <intl label> })` — overridable.
2. Awaits the success / failure / progress toast derived from the same intl message — overridable.
3. Fails fast when the locator misses (intl rename) instead of timing out at the toast.

`handleToast` and `waitForResponse` are reserved for the narrow cases listed under [Remaining exceptions](#3-remaining-exceptions).

## 1. Helper API (current)

The helper is `command(resource)`, exposed through three entry points:

| Entry                    | Use site                                                                  | Notes                                                      |
| ------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `command` fixture        | Specs: `async ({ page, command }) => …`                                   | Page-bound. Returns a `BoundCommand`.                      |
| `PomBase.command` field  | POMs: `this.command(rsc)`                                                 | Page-bound via constructor.                                |
| `makeBoundCommand(page)` | Top-level helper fns that only receive `page` and can't reach the fixture | Returns a `BoundCommandFactory`; call it like the fixture. |

Resource id is constrained to `ActionId` — every key under `action.${id}` in the frontend intl catalog (`frontend/composables/intl.ts`). Typos fail at compile time; a missing intl entry throws at construction.

Fluent shortcuts on `BoundCommand`:

| Method                             | Replaces                                                                                                                | When                                                                                                                                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.via(locator)`                    | `{ locator: … }` option                                                                                                 | Trigger isn't a labeled button — list rows, dialog arrows, icon buttons, regex-matched labels, dialog-scoped buttons. Only way to set the trigger.                               |
| `.thenConfirm({ title?, label? })` | `afterClick: () => page.getByRole("button", { name: "Ja" }).click()` (+ optional `expect(dialog).toBeVisible()` before) | Action button opens a dialog; the RPC fires after the user confirms. Optional `title: string \| RegExp` asserts the dialog appeared with expected copy before the confirm click. |

For the case where the caller has already opened a dialog elsewhere and the "Ja" button itself is the RPC trigger, pass `{ label: "Ja" }` to `command()` — the default `getByRole("button", { name: "Ja" })` locator with the intl-derived toast prefix covers it without a dedicated method.

Options resolve across three layers (each overrides the previous): creation (`command(rsc, opts)`) → `bind` (`.bind(page, opts)`) → per-click (`.click(opts)`). `vars` are merged; `label` / `toastPrefix` / `exact` / `confirmAfterClick` cascade. The locator lives separately and is set only by `.via()`. See [`command.ts`](../../e2e/helpers/command.ts) for the full surface.

## 2. Migrated sites

Grouped by the original audit category.

### 2a. User-management mutations

- User-management: Create / Save / Delete + confirm route through `command(UserManagement.{CreateUser,UpdateUserById,DeleteUserById})`.
- Duplicated `authenticateAdmin` / `createTestUser` helpers extracted into a shared `UsersAdminPOM` + per-tenant subclasses; spec bodies use the fixture's `command` directly.

### 2b. Workflow POM

- Invalid-weight action → `expectFailure: true`; release / dialog-confirm / stack actions routed through `command`.
- Done-tab release maps to the release resource (not the generic empty action), dropping redundant `label` overrides where the intl `_isLabel.true` already matched.

### 2c. Cross-workflow + item + order

- Cross-workflow block/unblock order, via dynamic substring → later replaced with an `OrderManagement.ChangeBlockedState` vars shim.
- "Mark all done" position click awaits the `Orders.Full` toast.
- Release "Ja" awaits `Orders.Release`.

### 2d. waitForResponse → toast wait where toast already proves the RPC

Redundant `waitForResponse(Process | Split | Confirm)` sites in `<workflow>/processing.spec.ts` collapsed into `command(rsc).click()`.

### 2e. Locator-override sweep

- Workflow POM assign actions; order-workflow POM Cancel/MarkInStock/etc; dialog `<-` / `Not there` / `There`; hold-orders.
- Other workflow POMs, shared/import, cross-workflow specs.

### 2f. Intl `_isLabel` sync

`<workflow>/Orders.UpdateLabel` intl gains `_isLabel` so the rendered "Save" button is intl-derived; POM sites drop the literal `handleToast` in favour of `command(...)`.

### 2g. Page-bound API + sweep

- `command` fixture + `PomBase.command` field; POMs and specs migrated to drop the explicit `page` argument; misc POMs promoted to extend `PomBase`.

### 2h. DX overhaul

- Rename the old command-button helper → `command`; add `.via(locator)` and confirm fluent shortcuts.
- Drop the unbound `Command.click(page, …)`; tighten resource id type to `ActionId`; missing intl entry now throws.
- Swap `BoundCommand.click` arg order so e2e options come first.
- `.thenConfirm()` replaces the recurring `afterClick: () => …getByRole("button", { name: "Ja" }).click()` pattern.
- Drop `LocatorFactory` / `LocatorSource` types and the `{ locator: … }` option-bag; `.via(Locator)` is the only path to override the trigger. All `(scope) => scope.X` sites migrated to `page.X` / `this.page.X`.

## 3. Remaining exceptions

### 3a. `handleToast` direct

| Location                                                                                       | Reason                                                                                                              | Verdict                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<workflow>.ts` `readItem` — `handleToast("Read and export", () => this.codeInput.fill(code))` | Trigger is `Locator.fill()`, not `click()`. `command(...).click()` always issues `.click()` on the located element. | Keep. `codeInput.fill` is the natural API for the input flow; wrapping `command` around it would require either a `trigger` option (one call site, not worth the helper surface) or a click-then-fill pattern that races with the input's debounce. Toast prefix is the literal intl value, no drift risk past a rename of the resource action. |

### 3b. `waitForResponse` direct

| Location                                                                                                                        | Reason                                                                                                                                                                                     | Verdict                                               |
| ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| `<workflow>.ts` `processContainerOnRowExpectWeightCapError` — `waitForResponse(this.page, () => row.check(), Orders.SaveItems)` | `SaveItems` runs with `Command.withDefaultToast({ onWaiting: null, onSuccess: null })` (the row Actions component) — silent on success, so there is no toast for `handleToast` to wait on. | Keep. This is the documented ranking-step-4 fallback. |

### 3b.1. `skipToast: true` on `command`

| Location                                                                                                   | Reason                                                                                                                                                                                                              | Verdict                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<workflow>.ts` `processContainerOnRowExpectWeightCapError` — `processItemsBtn.click({ skipToast: true })` | Weight cap is enforced client-side: `Maximales Gewicht von 25 kg` is rendered as inline form-validation text, no RPC fires. The neighbouring `expect(getByText(expectedError)).toBeVisible()` is the actual settle. | Keep. Initially migrated as `expectFailure: true`, which timed out waiting for a failure toast that never fires — corrected after running the suite. |

### 3b.2. Visible-state-change settle (rank #1 in `act.ts`) instead of toast

| Location                                                                                                                                           | Reason                                                                                                                                                                                                                              | Verdict                                                                                        |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `<workflow>/flow.spec.ts` "Mark all items" — bare `positionButton.click()` followed by `expect(getByText("OPEN")).toBeVisible({ timeout: 15000 })` | "Mark all done" bursts N `Items.MarkDone` toasts, then the watcher auto-fires `Orders.Full` which navigates via `Router.push` to `/orders`. The `Full` success toast races the navigation and does not reliably reach the new page. | Keep. `OPEN` tab visibility is a higher-rank settle anyway (rank #1) and was already in place. |

### 3c. Label overrides on `command`

Two sub-categories: "Ja" dialog confirms (sugar exists) and concrete-text divergence (manual override).

#### "Ja" dialog confirms — `{ label: "Ja" }` and `.thenConfirm()`

Two flavors:

**`.thenConfirm()`** — action button opens a dialog, then "Ja" fires the RPC.

- Delete-user sites; cancel/reverse-cancel — activator (`getByText("Cancel")` on the order card) and the "Ja" click are co-located, so the full chain reads `command(rsc).via(activator).thenConfirm().click()`.

**`{ label: "Ja" }`** — the "Ja" button itself is the RPC trigger; the caller opened the dialog elsewhere (separate POM method, helper, or test step). Default `getByRole("button", { name: "Ja" })` covers it.

**Verdict — keep.** Every "Ja" dialog has an upstream activator whose label matches the resource's intl key. Folding "Ja" into the resource's intl key would mean either renaming the activator (UX regression) or a third ICU branch — not worth it for a universal affirmation. `.thenConfirm()` collapses co-located activator + confirm into one chain; `{ label: "Ja" }` covers the cases where the activator click is buried in a helper or sibling method.

#### Concrete-text overrides where intl label diverges from rendered button

| Location                                | Resource                      | Intl label                                  | Button text                                                               | Why                                                                                                                              |
| --------------------------------------- | ----------------------------- | ------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `<workflow>.ts` (`closeOrderBtn` field) | `<workflow>/Orders.Full`      | `"Close order"` (rendered on the main page) | `"Close"` (the completion _dialog_ confirm — same flow, different button) | Same dialog-vs-activator split as above, just without an `_isLabel` ICU pattern. Sibling activator already uses `"Close order"`. |
| `<workflow>.ts`                         | `<workflow>/Orders.AddOrder`  | `"Add order"` (sidebar entry)               | `"Add"` (the per-row confirm button)                                      | Same shape — main entry and per-row confirm need different copy.                                                                 |
| `<workflow>/manager.spec.ts`            | `<workflow>/Order.FixAddress` | plain `"Edit address"`                      | `"Save"` (the dialog submit)                                              | The intl key has no `_isLabel` split; the dialog button uses generic `"Save"`.                                                   |

**Verdict — mostly keep.** Adding `_isLabel` ICU patterns would clean up the manager.spec case in particular, but the cost (touching shared intl + verifying no other render site relies on the current label) outweighs a single-line `label:` override. The pattern is documented and obvious from the call site.

### 3d. `.via(locator)` trigger overrides

Every locator override falls into one of four categories:

| Category                                                                                       | Examples                                                                                                                                                        | Why default locator can't fit                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Non-button trigger** — `getByText`, `getByTestId`, list-row click, `<v-card>` clickable text | order label, row text, detail-panel span, dummy provider text                                                                                                   | `getByRole("button", { name })` doesn't match `getByText` spans or `<v-list-item>` cards. Vue UI uses both for interactive surfaces.                                                           |
| **Regex / templated label** — button text contains a runtime value                             | `/Process \(2\.5 kg\)/`, `/Process \(1 kg\)/`                                                                                                                   | `Command.label` is a string; weight is interpolated by the frontend into the button text.                                                                                                      |
| **Scoped to dialog / row / parent** — many same-named buttons on page                          | `.v-dialog`-scoped, `getByRole("dialog").getByRole("button", { name: "Block order" })`, dialog opener (toast comes from the position click inside `afterClick`) | The default locator would match the wrong instance. `parent` covers some cases but not when the scoping is "the second button with this text" or "inside `.v-dialog` regardless of placement". |
| **Icon-only / accessible-name-less button**                                                    | the unblock icon — `orderRow.getByRole("button").filter({ hasNot: page.getByRole("link") }).first()`                                                            | Button has no text and no `aria-label`. The frontend renders it as an SVG; locating it requires a structural filter, not `getByRole({ name })`.                                                |

**Verdict — keep all.** Each override is the simplest expression of the trigger's structure. The intl-derived toast prefix stays bound to the resource, which is the load-bearing intl link; `.via()` only sets where to click. Drift risk on the locator is intentional and local — renaming a dialog button breaks the test on the right line, not at the toast wait.

A small future improvement: the `<v-list-item>` (order text) and dialog confirm-button patterns each repeat across different specs / POMs. They could be hoisted into named locator helpers (e.g. `orderListItem(label)`, `dialogConfirmButton(label)`) and chained into `.via(...)` without changing the `command` API. Left for a follow-up since the duplication is shallow and the call site is more readable inline.

### 3e. Resource shims `{ id: "..." } as const`

| Shim                                 | Location                                                               | Reason                                                                                                                                                                                           |
| ------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `OrderManagement.ChangeBlockedState` | per-tenant `orders-management.ts` POMs, cross-workflow visibility spec | Intl key exists in the frontend catalog but no Effect resource class — the action is dispatched via a frontend-only form.                                                                        |
| `OrderManagementForm.AdjustCount`    | cross-workflow count-sync spec                                         | Composite toast surfaced by the management dialog; the dialog actually dispatches per-workflow `Orders.UpdateCount` mutations but the user-facing toast text comes from this synthetic intl key. |

**Verdict — keep.** Shims keep the intl coupling explicit (renaming the key still breaks the test at the toast wait); the alternative is a string literal in `handleToast`, which is strictly worse. The shape `{ id: "X" } as const` satisfies `command`'s `{ readonly id: ActionId }` constraint as long as the literal matches an existing `action.${ActionId}` key — typos fail at compile time, missing intl entries throw at construction.

If the underlying frontend action ever migrates onto a real resource class, swap the shim's import — call sites stay unchanged.

## 4. Recommended next steps

1. **`Order.FixAddress` `_isLabel`** — adding `{_isLabel, true {Save} other {Edit address}}` to the FixAddress keys drops the manager.spec label override and unblocks similar use in other workflows. Confirm no on-page button currently relies on the long form being shown.
2. **Locator helpers** — `orderListItem`, `dialogConfirmButton(label)`, `dialogScopedButton(label)` would dedupe the `.v-dialog` patterns in dialog-middleware + management POMs.
3. **Fill-trigger toast** — if a second fill-based toast case ever appears, extend `command` with an optional `trigger?: (loc: Locator) => Promise<void>` to absorb the last `handleToast` call site. Not worth it for a single instance.
4. **Management shim → real resource** — if/when the management form gets a proper Effect resource class, the call sites can drop the local `const ChangeBlockedState = { id: … } as const` and import the real one.
