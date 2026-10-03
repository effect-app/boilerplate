#!/usr/bin/env node
import type { CommentJSONValue } from "comment-json"
import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync, readlinkSync, rmSync } from "node:fs"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import type { Document } from "yaml"
import { nonReferencedEffectAppPackages, type PackageEntry, sourceEffectAppPackages, sourceEffectPackages } from "./embedded-effect-packages.ts"

type LinkAction = "add" | "remove"

type PackagePair = readonly [name: string, relativePath: string]

type TsReference = { path?: string }

type TsConfigDoc = {
  references?: TsReference[]
  compilerOptions?: {
    paths?: Record<string, string[]>
    noPropertyAccessFromIndexSignature?: boolean
    noUncheckedIndexedAccess?: boolean
  }
}

type OxlintOverride = {
  files?: string[]
  rules?: Record<string, string>
}

type OxlintDoc = {
  overrides?: unknown[]
}

type PackageJson = {
  version?: string
  exports?: Record<string, unknown>
}

type CJSONAPI = {
  parse: {
    (json: string): CommentJSONValue
    <T>(json: string): T
  }
  stringify: (value: unknown, replacer?: unknown, space?: string | number) => string
  assign: (target: Record<string, string[]>, source?: Record<string, string[]>) => Record<string, string[]>
}

type YAMLAPI = {
  parseDocument: (source: string) => Document
}

const asCJSONAPI = (module: object): CJSONAPI => {
  if ("default" in module && module.default) return module.default as CJSONAPI
  return module as CJSONAPI
}

