<!-- Space: SA -->
<!-- Title: How We Build -->

# How We Build — PMs and Engineers Working Together

A practical guide for everyone who writes stories, ships code, or reviews PRs in this repo. Read this once. Refer back when you're starting something new.

## Why this exists

Software work used to flow through this team like this: the PM would type up bullet points describing a change, an engineer would read them, and they'd start coding. It worked most of the time — until it didn't.

The bullets assumed shared context. That worked when everyone had been in the same conversations for weeks. It broke whenever:

- A new joiner took on a ticket
- Someone came back from two weeks off
- An AI agent tried to help without seeing the prior threads
- An engineer touched a workflow they hadn't built themselves

We don't want to fix this by writing every story from scratch. That would be wasteful — most of what's in the system is stable. We want **diff-style stories** (small, focused, "change X to Y") to keep working, but we need somewhere for the "X" to actually live in writing.

That place is `wiki/flows/`.

## The flow docs — what they are

`wiki/flows/` is the single source of truth for every customer-facing workflow we run. One file per workflow. Each file describes:

- **What the workflow is for** — the business purpose, in plain English
- **Who's involved** — operators, managers, admins
- **The business rules** — weight caps, sequencing, who can do what
- **The end-to-end flow** — labeled stages from import to closeout
- **Step-by-step user actions** — what someone clicks, in order
- **External systems, labels, closeout, notifications** — who's informed, what gets produced, what goes to the external accounting system
- **Variants and scenarios** — named cases linked to test fixtures
- **A story-writing checklist** — what to consider when changing this workflow
- **For engineers** — file paths, controllers, e2e specs, state machines (at the bottom, kept separate)

The structure is deliberate: PMs and BAs read the top, engineers read all of it.

Browse the catalog at `wiki/flows/README.md` once the first workflow lands.

## How stories should be written

PMs write diffs. That's fine. We just want every diff to **reference what it's diffing against**.

A good story has four pieces above whatever bullet points or flow notes the PM already produces:

### 1. Why

One or two lines about the customer pain or business reason behind the change. Not "the boss asked for it" — the actual motivation. Engineers use this to make judgment calls when the spec doesn't cover an edge case.

> _The team complained that orders shipped to a particular destination keep arriving with items damaged in transit. We want to prevent stack heights above 4 for that destination._

### 2. Acceptance criteria

How will we know it works? Rough is fine — the PM doesn't need to write test code. Just say what should be true after the change.

> _Stack height > 4 should show an error in the workstation dialog and prevent the user from confirming. Stack height ≤ 4 still allowed for this workflow's stacks._

### 3. Out of scope

What this story is **not** about. This kills more ambiguity than anything else. Engineers and AI agents are good at scope-creep when scope is unclear.

> _Not changing the 5-unit limit for other sites. Not touching provider B, which already disallows stacking entirely._

### 4. Touched flows

A link to the flow doc section(s) this change applies to. This is the diff target.

> _Applies to `wiki/flows/<workflow>.md` § Business rules — specifically the "Stack height ≤5" row._

That's it. The bullets describing the actual change come after.

## The 15-minute kickoff

The PM sends a story. Before any code happens, schedule a fifteen-minute call. The PM reads the bullets aloud. The engineer asks open questions. The PM captures the answers in writing, in the same session.

This replaces days of Slack ping-pong. The questions you'd otherwise type and wait for get answered in one sitting. It also surfaces the questions the PM didn't know to anticipate.

If the answers reveal that the story actually touches more than the listed flows, update the "Touched flows" field before starting work.

If a question doesn't resolve in fifteen minutes — escalate. Schedule a follow-up. Don't start coding against ambiguity.

## How engineers keep flow docs current

This is the part everyone has to commit to. If you change how a workflow behaves, you **update the flow doc in the same pull request as the code**. Same merge gate. Code review checklist includes "Did the flow doc get updated?"

A change to a business rule (weight cap, input requirement, who can close an order) means the relevant **Business rules** section gets updated. A new variant (e.g. a new provider supported) means the **Variants** table gets a row. A new German term in the UI means it goes in the **Glossary**.

If the change is internal-only — refactoring, performance work, dependency bumps — say so explicitly in the PR description: "Flow doc not updated because this is internal-only refactoring." That's fine. We just don't want silent drift.

When the doc lags the code, future stories diff against a fiction. Everyone loses time. So we don't let it happen.

## New behavior ships with e2e coverage

New or changed business behavior must be exercised by an e2e test before it reaches production. There are two ways to satisfy this:

- **Tests with the merge.** The PR that changes behavior also adds the e2e spec covering it. Merge and ship.
- **Behind a feature toggle.** A PR can merge without e2e _if_ the new behavior is gated behind a feature flag that's disabled in prod. A follow-up PR adds the e2e spec, and the flag does not flip on in prod until that spec exists.

What is not OK: shipping new behavior to production without an e2e test exercising the divergence. "I tested it manually" is not coverage at this team size.

Same rule applies to AI agents. If an agent ships a behavior change, it must also write the test or open a paired PR doing so.

There's a discipline to _how_ to write the test, too — see [`e2e-state-pattern.md`](./architecture/e2e-state-pattern.md) for the walk-once + API-seed rule. Adding a redundant full-flow walk to cover a variant is worse than adding nothing.

## How code reviewers reinforce this

Reviewers (including Copilot) check that PRs touching workflow behavior also touch the flow doc. If a behavior changed and the doc didn't, that's a blocking comment.

The phrasing we use:

> "This PR changes [behavior X] but `wiki/flows/<workflow>.md` still describes the old behavior. Per the same-PR rule in `wiki/architecture/flow-documentation.md`, please update [specific section]."

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

### Before handing work to PM/QA (engineer)

1. Verify the changed flow works end-to-end at least once in the target environment (usually Demo)
2. Do a basic functional check yourself before asking PM/QA to test
3. If external systems are part of the change, run a real integration check and confirm the expected output is produced
4. Check Honeycomb for the request path: validate spans/events, look for errors, and confirm no obvious latency regressions
5. Only hand over to PM/QA after those checks are done; include what you verified in your handoff note

### When you review a PR (everyone)

1. Did the behavior change? Did the doc change?
2. If behavior-yes / doc-no — block until resolved (unless explicitly internal-only)
3. Did the behavior change? Is there e2e coverage for it? If not, is it gated behind a feature toggle w/ test work tracked as follow-up?
4. Is the new behavior consistent with other business rules in the doc?

### When you onboard or come back from leave

1. Browse `wiki/flows/` for the workflows you work with
2. Read the README and any workflow you'll touch
3. Skim recent git log of `wiki/flows/<workflow>/` to see what changed while you were away

## What this isn't

This isn't a heavyweight process. We're not asking for Confluence ceremonies, RACI matrices, or weekly status reports. The story template is four fields. The kickoff is fifteen minutes. The doc update is part of the work you're already doing.

It's also not optional. The cost of skipping it shows up later — in confused engineers, in misshipped features, in AI agents confidently writing nonsense. The fifteen minutes you save by skipping the kickoff get spent ten times over in Slack threads next week.

## Where to go from here

- **Catalog of flows** → `wiki/flows/README.md` (create when the first workflow lands)
- **Why we treat flow docs as living specs** → [`flow-documentation.md`](./architecture/flow-documentation.md)
- **AI agent instructions** → [`AGENTS.md`](../AGENTS.md)
- **Architecture patterns** → [`architecture/index.md`](./architecture/index.md)
  If you have feedback on this process, talk to your team leads. We'd rather iterate on the rules than have people quietly ignoring them.
