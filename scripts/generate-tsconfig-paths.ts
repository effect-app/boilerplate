#!/usr/bin/env node
/**
 * Generates `compilerOptions.paths` for the api tsconfigs from
 * `api/package.json` `imports`. Comments in the tsconfigs are preserved
 * via `comment-json`.
 *
 * When embedded Effect source mode is LINKED (`pnpm-workspace.yaml`
 * `overrides` point the effect packages at `link:repos/...`), the linked
 * packages' source `paths` are appended too — derived from each package's
 * `exports` (mirrors `scripts/embedded-effect-source.ts`). Without this,
 * paths:gen (run by `pnpm check`/`build`) strips the effect `paths` the link
 * step added, since they aren't in `api/package.json` `imports`.
 * TODO: revisit removal once symlink+`exports`+Node16 resolution is confirmed
 * to make these fully redundant.
 *
 * Usage:
 *   node scripts/generate-tsconfig-paths.ts          # write
 *   node scripts/generate-tsconfig-paths.ts --check  # exit 1 if changes
 */
import CJSON from "comment-json"
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import YAML from "yaml"
import { sourceEffectAppPackages, sourceEffectPackages } from "./embedded-effect-packages.ts"

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, "..")
const apiRoot = resolve(repoRoot, "api")
const pkgPath = resolve(apiRoot, "package.json")

const TARGETS = [
  "tsconfig.json",
  "tsconfig.src.json",
  "tsconfig.test.json"
] as const

interface ImportsEntry {
  default?: string
  import?: string | { default?: string }
}

const resolveImportDefault = (entry: ImportsEntry | string): string | undefined => {
  if (typeof entry === "string") return entry
  if (entry.default) return entry.default
  if (typeof entry.import === "string") return entry.import
  return entry.import?.default
}

// Linked Effect source packages: [import name, path relative to repo root].
// Source of truth: scripts/embedded-effect-packages.ts (shared with
// embedded-effect-source.mjs). These are the source* packages that feed
// tsconfig `paths` — the non-referenced ones are deliberately excluded.
const LINKED_PACKAGES: ReadonlyArray<readonly [string, string]> = [
  ...sourceEffectPackages,
  ...sourceEffectAppPackages
]
  .map(([name, relPath]) => [name, relPath])

interface ExportEntry {
  types?: string
  default?: string
}

// Linked iff the pnpm-workspace.yaml overrides redirect an effect package to
// `link:`. pnpm 11 reads overrides from pnpm-workspace.yaml, not the
// `package.json` `pnpm` field.
const isLinked = (): boolean => {
  const workspace = YAML.parse(readFileSync(resolve(repoRoot, "pnpm-workspace.yaml"), "utf8")) as {
    overrides?: Record<string, string>
  }
  const overrides = workspace?.overrides ?? {}
  return LINKED_PACKAGES.some(([name]) => {
    const spec = overrides[name]
    return typeof spec === "string" && spec.startsWith("link:")
  })
}

const resolveExportTarget = (entry: ExportEntry | string): string | undefined => {
  if (typeof entry === "string") return entry
  if (!entry) return undefined
  if (typeof entry.types === "string") return entry.types
  if (typeof entry.default === "string") return entry.default
  return undefined
}

// Skip non-public export keys: the catch-all `*` mapping already covers them
// for resolution, and they were never in the committed linked block.
const skipExportKey = (key: string): boolean =>
  key === "./package.json" || key.includes("internal") || key === "./*/index"

// Path mappings for linked packages, derived from each package's `exports`.
// Targets are relative to the api tsconfigs (all under `api/`, one level below
// repo root), so a repo-root-relative path becomes `../<path>`.
const buildLinkedPaths = (): Record<string, string[]> => {
  const paths: Record<string, string[]> = {}
  for (const [name, relPath] of LINKED_PACKAGES) {
    const pkg = JSON.parse(
      readFileSync(resolve(repoRoot, relPath, "package.json"), "utf8")
    ) as { exports?: Record<string, ExportEntry | string> }
    for (const [key, entry] of Object.entries(pkg.exports ?? {})) {
      if (skipExportKey(key)) continue
      const target = resolveExportTarget(entry)
      if (!target) continue
      const mappedKey = key === "." ? name : `${name}/${key.slice(2)}`
      const cleanTarget = target.startsWith("./") ? target.slice(2) : target
      paths[mappedKey] = [`../${relPath}/${cleanTarget}`]
    }
  }
  return paths
}

const buildPaths = (): Record<string, string[]> => {
  const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
    imports?: Record<string, ImportsEntry | string>
  }
  if (!pkg.imports) throw new Error("api/package.json is missing `imports`")

  const paths: Record<string, string[]> = {}
  for (const [key, entry] of Object.entries(pkg.imports)) {
    const def = resolveImportDefault(entry)
    if (!def) continue
    paths[key] = [def]
  }
  if (isLinked()) Object.assign(paths, buildLinkedPaths())
  return paths
}

const detectIndent = (src: string): string | number => {
  const m = src.match(/\n([ \t]+)\S/)
  if (!m) return 2
  const ws = m[1]
  if (!ws) return 2
  return ws.startsWith("\t") ? "\t" : ws.length
}

interface TsConfigDoc {
  compilerOptions?: {
    paths?: Record<string, string[]>
  }
}

const updateFile = (relPath: string, paths: Record<string, string[]>): boolean => {
  const file = resolve(apiRoot, relPath)
  const src = readFileSync(file, "utf8")
  const doc = CJSON.parse<TsConfigDoc>(src)
  if (!doc.compilerOptions) {
    console.warn(`skip ${relPath}: no compilerOptions`)
    return false
  }
  if (!doc.compilerOptions.paths) {
    console.warn(`skip ${relPath}: no compilerOptions.paths`)
    return false
  }

  // Replace in place to preserve key position & surrounding comments.
  doc.compilerOptions.paths = CJSON.assign({}, paths)

  const eol = src.endsWith("\n") ? "\n" : ""
  const out = CJSON.stringify(doc, null, detectIndent(src)) + eol
  if (out === src) return false

  if (!check) writeFileSync(file, out)
  return true
}

const check = process.argv.includes("--check")
const paths = buildPaths()

let changed = false
for (const t of TARGETS) {
  const did = updateFile(t, paths)
  if (did) {
    changed = true
    console.log(`${check ? "would update" : "updated"} api/${t}`)
  } else {
    console.log(`unchanged       api/${t}`)
  }
}

if (check && changed) process.exit(1)
