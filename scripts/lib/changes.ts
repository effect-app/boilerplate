// Single source of truth for change detection.
//
// Pure-ish (no execution policy): given a way to enumerate "changed" files,
// decide which packages are affected. Consumed by:
//   - scripts/validate-changed.ts (local/agent: runs scoped pnpm commands)
//
// Keep the rules here; the consuming scripts must not grow their own copies.
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import type { LooseOpts } from "./opts.ts"

// ─────────────────────────────────────────────────────────────────────────────
// Rule constants
// ─────────────────────────────────────────────────────────────────────────────

// Files excluded from change detection entirely (docs/wiki/infra trees, and
// root-level markdown such as README.md / AGENTS.md).
//
// Package-scoped markdown (`api/**/*.md`, `frontend/**/*.md`, `e2e/**/*.md`) is
// kept: those files are format-checked by that package's `pnpm lint` / dprint.
// `repos/` is excluded too UNLESS the workspace is in linked-source mode.
export const docExcludeRegex = /^(docs\/|wiki\/|\.infra\/|[^/]+\.md$)/

// Root-level files that force every gate ("shared" bucket).
const sharedFiles = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "flake.lock",
  "flake.nix",
  ".pnpmfile.cjs",
  ".npmrc",
  "scripts/install-patched-compilers.ts",
  "scripts/tsgo-or-tsc.ts"
])

const sharedGlobs = [
  /^tsconfig[^/]*\.json$/,
  /^patches\//
]

// Vendored Effect monorepo: only counts when pnpm-workspace.yaml `overrides`
// points at a local link (registry mode otherwise).
export const isLinkedSource = (root = process.cwd()) => {
  const file = path.join(root, "pnpm-workspace.yaml")
  return fs.existsSync(file) && fs.readFileSync(file, "utf8").includes("link:repos/")
}

// ─────────────────────────────────────────────────────────────────────────────
// Diff strategies — what counts as "changed".
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {"working"|"committed"|"all"} DiffMode
 * - working:   open changes only (staged + unstaged + untracked vs HEAD)
 * - committed: <base>..HEAD only (what a clean checkout would diff)
 * - all:       <base>..HEAD + open changes + untracked (superset; local default)
 */
export type DiffMode = "working" | "committed" | "all"

const git = (args: string[], root: string) => spawnSync("git", args, { cwd: root, encoding: "utf8" })

const gitLines = (args: string[], root: string) => {
  const r = git(args, root)
  if (r.status !== 0) return []
  return r.stdout.split(/\r?\n/).filter(Boolean)
}

const listUntracked = (root: string) => gitLines(["ls-files", "--others", "--exclude-standard"], root)

/**
 * Enumerate changed files for a mode. Returns repo-relative paths, already
 * filtered through the doc/infra/markdown exclusion and (when not linked) the
 * `repos/` exclusion.
 *
 * @param {DiffMode} mode
 * @param {{ base?: string, root?: string, linkedSource?: boolean }} [opts]
 * @returns {string[]}
 */
export const collectChangedFiles = (mode: DiffMode, opts: LooseOpts = {}) => {
  const root = opts.root ?? process.cwd()
  const linked = opts.linkedSource ?? isLinkedSource(root)
  const files = new Set<string>()

  if (mode === "working") {
    for (const f of gitLines(["diff", "--name-only", "--cached"], root)) files.add(f) // staged
    for (const f of gitLines(["diff", "--name-only"], root)) files.add(f) // unstaged
    for (const f of listUntracked(root)) files.add(f)
  } else {
    const base = opts.base
    if (!base) throw new Error(`mode '${mode}' requires --base <ref>`)
    for (const f of gitLines(["diff", "--name-only", base], root)) files.add(f)
    if (mode === "all") {
      for (const f of gitLines(["diff", "--name-only", "HEAD"], root)) files.add(f)
      for (const f of listUntracked(root)) files.add(f)
    } else {
      // committed: drop anything that is only a working-tree change vs HEAD
      const working = new Set([...gitLines(["diff", "--name-only", "HEAD"], root), ...listUntracked(root)])
      for (const f of working) files.delete(f)
    }
  }

  return filterFiles(files, { linkedSource: linked, root })
}

const keepFile = (file: string, linked: boolean) => {
  if (docExcludeRegex.test(file)) return false
  if (!linked && file.startsWith("repos/")) return false
  return true
}

/**
 * Apply the doc/infra/root-markdown (+ repos-unless-linked) exclusion and
 * normalize separators. This is the single filter — every input path (git
 * strategy or a fed file list) goes through it so the exclusion rules live in
 * one place.
 * @param {Iterable<string>} files
 * @param {{ linkedSource?: boolean, root?: string }} [opts]
 * @returns {string[]}
 */