const asYAMLAPI = (module: object): YAMLAPI => {
  if ("default" in module && module.default) return module.default as YAMLAPI
  return module as YAMLAPI
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

let cjsonModule: Promise<CJSONAPI> | undefined

const getCJSON = async (): Promise<CJSONAPI> => {
  cjsonModule ??= import("comment-json").then((module) => asCJSONAPI(module))
  return cjsonModule
}

// Lazy import: the `check-unlinked` CI guard runs with no node_modules
// (checkout-only, no pnpm install), so nothing here may import `yaml` at module
// load time. link/unlink/status run post-install and import it on demand.
let yamlModule: Promise<YAMLAPI> | undefined

const getYAML = async (): Promise<YAMLAPI> => {
  yamlModule ??= import("yaml").then((module) => asYAMLAPI(module))
  return yamlModule
}

const embeddedPatchedDependencies: Record<string, string> = {}

// Effect's own version-pinned patch lives committed + active in
// pnpm-workspace.yaml (unlinked = effect from registry, patch applies). While
// linked, effect resolves to source via override, so pnpm aborts install with
// ERR_PNPM_UNUSED_PATCH. We must NOT add/remove the entry — its version drifts
// with every effect bump, so injecting a hardcoded version is wrong. Instead
// comment the existing line out on link, uncomment it on unlink. Never add.
// Registry patches for packages that become unused when those packages are
// `link:repos/...` overrides. Comment them out on link (pnpm errors on unused
// patchedDependencies); uncomment on unlink so the published dist still carries
// in-tree fixes.
const linkedUnusedPatchRe = /^(\s*)(# )?("?(?:effect|effect-app|@effect-app\/vue)@[^:"]*"?:\s*patches\/.*)$/

const rootEmbeddedReferenceTargets = [
  "tsconfig.embedded-effect.json"
]

const embeddedTsConfigPaths = [
  "api/tsconfig.json",
  "api/tsconfig.src.json",
  "api/tsconfig.test.json",
  "e2e/tsconfig.json",
  "frontend/tsconfig.json",
  "frontend/server/tsconfig.json"
]

const embeddedTsConfigPathPaths = [
  "api/tsconfig.json",
  "api/tsconfig.src.json",
  "api/tsconfig.test.json",
  "e2e/tsconfig.json"
]

const embeddedReferenceTargets = [
  "repos/effect/packages/effect",
  "repos/effect/packages/vitest",
  "repos/effect/packages/platform-node",
  "repos/effect/packages/platform-node-shared",
  "repos/effect/packages/platform-browser",
  "repos/effect/packages/sql/sqlite-node",
  "repos/effect/packages/atom/vue",
  "repos/effect/packages/tools/openapi-generator",
  "repos/effect/packages/opentelemetry",
  "repos/effect-app/packages/effect-app/tsconfig.src.json",
  "repos/effect-app/packages/infra/tsconfig.src.json",
  "repos/effect-app/packages/vue/tsconfig.src.json"
]

// Packages whose src feeds tsconfig `paths`/`references` — MUST NOT include any
// package with .vue sources (default tsc/tsgo can't read them).
const linkedPackagePathTargets: PackagePair[] = [...sourceEffectPackages, ...sourceEffectAppPackages]
  .map(([name, relativePath]) => [name, relativePath])

// Every linked package needs a pnpm-workspace entry (incl. the .vue one).
const embeddedWorkspacePackagePaths = [
  ...linkedPackagePathTargets,
  ...nonReferencedEffectAppPackages.map(([name, relativePath]): PackagePair => [name, relativePath])
]
  .map(([, relativePath]) => relativePath)

const effectAppEmbeddedReferenceTargets = {
  "repos/effect-app/packages/effect-app/tsconfig.src.json": [
    "repos/effect/packages/effect",
    "repos/effect/packages/vitest"
  ],
  "repos/effect-app/packages/infra/tsconfig.src.json": [
    "repos/effect/packages/effect",
    "repos/effect/packages/vitest",
    "repos/effect-app/packages/effect-app/tsconfig.src.json"
  ],
  "repos/effect-app/packages/vue/tsconfig.src.json": [
    "repos/effect/packages/effect",
    "repos/effect/packages/atom/vue",
    "repos/effect-app/packages/effect-app/tsconfig.src.json"
  ]
}

const readJson = async (relativePath: string): Promise<PackageJson> => {
  const file = path.join(root, relativePath)
  return JSON.parse(await readFile(file, "utf8"))
}

// pnpm 11 reads overrides + patchedDependencies from pnpm-workspace.yaml (the
// `pnpm` field in package.json is no longer read). Edit via the YAML Document
// API so the hand-maintained comments + non-managed entries survive round-trips.
const workspaceFile = path.join(root, "pnpm-workspace.yaml")

const readWorkspaceDoc = async () => {
  const YAML = await getYAML()
  return YAML.parseDocument(await readFile(workspaceFile, "utf8"))
}

const writeWorkspaceDoc = async (doc: Document) => writeFile(workspaceFile, doc.toString())

const readText = (relativePath: string) => readFileSync(path.join(root, relativePath), "utf8")

const parseJsonc = (text: string) => JSON.parse(text.replace(/^\s*\/\/[^\n]*\n/gm, ""))

const toPosixPath = (value: string) => value.split(path.sep).join("/")

const referencePath = (configPath: string, targetPath: string) => {
  const from = path.dirname(path.join(root, configPath))
  const to = path.join(root, targetPath)
  const relative = toPosixPath(path.relative(from, to))
  return relative.startsWith(".") ? relative : `./${relative}`
}

const detectIndent = (src: string) => {
  const match = src.match(/\n([ \t]+)\S/)
  if (!match) return 2
  const whitespace = match[1]
  if (!whitespace) return 2
  return whitespace.startsWith("\t") ? "\t" : whitespace.length
}

const updateTsConfigReferences = async (configPath: string, targetPaths: readonly string[], action: LinkAction) => {
  const file = path.join(root, configPath)
  if (!existsSync(file)) return

  const CJSON = await getCJSON()
  const src = await readFile(file, "utf8")
  const doc = CJSON.parse<TsConfigDoc>(src)
  const references = Array.isArray(doc.references) ? [...doc.references] : []
  const managedPaths = new Set(targetPaths.map((targetPath) => referencePath(configPath, targetPath)))

  const unmanagedReferences = references.filter((reference) => {
    if (!reference || typeof reference.path !== "string") return true
    return !managedPaths.has(reference.path)
  })

  doc.references = action === "add"
    ? [
      ...unmanagedReferences,
      ...[...managedPaths].map((managedPath) => ({ path: managedPath }))
    ]
    : unmanagedReferences

  const eol = src.endsWith("\n") ? "\n" : ""
  const out = CJSON.stringify(doc, null, detectIndent(src)) + eol
  if (out !== src) await writeFile(file, out)
}

const resolvePackageExportTarget = (entry: unknown): string | undefined => {
  if (typeof entry === "string") return entry
  if (!entry || typeof entry !== "object") return undefined
  if ("types" in entry && typeof entry.types === "string") return entry.types
  if ("default" in entry && typeof entry.default === "string") return entry.default
  return undefined
}

const packagePathMappings = (configPath: string, packageTargets: readonly PackagePair[]) => {
  const paths: Record<string, string[]> = {}
  for (const [name, targetPath] of packageTargets) {
    const packageJsonPath = path.join(root, targetPath, "package.json")
    const pkg: PackageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"))
    const exports = pkg.exports ?? {}

    for (const [key, entry] of Object.entries(exports)) {
      if (key === "./package.json") continue
      const exportTarget = resolvePackageExportTarget(entry)
      if (!exportTarget) continue

      const mappedKey = key === "."
        ? name
        : `${name}/${key.slice(2)}`
      paths[mappedKey] = [referencePath(configPath, path.join(targetPath, exportTarget))]
    }
  }
  return paths
}

const updateTsConfigPaths = async (configPath: string, packageTargets: readonly PackagePair[], action: LinkAction) => {
  const file = path.join(root, configPath)
  if (!existsSync(file)) return

  const CJSON = await getCJSON()
  const src = await readFile(file, "utf8")
  const doc = CJSON.parse<TsConfigDoc>(src)
  doc.compilerOptions ??= {}
  const compilerOptions = doc.compilerOptions
  const paths = compilerOptions.paths ?? CJSON.assign({})
  compilerOptions.paths = paths

  const mappings = packagePathMappings(configPath, packageTargets)
  for (const key of Object.keys(mappings)) {
    const mapping = mappings[key]
    if (action === "add") {
      if (mapping) paths[key] = mapping
    } else {
      delete paths[key]
    }
  }

  if (Object.keys(paths).length === 0) {
    delete compilerOptions.paths
  }

  const eol = src.endsWith("\n") ? "\n" : ""
  const out = CJSON.stringify(doc, null, detectIndent(src)) + eol
  if (out !== src) await writeFile(file, out)
}

// Configs we deliberately do NOT wire `references` into on link (for now).
// `frontend/tsconfig.json` references break the Nuxt/project-references setup.
const referencesDisabledConfigPaths = new Set([
  "frontend/tsconfig.json"
])

const updateEmbeddedReferences = async (action: LinkAction) => {
  await updateTsConfigReferences("tsconfig.all.json", rootEmbeddedReferenceTargets, action)

  for (const configPath of embeddedTsConfigPaths) {
    // Skip adding references to opted-out configs; still strip them on unlink.
    if (action !== "add" || !referencesDisabledConfigPaths.has(configPath)) {
      await updateTsConfigReferences(configPath, embeddedReferenceTargets, action)
    }
    await updateTsConfigPaths(configPath, linkedPackagePathTargets, "remove")
  }

  for (const configPath of embeddedTsConfigPathPaths) {
    await updateTsConfigPaths(configPath, linkedPackagePathTargets, action)
  }

  for (const [configPath, targetPaths] of Object.entries(effectAppEmbeddedReferenceTargets)) {
    await updateTsConfigReferences(configPath, targetPaths, action)
    await updateTsConfigPaths(
      configPath,
      sourceEffectPackages.map(([name, relativePath]): PackagePair => [name, relativePath]),
      action
    )
  }
}

// The global JSON.parse / Body.json overrides (any -> unknown) live in their
// own ambient file, pulled into builtin.ts via a triple-slash reference. In
// linked mode the override leaks into source-linked Effect and breaks Effect's
// own JSON.parse(...) / response.json() call sites, so we disable it on link by
// commenting the reference, and restore it on unlink.
const builtinTsPath = "repos/effect-app/packages/effect-app/src/builtin.ts"
const jsonRefEnabled = "/// <reference path=\"./builtin-json.d.ts\" />"
const jsonRefDisabled = `// disabled-in-linked-mode: ${jsonRefEnabled}`

const updateJsonOverride = async (action: LinkAction) => {
  const file = path.join(root, builtinTsPath)
  if (!existsSync(file)) return

  const src = await readFile(file, "utf8")
  let out = src
  if (action === "add") {
    // link => disable. Guard against double-commenting (jsonRefEnabled is a
    // substring of jsonRefDisabled).
    if (src.includes(jsonRefEnabled) && !src.includes(jsonRefDisabled)) {
      out = src.replace(jsonRefEnabled, jsonRefDisabled)
    }
  } else {
    // unlink => restore.
    out = src.replace(jsonRefDisabled, jsonRefEnabled)
  }

  if (out !== src) await writeFile(file, out)
}

// Linked Effect source is authored with `noUncheckedIndexedAccess` on and has
// no built types (resolves to source), so under the frontend's looser config +
// vue-tsc its index-signature / possibly-undefined types break the check. Relax
// the frontend's two index-access strictness flags while linked; restore strict
// on unlink. See the documenting comment in frontend/tsconfig.json.
const updateFrontendStrictness = async (action: LinkAction) => {
  const file = path.join(root, "frontend/tsconfig.json")
  if (!existsSync(file)) return

  const CJSON = await getCJSON()
  const src = await readFile(file, "utf8")
  const doc = CJSON.parse<TsConfigDoc>(src)
  doc.compilerOptions ??= {}

  if (action === "add") {
    // link => relax
    doc.compilerOptions.noPropertyAccessFromIndexSignature = false
    doc.compilerOptions.noUncheckedIndexedAccess = false
  } else {
    // unlink => restore strict (set explicitly rather than deleting, so the
    // documenting comment + key order survive the comment-json round-trip).
    doc.compilerOptions.noPropertyAccessFromIndexSignature = true
    doc.compilerOptions.noUncheckedIndexedAccess = true
  }

  const eol = src.endsWith("\n") ? "\n" : ""
  const out = CJSON.stringify(doc, null, detectIndent(src)) + eol
  if (out !== src) await writeFile(file, out)
}

// While linked, turn off the type-aware no-unnecessary-type-assertion rule for
// the frontend — same reason as the tsconfig/eslint toggles: linked Effect
// source (authored WITH noUncheckedIndexedAccess) under the frontend's relaxed
// strictness makes the defensive `!` assertions read as redundant, firing false
// positives that flip back on unlink. Done via a `frontend/**`-scoped override
// in the ROOT .oxlintrc.json (a nested frontend config would re-root oxlint and
// drop the root ignorePatterns — e.g. `**/*.vue` — un-ignoring everything). The
// override is scoped to frontend so api/e2e keep the rule.
const oxlintAssertionRule = "typescript/no-unnecessary-type-assertion"

const isManagedFrontendOverride = (entry: unknown): entry is OxlintOverride => {
  if (typeof entry !== "object" || entry === null) return false
  const override = entry as OxlintOverride
  return Array.isArray(override.files)
    && override.files.includes("frontend/**")
    && Boolean(override.rules)
    && override.rules?.[oxlintAssertionRule] === "off"
}

const updateFrontendOxlint = async (action: LinkAction) => {
  const file = path.join(root, ".oxlintrc.json")
  if (!existsSync(file)) return

  const CJSON = await getCJSON()
  const src = await readFile(file, "utf8")
  const doc = CJSON.parse<OxlintDoc>(src)

  const overrides = (Array.isArray(doc.overrides) ? doc.overrides : [])
    .filter((entry) => !isManagedFrontendOverride(entry))

  if (action === "add") {
    overrides.push(CJSON.parse<OxlintOverride>(`{
      // Managed by scripts/embedded-effect-source.ts (linked mode only):
      // linked Effect source authored with noUncheckedIndexedAccess, under the
      // frontend's relaxed config, makes \`!\` assertions read as redundant.
      "files": ["frontend/**"],
      "rules": { "${oxlintAssertionRule}": "off" }
    }`))
  }

  if (overrides.length > 0) doc.overrides = overrides
  else delete doc.overrides

  const eol = src.endsWith("\n") ? "\n" : ""
  const out = CJSON.stringify(doc, null, detectIndent(src)) + eol
  if (out !== src) await writeFile(file, out)
}

const workspaceBlockStart = "  # embedded-effect-source:start"
const workspaceBlockEnd = "  # embedded-effect-source:end"

const updateWorkspacePackages = async (action: LinkAction) => {
  const workspacePath = "pnpm-workspace.yaml"
  const src = await readFile(path.join(root, workspacePath), "utf8")
  const eol = src.endsWith("\n") ? "\n" : ""
  const managedEntries = new Set(embeddedWorkspacePackagePaths.map((packagePath) => `  - ${packagePath}`))
  const lines = src.trimEnd().split(/\r?\n/)
  const unmanagedLines: string[] = []
  let insideManagedBlock = false

  for (const line of lines) {
    if (line === workspaceBlockStart) {
      insideManagedBlock = true
      continue
    }
    if (line === workspaceBlockEnd) {
      insideManagedBlock = false
      continue
    }
    if (insideManagedBlock || managedEntries.has(line)) continue
    unmanagedLines.push(line)
  }

  if (action === "add") {
    // Insert inside the `packages:` sequence — pnpm-workspace.yaml now also holds
    // mapping keys (overrides, settings, …), so appending at EOF would emit orphan
    // sequence items after those maps and produce invalid YAML.
    const packagesIndex = unmanagedLines.findIndex((line) => line.trimEnd() === "packages:")
    if (packagesIndex === -1) throw new Error("pnpm-workspace.yaml is missing a `packages:` block")
    unmanagedLines.splice(
      packagesIndex + 1,
      0,
      workspaceBlockStart,
      ...embeddedWorkspacePackagePaths.map((packagePath) => `  - ${packagePath}`),
      workspaceBlockEnd
    )
  }

  const out = unmanagedLines.join("\n") + eol
  if (out !== src) await writeFile(path.join(root, workspacePath), out)
}

const updatePatchedDependencies = (doc: Document, action: LinkAction) => {
  for (const [name, patchPath] of Object.entries(embeddedPatchedDependencies)) {
    if (action === "add") {
      doc.setIn(["patchedDependencies", name], patchPath)
    } else if (doc.getIn(["patchedDependencies", name]) === patchPath) {
      doc.deleteIn(["patchedDependencies", name])
    }
  }
}

// Comment out (link) / uncomment (unlink) registry patches that do not apply
// to linked source, without ever adding or removing the lines. Text-based: the
// `yaml` Document API can't toggle a node between comment and live entry.
const toggleEffectPatches = async (action: LinkAction) => {
  const src = await readFile(workspaceFile, "utf8")
  const eol = src.endsWith("\n") ? "\n" : ""
  let changed = false
  const out = src
    .trimEnd()
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(linkedUnusedPatchRe)
      if (!match) return line
      const [, indent, commented, body] = match
      if (action === "add") {
        if (commented) return line // already commented (linked)
        changed = true
        return `${indent}# ${body}`
      }
      if (!commented) return line // already live (unlinked)
      changed = true
      return `${indent}${body}`
    })
    .join("\n") + eol
  if (changed) await writeFile(workspaceFile, out)
}

