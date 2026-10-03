# E2E — Walk Once, API-Seed Variants

Companion to [E2E Architecture](./e2e.md). Mandatory pattern for new specs + refactor target for old ones.

## Rule

**Walk a flow via the UI exactly once per workflow.** For every variant, edge case, or branch off that flow, **seed state via API calls** and exercise only the divergent UI surface.

## Why

UI walks are expensive:

- Browser nav + paint waits + animation settle = 3–10× slower than API calls
- Each step adds flake surface (selector misses, race conditions, toast stacking)
- Repeated walks bloat CI minutes + test files

API-seeded state hits the same controllers the UI does. State is realistic, drift-resistant, fast.

Track redundant walks; each one is a candidate for an API-seeded variant.

## The pattern

### One UI happy path per workflow

```ts
// e2e/tests/<workflow>/full-workflow.spec.ts
test.slow() // legitimately walks the workflow end-to-end
test("<workflow> full workflow", async ({ page, runtimes }) => {
  await importSample("<workflow>/sample.json")
  // walk the UI from start to finish
})
```

### Variants seeded via API helpers

```ts
// e2e/tests/<workflow>/variants/stacking.spec.ts
test("Stack height 5 allowed, 6 rejected", async ({ runtimes }) => {
  const { orderId } = await seedOrder({
    site: "Berlin",
    provider: "provider-a",
    items: 6 // pre-built 6-tall stack via API
  })
  // single UI assertion: stack-height-6 dialog shows error
})

test("Non-stackable provider items cannot stack", async ({ runtimes }) => {
  const { orderId } = await seedOrder({
    provider: "provider-b",
    items: 2
  })
  // assert the option is disabled for a non-stackable provider
})
```

### Composite seed helpers live in `e2e/helpers/seed/`

```
e2e/helpers/seed/
├── <workflow-a>.ts   seedOrder(...) advanceToStepD(...) putOrderInTransferredState(...)
├── <workflow-b>.ts   seedBatch(...) setupDoneState(...)
├── <workflow-c>.ts   seedDocuments(...)
├── <workflow-d>.ts   seedContainer(...) loadContainer(...)
└── _shared.ts        loginAs(role), apiClient(ctx)
```

Each helper calls real controllers — same path the UI takes. No backdoor DB migrations.

### POMs expose `jumpTo(state)`

```ts
const order = new WorkflowOrder(page)
await order.jumpTo("transferred", { orderId })
// no UI walk; order now in transferred state
```

Implemented in terms of seed helpers.

## What goes off the UI entirely

E2E is NOT the place for:

- **External API request structure** → unit-test `api/src/services/<Provider>/*.ts`
- **Stack validator algorithm** → pure function, unit test
- **Projection flag math** → unit/integration tests over repo data
- **External-system event serialization** → schema tests
- **PDF byte-level layout** → visual regression only for top-priority documents
- **Mailer subject/recipient** → integration test w/ test transport

Move these. Keep e2e for: "user clicks button X, sees outcome Y, given state Z".

## Spec file layout

```
<workflow>/
├── full-workflow.spec.ts        ← single UI happy path, kept thorough
├── variants/
│   ├── <concern-1>.spec.ts      ← API-seeded, focused UI assertion
│   ├── <concern-2>.spec.ts
│   └── ...
└── provider/                    ← integration-level provider tests if needed
    └── ...
```

Aim: `variants/*.spec.ts` average 5–10 sec each — most steps API, one UI assertion.

## When e2e tests are required

**New or changed business behavior must be exercised by an e2e spec before it reaches production.** Two acceptable paths:

| Path                      | When OK                                                                                                                                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tests-with-merge**      | PR includes the e2e spec covering the new/changed behavior. Merges + ships.                                                                                     |
| **Behind feature toggle** | PR may merge without e2e _only_ if the new behavior is gated behind a feature flag disabled in prod. A follow-up PR adds the e2e spec before the flag flips on. |

What's **not** OK: new behavior reaching prod without e2e coverage of the divergence. Manual QA does not count.

This applies to AI agents and humans equally. If an agent ships a behavior change, it must also write the test or open a paired PR doing so.

Note: adding a _bad_ e2e test (full-flow walk for a variant assertion) is worse than adding no test — see Acceptance criteria below.

## Acceptance criteria for new specs

When opening a PR w/ a new e2e spec, reviewer checks:

- [ ] Does it walk a full flow via UI? If yes, is it the **canonical** happy path for that workflow (no other spec already does this)?
- [ ] If it's a variant, does it use an API seed helper to reach the divergent state?
- [ ] If the seed helper doesn't exist yet, does this PR add it to `e2e/helpers/seed/`?
- [ ] Could any step be unit-tested instead? (Pure functions, schemas, API requests)
- [ ] Does the spec run in under 15 seconds locally? (over 30 → reach for `test.slow()` only after investigating per [e2e.md](./e2e.md#slow-tests-are-usually-a-smell))

## Acceptance criteria for spec refactors

When refactoring an old spec toward this pattern:

- [ ] Extract any repeated prelude (≥3 specs using same setup) into `e2e/helpers/seed/<workflow>.ts`
- [ ] If specs share a sample import, consider suite-scoped `beforeAll()` (only if tests don't mutate shared state)
- [ ] Parameterize variant tests via `for (const variant of variants) test(...)` when the only difference is data

## Existing helpers (already in repo)

`e2e/helpers/command.ts`:

- `command(resource)` — RPC-triggering clicks with an intl-derived label + toast wait.

`e2e/helpers/act.ts`:

- `waitForResponse(callback, matcher)` / `handleToast()` / `actButton()`

Composite seed helpers live in `e2e/helpers/seed/` — see its README for the extraction rules.

## How AI uses this pattern

- **Writing a new spec.** Default to API-seeded variant unless this is the canonical happy path for the workflow.
- **Reviewing a spec.** Flag full-flow walks where API-seeded variants would do.
- **Refactoring.** Look for ≥3 specs sharing a prelude; extract into a helper.
- **Copilot reviews.** Comment on PRs that add full-flow walks for variant assertions.

## Cross-references

- [E2E Architecture](./e2e.md)
- [Playwright POM design](./playwright-poms.md)
- [Flow Documentation Rules](./flow-documentation.md)
