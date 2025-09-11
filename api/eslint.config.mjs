import path from "node:path"
import { fileURLToPath } from "node:url"
import { augmentedConfig } from "@effect-app/eslint-shared-config/eslint.base.config"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default [
  ...augmentedConfig(__dirname, false),
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "**/*.d.ts",
      "**/*.config.ts"
    ]
  }
]
