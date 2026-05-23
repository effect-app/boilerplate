<!-- TODO(shared): contains project-specific examples (Mako/Empasa/EasyLife, carriers, bauhaus, omega). Generalize before downstream sync. -->

# How We Build — PMs and Engineers Working Together

A practical guide for everyone who writes stories, ships code, or reviews PRs in this repo. Read this once. Refer back when you're starting something new.

## Why this exists

Software work used to flow through this team like this: the PM would type up bullet points describing a change, an engineer would read them, and they'd start coding. It worked most of the time — until it didn't.

The bullets assumed shared context. That worked when everyone had been in the same conversations for weeks. It broke whenever:

- A new joiner picked up a ticket
- Someone came back from two weeks off
- An AI agent tried to help without seeing the prior threads
- An engineer touched a workflow they hadn't built themselves

We don't want to fix this by writing every story from scratch. That would be wasteful — most of what's in the system is stable. We want **diff-style stories** (small, focused, "change X to Y") to keep working, but we need somewhere for the "X" to actually live in writing.

That place is [`docs/flows/`](./flows/).

## The flow docs — what they are

`docs/flows/` is the single source of truth for every customer-facing workflow we run. One file per workflow, per company. Each file describes:

- **What the workflow is for** — the business purpose, in plain English
- **Who's involved** — pickers, packers, managers, admins
- **The business rules** — weight caps, sequencing, who can do what
- **The end-to-end flow** — labeled stages from import to closeout
- **Step-by-step user actions** — what someone clicks, in order
- **Carriers, labels, closeout, notifications** — who's informed, what gets printed, what goes to ABAS
- **Variants and scenarios** — named cases linked to test fixtures
- **A story-writing checklist** — what to consider when changing this workflow
- **For engineers** — file paths, controllers, e2e specs, state machines (at the bottom, kept separate)

The structure is deliberate: PMs and BAs read the top, engineers read all of it.

Browse the catalog at [`docs/flows/README.md`](./flows/README.md).

## How stories should be written

PMs write diffs. That's fine. We just want every diff to **reference what it's diffing against**.

A good story has four pieces above whatever bullet points or flow notes the PM already produces:

### 1. Why

One or two lines about the customer pain or business reason behind the change. Not "the boss asked for it" — the actual motivation. Engineers use this to make judgment calls when the spec doesn't cover an edge case.

> *Bauhaus complained that pallets shipped to Berlin keep arriving with cartons sliding off. We want to prevent stacks taller than 4 pallets for that destination.*

### 2. Acceptance criteria

How will we know it works? Rough is fine — the PM doesn't need to write test code. Just say what should be true after the change.

> *Stack height > 4 should show an error in the pack-spot dialog and prevent the user from confirming. Stack height ≤ 4 still allowed for Bauhaus pallets.*

### 3. Out of scope

What this story is **not** about. This kills more ambiguity than anything else. Engineers and AI agents are good at scope-creep when scope is unclear.

> *Not changing the 5-pallet limit for other sites. Not touching Dachser, which already disallows stacking entirely.*

### 4. Touched flows

A link to the flow doc section(s) this change applies to. This is the diff target.

