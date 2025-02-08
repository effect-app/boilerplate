/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck

import { vueConfig } from "../eslint.vue.config.mjs"

import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default [
  ...vueConfig(__dirname, false),
  {
    ignores: [".nuxt/**", ".output/**", ".storybook/**"],
  },
  {
    files: ["pages/**/*.vue", "components/**/*.vue", "layouts/**/*.vue"],
    rules: {
      "vue/multi-word-component-names": "off",
    },
  },
]
