# Effect App Sample

Demo basic usage of Models, Resources, Controllers, Clients, long running tasks and some SSE.

## Setup

1. `pnpm i` from root
2. open a typescript file, and set VSCode's Typescript version to use the workspace version:
   - TypeScript: Select TypeScript version: Use workspace version

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

- Make sure you don't have the old Vue/Vetur vs code plugin installed, but the new ones only: "Vue.volar", "Vue.vscode-typescript-vue-plugin"

## Framework documentation

[WIP](https://github.com/effect-ts-app/docs)