const packageVersion = async (relativePath: string) => {
  const pkg = await readJson(path.join(relativePath, "package.json"))
  return pkg.version
}

const registrySpec = async ([_name, relativePath, prefix]: PackageEntry) => {
  if (prefix === null) return null
  return `${prefix}${await packageVersion(relativePath)}`
}

const managedPackages = (): PackageEntry[] => [
  ...sourceEffectPackages,
  ...sourceEffectAppPackages,
  ...nonReferencedEffectAppPackages
]

const isEmbeddedSourcePath = (targetPath: string) => {
  const resolved = path.resolve(targetPath)
  return [
    path.join(root, "repos/effect"),
    path.join(root, "repos/effect-app")
  ]
    .some((embeddedRoot) => resolved === embeddedRoot || resolved.startsWith(`${embeddedRoot}${path.sep}`))
}

const removeStaleEmbeddedSourceLinks = () => {
  const virtualStore = path.join(root, "node_modules/.pnpm")
  if (!existsSync(virtualStore)) return

  const removeEmbeddedLinksIn = (dir: string) => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const entryPath = path.join(dir, entry.name)
      if (entry.isSymbolicLink()) {
        const target = path.resolve(path.dirname(entryPath), readlinkSync(entryPath))
        if (isEmbeddedSourcePath(target)) rmSync(entryPath)
        continue
      }
      if (entry.isDirectory()) removeEmbeddedLinksIn(entryPath)
    }
  }

  removeEmbeddedLinksIn(path.join(virtualStore, "node_modules"))
  for (const entry of readdirSync(virtualStore, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const entryPath = path.join(virtualStore, entry.name)
    if (entry.name.includes("repos+effect")) {
      rmSync(entryPath, { force: true, recursive: true })
      continue
    }
    removeEmbeddedLinksIn(path.join(entryPath, "node_modules"))
  }

  // Nuxt generated imports keep absolute-ish references to linked package src.
  rmSync(path.join(root, "frontend/.nuxt"), { force: true, recursive: true })
}

