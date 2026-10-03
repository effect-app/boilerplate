# Agent Instructions

This is the `@effect-app/boilerplate` starter — a TypeScript monorepo seed (`api/` Effect backend + `frontend/` Nuxt + `e2e/` Playwright) for projects built on the Effect App ecosystem.

- Package manager: `pnpm` (v11, pinned via `packageManager`)
- Base branch: `main`

## Read First

[`wiki/architecture/`](./wiki/architecture/index.md) is the source of truth for patterns:
import rules, resource/controller layout, command pattern, query shapes,
database query guidelines, tagged state machines, error model, vue conventions, etc.

These are **synced** from [`effect-app/shared`](https://github.com/effect-app/shared) via `effa sync` — see [`wiki/shared-sync.md`](./wiki/shared-sync.md).

When changing a synced doc: edit in place, then `effa sync-push --pr` to propagate upstream.

For implementation work, start at the index and load only the docs that match the task.

## Design

**Inspect the existing system first.** Before proposing an approach, find the implementations
that play the same role — sibling modules, commands, pages, builders — and name them.

Then present **two angles**, both accounting for the existing system:

1. **The pragmatic fit** — the smallest change that works within the current architecture,
   constraints, and migration cost, matching how the named peers already do it.
2. **The greenfield ideal** — how this would look if built fresh today, unconstrained.
   If that shape is better than the peers, the path must include updating those peers,
   as a stated path (this change or a tracked follow-up).

Keep it brief — a paragraph or a few bullets per angle. Record on every non-trivial PR:
`Design angles: <assumed goal> — peers <named> (<pattern>); follow <X> / migrate <Y> via <path> / n/a (trivial)`.

## Hard Rules

- In Markdown, when inline code contains a backtick, use a double-backtick
  delimiter: ``code ` containing a backtick``. Do not escape the inner backtick
  with a slash.
- No `as any` / `as unknown`. Fix the real type.
- No `@ts-expect-error` / `@ts-ignore`. Fix the underlying type or schema wiring.
- No retry/sleep/nudge fixes for flakes. Find the root cause.
- `withConstructorDefault` is not a decode/migration default: it runs on `.make()`,
  not on decode. A new required field on persisted data needs an explicit,
  preferably versioned migration or a jitM-style backfill at the store boundary.
- `.make()` / `.makeFrom()` **strip any property the target schema doesn't declare**,
  so build state from a spread instead of hand-copying fields:
  `State.make({ ...state, ...dropTag(event), byUserId })`. A later key overrides an
  earlier spread (order matters).
- No local imports from `repos/*`; use packages. `repos/effect` and `repos/effect-app`
  are reference source only. Never webfetch Effect; read the local `repos/effect`.
- `effect` / `effect-app` / `@effect-app/*` resolve from the **registry** by
  default, so edits to `repos/*` source are dormant in the app. To test a
  repos change locally, run `pnpm embedded:effect:link` first (links the vendored
  source into the workspace), then `pnpm install`. `pnpm embedded:effect:status`
  shows linked-vs-registry; `pnpm embedded:effect:unlink` reverts.
- **Do not add `pnpm` patches for `effect-app` / `@effect-app/*`.** Either link the
  vendored source (`pnpm embedded:effect:link`) or upstream the fix and adopt the
  new published release.
- Use one `#<Root>/*` alias per `src` dir. No per-file aliases, old shims, or
  unfinished moves.
- **No manual command→query invalidation.** Do not add `Req.Command` 4th-arg
  `invalidatesQueries` callbacks, page-level `queryInvalidation`, or `clientFor`
  invalidation maps. Queries register repository reads; commands publish repository
  writes; the client invalidates by intersection. See
  [wiki/architecture/command-pattern.md](./wiki/architecture/command-pattern.md).
- **Refactors end in a clean state — full replace, no leftovers.** When renaming
  a symbol, class, function, module, or file, update **every** reference and
  delete the old name. No back-compat aliases, no re-export shims at the old path,
  never both names resolvable at once.
- Tests must import production logic. Do not copy business logic into tests.
- `.vue` files wire UI to logic; tested logic belongs in `.ts` modules or
  composables.

## Validation

### Agent ship gate (static on every push, browser e2e on ready / publish)

**`pre-push` (`scripts/agent-pre-push.ts`) is the agent ship gate.** Humans are
**not** forced through it. Agents are detected via `GROK_AGENT` / `T3_AGENT` /
`AI_AGENT` / Claude / Cursor / Codex env markers.

| Branch PR state         | Agent pre-push                            |
| ----------------------- | ----------------------------------------- |
| No open PR              | **static gate** (`pnpm validate:changed`) |
| **Draft**               | **static gate** (`pnpm validate:changed`) |
| **Ready** for review    | full ship gate                            |
| `gh` / PR lookup failed | full ship gate (**fail closed**)          |

- **`pnpm validate:changed`** runs `check` / `lint-fix` / `test` only for the
  packages you touched (api / frontend / e2e), via `scripts/lib/changes.ts`.
  Root-config / lockfile changes fall back to the full gate. `pnpm validate:plan`
  prints the plan.
- **Browser E2E attestation** — when browser e2e is affected, the full gate asks
  whether the relevant Playwright specs have been run. Only an explicit
  `y` / `yes` within five seconds passes; `no`, empty input, timeout, or no
  interactive terminal blocks.
- **Publish path (required):** `pnpm pr:ready` — runs the same ship gate, then
  marks the PR ready. Agents must **not** call `gh pr ready` (or the
  ready-for-review API) directly. `scripts/install-git-hooks.ts` installs
  `.tools/bin/gh`, a policy shim that blocks those commands unless
  `AGENT_PR_SHIP=1` (set only by `pr:ready`). Put `$REPO/.tools/bin` **first** on
  `PATH` in agent sessions so the shim wins over system `gh`.
- The gate result is cached per HEAD SHA in `.run/agent-ship-gate.json`, so one
  commit is validated once no matter how many times you push or publish it.
  Force a re-run only when diagnosing the gate: `AGENT_SHIP_GATE_FORCE=1`.
- Dirty worktrees are rejected: commit before pushing. If the hook rewrites files
  (`lint-fix` / dprint), stage those rewrites, commit, and push again.
- **Never** `git push --no-verify` / `git commit --no-verify`.
  **Never** set `SKIP_AGENT_PREPUSH` (human escape hatch only).

**Do not run whole-suite checks by hand as routine verification** — the gate runs
them, once, and CI is the backstop. The exception is narrow, targeted proof while
iterating: the one test you are fixing, or typechecking the package you edited.

### Mandatory validation steps

After making **all** changes, run from the **repository root**:

```sh
pnpm check && pnpm lint-fix
```

- `pnpm check` type-checks all packages (tsgo; frontend via `vue-tsc`). Because
  packages depend on each other (e.g. `frontend` and `e2e` depend on `api`),
  always run from the root to catch cross-package type errors.
- `pnpm lint-fix` auto-formats and fixes lint issues across all packages.
- `pnpm rbuild` (`clean` + `check`) is not part of routine validation — reach for
  it only for unexplained weirdness that survives a normal check.
- Note: `pnpm check` for `frontend` runs `nuxt prepare` automatically; if
  `lint-fix` fails with `.nuxt/tsconfig.json not found`, run `pnpm check` first,
  then `pnpm lint-fix`.

## Code Style Guidelines

**Always** look at existing code in the repository to learn and follow
established patterns before writing new code.

Do not worry about getting code formatting perfect while writing. Use `pnpm lint-fix`
to automatically format code according to the project's style guidelines.

## Prefer `Effect.fnUntraced` over functions that return `Effect.gen`

Instead of writing:

```ts
const fn = (param: string) =>
  Effect.gen(function*() {
    // ...
  })
```

Prefer:

```ts
const fn = Effect.fnUntraced(function*(param: string) {
  // ...
})
```

## Using `Context.Service`

Prefer the class syntax when working with `Context.Service`. For example:

```ts
import { Context } from "effect-app"

class MyService extends Context.Service<MyService, {
  readonly doSomething: (input: string) => number
}>()("MyService") {}
```

## Checking Array is not empty

Avoid `.length > 0` or `.length === 0` or `!.length` or `!!.length` checks, use `Array.isArrayNonEmpty` for type narrowing by default.

## Resource and controller layout

Resource files (`**/resources/*.ts`) and controllers (`*.Controllers.ts`) follow a
fixed declaration order: `List`, `List*`, `Get`, `Get*`, then commands alphabetically.
Helper classes (`S.Opaque`, views, errors, inputs) sit immediately before the request
that uses them. See [wiki/architecture/resource-and-controller-layout.md](./wiki/architecture/resource-and-controller-layout.md).

## Vue conventions

`.vue` files have extra constraints (e.g. don't shadow `Array`). See [wiki/architecture/vue-conventions.md](./wiki/architecture/vue-conventions.md).

## Schema defaults: `withConstructorDefault` vs `withDecodingDefault`

All `.withConstructorDefault` extensions exposed by `effect-app` (`S.DateValid.withConstructorDefault`, `S.Boolean.withConstructorDefault`, `S.Array(...).withConstructorDefault`, `S.NullOr(...).withConstructorDefault`, `StringId.withConstructorDefault`, branded ids, etc.) are **construction-only**:

- Applied when the field is omitted from input to a Schema constructor / `.make(...)` call.
- **NOT** applied during `decode` (JSON, database rows, RPC payloads). A stored record missing the field will still fail to decode.
- Therefore `.withConstructorDefault` MUST NOT be used as a just-in-time migration mechanism for database fields.

Do not reach for `withDecodingDefault*` as a substitute either. A missing field in persisted data is just as likely to be data corruption as it is an old-shape document; silently substituting a default hides the problem and can poison downstream aggregates.

Prefer an **explicit, preferably versioned** migration of database data (a schema-version field, a one-shot backfill, or a transform on read gated on an explicit version marker) over decode-time fallbacks. Don't shove missing fields under the rug.

## Git workflow

- **Work in committable increments — commit each before moving on.** Each commit
  builds and passes its checks; no end-of-task mega-commit.
- **On `main`, branch first** for feature work — unless told "commit and push" on
  `main`.
- **Commit and push as the natural completion of a task** — the user opts _out_
  ("don't push"), not in.
- **Rebase before publishing or the final ready-PR push.** Fetch `origin` and
  rebase a PR targeting `main` onto the latest `origin/main` before the ship gate.
  Use `--force-with-lease` when updating rebased branches.
- **Squash-merge repo: new commit per change on a pushed branch, avoid `--amend`**
  (reserve it for local/unpushed commits or a deliberate rebase).

## PRs

The PR description is the shared, portable record any agent resumes from — open
early, keep it current.

Use real Markdown H2 headings in exactly this order:

```md
## Why

## What

## How

## Remarks
```

Do not replace these headings with bold labels, inline code, or a flat list.
Prefer concise, discursive paragraphs under them. Use bullets only when they
materially improve clarity.

- **Always open a draft as early as possible:** once the first meaningful commit
  gives reviewers anything useful to inspect, push it and open the draft.
- **Publish only when done:** `pnpm pr:ready` (ship gate, then undraft). Do not
  use raw `gh pr ready`.
- **Keep the PR description in sync at every commit** — final description = net
  diff to `main`, no filler.
- PR description must include:
  - `Flow doc updated: ✅ / ❌ (reason)` — or `n/a` while no flow docs exist
  - `E2E coverage: added / follow-up tracked / internal-only`
  - `Design angles: <assumed goal> — peers <named> (<pattern>); follow <X> / migrate <Y> via <path> / n/a (trivial)`
