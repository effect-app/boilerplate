# Migration

Right now we are using Effect v3 - effect (repos/effect-v3) and corresponding effect-app v3 (repos/libs#main)
The task is about migrating to Effect v4 - effect-smol (repos/effect-v4) and corresponding effect-app v4 (repos/libs#r/effect-v4-2)

There are migration guides:
- Announcement: https://effect.website/blog/releases/effect/40-beta/
- [v3 to v4 general](/repos/effect-v4/MIGRATION.md)
- [Schema v3 to v4](/repos/effect-v4/packages/effect/SCHEMA.md#migration-from-v3)

## Steps

0. First upgrade/replace all effect v3 packages with v4 counterparts in the repository. Make sure no references to v3 packages remain. Remove v3 patches.
1. Convert `api` - as it's the base for everything
2. Convert `frontend`
3. Convert `e2e`

Each step will be completed individually, and only move on to the next step when the current is done succesfully, and confirmed by the user.
For each step we should find out if we can convert 1:1 or certain things are missing preventing that.
Commit every task you complete for every step (wait until confirmation by the user)

## Rules

- Always check `AGENTS.md` in the root of each repository to understand rules.
  - Ignore the `#### New Features` section, instead follow `#### Migrations` for `### Mandatory Validation Steps`
- Consult the earlier mentioned Migration Guides for hints
- Create task files for each Step in markdown files under `task/Migration` directory, and track progress and findings in each.
- Save all conversion findings in a `task/findings.md` file to speed up future migrations. Read this file for every step!
- Never replace any function argument type with `any`
- Never cast to `any` as a "fix" (`(s as any)`)! nor recasting via `any` e.g `as any as S.Schema<any>`. or `unknown`: e.g `as unknown as S.Schema<any>`. Maybe you first need to fix other files.
<!-- - Never replace function bodies with placeholders. Real fixes only. Ask if you can't find a real solution. -->
- Consult the migration guides instead of making up assumptions. e.g `Schema<A, I, R>` is now `Codec<A, I, R>`
- Prioritise first fixing files that are dependencies of others (via direct or indirect imports).
  - Migrate and fix files in dependency order
- The `repos` only serve as documentation/reference, there are examples and tests. Do not link packages to these local files. The repository source code should only use (pre) released packages from npm.

### CRITICAL: Never Remove Functionality

**The migration task is to change v3 API patterns to v4 patterns, NOT to remove code.**

- ❌ **NEVER** delete classes, functions, properties, or implementations during migration
- ❌ **NEVER** add new helper functions that weren't in the original code
- ✅ **ONLY** change API patterns from v3 to v4
- ✅ **When the compiler shows an error, FIX it** by finding the v4 equivalent API - don't delete the code
- ✅ **If code compiles, leave it alone** - don't change working code

**Example mistakes to avoid:**
- Removing `User.resolver`, `getUserByIdResolver`, `UserFromIdLayer` because they "look complex"
- Adding helper methods like `FullName.render()`, `showFullName()` that weren't there
- Deleting resolver patterns without checking if they cause errors
- Removing static properties without understanding their purpose

**Correct approach:**
1. Read the original code carefully
2. Run the compiler to see what's actually broken
3. For each error, find the v4 equivalent API and migrate the pattern
4. If you can't find the v4 equivalent, document it and ask - **NEVER delete the code**
5. If code has no errors, don't touch it

## Process

- Always consult `findings.md` to help with migration or to fix build errors.
- When not finding the solution there, inspect the migration guides (this file, and the migration guides listed at the top), and source code in the `repos` folder
- Once finding a new solution, or fix mistakes, update `findings.md`

## Conversion

We start with an as close as possible 1:1 conversion.

1. replace `effect`, `@effect/*`, `@effect-*/*` package.json references, with their respective v4 counter parts (most `@effect/*` and `@effect-*/*` have moved into `effect/unstable/*`). Also update `effect-app` and `@effect-app/*`, rerun `pnpm i`
2. replace `effect`, `@effect/*` and `@effect-*/*`  typescript references, with their respective v4 counter parts (most @effect/* have moved into `effect/unstable/*`)
3. use new names of v4 functions and modules accordingly

## Conversion hints

- Use `.asEffect()` when trying to use `Option`, `Either` (`Result`), `Reference`, `Service` etc with `Effect` combinators
- `Effect.all()` with homogenous `Config`, `Either` (`Result`) or `Option` values, should be replaced with `Config.all()` and so forth. When heterogenous involved, use `.asEffect()`
- `Effect.dieMessage("a message")` is now `Effect.die("a message")`
- Do not convert Schema classes to non classes (const+interface), instead use the `Schema.Opaque` helper if needed.
- `Array.filterMap` is replacable by effect's `Array.filter` with a `Filter.Filter` that filters and maps at the same time, using `Result` instead of `Option` it seems. 
- If `pipe()` has been defined on a parent class, don't fix it by using `override pipe()` in a child class, just remove the method and rely on the inherited method.

### Schema Type Parameters

In v4, schemas with context/service requirements use `Codec`, not `Schema`.

**v3 `Schema<A, I, R>` (3 type parameters) → v4 `Codec<A, I, R>`**

Before (v3):
```ts
export const UserFromId: S.Schema<User, string, UserFromIdResolver> = S.transformOrFail(...)
```

After (v4):
```ts
// Option 1: Let TypeScript infer (if possible)
export const UserFromId = S.transformOrFail(...)

// Option 2: Explicit typing when needed
export const UserFromId: S.Codec<User, string, UserFromIdResolver> = S.transformOrFail(...)
```

**IMPORTANT:** 
- `Schema<T, I>` in v4 has 2 type parameters and NO service requirements
- `Codec<T, I, R>` in v4 has 3 type parameters and CAN have service requirements (R)
- **Never remove the R parameter** - change `Schema<T, I, R>` to `Codec<T, I, R>` instead


### `Effect.Service` migration to `ServiceMap.Service`

Before:
```ts
class GHGistService extends Effect.Service<GHGistService>()("GHGistService", {
  dependencies: [RunCommandService.Default],
  effect: Effect.gen(function*() {
    // ...
  })
} {}
```

After:
```ts
class GHGistService extends ServiceMap.Service<GHGistService>()("GHGistService", {
  make: Effect.gen(function*() {
    // ...
  })
}) {
  static DefaultWithoutDependencies = Layer.effect(this, this.make)
  static Default = this.DefaultWithoutDependencies.pipe(
    Layer.provide(RunCommandService.Default)
  )
}
```

## Out of scope

- detect naming patterns we adopted from effect v3 in our libraries, and change them to match v4 naming patterns.
- general refactorings and improvements

You can document these for follow-ups, in a task/followups.md file.

## Context

- The effect source code repository is located inside `repos/effect`
- The effect-smol source code repository is located inside `repos/effect-smol`

All repos can be kept uptodate with `git submodule foreach git pull origin main` and `git submodule foreach pnpm i`.