export const filterFiles = (files: Iterable<string>, opts: LooseOpts = {}) => {
  const linked = opts.linkedSource ?? isLinkedSource(opts.root ?? process.cwd())
  return [...new Set(files)]
    .map((f) => f.replaceAll(path.sep, "/"))
    .filter((f) => keepFile(f, linked))
}

/**
 * Read a raw file list (one repo-relative path per line, as `git diff
 * --name-only` produces) from a path or stdin (`"-"`). Unfiltered — the caller
 * runs the result through {@link filterFiles} (or {@link getChangedFiles}).
 * @param {string} source path, or `"-"` / `"/dev/stdin"` for stdin
 * @param {{ root?: string }} [opts]
 * @returns {string[]}
 */
export const readFileList = (source: string, opts: LooseOpts = {}) => {
  const root = opts.root ?? process.cwd()
  let text: string
  if (source === "-" || source === "/dev/stdin") {
    text = fs.readFileSync(0, "utf8")
  } else {
    const resolved = path.resolve(root, source)
    text = fs.existsSync(resolved) ? fs.readFileSync(resolved, "utf8") : ""
  }
  return text.split(/\r?\n/).filter(Boolean)
}

/**
 * Single entry for obtaining the changed-file list.
 * @param {{ changedFiles?: string, mode?: DiffMode, base?: string, root?: string }} [opts]
 * @returns {string[]}
 */
export const getChangedFiles = (opts: LooseOpts = {}) => {
  const root = opts.root ?? process.cwd()
  if (typeof opts.changedFiles === "string") {
    return filterFiles(readFileList(opts.changedFiles, { root }), { root })
  }
  const mode: DiffMode = opts.mode === "working" || opts.mode === "committed" || opts.mode === "all"
    ? opts.mode
    : "all"
  let base = opts.base
  if ((mode === "committed" || mode === "all") && !base) {
    base = resolveDefaultBase(root).base
  }
  return collectChangedFiles(mode, { base, root })
}

/** Resolve the default base ref for local committed/all modes. */
export const resolveDefaultBase = (root = process.cwd()) => {
  for (const ref of ["origin/main", "main"]) {
    const verify = git(["rev-parse", "--verify", `${ref}^{commit}`], root)
    if (verify.status !== 0) continue
    const mb = git(["merge-base", ref, "HEAD"], root)
    if (mb.status === 0 && mb.stdout.trim()) {
      return { base: mb.stdout.trim(), source: `merge-base(${ref},HEAD)` }
    }
    // ref exists but no merge-base (orphan): diff against the ref itself
    return { base: ref, source: ref }
  }
  return { base: "HEAD^", source: "HEAD^" }
}

// ─────────────────────────────────────────────────────────────────────────────
// Classification
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {string[]} files repo-relative, already doc-filtered
 * @param {{ linkedSource?: boolean }} [opts]
 */
export const classify = (files: string[], opts: LooseOpts = {}) => {
  const linked = opts.linkedSource ?? false
  let shared = false
  let api = false
  let api_image = false
  let fe = false
  let e2e = false

  for (const file of files) {
    if (sharedFiles.has(file) || sharedGlobs.some((re) => re.test(file))) shared = true
    if (file.startsWith("repos/") && linked) shared = true
    // Compile + unit tests: any api/ path (including api/test/).
    if (file.startsWith("api/") || file === "Dockerfile") api = true
    // Docker image contents exclude unit tests.
    if (
      !file.endsWith(".md") && ((file.startsWith("api/") && !file.startsWith("api/test/")) || file === "Dockerfile")
    ) {
      api_image = true
    }
    if (!file.endsWith(".md") && (file.startsWith("frontend/") || file === "Dockerfile.fe")) fe = true
    if (file.startsWith("e2e/")) e2e = true
  }

  return { shared, api, api_image, fe, e2e, linkedSource: linked }
}

/**
 * Run the whole pipeline for a file list.
 * @param {string[]} files repo-relative, doc-filtered changed files
 * @param {{ forceFull?: boolean, root?: string }} [opts]
 */
export const deriveGates = (files: string[], opts: LooseOpts = {}) => {
  const root = opts.root ?? process.cwd()
  const linked = isLinkedSource(root)
  const split = classify(files, { linkedSource: linked })
  const shared = split.shared || opts.forceFull === true

  return {
    code: files.some((f) => !f.startsWith(".github/")),
    shared: split.shared,
    api: split.api,
    fe: split.fe,
    e2e: split.e2e,
    linked_source: linked,
    api_rebuild: !!shared || split.api,
    api_image_rebuild: !!shared || split.api_image,
    fe_rebuild: !!shared || split.fe
  }
}
