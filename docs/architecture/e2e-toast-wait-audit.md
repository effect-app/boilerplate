# E2E toast-wait audit

Class of bug: an e2e test fires an RPC-triggering click, then navigates or reads list state, but the RPC has not yet propagated. Same shape as `a909ece264` (`fix(e2e): settle cart-close + packspot RPCs in heavy-order-packing`). This document tracks the audit that followed, the helper changes that came out of it, and the exceptions that remain.

Settle-signal helpers live in [`e2e/helpers/act.ts`](../../e2e/helpers/act.ts) (`handleToast`, `handleToastFailure`, `waitForResponse`) and [`e2e/helpers/command.ts`](../../e2e/helpers/command.ts). Ranking in `act.ts` doc-comment: visible state change > URL change > toast > response > transient busy state.

## Outcome

Every audit-listed bare-click site now waits for the appropriate signal. The default path is now `command(resource).click()` (or `this.command(...)` in a POM, or the `command` fixture in a spec), which:

1. Locates the trigger via `scope.getByRole("button", { name: <intl label> })` — overridable.
2. Awaits the success / failure / progress toast derived from the same intl message — overridable.
3. Fails fast when the locator misses (intl rename) instead of timing out at the toast.

`handleToast` and `waitForResponse` are reserved for the narrow cases listed under [Remaining exceptions](#3-remaining-exceptions). Across the whole suite: 1 `handleToast` site (fill trigger), 1 `waitForResponse` site (silent toast), 2 `skipToast: true` sites (client-side validation), and 1 bare-click site (visible state change is a higher-rank settle than the racy auto-toast).

## 1. Helper API (current)

The helper is `command(resource)`, exposed through three entry points:

| Entry | Use site | Notes |
|---|---|---|
| `command` fixture | Specs: `async ({ page, command }) => …` | Page-bound. Returns a `BoundCommand`. |
| `PomBase.command` field | POMs: `this.command(rsc)` | Page-bound via constructor. |
| `makeBoundCommand(page)` | Top-level helper fns that only receive `page` and can't reach the fixture | Returns a `BoundCommandFactory`; call it like the fixture. |

Resource id is constrained to `ActionId` — every key under `action.${id}` in [`deActionMessages`](../../api/src/resources/action-intl.ts). Typos fail at compile time; a missing intl entry throws at construction.

Fluent shortcuts on `BoundCommand`:

| Method | Replaces | When |
|---|---|---|
| `.via(locator)` | `{ locator: … }` option | Trigger isn't a labeled button — list rows, dialog arrows, icon buttons, regex-matched labels, dialog-scoped buttons. Only way to set the trigger. |
| `.thenConfirm({ title?, label? })` | `afterClick: () => page.getByRole("button", { name: "Ja" }).click()` (+ optional `expect(dialog).toBeVisible()` before) | Action button opens a dialog; the RPC fires after the user confirms. Optional `title: string \| RegExp` asserts the dialog appeared with expected copy before the confirm click. |

For the case where the caller has already opened a dialog elsewhere and the "Ja" button itself is the RPC trigger, pass `{ label: "Ja" }` to `command()` — the default `getByRole("button", { name: "Ja" })` locator with the intl-derived toast prefix covers it without a dedicated method.

Options resolve across three layers (each overrides the previous): creation (`command(rsc, opts)`) → `bind` (`.bind(page, opts)`) → per-click (`.click(opts)`). `vars` are merged; `label` / `toastPrefix` / `exact` / `confirmAfterClick` cascade. The locator lives separately and is set only by `.via()`. See [`command.ts`](../../e2e/helpers/command.ts) for the full surface.

## 2. Migrated sites (~80 across 25 files)

Grouped by the original audit category, with the commit that resolved them.

### 2a. User-management mutations (~30 sites)
- [`463ae5c2f`](https://github.com/macs-holding/scanner/commit/463ae5c2f) — Empasa user-management: Erstellen / Speichern / Löschen + Ja confirm route through `command(UserManagement.{CreateUser,UpdateUserById,DeleteUserById})`.
- [`9a62d4606`](https://github.com/macs-holding/scanner/commit/9a62d4606) — Mako user-management features.spec, same shape.
- [`134564dd8`](https://github.com/macs-holding/scanner/commit/134564dd8) — duplicated `authenticateAdmin` / `createTestUser` helpers extracted into shared `UsersAdminPOM` + per-company subclasses (`EmpasaUsersAdminPOM`, `MakoUsersAdminPOM`); spec bodies use the fixture's `command` directly.

### 2b. Bauhaus POM (~9 sites)
- [`56a4f37eb`](https://github.com/macs-holding/scanner/commit/56a4f37eb) — invalid-weight `Packen` → `expectFailure: true`; "Wagen freigeben" / dialog-confirm "Ja" / "Stapeln" routed through `command`.
- [`cc3829972`](https://github.com/macs-holding/scanner/commit/cc3829972) — Verpackt-tab cart release maps to `PackCarts.ReleaseCart` (not `Empty`), drops redundant `label` overrides where intl `_isLabel.true` already matched.

### 2c. Cross-workflow + multi-pick + dropshipping
- [`9f6bba07f`](https://github.com/macs-holding/scanner/commit/9f6bba07f) — Mako cross-workflow block/unblock cart, via dynamic substring → later replaced with `CartManagement.ChangeBlockedState` vars shim.
- [`2dba4397b`](https://github.com/macs-holding/scanner/commit/2dba4397b) — Multi-pick "Alle Kommissioniert" position click awaits the `PickCarts.Full` toast.
- [`6565dd60f`](https://github.com/macs-holding/scanner/commit/6565dd60f) — Dropshipping release-cart "Ja" awaits `PackCarts.Release`.

### 2d. waitForResponse → toast wait where toast already proves the RPC
- [`8e178b750`](https://github.com/macs-holding/scanner/commit/8e178b750) — 9 redundant `waitForResponse(Pack | Unpack | ConfirmPacking)` sites in `dropshipping/packing.spec.ts` collapsed into `command(rsc).click()`.

### 2e. Locator-override sweep (~22 sites, batches 1 & 2)
- [`bd8a59dea`](https://github.com/macs-holding/scanner/commit/bd8a59dea) — bauhaus POM picking/packing assigns; dropshipping POM Cancel/MarkInStock/etc; cart-middleware dialog `<-` / `Nicht da` / `Doch da`; hold-carts.
- [`a3b02e0c9`](https://github.com/macs-holding/scanner/commit/a3b02e0c9) — Mako/Standard POM, markisen, one-pick, shared/import, cross-workflow specs.

### 2f. Intl _isLabel sync
- [`30fa83361`](https://github.com/macs-holding/scanner/commit/30fa83361) — `Bauhaus/ShipList.UpdateBuildingBlockPallet` intl gains `_isLabel` so the rendered "Speichern" button is intl-derived; three POM sites drop the literal handleToast in favour of `command(...)`.

### 2g. Page-bound API + sweep
- [`9361c4a61`](https://github.com/macs-holding/scanner/commit/9361c4a61) — `commandButton` fixture + `PomBase.commandButton` field; 14 POMs and 8 specs migrated to drop the explicit `page` argument; `ImportOverview`, `Import`, `OnePickPOM` promoted to extend `PomBase`.

### 2h. DX overhaul (PR #1330)
- [`53dc7af72`](https://github.com/macs-holding/scanner/commit/53dc7af72) — rename `commandButton` → `command`; add `.via(locator)` and `.confirm()` fluent shortcuts (`.confirm()` later dropped in favour of `{ label: "Ja" }`).
- [`2f60de888`](https://github.com/macs-holding/scanner/commit/2f60de888) — drop unbound `Command.click(page, …)`; tighten resource id type to `ActionId`; missing intl entry now throws.
- [`1161696f0`](https://github.com/macs-holding/scanner/commit/1161696f0) — swap `BoundCommand.click` arg order so e2e options come first.
- [`606da1ad5`](https://github.com/macs-holding/scanner/commit/606da1ad5) — `.thenConfirm()` replaces the recurring `afterClick: () => …getByRole("button", { name: "Ja" }).click()` pattern (7 sites).
- [`01ff566dc`](https://github.com/macs-holding/scanner/commit/01ff566dc) — drop `LocatorFactory` / `LocatorSource` types and the `{ locator: … }` option-bag; `.via(Locator)` is the only path to override the trigger. All 20 `(scope) => scope.X` sites migrated to `page.X` / `this.page.X`.

## 3. Remaining exceptions

### 3a. `handleToast` direct (1 site)

| Location | Reason | Verdict |
|---|---|---|
| [`empasa/markisen.ts:122`](../../e2e/tests/poms/empasa/markisen.ts#L122) `scanItem` — `handleToast("Scannen und Drucken", () => this.scanInput.fill(gtin))` | Trigger is `Locator.fill()`, not `click()`. `command(...).click()` always issues `.click()` on the located element. | Keep. `scanInput.fill` is the natural API for the scan flow; wrapping `command` around it would require either a `trigger` option (one call site, not worth the helper surface) or a click-then-fill pattern that races with the input's debounce. Toast prefix is the literal intl value, no drift risk past a rename of `TruckItems.ScanAndPrint`. |

### 3b. `waitForResponse` direct (1 site)

| Location | Reason | Verdict |
|---|---|---|
| [`mako/bauhaus.ts:180`](../../e2e/tests/poms/mako/bauhaus.ts#L180) `packBauhausCartonOnRowExpectWeightCapError` — `waitForResponse(this.page, () => row.check(), PackListRsc.SaveItems)` | `SaveItems` runs with `Command.withDefaultToast({ onWaiting: null, onSuccess: null })` ([Actions.vue:948-955](../../frontend/workflows/mako/pages/bauhaus/package/_components/Actions.vue#L948-L955)) — silent on success, so there is no toast for `handleToast` to wait on. | Keep. This is the documented ranking-step-4 fallback. The same resource also appears as `waitForResponse: PackListRsc.SaveItems` in the `packAndWait` helper at [bauhaus.ts:380](../../e2e/tests/poms/mako/bauhaus.ts#L380) — same justification. |

### 3b.1. `skipToast: true` on `command` (2 sites)

| Location | Reason | Verdict |
|---|---|---|
| [`bauhaus.ts:191`](../../e2e/tests/poms/mako/bauhaus.ts#L191) `packBauhausCartonOnRowExpectWeightCapError` — `bauhausPackArticlesBtn.click({ skipToast: true })` | Weight cap is enforced client-side: `Maximales Gewicht von 25 kg` is rendered as inline form-validation text, no `PackArticles` RPC fires. The neighbouring `expect(getByText(expectedError)).toBeVisible()` is the actual settle. | Keep. Initially migrated as `expectFailure: true`, which timed out waiting for a failure toast that never fires — corrected after running the suite. |
| [`bauhaus.ts:159`](../../e2e/tests/poms/mako/bauhaus.ts#L159) `packBauhausCartonExpectInvalidThenRetry` (dead code path — no callers) — same shape | Same client-side weight-cap validation. | Keep for consistency with the live `…WeightCapError` sibling; will go away when this dead helper is removed. |

### 3b.2. Visible-state-change settle (rank #1 in `act.ts`) instead of toast (1 site)

| Location | Reason | Verdict |
|---|---|---|
| [`mako/multi-pick/flow.spec.ts:79`](../../e2e/tests/mako/multi-pick/flow.spec.ts#L79) "Pick all items" — bare `positionButton.click()` followed by `expect(getByText("FREI")).toBeVisible({ timeout: 15000 })` | "Alle Kommissioniert" bursts N `PickList.Picked` toasts, then the watcher auto-fires `PickCarts.Full` which navigates via `Router.push` to `/carts`. The `Full` success toast races the navigation and does not reliably reach the new page. | Keep. Sweep first migrated this to `command(PickCarts.Full).via(...)` waiting on the Full toast — timed out under load. FREI tab visibility is a higher-rank settle anyway (rank #1) and was already in place. |

### 3c. Label overrides on `command`

Two sub-categories: "Ja" dialog confirms (sugar exists) and concrete-text divergence (manual override).

#### "Ja" dialog confirms — `{ label: "Ja" }` and `.thenConfirm()` (12 sites)

Two flavors:

**`.thenConfirm()`** — action button opens a dialog, then "Ja" fires the RPC.
- Delete-user sites (7): `user-editing.spec.ts:120`, `business-logic.spec.ts:69 / 87 / 184 / 198 / 246`, `features.spec.ts:167`.
- Dropshipping cancel/reverseCancel ([`dropshipping.ts:65`](../../e2e/tests/poms/easy-life/dropshipping.ts#L65), [`:75`](../../e2e/tests/poms/easy-life/dropshipping.ts#L75)) — activator (`getByText("Abbrechen")` on the order card) and the "Ja" click are co-located, so the full chain reads `command(rsc).via(activator).thenConfirm().click()`.

**`{ label: "Ja" }`** — the "Ja" button itself is the RPC trigger; the caller opened the dialog elsewhere (separate POM method, helper, or test step). Default `getByRole("button", { name: "Ja" })` covers it.

| Location | Resource |
|---|---|
| [`bauhaus.ts:219`](../../e2e/tests/poms/mako/bauhaus.ts#L219), [`:250`](../../e2e/tests/poms/mako/bauhaus.ts#L250), [`:389`](../../e2e/tests/poms/mako/bauhaus.ts#L389) + [`mako/standard.ts:241`](../../e2e/tests/poms/mako/standard.ts#L241) | `PackList.Print` (post-print "Ja" dialog; activator click in sibling POM method) |
| [`packing.spec.ts:596`](../../e2e/tests/easy-life/dropshipping/packing.spec.ts#L596), [`:610`](../../e2e/tests/easy-life/dropshipping/packing.spec.ts#L610) | `Dropshipping/PackList.ConfirmPacking` (activator triggered by `packCurrentOrderViaUI` helper) |
| [`markisen.ts:219`](../../e2e/tests/poms/empasa/markisen.ts#L219) | `Markisen/TruckItems.GodMode` (activator handled with a native `window.confirm` listener) |

**Verdict — keep.** Every "Ja" dialog has an upstream activator whose label matches the resource's intl key. Folding "Ja" into the resource's intl key would mean either renaming the activator (UX regression) or a third ICU branch — not worth it for a universal affirmation. `.thenConfirm()` collapses co-located activator + confirm into one chain; `{ label: "Ja" }` covers the cases where the activator click is buried in a helper or sibling method.

#### Concrete-text overrides where intl label diverges from rendered button (3 sites)

| Location | Resource | Intl label | Button text | Why |
|---|---|---|---|---|
| [`bauhaus.ts:16`](../../e2e/tests/poms/mako/bauhaus.ts#L16) (`bauhausCloseCartBtn` field) | `Bauhaus/PickCarts.Full` | `"Wagen Abschließen"` (rendered on the main commission page) | `"Abschließen"` (the cart-completion *dialog* confirm — same flow, different button) | Same dialog-vs-activator split as above, just without a `_isLabel` ICU pattern. Sibling activator already uses `"Wagen Abschließen"`. |
| [`bauhaus.ts:75`](../../e2e/tests/poms/mako/bauhaus.ts#L75) | `Bauhaus/PickList.AddOrderToCart` | `"Auftrag hinzufügen"` (sidebar entry) | `"Hinzufügen"` (the per-order-row confirm button) | Same shape — main entry and per-row confirm need different copy. |
| [`manager.spec.ts:255`](../../e2e/tests/easy-life/dropshipping/manager.spec.ts#L255) | `Dropshipping/Order.FixAddress` | plain `"Adressdaten überarbeiten"` | `"Speichern"` (the dialog submit) | The intl key has no `_isLabel` split; the dialog button uses generic `"Speichern"`. |

**Verdict — mostly keep.** Adding `_isLabel` ICU patterns would clean up the manager.spec case in particular, but the cost (touching shared intl + verifying no other render site relies on the current label) outweighs a single-line `label:` override. The pattern is documented and obvious from the call site.

Bauhaus's `bauhausCloseCartBtn` carries an inline comment justifying the label override; the other two are short enough that the override speaks for itself.

### 3d. `.via(locator)` trigger overrides (~20 sites)

Every locator override falls into one of four categories:

| Category | Examples | Why default locator can't fit |
|---|---|---|
| **Non-button trigger** — `getByText`, `getByTestId`, list-row click, `<v-card>` clickable text | [`bauhaus.ts:52`](../../e2e/tests/poms/mako/bauhaus.ts#L52) cart label, [`bauhaus.ts:112`](../../e2e/tests/poms/mako/bauhaus.ts#L112) pack-spot text, [`dropshipping.ts:113`](../../e2e/tests/poms/easy-life/dropshipping.ts#L113) detail-panel `Vergriffen markieren` span, [`markisen.ts:111`](../../e2e/tests/poms/empasa/markisen.ts#L111) `dummy` printer text, [`standard.ts:107`](../../e2e/tests/poms/mako/standard.ts#L107) `Wagen N` text | `getByRole("button", { name })` doesn't match `getByText` spans or `<v-list-item>` cards. Vue UI uses both for interactive surfaces. |
| **Regex / templated label** — button text contains a runtime value | [`packing.spec.ts:289`](../../e2e/tests/easy-life/dropshipping/packing.spec.ts#L289) `/Verpacken \(2\.5 kg\)/`, [`:653`](../../e2e/tests/easy-life/dropshipping/packing.spec.ts#L653) / [`:703`](../../e2e/tests/easy-life/dropshipping/packing.spec.ts#L703) `/Verpacken \(1 kg\)/` | `Command.label` is a string; weight is interpolated by the frontend into the button text. |
| **Scoped to dialog / row / parent** — many same-named buttons on page | [`cart-middleware.spec.ts:56,73,91,131,140,248,259`](../../e2e/tests/easy-life/dropshipping/cart-middleware.spec.ts#L56) `.v-dialog`-scoped, [`carts-management.ts:120`](../../e2e/tests/poms/empasa/carts-management.ts#L120) `getByRole("dialog").getByRole("button", { name: "Wagen Blockieren" })`, [`bauhaus.ts:444`](../../e2e/tests/poms/mako/bauhaus.ts#L444) `Kommissioniert` dialog opener (toast comes from the position click inside `afterClick`) | The default locator would match the wrong instance. `parent` covers some cases but not when the scoping is "the second button with this text" or "inside `.v-dialog` regardless of placement". |
| **Icon-only / accessible-name-less button** | [`cross-workflow-unblock-visibility.spec.ts:69`](../../e2e/tests/mako/cross-workflow-unblock-visibility.spec.ts#L69) the unblock icon — `cartRow.getByRole("button").filter({ hasNot: page.getByRole("link") }).first()` | Button has no text and no `aria-label`. The frontend renders it as an SVG; locating it requires a structural filter, not `getByRole({ name })`. |

**Verdict — keep all.** Each override is the simplest expression of the trigger's structure. The intl-derived toast prefix stays bound to the resource, which is the load-bearing intl link; `.via()` only sets where to click. Drift risk on the locator is intentional and local — renaming a dialog button breaks the test on the right line, not at the toast wait.

A small future improvement: the `<v-list-item>` (cart text) and dialog `"<-" `/`"Nicht da"` / `"Doch da"` button patterns each repeat 3–4 times across different specs / POMs. They could be hoisted into named locator helpers (e.g. `cartListItem(label)`, `dialogConfirmButton(label)`) and chained into `.via(...)` without changing the `command` API. Left for a follow-up since the duplication is shallow and the call site is more readable inline.

### 3e. Resource shims `{ id: "..." } as const` (3 sites)

| Shim | Location | Reason |
|---|---|---|
| `CartManagement.ChangeBlockedState` | [`empasa/carts-management.ts`](../../e2e/tests/poms/empasa/carts-management.ts), [`easy-life/carts-management.ts`](../../e2e/tests/poms/easy-life/carts-management.ts), [`cross-workflow-unblock-visibility.spec.ts`](../../e2e/tests/mako/cross-workflow-unblock-visibility.spec.ts) | Intl key exists in [`action-intl.ts`](../../api/src/resources/action-intl.ts#L18) but no Effect resource class — the action is dispatched via a frontend-only form. |
| `CartManagementForm.AdjustCartCount` | [`cross-workflow-cart-count-sync.spec.ts`](../../e2e/tests/mako/cross-workflow-cart-count-sync.spec.ts#L9) | Composite toast surfaced by the "Wagen verwalten" dialog; the dialog actually dispatches per-workflow `PickCarts.UpdateCount` mutations but the user-facing toast text comes from this synthetic intl key. |

**Verdict — keep.** Shims keep the intl coupling explicit (renaming the key still breaks the test at the toast wait); the alternative is a string literal in `handleToast`, which is strictly worse. The shape `{ id: "X" } as const` satisfies `command`'s `{ readonly id: ActionId }` constraint as long as the literal matches an existing `action.${ActionId}` key — typos fail at compile time, missing intl entries throw at construction.

If the underlying frontend action ever migrates onto a real resource class, swap the shim's import — call sites stay unchanged.

## 4. Recommended next steps

1. **`Order.FixAddress` _isLabel** — adding `{_isLabel, true {Speichern} other {Adressdaten überarbeiten}}` to the four FixAddress keys ([action-intl.ts:51,105,145,173,202,216,234](../../api/src/resources/action-intl.ts#L51)) drops the manager.spec label override and unblocks similar use of FixAddress in other workflows. Confirm no on-page button currently relies on the long form being shown.
2. **Locator helpers** — `cartListItem`, `dialogConfirmButton(label)`, `dialogScopedButton(label)` would dedupe the 7+ `.v-dialog` patterns in cart-middleware + carts-management POMs.
3. **`Markisen/TruckItems.ScanAndPrint` trigger** — if a second fill-based toast case ever appears, extend `command` with an optional `trigger?: (loc: Locator) => Promise<void>` to absorb the last `handleToast` call site. Not worth it for a single instance.
4. **CartManagement shim → real resource** — if/when the cart-management form gets a proper Effect resource class, the three call sites can drop the local `const ChangeBlockedState = { id: … } as const` and import the real one.
