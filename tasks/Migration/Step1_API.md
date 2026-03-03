# Step 1: Convert api

## Objective
Migrate `api` from Effect v3 to v4 in dependency order.

## Validation (Migrations)
- Run `pnpm eslint fix ./src/<file.ts>` for edited files
- Run `pnpm check`

## Progress
- [x] Baseline typecheck collected
- [x] Imports migrated (`effect`, `@effect/*`, `@effect-*/*`)
- [x] API renames applied (Effect/Schema/Layer/Service)
- [x] Lint fix completed
- [x] Typecheck green

## Notes
- `api` has no `check` script; used `pnpm compile` (`tsc --noEmit`) as typecheck.
- Migrated remaining v3 imports in `api/src`:
	- `@effect/experimental/DevTools` → `effect/unstable/devtools`
	- `@effect/rpc` → `effect/unstable/rpc`
	- `@effect/platform/Runtime` → `effect/Runtime`
	- `@effect/platform/HttpClient` → `effect/unstable/http/HttpClient`
	- `@effect/platform` http modules in middleware → `effect-app/http` re-exports
- Replaced `PlatformLogger.toFile` with `Logger.toFile`.
- Replaced `Effect.zipRight` with `Effect.andThen` in middleware.
- Validation run:
	- `pnpm compile` ✅
	- `pnpm exec eslint --fix <edited files>` ✅
	- `pnpm lint` ✅ (warnings only, no blocking errors)
