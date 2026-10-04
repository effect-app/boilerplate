#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { errMessage } from "./lib/opts.ts"

type CompilerName = "tsgo" | "tsc"

const args = process.argv.slice(2)
const selectedCompiler = process.env.TS_COMPILER ?? "auto"
const rootRequire = createRequire(join(process.cwd(), "package.json"))

const resolveCompiler = (compiler: CompilerName): string => {
  switch (compiler) {
    case "tsgo":
      return join(dirname(rootRequire.resolve("@typescript/native-preview/package.json")), "bin", "tsgo.js")
    case "tsc":
      return rootRequire.resolve("typescript/bin/tsc")
  }
}

const run = (command: CompilerName): never => {
  let bin: string
  try {
    bin = resolveCompiler(command)
  } catch (error: unknown) {
    console.error(`[compiler] failed to resolve ${command}: ${errMessage(error)}`)
    process.exit(1)
  }
  const result = spawnSync(process.execPath, [bin, ...args], { stdio: "inherit" })
  if (result.error) {
    console.error(`[compiler] failed to run ${command}: ${result.error.message}`)
    process.exit(1)
  }
  if (result.signal) {
    console.error(`[compiler] ${command} terminated by ${result.signal}`)
    process.exit(1)
  }
  process.exit(result.status ?? 1)
}

const canRunTsgo = (): boolean => {
  let bin: string
  try {
    bin = resolveCompiler("tsgo")
  } catch (error: unknown) {
    console.warn(`[compiler] tsgo is unavailable (${errMessage(error)}); falling back to tsc`)
    return false
  }
  const result = spawnSync(process.execPath, [bin, "--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  })
  if (result.status === 0) return true

  const reason = result.error?.message ?? result.stderr?.trim() ?? result.stdout?.trim() ?? `exit ${result.status}`
  console.warn(`[compiler] tsgo is unavailable (${reason}); falling back to tsc`)
  return false
}

switch (selectedCompiler) {
  case "auto":
    run(canRunTsgo() ? "tsgo" : "tsc")
    break
  case "tsgo":
  case "tsc":
    run(selectedCompiler)
    break
  default:
    console.error(`[compiler] unsupported TS_COMPILER=${selectedCompiler}; expected auto, tsgo, or tsc`)
    process.exit(1)
}
