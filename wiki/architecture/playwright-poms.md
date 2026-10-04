<!-- Space: SA -->
<!-- Parent: Architecture -->
<!-- Parent: Architecture (shared) -->
<!-- Title: Playwright Page Object Models -->

# Playwright Page Object Models — design rules

Cross-project rules for designing Playwright POMs in effect-app applications. App-specific layering (company bases, command wrappers) lives in the app's `e2e.md`.

## Core rule

> POMs describe **what's on the page**, not **what one test does with it**.

If a method name encodes a specific test scenario, an entity ID, a weight, a count, a city, an article number — it belongs in the spec, not the POM. The POM exposes primitives; the spec composes scenarios.

## Patterns

### Prefer dynamic getters over numbered statics

Bad:

```ts
readonly row4: Locator
readonly row5: Locator
readonly firstCode: Locator
readonly secondCode: Locator
```

Good:

```ts
getRowCheckbox(index: number) { return this.rowCheckboxes.nth(index) }
getRowByCode(code: string)    { return this.page.getByText(code).nth(0) }
getNumberedItem(n: number)    { return this.page.locator(`text=Item ${n}`).nth(0) }
```

Naming: `get*(...)` for locator factories, semantic verbs (`navigateTo*`, `switchTo*`, `select*`, `choose*`) for awaitable methods.

### Parametrize anything the spec varies

Bad:

```ts
this.checkButton = page.getByText("listing ( 5 ) ( 5 items )")
async openDetailsForOrder2343712() { ... "Region1" ... "2343712" ... "Berlin" ... }
async processFirstContainer300Weight22kg() { ... "Container 300" ... "22" ... }
async markOrdersAsDoneAndReturn7() { for (i=0; i<7; ...) ... "Berlin" }
```

Good:

```ts
getListingCheck(rows: number, items: number)
openDetailsForOrder(region: string, orderId: string)
processContainer(containerName: string, weight: string)
markOrdersAsDoneAndReturn(itemCount: number, qtyLabel: string, city: string, orderId: string)
```

### Loops and randomness belong in the spec

Bad (loop + random hard-baked):

```ts
async handlePositions() {
  for (let i = 0; i < 5; i++) {
    await this.checkButton.click()
    const random = Math.floor(Math.random() * 10)
    await this.positionLabel.locator("button").nth(random).click()
  }
}
```

Good (POM gives primitive, spec controls count):

```ts
// POM
async chooseRandomPosition(range: number) {
  await this.checkButton.click()
  await this.getPositionButton(Math.floor(Math.random() * range)).click()
}

// spec
for (let i = 0; i < 5; i++) {
  await pom.chooseRandomPosition(10)
}
```

### Dedupe city/region variants

If two methods only differ by a string they hard-code, collapse into one and pass the string:

```ts
// Before
openOverview()         // hard-coded "Berlin", "2343712"
openOverviewMunich(id) // hard-coded "Munich"

// After
openOverviewFor(city: string, orderId: string)
```

### Locator selection priority

In order of preference:

1. `getByRole(...)` with `name` regex/string — accessibility-driven, robust.
2. `getByLabel(...)`, `getByPlaceholder(...)`, `getByText(...)`.
3. `data-test` attributes (e.g. `[data-test='item-list']`, `[data-entity="..."]`).
4. Structural CSS only when above are unavailable; document why.

Avoid:

- Auto-generated framework IDs (e.g. Vuetify `#input-v-0-4-0-37`). They drift with component-tree changes. Treat as a code smell — leave a TODO and prefer adding `data-test` to the component.
- `.nth(<big number>)` (`nth(14)`, etc.). Either pin via role/text or expose as `get*(index)` so callers see the index.
- Locators that bake in a count: `text=occupied (1)`. Parametrize.

### Validation / error paths

Cases like "fill bad value, expect inline error, retry with valid" deserve their own POM method _because the sequence is reusable_, not because the values are fixed. Take the values as args:

```ts
fillFieldOnRowExpectError(
  fieldName: string,
  invalidValue: string,
  validValue: string,
  rowName: string,
  expectedError: string | RegExp
)
```

### When a wrapper is OK

A POM method that just renames a primitive is dead weight:

```ts
async clickDetailsButton() { await this.detailsButton.click() }
```

Prefer the locator directly:

```ts
await pom.detailsButton.click()
```

Keep wrappers when they add meaning, synchronization, or reuse:

- Wrap an RPC-triggering button click with the app-specific helper that derives the right toast/label/wait (see the app's `e2e.md` for the project's wrapper conventions).
- Express a navigation or view change the spec should read semantically (`navigateToWorkflowA()`, `switchToOnHoldTab()`).
- Compose multiple primitives in a way every caller wants (`selectOrder(itemCount)` orchestrating goto + select + add + finish).
- Hide a brittle selector behind a stable name (`getGroupButton(n)` over `text=Group ${n}`).

## Layering principle

POM hierarchies should layer by **shared surface area**, not by test scenario:

- A shared base holds cross-page primitives (toast handling, RPC-action wrapper, page navigation helpers).
- Tenant/area bases hold helpers shared within one tenant or area (hardware input, header checkbox, navigation roots).
- Workflow POMs extend the area base and add workflow-specific primitives.
- Shared cross-tenant POMs that vary only by form fields live in `shared/` and are subclassed per tenant.

Don't push test-specific logic up the hierarchy; don't duplicate primitives across workflows.

## Timeouts

`playwright.config.ts` should typically rely on Playwright defaults:

- Per-test timeout: **30 s**
- `expect()` timeout: **5 s**

Reach for `test.slow()` (triples the per-test budget) only after investigating why the test is slow. A test that runs close to 30 s is almost always doing more waiting than working.

### Slow tests are usually a smell

Common causes:

- **Unclosed toasts** — clicking a button that fires a toast without awaiting it means subsequent steps stack behind the still-visible toast. Use the project's RPC-settle helper rather than `waitForTimeout`.
- **Blind `waitForTimeout(...)`** — replace with locator-based waits (`expect(locator).toBeVisible()`, `waitForResponse(...)`).
- **`networkidle` waits on SPA pages** — `waitForURL` does not wait for paint; pair it with an assertion on a stable element instead of `networkidle`.
- **Sequential `expect()` polls that could be one assertion** — e.g. checking N rows individually instead of asserting on the list count once.
- **Auto-generated framework IDs in locators** that retry on every component-tree change — see locator priority above.
- **Re-running fixtures or imports inside steps that should reuse state** — set up once per test, not per step.

If a test legitimately exercises a multi-stage workflow and the wall-clock floor is dominated by real backend work, `test.slow()` is fine. Document why in a short comment next to the call.

### CI cost

Long per-test timeouts are most expensive when the test is already broken. If a click does nothing, or the action fails immediately, a blanket long timeout just burns CI minutes waiting for a state change that will never arrive. Prefer waiting briefly for an in-progress signal, only then extending the timeout window, and stopping as soon as the terminal success or failure signal appears.

## Checklist before adding a POM method

- [ ] Name describes the **UI action**, not the test step.
- [ ] All literal IDs / weights / counts / cities are parameters, not part of the name.
- [ ] Method adds behavior or intent beyond `locator.click()`; otherwise expose/use the locator directly.
- [ ] Loops with fixed counts live in specs; POM exposes the single-iteration primitive.
- [ ] Locator uses role / label / text; auto-IDs and large `nth(N)` flagged or refactored.
- [ ] No `*ForOrder<ID>`, `*Order<N><City>`, `*<Number>Weight<N>kg` patterns.
