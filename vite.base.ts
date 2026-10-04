/// <reference types="vitest" />
import fs from "fs"
import path from "path"
import type { UserConfig } from "vite"
import tsconfigPaths from "vite-tsconfig-paths"

const pj = require("./package.json")

const basePj = pj.name.replace("/root", "")

export default function makeConfig(dirName?: string): UserConfig {
  const alias = (name: string) => ({
    [basePj + "/" + name]: path.join(__dirname, `/${name}/src`)
  })
  const projects = ["api"]
  const aliases: Record<string, string> = {}
  for (const project of projects) {
    Object.assign(aliases, alias(project))
  }
  if (dirName) {
    aliases[JSON.parse(fs.readFileSync(dirName + "/package.json", "utf-8")).name] = path.join(dirName, "/src")
  }
  return {
    plugins: [tsconfigPaths({ projects: projects.map((_) => path.join(__dirname, `/${_}`)) })],
    test: {
      include: ["./src/**/*.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
      exclude: ["./test/**/*"],
      reporters: "verbose",
      globals: true
    },
    resolve: Object.keys(aliases).length > 0
      ? {
        alias: {
          ...aliases
        }
      }
      : undefined
  }
}
