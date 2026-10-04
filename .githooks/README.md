# Native Git hooks

`pnpm install` configures `core.hooksPath=.githooks`. Because this directory is
tracked, the hooks exist immediately in every linked worktree. `post-checkout`
runs after branch checkout and worktree creation before Git returns.

## `post-checkout`

### 1. Clear TypeScript project emit (always on branch / worktree checkout)

`pnpm check` is `tsgo --build` with `composite` + `incremental` +
`emitDeclarationOnly`. Outputs (`.tsbuildinfo` + `.d.ts`) live under package
`dist/` directories and are gitignored.

After a branch switch, **sources** follow HEAD but **dist** can still belong to
another tree. tsgo may treat projects as up to date and typecheck new sources
against old declarations → phantom type errors that disappear on
`pnpm rbuild` (`clean` + `check`).

On every **branch** checkout (`post-checkout` flag `1`), this hook deletes:

- `api/dist`, `api/test/dist`, `api/test/dist-*`
- `e2e/dist`, `e2e/test-out`
- `frontend/dist`
- any remaining `*.tsbuildinfo` outside `node_modules` / `repos` / `.git`

File-only checkouts (flag `0`) are left alone so partial restores stay cheap.

**This is a workaround.** Root cause belongs in tsgo incremental invalidation.
Remove this wipe when upstream is reliable **and** the `effect-app/tsgo` pin
includes those fixes. Do not re-enable cross-tree dist reuse without an exact
source-identity key.

### 2. Reconcile pnpm (when package/lock changed)

Successful reconciliation records the package/lockfile state under
`node_modules`, so a later worktree setup does not repeat an install which Git
already completed.

## `pre-commit`

Runs `lint-staged` (oxlint fast pass + dprint) on staged files directly from
`node_modules/.bin`, not via pnpm (pnpm's dependency-status check aborts
without a TTY when the lockfile moved).

## `pre-push`

Agent-only ship gate, see [`scripts/agent-pre-push.ts`](../scripts/agent-pre-push.ts).
Humans: no-op unless `SKIP_AGENT_PREPUSH` is unset and agent env markers match.
