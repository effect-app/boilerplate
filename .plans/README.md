# Plans

Local working memory for in-flight work. Plan files here are **gitignored** — the
`.plans/*` files stay on your machine and never get committed. Only this README
(the convention) is tracked, so every clone knows the system.

The **shared, portable record is the PR description.** The local plan is richer
working memory that mirrors it. Because the plan is local, an agent resuming on a
fresh checkout rebuilds it from the PR description — so the PR description must
always be complete enough to continue from alone. See the PR rules in
[`../AGENTS.md`](../AGENTS.md#prs).

Trivial changes (one-liners, copy fixes, mechanical renames) don't need a plan.
Anything worth a draft PR and multiple increments does.

## How it's used

- **One file per work item**, named for the branch or a kebab title:
  `.plans/<branch-or-title>.md`.
- Write it as the first step, keep it updated **at every commit**, and keep it in
  sync with the PR description.
- Durable reference — architecture, conventions, flows — lives in
  [`../wiki`](../wiki), not here. Link to it; don't copy it into a plan.
- When the work ships, the PR is the permanent record. Delete the local plan or
  leave it; it isn't history.

## Resuming someone else's (or your own) in-flight work

1. Read the PR description — it's the source of truth for plan + status.
2. If a local `.plans/<…>.md` exists, use it as extra context.
3. If not, recreate one from the PR description using the template below.

## Template

```markdown
# Plan: <title>

Status: <one-line current state — what's done, what's next>

## Summary

<goal, constraints, links to wiki docs>

## Steps

- [ ] step

## Findings / decisions

<what changed the plan and why>
```
