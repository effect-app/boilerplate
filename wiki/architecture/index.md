# Architecture

This folder covers how the application is configured and how it selects workflows.

## Process & documentation (read first)

- **[Flow Documentation — The Living Spec](./flow-documentation.md)** ← what `wiki/flows/` is, why it's mandatory, update-in-PR rule
- **[E2E State Pattern — Walk Once, API-Seed Variants](./e2e-state-pattern.md)** ← test design rule

## Technical architecture

- [Configuration and companies](./configuration-and-tenancy.md)
- [Database query guidelines](./database-query-guidelines.md)
- [Workflow: routing and selection](./workflow.md)
- [Import / Export rules](./import-rules.md)
- [Resource and Controller Layout](./resource-and-controller-layout.md)
- [Query Shape: List vs Get](./query-shape-list-vs-get.md)
- [Command Pattern for Mutations](./command-pattern.md)
- [Command Input Validation](./command-input-validation.md)
- [Streams and Realtime Progress](./streams-and-progress.md)
- [List Layout: per-item Actions](./list-layout.md)
- [Vue Conventions](./vue-conventions.md)
- [E2E Tests](./e2e.md)

## Business flow catalog

See [`wiki/flows/`](../flows/README.md) for per-company, per-workflow operating reference (carriers, labels, closeout, business rules, variants).
