# @effect-app-boilerplate

TypeScript monorepo starter for projects on the Effect App ecosystem:

- `api/` — Effect backend (runs TypeScript from source on Node 24)
- `frontend/` — Nuxt + Vue
- `e2e/` — Playwright

## Setup

1. `pnpm i` from root
2. open a TypeScript file, and set VSCode's Typescript version to use the workspace version:
   - TypeScript: Select TypeScript version: Use workspace version
3. `pnpm check` to typecheck all packages, `pnpm lint-fix` to format + fix lint.

Notes:

- The repo uses tsgo (via `@effect/tsgo` + `typescript-native-bridge`); `pnpm prepare`
  installs the patched compiler and the native git hooks.
- Architecture + conventions live in [`wiki/architecture/`](wiki/architecture/index.md) and
  [`AGENTS.md`](AGENTS.md).

## Run

Use the VSCode "Run Task", "Run UI".
Or see below for running manually.

### API, Models, Resources

a) `pnpm build -w`
b) `cd api && pnpm dev`

Visit: http://localhost:3610/docs
The API is also proxied in the frontend on /api

### Frontend (Nuxt)

- `cd frontend && pnpm dev -o`

Visit: http://localhost:4000
API Docs: http://localhost:4000/api/docs

Notes

- Make sure you don't have the old Vue/Vetur vs code plugin installed, but the new ones only: "Vue.volar"

### Helpful editor hints

Add to keybinds:

```json
{
  "key": "ctrl+shift+i",
  "command": "editor.action.sourceAction",
  "args": {
    "kind": "source.addMissingImports",
    "apply": "first"
  }
}
```

## Validation

```sh
pnpm check        # typecheck everything (tsgo + vue-tsc)
pnpm lint-fix     # format + lint fix
pnpm validate:changed   # scoped check/lint-fix/test for the packages you touched
pnpm test:scripts       # change-detection kernel tests
```

Agents: pushes run the ship gate automatically; publish with `pnpm pr:ready`.
See [`AGENTS.md`](AGENTS.md#validation).

## Documentation

The wiki lives in [`wiki/`](wiki/Home.md). Shared architecture docs, e2e helpers and
ts-plugins are synced from `effect-app/shared` — see
[`wiki/shared-sync.md`](wiki/shared-sync.md) for `effa sync` usage.

When using this boilerplate for a new project, keep the synced files in place and
add your project-specific flow docs under `wiki/flows/`.

## Framework documentation

[WIP](https://github.com/effect-ts-app/docs)
