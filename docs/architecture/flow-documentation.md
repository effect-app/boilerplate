# Flow Documentation — The Living Spec

**Mandatory reading** for anyone (human or AI) touching workflow code. Reinforce in code reviews.

## What it is

`docs/flows/` is the single source of truth for every customer-facing workflow.

- **Primary audience: Business Analyst / Product Manager.** Plain-English business rules + carriers + closeout + variants.
- **Secondary audience: engineers + AI.** Each flow doc has a **"For engineers"** section at the bottom w/ file paths, controllers, e2e specs, state machines.

Layout:

```
docs/flows/
├── README.md                ← top-level index + glossary + cross-cutting
├── shared/                  ← cross-company concepts
├── <company-a>/             ← per-workflow docs
├── <company-b>/
├── e2e-coverage-gaps.md     ← gap analysis surfaced from docs
└── e2e-duplicate-walks.md   ← duplicate-walk audit
```

## Why it matters

Before flow docs existed, the entire system state lived in heads. Consequences:
- New joiners + AI agents couldn't be productive without weeks of pairing
- Anyone returning after vacation re-asked the same questions
- The PM's stories were thin because there was no canonical "current state" to diff against
- Multiple engineers re-invented business rules from scratch in each PR

Flow docs replace that w/ a written contract everyone (human + AI) can cite.

## Rules

### 1. Stories diff against flow docs

When the PM (or anyone) writes a story:
- Reference the relevant flow doc + section
- Express the change as a **diff** against documented behavior
- Don't restate full context — the doc holds it

Engineers reading the story load the referenced doc + apply the diff. Less ambiguity, faster delivery.

### 2. Flow changes update docs in the same PR

If your PR changes a workflow's behavior, **update the flow doc in the same PR**. Same merge gate as code.

Code review checklist includes: "Did this PR change a flow's behavior? Is `docs/flows/<company>/<workflow>.md` updated?"

### 3. AI agents must consult flow docs

When asked to work on a workflow:
1. Read the relevant `docs/flows/<company>/<workflow>.md` first
2. Treat its **Business rules** + **Glossary** as authoritative for terms + constraints
3. The **For engineers** section has file paths to dig deeper
4. If the doc doesn't answer a question, ask + update the doc after

### 4. Stale docs are worse than no docs

If you spot a doc out of sync w/ code, **fix it in the same touch**. Don't merge a doc that disagrees w/ shipped behavior.

### 5. Each PR touching a workflow flags it

PR description should include "Flow doc(s) updated: ✅ / ❌ (not applicable because ...)".

### 6. New flow behavior ships with e2e coverage

New or changed business behavior must be exercised by an e2e spec before it reaches production. Two acceptable paths:

- **Tests-with-merge** — PR adds the relevant e2e spec(s) covering the new/changed behavior. Merges to main and ships.
- **Behind feature toggle** — PR may merge without e2e if the new behavior is gated behind a feature flag/toggle that is **disabled in prod**. A follow-up PR adds the e2e spec(s). The toggle does not flip on in prod until the e2e covers the new path.

What's **not** OK: new behavior reaching prod without e2e coverage of the divergence. "We tested manually" is not coverage; the team scaled past that.

Test discipline (walk once / API-seed variants) per [`e2e-state-pattern.md`](./e2e-state-pattern.md) — adding more full-walk specs to cover variants is worse than adding none. Use the seed helpers.

This applies to AI agents and humans equally. If an agent ships a behavior change, it must also write the test or open a paired PR doing so.

## What to put in a flow doc

See [docs/flows/README.md](../flows/README.md) for the pattern. Every flow doc has:

1. **What this workflow is for** — 1–2 sentences, business purpose
2. **Who's involved** — roles + actions
3. **Business rules** — named, in a table
4. **End-to-end flow** — labeled stages
5. **Step-by-step user actions** — plain-English
6. **Carriers, labels, closeout, notifications**
7. **Variants** — linked to sample fixtures
8. **Story-writing checklist** — what to cover when diffing this flow
9. **For engineers** — file paths, API surface, state machines, e2e

## What NOT to put

- Architectural patterns (those belong in `docs/architecture/*.md`)
- Implementation strategy (those go in PR description or planning docs that get deleted post-merge)
- Performance benchmarks (separate concern)
- API request schemas (the controller is the source of truth; link to it)

## How AI uses flow docs

- **At task start.** Load the relevant flow doc into context before writing code.
- **During review.** Cross-check behavior changes against the doc. Flag mismatches.
- **At PR-write time.** Reference the doc section in PR description.
- **In Copilot reviews.** Comment when a PR changes flow behavior without updating the doc.

See [`.github/copilot-instructions.md`](../../.github/copilot-instructions.md) for full AI/Copilot reinforcement.

## Cross-references

- [E2E State Pattern](./e2e-state-pattern.md) — walk-once + API-seed rule for tests
- [E2E Architecture](./e2e.md) — playwright + POM design
- [Flow Catalog README](../flows/README.md) — entry point to all flow docs
- [Outdated Docs Inventory](../flows/outdated-docs.md) — pre-flow-doc artifacts that need reconciling
