import { augmentedConfig } from "../eslint.base.config.mjs"

import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default [
  ...augmentedConfig(__dirname, false, "tsconfig.all2.json"),
  {
    ignores: [
      "eslint.config.mjs"
    ]
  }
]
