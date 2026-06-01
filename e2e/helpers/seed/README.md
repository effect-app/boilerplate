# `e2e/helpers/seed/` — Composite API Seed Helpers

Per the [walk-once + API-seed rule](../../../wiki/app-architecture/e2e-state-pattern.md), specs walk a workflow via UI **exactly once** per workflow. Variants, edge cases, and branches reach their starting state via API calls — not by re-walking the UI.

This directory holds the composite helpers that perform those state transitions. Each helper calls the same controllers the UI does — no DB shortcuts, no fixtures bypass — so seeded state is realistic.

## How to use

```ts
// In a spec, after importing the sample CSV/JSON:
const clients = await runtimes.userRuntime.runPromise(
  setupWorkflowPickedState()
)

// Now exercise only the divergent behavior:
await page.goto("/example-workflow/package")
// … the unique UI/API assertions for this test
```

## How to add a helper

When you find yourself writing the same 30+ lines of setup at the top of 3 or more specs, that's a candidate. Extract into a function here, named for the **state it leaves the system in**, not the steps it runs.

Good names: `setupWorkflowPickedState`, `seedShipmentInCarrierBookedState`, `advanceTruckToLoaded`.

Bad names: `runPickFlow`, `setupTest`, `prepare`.

Each helper:

- Takes a small `params` object (cartId, spotId, etc.) with sensible defaults
- Uses real controllers via `clientFor(…)`
- Returns whatever clients/IDs the caller will need next
- Has a short docstring stating what state the system is in after it runs, and who owns the upstream (import, cancellation) — usually the caller

## What this directory is NOT for

- One-off helpers used by a single spec (keep them in the spec)
- DB seeding, fixture file loading, or anything that bypasses the API layer
- Workflow-specific page object methods — those live in `e2e/tests/poms/<company>/`

## Files

| Helper                 | What state it produces                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<workflow>.ts`        | `setupWorkflowPickedState` — cart picked + pack spot + pack cart claimed; `setupWorkflowPickedCartOnly` — cart picked, before pack side                                                                                                                                                                                                                                                                                                                                |
| `bucket.ts`            | `readBucket` / `resetBucket` — read or clear the per-namespace bucket of captured events sent to the external accounting system                                                                                                                                                                                                                                                                                                                                        |
| `bauhaus-splitting.ts` | `seedBauhausPackedGroup` — every part Initial, every order packed onto a BB pallet; `advanceBauhausGroupToLabelsAssigned` — every part LabelsAssigned (composes the pack helper if needed); `advanceBauhausGroupToRootAbasPending` — root RootAbasPending while parts stay LabelsAssigned (drives FinalizeGroup with the `x-e2e-finalize-abort-after-publish` header, catches the controller's expected die); `advanceBauhausGroupToClosed` — root + every part Closed |
| `empasa/markisen`      | `setupMarkisenScannedTruck` — truck claimed and all active items scanned/printed; `setupMarkisenLoadedTruck` — scanned truck advanced to loaded                                                                                                                                                                                                                                                                                                                        |
| `mako/standard`        | `setupStandardPickedCart` — Standard cart claimed, current order fully picked, cart marked Full and ready for packing                                                                                                                                                                                                                                                                                                                                                  |

Add a row when you add a helper.
