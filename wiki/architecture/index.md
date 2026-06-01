<!-- Space: SA -->
<!-- Parent: Scanner Wiki -->
<!-- Parent: Architecture -->
<!-- Title: Architecture (shared) -->

# Architecture (shared, effect-app)

This folder holds **cross-project effect-app architecture** that is synced between multiple effect-app applications. Changes here may affect other repos.

For app-specific architecture, see [`../app-architecture/index.md`](../app-architecture/index.md).
Entry point for both: [`../architecture.md`](../architecture.md).

## Technical architecture

- [Database query guidelines](./database-query-guidelines.md)
- [Import / Naming rules](./import-rules.md)
- [Resource and Controller Layout](./resource-and-controller-layout.md)
- [Query Shape: List vs Get](./query-shape-list-vs-get.md)
- [Command Pattern for Mutations](./command-pattern.md)
- [Command Input Validation](./command-input-validation.md)
- [Durable Workflows & DurableDeferred](./durable-workflows.md) — idempotency keys, resume vs restart, write-once deferred slots, token routing, compensation vs `ensuring`, replay-safe activities.
- [Streams and Realtime Progress](./streams-and-progress.md)
- [List Layout: per-item Actions](./list-layout.md)
- [Vue Conventions](./vue-conventions.md)
- [OmegaForm](./omega-form.md)
- [Playwright POM design](./playwright-poms.md)
