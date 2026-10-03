/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

import { vueConfig } from "@effect-app/eslint-shared-config/eslint.vue.config"
import vuetify from "eslint-plugin-vuetify"

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const vuetifyRecommendedV4 = vuetify.configs["flat/recommended-v4"].map((config) => ({
  ...config,
  plugins: config.plugins?.vuetify ? { vuetify: config.plugins.vuetify } : config.plugins
}))

// True when the embedded Effect source is linked in (pnpm `link:` overrides to
// repos/effect*). Mirrors the detection in scripts/embedded-effect-source.ts.
const effectSourceLinked = (() => {
  try {
    const workspace = fs.readFileSync(path.join(__dirname, "../pnpm-workspace.yaml"), "utf8")
    return /link:(\.\.\/)?repos\/effect(-app)?\//.test(workspace)
  } catch {
    return false
  }
})()

export default [
  ...vueConfig(__dirname, false),
  // Vuetify 4 upgrade rules: typography MD2→MD3 renames, elevation overflow, legacy grid props, deprecated snackbar
  ...vuetifyRecommendedV4,
  {
    ignores: ["**/.nuxt/**", "**/.output/**", "**/*.ts", "scripts/**"]
  },
  {
    files: ["pages/**/*.vue", "components/**/*.vue", "layouts/**/*.vue"],
    rules: {
      "vue/multi-word-component-names": "off"
    }
  },
  {
    // Do not re-register `@typescript-eslint` here: `vueConfig` already provides
    // it. ESLint 10 rejects plugin redefinition, and linked effect-app source can
    // surface two physical plugin instances (registry vs link) that make the
    // redefine fail hard.
    rules: {
      "@typescript-eslint/no-explicit-any": "warn"
    }
  },
  // When the embedded Effect source is linked in, Effect's own source is
  // type-checked as part of this project. Effect is authored WITH
  // `noUncheckedIndexedAccess` enabled, but this frontend does NOT enable it
  // (see frontend/tsconfig.json). Under the looser setting, indexed access is
  // typed `T` instead of `T | undefined`, so the `!` / `as` assertions that are
  // necessary against Effect's real (unlinked) types read as redundant — making
  // `@typescript-eslint/no-unnecessary-type-assertion` fire false positives that
  // flip back the moment we unlink. Disable the rule while linked; it returns
  // automatically once Effect resolves to its built types again.
  ...(effectSourceLinked
    ? [{
      rules: {
        "@typescript-eslint/no-unnecessary-type-assertion": "off"
      }
    }]
    : [])
]
