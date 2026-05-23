# E2E Tests

End-to-end tests live in `e2e/` and run on Playwright. They drive the real frontend against a real backend per company (Mako, Easy-Life, Empasa).

> **Mandatory pattern: walk a flow via UI exactly once per workflow; API-seed all variants.**
> See [E2E State Pattern](./e2e-state-pattern.md) for the full rule + helpers.
> Audit of current duplicate walks: [duplicate-walks audit](../flows/e2e-duplicate-walks.md).
> Coverage gaps: [coverage-gaps](../flows/e2e-coverage-gaps.md).

- Test files: `e2e/tests/<company>/<workflow>/*.spec.ts`
- Page Object Models: `e2e/tests/poms/<company>/<workflow>.ts`
- Helpers: `e2e/helpers/` (toast handling, CSV import, client fixups)
- Playwright config: `e2e/playwright.config.ts`
- Operational notes & inventory: [`e2e/README.md`](../../e2e/README.md)

## POM architecture

How to design and name POM methods — dynamic getters, parametrization, locator priority, layering — is documented separately:

- [POM Architecture](../../e2e/tests/poms/ARCHITECTURE.md)

Specs compose POM primitives. Test-specific values (order IDs, weights, cities, counts) belong in the spec, not the POM.

## `command(rsc)` is the default action wrapper

RPC-triggering button clicks go through [`command(resource)`](../../e2e/helpers/command.ts) (in specs: destructure `command` from the test fixture; in POMs: `this.command(...)`). The helper derives the button label and toast prefix from the same intl key the frontend renders, so a label rename breaks the test at the locator step instead of at a stale toast wait.

Fluent shortcuts: `.via(locator)` for non-button triggers, `.thenConfirm()` when the action opens a confirm dialog and the RPC fires on "Ja". For the case where the caller already opened the dialog elsewhere and "Ja" itself is the trigger, pass `{ label: "Ja" }` to `command()`. Audit + rationale for `handleToast` / `waitForResponse` fallbacks: [e2e-toast-wait-audit.md](./e2e-toast-wait-audit.md).

## Timeouts

`playwright.config.ts` does **not** override `timeout`, `expect.timeout`, `actionTimeout`, `navigationTimeout`, or `globalTimeout`. Playwright defaults apply:

- Per-test timeout: **30 s**
- `expect()` timeout: **5 s**

A handful of long workflow specs use `test.slow()`, which triples the per-test timeout to 90 s and tags the test as slow in reports. Current set lives in `e2e/README.md` ("Tests marked `test.slow()`").

### Slow tests are usually a smell

Reach for `test.slow()` only after investigating why the test is slow. A test that runs close to 30 s is almost always doing more waiting than working. Common causes:

- **Unclosed toasts** — clicking a button that fires a toast without awaiting it (via `command(rsc).click()`, `handleToast(...)`, or `actButton(...)`) means subsequent steps stack behind the still-visible toast. The default path is `command(rsc).click()`; reach for `handleToast` only for fill-trigger / `waitForResponse` for silent toasts (see [audit](./e2e-toast-wait-audit.md)).
- **Blind `waitForTimeout(...)`** — replace with locator-based waits (`expect(locator).toBeVisible()`, `waitForResponse(...)`).
- **`networkidle` waits on SPA pages** — `waitForURL` does not wait for paint; pair it with an assertion on a stable element instead of `networkidle`.
- **Sequential `expect()` polls that could be one assertion** — e.g. checking N rows individually instead of asserting on the list count once.
- **Auto-generated Vuetify IDs in locators** that retry on every component-tree change — see POM Architecture for locator priority.
- **Re-running fixtures or imports inside steps that should reuse state** — import once per test, not per step.

If a test legitimately exercises a multi-stage workflow (pick → pack → closeout) and the wall-clock floor is dominated by real backend work, `test.slow()` is fine. Document why in a short comment next to the call.

### CI cost

Long per-test timeouts are most expensive when the test is already broken. If a click does nothing, or the action fails immediately, a blanket 90 s timeout just burns CI minutes waiting for a state change that will never arrive. Prefer waiting briefly for the German `… wird ausgeführt` in-progress toast, only then extending the timeout window, and stopping as soon as the terminal success or failure toast appears.
