# Step 0: Upgrade/Replace Effect v3 Packages with v4 Counterparts

## Objective
Replace all effect v3 packages with v4 counterparts and ensure no references to v3 packages remain.

## Tasks

- [ ] 1.1: Update main `package.json` with v4 packages
- [ ] 1.2: Update `api/package.json` with v4 packages  
- [ ] 1.3: Update `frontend/package.json` with v4 packages
- [ ] 1.4: Update `e2e/package.json` with v4 packages
- [ ] 1.5: Remove `effect.patch` from patches and pnpm.patchedDependencies
- [ ] 1.6: Run `pnpm i` to install new packages
- [ ] 1.7: Verify no v3 packages remain in lockfile

## v3 to v4 Package Mapping

From findings.md:
- `effect` 3.x → `effect` 4.x (check major version)
- `@effect/experimental` → check v4 version
- `@effect/opentelemetry` → check v4 version
- `@effect/platform` → v4 version
- `@effect/platform-node` → v4 version
- `@effect/platform-browser` → v4 version
- `@effect/rpc` → v4 version
- `@effect/rpc-http` → v4 version
- `@effect/vitest` → v4 version
- `@effect-atom/atom` → `@effect/atom` (rename)
- `@effect-atom/atom-vue` → `@effect/atom-vue` (rename)
- `@effect-app/*` → check v4 versions (effect-app library)

## Progress

### Completed Actions

✅ 1.1: Updated all package.json files with v4 packages
✅ 1.2: Removed `effect.patch` from patches and pnpm.patchedDependencies
✅ 1.3: Removed `@effect/rpc` and `@effect/rpc-http` (now built-in to effect v4)
✅ 1.4: Removed `@effect/platform` (not needed directly)
✅ 1.5: Deleted effect.patch file from patches directory
✅ 1.6: Ran `pnpm i` - successfully installed all v4 packages
✅ 1.7: Verified no v3 direct packages in lockfile

### Installed Versions

**Root (`package.json`):**
- `effect`: 4.0.0-beta.25 ✓
- `@effect/opentelemetry`: 4.0.0-beta.25 ✓
- `@effect/platform-node`: 4.0.0-beta.25 ✓

**API (`api/package.json`):**
- `@effect-app/infra`: 4.0.0-beta.1 ✓
- `effect-app`: 4.0.0-beta.1 ✓
- `@effect/opentelemetry`: 4.0.0-beta.25 ✓
- `@effect/platform-node`: 4.0.0-beta.25 ✓
- `@effect/vitest`: 4.0.0-beta.25 ✓
- `effect`: 4.0.0-beta.25 ✓

**Frontend (`frontend/package.json`):**
- `@effect-app/vue`: 4.0.0-beta.1 ✓
- `@effect-app/vue-components`: 4.0.0-beta.1 ✓
- `@effect/atom-vue`: 4.0.0-beta.25 ✓
- `@effect/platform-browser`: 4.0.0-beta.25 ✓
- `@effect/opentelemetry`: 4.0.0-beta.25 ✓
- `effect`: 4.0.0-beta.25 ✓
- `effect-app`: 4.0.0-beta.1 ✓

**E2E (`e2e/package.json`):**
- `@effect/platform-node`: 4.0.0-beta.25 ✓
- `effect-app`: 4.0.0-beta.1 ✓
- `effect`: 4.0.0-beta.25 ✓

## Notes

- Some transitive dependencies still use v3 packages (e.g., `@effect/platform@0.94.1`) as they come from other libraries - this is normal and will be resolved during API migration
- RPC and RPC-HTTP are now part of `effect` core in v4 (`effect/unstable/rpc`)
- Installation completed successfully with some expected peer dependency warnings (beta versions)

## Original Versions Found (for reference)
- @effect-atom/atom may be renamed to @effect/atom or may not exist as a separate package in v4
