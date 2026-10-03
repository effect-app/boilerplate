// Single source of truth for the embedded Effect / effect-app package taxonomy.
// Consumed by:
//   - embedded-effect-source.mjs   (link/unlink: overrides, workspace, tsconfigs)
//   - generate-tsconfig-paths.ts   (linked-mode tsconfig `paths`)
// Kept here (plain .mjs, no CLI side effects) so both importers stay in sync.

export type PackageEntry = readonly [name: string, relativePath: string, prefix: string | null, kind?: string]

// [import name, path relative to repo root, registry version prefix; "" pins exact, null removes override]
export const sourceEffectPackages: PackageEntry[] = [
  ["effect", "repos/effect/packages/effect", ""],
  ["@effect/atom-vue", "repos/effect/packages/atom/vue", ""],
  ["@effect/openapi-generator", "repos/effect/packages/tools/openapi-generator", null],
  ["@effect/platform-browser", "repos/effect/packages/platform-browser", ""],
  ["@effect/platform-node", "repos/effect/packages/platform-node", ""],
  ["@effect/platform-node-shared", "repos/effect/packages/platform-node-shared", ""],
  ["@effect/sql-sqlite-node", "repos/effect/packages/sql/sqlite-node", ""],
  ["@effect/vitest", "repos/effect/packages/vitest", ""],
  ["@effect/opentelemetry", "repos/effect/packages/opentelemetry", null]
]

export const sourceEffectAppPackages: PackageEntry[] = [
  ["effect-app", "repos/effect-app/packages/effect-app", null, "source"],
  ["@effect-app/infra", "repos/effect-app/packages/infra", null, "source"],
  ["@effect-app/vue", "repos/effect-app/packages/vue", null, "source"]
]

// The rest of the effect-app packages. They get pnpm overrides + a workspace
// entry (so every linked package's `workspace:*` deps resolve — e.g.
// vue-components → eslint-shared-config → eslint-codegen-model), but are
// deliberately excluded from tsconfig `paths`/`references`:
//   - vue-components: src has .vue SFCs; default tsc/tsgo can't read them.
//     Runtime .vue is compiled by vite; the frontend types it via vue-tsc from
//     src — no build on link.
//   - cli / eslint-codegen-model / eslint-shared-config: devtime-only (CLI /
//     eslint), no `tsconfig.src.json`, never imported by typechecked app code.
export const nonReferencedEffectAppPackages: PackageEntry[] = [
  ["@effect-app/cli", "repos/effect-app/packages/cli", null, "tool"],
  ["@effect-app/eslint-codegen-model", "repos/effect-app/packages/eslint-codegen-model", null, "tool"],
  ["@effect-app/eslint-shared-config", "repos/effect-app/packages/eslint-shared-config", null, "tool"],
  ["@effect-app/vue-components", "repos/effect-app/packages/vue-components", null, "source-vue"]
]
