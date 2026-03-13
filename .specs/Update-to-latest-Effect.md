# Update to latest effect and effect-app packages

## Rules

- only include root `package.json` and `api`, `e2e`, and `frontend` packages.

## Steps

1. run `pnpm test` and `pnpm lint-fix` to compare later
2. update package.json files
3. run `pnpm i`
4. update `repos/effect-v4` and `repos/effect-app` pointer to the same version we just updated the packages to. and run `pnpm i` inside it.
5. run test and lint again, compare to from before the update.
6. prepare commit

If new errors occur, first describe the problem, propose solutions and wait for answers.
