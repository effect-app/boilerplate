<!-- TODO(shared): contains project-specific examples (Mako/Empasa/EasyLife, carriers, bauhaus, omega). Generalize before downstream sync. -->

# Architecture

This folder covers how the Scanner API is configured and how it selects workflows.

## Process & documentation (read first)

- **[Flow Documentation — The Living Spec](./flow-documentation.md)** ← what `docs/flows/` is, why it's mandatory, update-in-PR rule
- **[E2E State Pattern — Walk Once, API-Seed Variants](./e2e-state-pattern.md)** ← test design rule
- **[ABAS Closing-Payload Testing Plan](./abas-payload-testing-plan.md)** ← plan only, not executed

## Technical architecture

- [Configuration and companies](./configuration-and-tenancy.md)
- [Database query guidelines](./database-query-guidelines.md)
- [Workflow: routing and selection](./workflow.md)
- [Packstations and Printers](./packstations-and-printers.md)
- [Import / Export rules](./import-rules.md)
- [Resource and Controller Layout](./resource-and-controller-layout.md)
- [Query Shape: List vs Get](./query-shape-list-vs-get.md)
- [Command Pattern for Mutations](./command-pattern.md)
- [Command Input Validation](./command-input-validation.md)
- [Streams and Realtime Progress](./streams-and-progress.md)
- [List Layout: per-item Actions](./list-layout.md)
- [OmegaForm](./omega-form.md)
- [Vue Conventions](./vue-conventions.md)
- [E2E Tests](./e2e.md)

## Business flow catalog

See [`docs/flows/`](../flows/README.md) for per-company, per-workflow operating reference (carriers, labels, closeout, business rules, variants).
