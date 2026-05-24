# Shared Content Sync

How shared architecture docs, e2e helpers, and ts-plugins move between this project, the upstream `effect-app/shared` repo, and other consuming projects.

## Where things live

| Local path | Source of truth | Sync method |
|---|---|---|
| `wiki/architecture/*` | `effect-app/shared` `wiki/architecture/` | `effa sync` (strict) |
| `wiki/how-we-build.md` | `effect-app/shared` | `effa sync` (strict) |
| `e2e/helpers/*` (except `adapter.ts`) | `effect-app/shared` `e2e/helpers/` | `effa sync` (strict) |
| `e2e/helpers/adapter.ts` | **project-local** | hand-edited per project |
| `scripts/ts-plugins/prefer-namespace-import/` | `effect-app/shared` `ts-plugins/...` | `effa sync` (strict) |
| `tsconfig.plugins.json` | `effect-app/shared` `templates/tsconfig.plugins.json` | manual diff + merge |

Lockfile: [`.shared.json`](../.shared.json) pins the upstream sha.

## Commands

```sh
effa sync              # pull from shared@<pinned-ref>, overwrite local files
effa sync-diff         # report drift between local and pinned-ref cache
effa sync-push --pr    # push locally-modified synced files upstream + open PR
```

All operate from the project root where `.shared.json` lives.

## Daily workflows

### Pull upstream updates

```sh
effa sync
git status                            # review what changed
git diff <files>
# if good
git add -A && git commit
# if bad: revert specific files, leave .shared.json unmodified
```

### Edit a shared doc in-flow (then propagate)

1. Edit the file in this project as if it were local (e.g. `wiki/architecture/import-rules.md`).
2. Verify the rule by using it locally.
3. `effa sync-diff` — confirms the file is `M`.
4. `effa sync-push --pr -m "tighten cross-workflow namespace rule"`
5. Once the PR merges upstream, bump this project's `.shared.json` `ref` to the new sha and `effa sync` to re-align. (sync-push leaves the local file in place; the bump is what records the new baseline.)

### Pin to a specific upstream version

Edit `.shared.json` `ref` to a sha or tag, then `effa sync`.

## Adapter pattern (for `e2e/helpers/command.ts`)

The synced `command.ts` imports project-local intl from `./adapter.js`:

```ts
import { type ActionIntlKey, deActionMessages } from "./adapter.js"
```

This project owns `e2e/helpers/adapter.ts` and re-exports from the actual API resource. The stub on initial sync is a no-op (empty messages). Wire to your real intl source once the api package exposes one:

```ts
export { type ActionIntlKey, deActionMessages } from "@<project>/api/resources/action-intl"
```

## When NOT to use `effa sync`

- **Templates** (e.g. `tsconfig.plugins.json`): project-customized. Diff manually against `~/.cache/effa/shared/<slug>/templates/<file>`.
- **Anything not listed in `.shared.json artifacts`**: not tracked.
- **Project-local files** (e.g. `e2e/helpers/adapter.ts`): never in shared; excluded by absence.

## Troubleshooting

- `No .shared.json found`: run from project root.
- `Could not resolve home directory`: set `$HOME`.
- Cache stale: `rm -rf ~/.cache/effa/shared/<slug>` and re-run.
- Sync overwrote work you wanted to keep: lockfile is unchanged — `git checkout -- <file>` to restore, then re-edit. `sync-push` to upstream first if the work belongs there.
