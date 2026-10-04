<!-- Space: SA -->
<!-- Parent: Architecture -->
<!-- Parent: Architecture (shared) -->
<!-- Title: Architecture (shared) -->

# Architecture (shared, effect-app)

This folder is the shared architecture reference for this project. It holds **cross-project effect-app architecture** that is synced between multiple effect-app applications; changes here may affect other repos. Project-specific flow docs live in `wiki/flows/` (create when the first workflow lands).

## Technical architecture

- [Evidence Precedence for Workflow Planning](./evidence-precedence.md) — interpret Jira, Confluence, diagrams, annotations, screenshots, and implementation reality without turning examples into requirements.
- [Implementation Plan Conventions](./implementation-plan-conventions.md) — merge often, feature-flag demo vs prod, early OpenAPI/samples, tagged models that make bad states unrepresentable.
- [Database query guidelines](./database-query-guidelines.md) — push filtering, counting, pagination, and projection into the repository query.
- [Repository write boundaries](./repository-write-boundaries.md) — atomic-by-default writes, explicit chunking, migration rehearsal parity, and store limits.
- [Import / Naming rules](./import-rules.md) — service naming (name by what it does, not "XService"), language conventions (code = English, copy = German via intl), import rules.
- [Resource and Controller Layout](./resource-and-controller-layout.md) — fixed declaration order for resource files and controllers.
- [Query Shape: List vs Get](./query-shape-list-vs-get.md) — one entity gets a `Get`/`Find`; never pull `List` and filter client-side.
- [Tagged State Machines](./tagged-state-machines.md) — keep lifecycle-specific data on the tagged state that owns it, not as root sidecars.
- [Command Pattern for Mutations](./command-pattern.md) — a command encapsulates the whole user intent; compose Effects, not Commands.
- [Command Input Validation](./command-input-validation.md) — gate at the caller; the command body assumes valid input.
- [Durable Workflows & DurableDeferred](./durable-workflows.md) — idempotency keys, resume vs restart, write-once deferred slots, token routing, compensation vs `ensuring`, replay-safe activities.
- [Error Model — Data vs Schema tagged errors](./error-model.md) — local diagnostic errors (`Data.TaggedError`) vs contractual transport errors (`Schema.TaggedErrorClass`); translate at boundaries, name by operation, inner `reason` unions, cause → telemetry.
- [Streams and Realtime Progress](./streams-and-progress.md) — stream commands report progress in the toast; `Operations.run` for work that outlives the request.
- [List Layout: per-item Actions](./list-layout.md) — render per-item actions inside the list body slot, not behind a page-level selection ref.
- [List Totality: every entity lands in exactly one rendered bucket](./list-totality.md) — total, compile-enforced tab/section classification (`bucketByPhase`) so no state can be invisible or double-shown.
- [Frontend Route Guards and Async Setup](./frontend-route-guards.md) — guards before setup; navigation must interrupt setup work.
- [Vue Conventions](./vue-conventions.md) — `.vue` constraints: don't shadow `Array`, use TaggedUnion guards, group form state.
- [Playwright POM design](./playwright-poms.md) — POMs describe what's on the page, not what one test does with it.

## Testing and flow documentation

- [E2E](./e2e.md) — Playwright suite layout, `command(rsc)` default action wrapper, timeouts.
- [E2E State Pattern](./e2e-state-pattern.md) — walk a flow via UI exactly once per workflow; API-seed all variants.
- [E2E Toast Wait Audit](./e2e-toast-wait-audit.md) — settle signals for RPC-triggering clicks; `handleToast` / `waitForResponse` exceptions.
- [Flow Documentation](./flow-documentation.md) — `wiki/flows/` is the living spec; update it in the same PR as behavior changes.
