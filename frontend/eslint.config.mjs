/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

import { vueConfig } from "@effect-app/eslint-shared-config/eslint.vue.config"
import vuetify from "eslint-plugin-vuetify"

import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default [
  ...vueConfig(__dirname, false),
  // Vuetify 4 upgrade rules: typography MD2→MD3 renames, elevation overflow, legacy grid props, deprecated snackbar
  ...vuetify.configs["flat/recommended-v4"],
  {
    ignores: [".nuxt/**", ".output/**", "**/*.ts"]
  },
  {
    files: ["pages/**/*.vue", "components/**/*.vue", "layouts/**/*.vue"],
    rules: {
      "vue/multi-word-component-names": "off"
    }
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn"
    }
  }
]
