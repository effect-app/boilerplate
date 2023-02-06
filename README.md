# @effect-app/boilerplate

## Setup

1. `pnpm i` from root
2. open a typescript file, and set VSCode's Typescript version to use the workspace version:
   - TypeScript: Select TypeScript version: Use workspace version

## Run

Use the VSCode "Run Task", "Run UI".
Or see below for running manually.

### API, Models, Resources

a) `pnpm build -w`
b) `cd _project/main && pnpm dev`

Visit: http://localhost:3610/docs
The API is also proxied in the frontend on /api

### Frontend (Nuxt)

- `cd _project/frontend-nuxt && pnpm dev -o`

Visit: http://localhost:5281
API Docs: http://localhost:5281/api/docs

Notes

- Make sure you don't have the old Vue/Vetur vs code plugin installed, but the new ones only: "Vue.volar", "Vue.vscode-typescript-vue-plugin"

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

## Framework documentation

[WIP](https://github.com/effect-ts-app/docs)
