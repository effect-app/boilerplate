# Agent Instructions

This is the `@effect-app/boilerplate` starter — a TypeScript monorepo seed (`api/` Effect backend + `frontend/` Nuxt + `e2e/` Playwright) for projects built on the Effect App ecosystem.

## Architecture + conventions

[`wiki/architecture/`](./wiki/architecture/index.md) is the source of truth for patterns:
import rules, resource/controller layout, command pattern, query shapes,
database query guidelines, e2e state pattern, vue conventions, etc.

These are **synced** from [`effect-app/shared`](https://github.com/effect-app/shared) via `effa sync` — see [`wiki/shared-sync.md`](./wiki/shared-sync.md).

When changing a synced doc: edit in place, then `effa sync-push --pr` to propagate upstream.

## Development Workflow

- The git base branch is `main`
- Use `pnpm` as the package manager

### Core Principles

- **Zero Tolerance for Errors**: All automated checks must pass
- **No `as any` / `as unknown` casts**: These are never acceptable fixes. Understand the actual types and fix the root cause. If a type mismatch exists, find the correct v4 API, update the type signatures, or restructure the code.
- **Clarity over Cleverness**: Choose clear, maintainable solutions
- **Conciseness**: Keep code and any wording concise and to the point. Sacrifice grammar for the sake of concision.
- **Reduce comments**: Avoid comments unless absolutely required to explain unusual or complex logic. Comments in jsdocs are acceptable.
- **Look for effect sources inside `repos/effect-v4`**
- **Never import local `repos` files**: Always use the latest online (pre-release) versions of packages instead. `repos` is just for reference, also includes examples, tests, and migration documentation.
- **Never webfetch from the `effect-v3` and `effect-v4` repos**: just use the locally included under `repos`

### Mandatory Validation Steps

After making **all** changes, run from the **repository root**:

```sh
pnpm check && pnpm lint-fix
```

- `pnpm check` runs type checking for all packages. Because packages depend on each other (e.g. `frontend` and `e2e` depend on `api`), always run from the root to catch cross-package type errors.
- `pnpm lint-fix` auto-formats and fixes lint issues across all packages.
- If type checking continues to fail, run `pnpm clean` from the root to clear caches, then re-run `pnpm check`.
- Note: `pnpm check` for `frontend` runs `nuxt prepare` automatically; if `lint-fix` fails with `.nuxt/tsconfig.json not found`, run `pnpm check` first, then `pnpm lint-fix`.


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

<!-- ## Barrel files

The `index.ts` files are automatically generated. Do not manually edit them. Use
`pnpm codegen` to regenerate barrel files after adding or removing modules. -->

<!-- ## Running test code

If you need to run some code for testing or debugging purposes, create a new
file in the `scratchpad/` directory at the root of the repository. You can then
run the file with `node scratchpad/your-file.ts`.

Make sure to delete the file after you are done testing. -->

<!-- ## Testing

Before writing tests, look at existing tests in the codebase for similar
functionality to follow established patterns.

- Test files are located in `packages/*/test/` directories for each package
- Main Effect library tests: `packages/effect/test/`
- Always verify implementations with tests
- Run specific tests with: `pnpm test <filename>`

### it.effect Testing Pattern

- Use `it.effect` for all Effect-based tests, not `Effect.runSync` with regular `it`
- Import `{ assert, describe, it }` from `@effect/vitest`
- Never use `expect` from vitest in Effect tests - use `assert` methods instead
- All tests should use `it.effect("description", () => Effect.gen(function*() { ... }))`

Before writing tests, look at existing tests in the codebase for similar
functionality to follow established patterns.

### Type level tests

Type level tests are located in the `dtslint` directories of each package.

You can run them with `pnpm test-types <filename>`.

Take a look at the existing `.tst.ts` files for examples of how to write type
level tests. They use the `tstyche` testing library. -->

## Changesets

All pull requests must include a changeset. You can create changesets in the
`.changeset/` directory.

The have the following format:

```md
---
"package-name": patch | minor | major
---

A description of the change.
```
