<!-- Space: SA -->
<!-- Parent: Architecture -->
<!-- Title: Evidence Precedence for Workflow Planning -->

# Evidence precedence for workflow planning

Use this process when reconstructing a target workflow from Jira, Confluence,
whiteboards, screenshots, and the current implementation. Its purpose is to
prevent an illustrative screenshot or historical implementation detail from
silently becoming a business requirement.

## Authority ladder

Apply evidence in this order, from highest to lowest authority:

1. **Jira and approved Confluence prose.** Explicit scope, acceptance criteria,
   decisions, business rules, and linked specifications define the target. A
   more specific, explicitly approved decision for the workflow can refine a
   broader document. Do not automatically resolve irreconcilable statements at
   this level; record an open decision.
2. **Diagram semantics.** The topology, branch conditions, sequence, labels,
   connectors, and grouping of the current-workflow diagram explain how the
   documented rules fit together. They may fill structural gaps but do not
   override Jira or Confluence prose.
3. **Annotations beside visual references.** Text placed next to a screenshot
   or example normally states the relevant delta: what should be copied, what
   differs, and what applies to the current workflow. Apply that annotation,
   not every visible detail in the referenced image.
4. **Screenshots and embedded images.** Treat these as examples, inspiration,
   or validation evidence by default. They often show another company,
   workflow, historical state, or mock-up. A screenshot-only rule is not an
   executable requirement until a higher-authority source confirms it.

The current code and repository flow docs are a separate kind of evidence:
they describe implementation reality and reveal migration, regression, and
operational constraints. They do not override the target business rules. They
do constrain the design: inspect peer implementations and either follow them
or migrate them. When the target changes, update the living flow doc in the
same behavior PR.

## Analysis process

1. Inventory every source, including parent/child Jira issues, linked
   Confluence pages, whiteboards, attachments, and relevant repository flows.
2. Reconstruct the diagram before interpreting its images. Capture the full
   board, then inspect branches, connectors, grouping, labels, and adjacent
   annotations at readable zoom.
3. Inspect each unique embedded image at native resolution. Identify its
   company, workflow, date/state, and the annotation that explains why it is on
   the board. Deduplicate repeated copies.
4. Give each planning statement a provenance class: `requirement`, `diagram`,
   `annotated reference`, `visual example`, `implementation reality`, or
   `inference`.
5. Resolve only cross-tier discrepancies where the higher source is explicit
   and in scope. Keep same-tier contradictions or genuine gaps as decision
   gates.
6. Derive implementation tasks and acceptance tests from requirements and
   resolved diagram semantics. Use screenshots to suggest examples and visual
   checks, never to silently add business behavior.

## Recording discrepancies

Keep the reasoning short and auditable. Use one of these forms in the plan:

- `Open — <conflict or missing rule>. The available sources at the same
  authority level do not resolve it; implementation is gated on <owner or
  decision>.`
- `Resolved — <decision>. Authority: <source>. <lower source> is
  <example/simplification/legacy behavior>, so it does not override the
  decision.`

**List order:** put every **Open** item **above** every **Resolved** item in
the same ledger (and the same rule for any other open/closed list). Readers
should hit unresolved topics first.

Do not hide discarded evidence. State what disagreed and why it lost
precedence. If a screenshot exposes a useful edge case, preserve it as a
candidate golden example even when its rule is non-normative.

## Expected planning output

A workflow plan should contain:

- a source register and the authority ladder used;
- a reconstructed target flow based on the highest available evidence;
- a discrepancy ledger of open then resolved conflicts (open first);
- assumptions and inferences clearly separated from requirements;
- decision gates only for unresolved, design-changing questions; and
- acceptance examples whose normative source is identified.

Also include a **Delivery approach** section using the defaults in
[Implementation Plan Conventions](./implementation-plan-conventions.md) (merge
often to `main`, feature flags for demo vs prod, early OpenAPI and sample
fixtures, tagged models that make bad states unrepresentable) — or call out an
intentional override.

This hierarchy controls interpretation, not document freshness. Re-check Jira
and Confluence before implementation starts, especially when the planning
artifact records a pending business review.