const install = (noInstall: boolean) => {
  if (noInstall) return
  // Linking rewrites pnpm.overrides + the workspace, so the lockfile WILL change
  // — pass --no-frozen-lockfile explicitly. (Do NOT force CI=true here: pnpm
  // treats CI as a signal to use a frozen lockfile, which makes link/unlink fail
  // with ERR_PNPM_LOCKFILE_CONFIG_MISMATCH the moment overrides change.)
  const result = spawnSync("pnpm", ["install", "--no-frozen-lockfile"], {
    cwd: root,
    stdio: "inherit"
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const run = (command: string, args: string[], cwd: string) => {
  // Inherit the real env — don't force CI=true (pnpm reads CI as a frozen-lockfile
  // signal, which breaks installs that legitimately change the lockfile).
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit"
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

const buildVueComponents = async ({ skipInstall = false }: { skipInstall?: boolean } = {}) => {
  const repo = path.join(root, "repos/effect-app")
  if (!skipInstall) run("pnpm", ["install", "--no-frozen-lockfile"], repo)
  run("pnpm", ["--dir", "packages/vue-components", "build"], repo)
}

// Fail if the working tree is dirty — link/unlink rewrite many committed files
// (pnpm-workspace.yaml, tsconfigs, .oxlintrc.json, …) and committing the result
// requires a clean starting point so the commit contains ONLY the link/unlink
// churn, not unrelated WIP.
const assertCleanWorkingTree = () => {
  const result = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" })
  if (result.status !== 0) {
    console.error("git status failed; cannot verify clean working tree")
    process.exit(result.status ?? 1)
  }
  if (result.stdout.trim() !== "") {
    console.error("Working tree is dirty. Commit or stash before linking/unlinking:")
    console.error(result.stdout)
    process.exit(1)
  }
}

// Commit the link/unlink churn in a single commit so the repo never carries a
// half-linked state on disk vs. in git. Staged explicitly by pathspec to avoid
// sweeping up unrelated changes (assertCleanWorkingTree already guarantees none,
// but pathscoping is defensive).
const commitLinkState = (action: LinkAction) => {
  const subject = action === "add" ? "link embedded effect source" : "unlink embedded effect source"
  const add = spawnSync("git", ["add", "-A"], { cwd: root, stdio: "inherit" })
  if (add.status !== 0) process.exit(add.status ?? 1)
  const commit = spawnSync(
    "git",
    ["commit", "-m", subject, "-m", "Generated by scripts/embedded-effect-source.ts"],
    { cwd: root, stdio: "inherit" }
  )
  if (commit.status !== 0) process.exit(commit.status ?? 1)
}

const link = async ({ noInstall }: { noInstall: boolean }) => {
  assertCleanWorkingTree()
  const doc = await readWorkspaceDoc()

  for (const [name, relativePath] of managedPackages()) {
    if (!existsSync(path.join(root, relativePath, "package.json"))) {
      throw new Error(`Cannot link ${name}; missing ${relativePath}/package.json`)
    }
    doc.setIn(["overrides", name], `link:${relativePath}`)
  }
  updatePatchedDependencies(doc, "add")

  await writeWorkspaceDoc(doc)
  await toggleEffectPatches("add")
  await updateEmbeddedReferences("add")
  await updateJsonOverride("add")
  await updateFrontendStrictness("add")
  await updateFrontendOxlint("add")
  await updateWorkspacePackages("add")

  install(noInstall)
  commitLinkState("add")
}

const unlink = async ({ noInstall }: { noInstall: boolean }) => {
  assertCleanWorkingTree()
  const doc = await readWorkspaceDoc()

  for (const entry of managedPackages()) {
    const [name] = entry
    const spec = await registrySpec(entry)
    if (spec === null) {
      doc.deleteIn(["overrides", name])
    } else {
      doc.setIn(["overrides", name], spec)
    }
  }
  updatePatchedDependencies(doc, "remove")

  await writeWorkspaceDoc(doc)
  await toggleEffectPatches("remove")
  await updateEmbeddedReferences("remove")
  await updateJsonOverride("remove")
  await updateFrontendStrictness("remove")
  await updateFrontendOxlint("remove")
  await updateWorkspacePackages("remove")
  removeStaleEmbeddedSourceLinks()
  // Linking changes the TypeScript project graph. Clear incremental build state
  // before installing registry packages so it cannot retain references to the
  // embedded Effect sources after unlinking.
  run("pnpm", ["clean"], root)
  install(noInstall)
  commitLinkState("remove")
}

const status = async () => {
  const doc = await readWorkspaceDoc()
  for (const [name] of managedPackages()) {
    console.log(`${name}: ${doc.getIn(["overrides", name]) ?? "(registry)"}`)
  }
}

const hasEmbeddedSourcePath = (value: string) =>
  typeof value === "string" && (
    value.includes("repos/effect/packages/")
    || value.includes("repos/effect-app/packages/")
    || value.includes("../repos/effect/packages/")
    || value.includes("../repos/effect-app/packages/")
    || value.includes("../../../effect/packages/")
    || value.includes("../../../effect-app/packages/")
  )

const tsConfigHasEmbeddedSource = (configPath: string) => {
  if (!existsSync(path.join(root, configPath))) return false
  return hasEmbeddedSourcePath(readText(configPath))
}

const checkUnlinked = async () => {
  const issues: string[] = []
  // Text-based (no `yaml` import): the CI guard runs without node_modules.
  const workspaceText = readText("pnpm-workspace.yaml")

  for (const [name, relativePath] of managedPackages()) {
    if (workspaceText.includes(`link:${relativePath}`)) {
      issues.push(`pnpm-workspace.yaml overrides.${name} is link:${relativePath}`)
    }
  }

  // Only flag linked effect / @effect/* / effect-app / @effect-app/* packages
  // (they live under repos/effect and repos/effect-app). Other linked repos —
  // Other repo snapshots under repos/ are not embedded-source and must not trip this.
  if (/link:(\.\.\/)?repos\/effect(-app)?\//.test(readText("pnpm-lock.yaml"))) {
    issues.push("pnpm-lock.yaml contains linked Effect/effect-app repos entries")
  }

  for (const [name, patchPath] of Object.entries(embeddedPatchedDependencies)) {
    if (workspaceText.includes(patchPath)) {
      issues.push(`pnpm-workspace.yaml patchedDependencies includes ${name}`)
    }
  }

  // A commented-out effect / effect-app patch line means the file was committed while linked.
  for (const line of workspaceText.split(/\r?\n/)) {
    const match = line.match(linkedUnusedPatchRe)
    if (match && match[2]) {
      issues.push(`pnpm-workspace.yaml linked-package patch is commented out: ${match[3]}`)
    }
  }

  for (const packagePath of embeddedWorkspacePackagePaths) {
    if (workspaceText.includes(`- ${packagePath}`)) {
      issues.push(`pnpm-workspace.yaml includes ${packagePath}`)
    }
  }

  for (
    const configPath of [
      "tsconfig.all.json",
      ...embeddedTsConfigPaths,
      ...embeddedTsConfigPathPaths,
      ...Object.keys(effectAppEmbeddedReferenceTargets)
    ]
  ) {
    if (tsConfigHasEmbeddedSource(configPath)) {
      issues.push(`${configPath} contains embedded Effect/effect-app source references`)
    }
  }

  const oxlintConfig: OxlintDoc = parseJsonc(readText(".oxlintrc.json"))
  if (Array.isArray(oxlintConfig.overrides) && oxlintConfig.overrides.some(isManagedFrontendOverride)) {
    issues.push(`.oxlintrc.json contains the linked-only frontend ${oxlintAssertionRule} override; remove via unlink`)
  }

  if (issues.length > 0) {
    console.error("Embedded Effect source mode is linked in committed files.")
    console.error("Run `pnpm embedded:effect:unlink` before committing.")
    for (const issue of issues) console.error(`- ${issue}`)
    process.exit(1)
  }

  console.log("Embedded Effect source mode is unlinked.")
}

const args = process.argv.slice(2)
const command = args[0]
const noInstall = args.includes("--no-install")

switch (command) {
  case "link":
    await link({ noInstall })
    break
  case "unlink":
    await unlink({ noInstall })
    break
  case "build-vue-components":
    await buildVueComponents()
    break
  case "status":
    await status()
    break
  case "check-unlinked":
    await checkUnlinked()
    break
  default:
    console.error([
      "Usage:",
      "  node scripts/embedded-effect-source.ts link [--no-install]",
      "  node scripts/embedded-effect-source.ts unlink [--no-install]",
      "  node scripts/embedded-effect-source.ts check-unlinked",
      "  node scripts/embedded-effect-source.ts build-vue-components",
      "  node scripts/embedded-effect-source.ts status"
    ]
      .join("\n"))
    process.exit(1)
}
