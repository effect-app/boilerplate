<!-- Space: SA -->
<!-- Parent: Architecture -->
<!-- Title: Implementation Plan Conventions -->

# Implementation plan conventions

Default delivery shape for multi-increment features. Use this when writing
Confluence / wiki plans so every plan does not re-invent the same operational
approach.

Companion to [Evidence Precedence](./evidence-precedence.md) (how to read
requirements).

## 1. Merge often to `main`

- Land work in **small, independently deployable increments**.
- Prefer **merge to `main` early and often** so each slice is on the shared
  path that feeds demo (and later prod) deploys.
- Do not hold large feature branches for "until the whole story is done."
  Incomplete behaviour must be **safe when merged** (see feature flags below).
- Each merged increment should be **testable on demo when desired** — not only
  after the final PR.

Plans should list PR / phase boundaries that can each merge with the flag off.

## 2. Feature flags: off in prod, fast on demo

- Gate new operator behaviour and new external side effects behind a named
  feature flag from the **first** behaviour slice.
- Default **`true` only in `local-dev`** (or another explicit non-prod rule);
  default **`false` in every remote environment**, including prod.
- **Demo (and other remotes) enable by intentional override**, not by code
  default. That keeps prod dark while the team can turn the feature on for
  testing as soon as useful slices are on `main`.
- Flag gates **activation**, not schema compatibility: one production data
  shape after migration; do not maintain old/new handlers behind the flag.
- Flag-off must preserve the **complete pre-feature contract** (imports, UI
  journeys, close-out payloads). See the flow e2e rules for prod-disabled
  toggles.
- Server-side enforce the flag so a stale client cannot bypass it.

## 3. External OpenAPI / contracts early; live integration late

When a feature changes import, close-out, or other external-facing contracts:

- **Update OpenAPI (and related docs) in an early increment** so the external
  partner and the app share a written contract before full service wiring.
- Treat that schema work as a **first-class deliverable**, not a cleanup step
  after UI is done.
- **Real external service integration** (consuming live endpoints, dual-write,
  cutover of production close-out) may stay **near the end** of the plan —
  after domain, flag-on UI, and demo-proven capture exist.
- Plans must separate: _contract published_ vs _live integration activated_.

## 4. Sample files from the new schemas (external system still authoritative later)

- As soon as OpenAPI / import-export shapes change, **add or extend sample
  files** under the sample trees (`sample/…`, e2e fixtures) that exercise the
  new fields and edge cases.
- Samples must pass the **production decoders**.
- Label them as **engineering fixtures derived from the proposed contract**.
  The **authoritative production samples** still come from the external system
  later; when the partner delivers, reconcile fixtures to those samples and
  keep decoder tests green.
- Do not block early demo/e2e progress on waiting for partner sample drops —
  invent useful, clearly non-final fixtures and replace them when the
  authoritative files arrive.

## 5. Models: related fields together; bad states unrepresentable

Prefer **one tagged field** (or state member) that groups related facts over
independent booleans + nullable values that can disagree.

**Example (lot tracking — illustrative, not a frozen schema name):**

Use **different tight unions per lifecycle phase**, not one mega-union on every
state. Each state only models what it explicitly needs.

```ts
// Pre-capture states (e.g. Initial, Active)
type LotTracking =
  | { readonly _tag: "notRequired" }
  | { readonly _tag: "required" } // needs capture; no value yet

// Post-capture states (e.g. Processed, Closed — depending on business rules)
type LotTrackingProcessed =
  | { readonly _tag: "notRequired" }
  | { readonly _tag: "required"; readonly value: LotNumber } // after the capture path

// Avoid: one shared shape on all states, or two fields that can lie
// lotTrackingRequired: boolean
// lotNumber: string | null  // required+null and notRequired+"xyz" are representable
// Also avoid: single union with optional value on every state — completed
// states can still be "required without value" at the type level.
```

Rules of thumb:

- If `B` is only meaningful when `A` is true, **do not** model `A` and
  optional `B` as siblings; nest or tag so `B` only exists when required.
- Prefer **state-local types**: pre-capture states hold requirement only;
  post-capture states that business rules say must have the value put
  `value` on the `required` member — so "required without value" is
  unrepresentable after the transition.
- Align with [Tagged State Machines](./tagged-state-machines.md): lifecycle
  facts sit on the state (or tagged facet) that owns them.
- After offline cutover, production schemas accept **only** the new world;
  legacy decoding stays in JitM/migration paths.

Plans should show the intended tagged shape even when names are still draft.

## 6. Open items first in every list

In plans (and similar ledgers), **order for the reader who needs action**:

- Put **open / unresolved / decision-gate / TBD** items at the **top** of each
  list or section.
- Put **resolved / closed / decided** items at the **bottom**.

Apply this to discrepancy ledgers, decision gates mixed with resolved notes,
workflow confidence tables (open capture phases above settled ones), and any
checklist that mixes status. Do not bury open questions under a wall of
resolved history.

## What a plan should state explicitly

When writing a feature plan, include a short **Delivery approach** section that
confirms or deliberately overrides these defaults:

1. Merge cadence (often to `main` vs exceptional long-lived branch).
2. Flag name, defaults, and how demo is enabled.
3. When OpenAPI / external contracts ship vs when live integration ships.
4. Sample-file strategy (engineering fixtures now; external authoritative later).
5. Target model shape (tagged / unrepresentable-bad-state sketch).
6. Peer inventory: which existing implementations of the same kind of thing
   were inspected, whether this slice follows them, or which of them the
   greenfield path would migrate.

## Related

- [Evidence Precedence for Workflow Planning](./evidence-precedence.md)
- [How We Build](../how-we-build.md) — feature toggle + e2e expectations
- [Tagged State Machines](./tagged-state-machines.md)