> *Applies to [Mako Bauhaus § Business rules](./flows/mako/bauhaus.md#the-big-business-rules) — specifically the "Stack height ≤5 pallets" row.*

That's it. The bullets describing the actual change come after.

## The 15-minute kickoff

The PM sends a story. Before any code happens, schedule a fifteen-minute call. The PM reads the bullets aloud. The engineer asks open questions. The PM captures the answers in writing, in the same session.

This replaces days of Slack ping-pong. The questions you'd otherwise type and wait for get answered in one sitting. It also surfaces the questions the PM didn't know to anticipate.

If the answers reveal that the story actually touches more than the listed flows, update the "Touched flows" field before starting work.

If a question doesn't resolve in fifteen minutes — escalate. Schedule a follow-up. Don't start coding against ambiguity.

## How engineers keep flow docs current

This is the part everyone has to commit to. If you change how a workflow behaves, you **update the flow doc in the same pull request as the code**. Same merge gate. Code review checklist includes "Did the flow doc get updated?"

A change to a business rule (weight cap, scan requirement, who can close an order) means the relevant **Business rules** section gets updated. A new variant (e.g. a new carrier supported) means the **Variants** table gets a row. A new German term in the UI means it goes in the **Glossary**.

If the change is internal-only — refactoring, performance work, dependency bumps — say so explicitly in the PR description: "Flow doc not updated because this is internal-only refactoring." That's fine. We just don't want silent drift.

When the doc lags the code, future stories diff against a fiction. Everyone loses time. So we don't let it happen.

## New behavior ships with e2e coverage

New or changed business behavior must be exercised by an e2e test before it reaches production. There are two ways to satisfy this:

- **Tests with the merge.** The PR that changes behavior also adds the e2e spec covering it. Merge and ship.
- **Behind a feature toggle.** A PR can merge without e2e *if* the new behavior is gated behind a feature flag that's disabled in prod. A follow-up PR adds the e2e spec, and the flag does not flip on in prod until that spec exists.

What is not OK: shipping new behavior to production without an e2e test exercising the divergence. "I tested it manually" is not coverage at this team size.

Same rule applies to AI agents. If an agent ships a behavior change, it must also write the test or open a paired PR doing so.

There's a discipline to *how* to write the test, too — see [`docs/architecture/e2e-state-pattern.md`](./architecture/e2e-state-pattern.md) for the walk-once + API-seed rule. Adding a redundant full-flow walk to cover a variant is worse than adding nothing.

## How code reviewers reinforce this

Reviewers (including Copilot, see [`.github/copilot-instructions.md`](../.github/copilot-instructions.md)) check that PRs touching workflow behavior also touch the flow doc. If a behavior changed and the doc didn't, that's a blocking comment.

The phrasing we use:

> "This PR changes [behavior X] but `docs/flows/<company>/<workflow>.md` still describes the old behavior. Per the same-PR rule in `docs/architecture/flow-documentation.md`, please update [specific section]."

Reviewers should be specific. Generic "see the docs" comments get ignored.

## The analyst gap — honestly

Our PM translates between the customer and us. They push back on requests, write flows, stay close to stakeholders. That's the role today and it works.

What the role does not currently include — and what we don't have anywhere else on the team — is a dedicated **business analyst** who pre-empts edge cases, defines testable acceptance criteria proactively, and spots conflicts between new requirements and existing flows.

The story template above (Why / Acceptance / Out of scope / Touched flows) closes about 70% of that gap on the cheap. The kickoff sync closes another chunk by surfacing the questions an analyst would have raised.

The remaining gap is real but no longer urgent. If we decide later that we need a dedicated analyst, we have two options:

- **Grow the PM role into it** over a few months. Pair on the first N stories using the template. Build the analyst muscle.
- **Hire an analyst alongside the PM**. PM keeps the customer-facing role; analyst owns requirements depth. Faster, costs more.

Let's see how we do with the lightweight tools first.

## What AI brings to this

When the flow docs are kept current, AI agents (Claude, Copilot, Cursor, etc.) become genuinely useful for spec work — drafting story candidates, spotting edge cases, suggesting test fixtures.

When the docs are out of date, AI agents become actively harmful. They confidently restate stale rules. They write code matching a system that no longer exists. They suggest stories that diff against fiction.

The flow docs are not just for humans. They are the prompt context every AI tool reads when it joins your task. Keep them honest and AI becomes a teammate. Let them rot and AI becomes a saboteur.

This is why the same-PR rule isn't a nice-to-have. It's the price of admission for AI helping us instead of hurting us.

## Quick reference

### When you write a story (PM)

1. Read the current flow doc for the workflow you're changing
2. Write the four required fields: Why / Acceptance / Out of scope / Touched flows
3. Add your bullets describing the change as a diff against the doc
4. Schedule a 15-minute kickoff w/ the assigned engineer

### When you start work on a story (engineer)

1. Read the linked flow doc section before opening any code file
2. Hold the kickoff sync if it hasn't happened yet
3. Capture clarifications back into the story or the flow doc
4. Write code

### When you ship a story (engineer)

1. If you changed how the workflow behaves, update the flow doc in the same PR
2. Add or update the e2e spec covering the new/changed behavior — OR gate the new behavior behind a feature toggle disabled in prod, and track the test work as a follow-up
3. In the PR description, state: "Flow doc updated: ✅" or "Flow doc not updated because [reason]" — and "E2E coverage: added / follow-up tracked / internal-only"
4. Mention which flow doc sections you touched

### When you review a PR (everyone)

1. Did the behavior change? Did the doc change?
2. If behavior-yes / doc-no — block until resolved (unless explicitly internal-only)
3. Did the behavior change? Is there e2e coverage for it? If not, is it gated behind a feature toggle w/ test work tracked as follow-up?
4. Is the new behavior consistent with other business rules in the doc?

### When you onboard or come back from leave

1. Browse `docs/flows/` for the company you work with
2. Read the company README and any workflow you'll touch
3. Skim recent git log of `docs/flows/<company>/` to see what changed while you were away

## What this isn't

This isn't a heavyweight process. We're not asking for Confluence ceremonies, RACI matrices, or weekly status reports. The story template is four fields. The kickoff is fifteen minutes. The doc update is part of the work you're already doing.

It's also not optional. The cost of skipping it shows up later — in confused engineers, in misshipped features, in AI agents confidently writing nonsense. The fifteen minutes you save by skipping the kickoff get spent ten times over in Slack threads next week.

## Where to go from here

- **Catalog of flows** → [`docs/flows/README.md`](./flows/README.md)
- **Why we treat flow docs as living specs** → [`docs/architecture/flow-documentation.md`](./architecture/flow-documentation.md)
- **AI agent instructions** → [`AGENTS.md`](../AGENTS.md)
- **PR review enforcement** → [`.github/copilot-instructions.md`](../.github/copilot-instructions.md)
- **Long-term docs strategy** (plan, not executed) → [`docs/documentation-strategy.md`](./documentation-strategy.md)

If you have feedback on this process, talk to Patrick. We'd rather iterate on the rules than have people quietly ignoring them.
