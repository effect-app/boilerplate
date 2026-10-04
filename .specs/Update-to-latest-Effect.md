# Update to latest effect and effect-app packages

## Rules

- only include root `package.json` and `api`, `e2e`, and `frontend` packages.

## Steps

1. run `pnpm check && pnpm lint-fix` to compare later
2. update the effect / `@effect/*` / `effect-app` / `@effect-app/*` versions in the package.json files
3. run `pnpm i`
4. update the `repos/effect` and `repos/effect-app` submodule pointers to the same versions we just updated the packages to
   (or `pnpm effa sync-effect`, then `pnpm i` inside the submodules when needed)
5. run `pnpm check && pnpm lint-fix` again, compare to before the update
6. prepare commit

If new errors occur, first describe the problem, propose solutions and wait for answers.

Note: `effect` / `effect-app` resolve from the registry by default; `repos/*` are reference
source only. Use `pnpm embedded:effect:link` / `pnpm embedded:effect:unlink` when you need to
test a change against vendored source.
