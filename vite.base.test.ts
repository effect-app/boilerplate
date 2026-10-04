/// <reference types="vitest" />

import AutoImport from "unplugin-auto-import/vite"
import { defineConfig } from "vite"
import type { UserConfig } from "vite"
import makeConfig from "./vite.base"

export default function defineTestConfig(
  dirName?: string,
  transform?: (cfg: UserConfig) => UserConfig
) {
  const b = makeConfig(dirName)
  // autoimport seems to work best, even if in some cases setting vitest/globals as types works.
  const autoImport = AutoImport({
    dts: "./test/auto-imports.d.ts",
    exclude: [
      /[\\/]node_modules[\\/]/,
      /[\\/]\.git[\\/]/,
      /[\\/]repos[\\/]effect[\\/]/,
      /[\\/]repos[\\/]effect-app[\\/]/
    ],
    imports: [
      "vitest",
      {
        "@effect-app/infra/vitest": [
          "describe",
          "it",
          "expect",
          "beforeAll",
          "afterAll",
          "beforeEach",
          "afterEach",

          "layer",

          "createRandomInstance",
          "createRandomInstanceI",

          "assert",
          "suite",
          "test"
        ]
      }
    ]
  })

  const cfg = {
    ...b,
    plugins: [
      ...b.plugins ?? [],
      autoImport
    ],
    test: {
      ...b.test,
      include: ["./test/**/*.test.{ts,mts,cts,tsx}"],
      exclude: ["**/node_modules/**"]
    },
    watchExclude: ["**/node_modules/**"]
  }
  return defineConfig(transform ? transform(cfg) : cfg)
}
