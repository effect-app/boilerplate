#!/usr/bin/env node
// Local/agent consumer of the shared change detector. Same rules as
// scripts/lib/changes.ts, different execution policy: instead of emitting
// gates for CI, it runs the scoped pnpm commands for the affected packages only.
//
//   pnpm validate:changed            # mode=all vs merge-base(origin/main) [default]
//   pnpm validate:changed -- --working      # open changes only (fast incremental loop)
//   pnpm validate:changed -- --base <ref>   # diff against a specific commit/PR base
//   pnpm validate:changed -- --plan         # print what would run, execute nothing
//   pnpm validate:changed -- --force        # full check + lint-fix + test
//
// Local is intentionally a SUPERSET of CI for typecheck: an API change also
// typechecks e2e (cheap, catches api→e2e type breaks before push). Tests are
// never scoped below package level.
//
// Lint asymmetry vs CI: this script runs `lint-fix` (oxlint/eslint/dprint write).
// CI runs check-only `pnpm lint` (`format:check`, no --fix). If lint-fix
// rewrites the working tree and we still exit 0, local is "green" while the
// uncommitted reformats fail CI. After every lint-fix phase we fail when
// git status changed, so those fixes must be staged/committed before push.
import { spawnSync } from "node:child_process"
import path from "node:path"
import process from "node:process"
import { classify, deriveGates, getChangedFiles, isLinkedSource, resolveDefaultBase } from "./lib/changes.ts"

const parseArgs = (argv: string[]) => {
  const out: {
    mode: string
    base: string | null
    changedFiles: string | null
    plan: boolean
    force: boolean
    root: string
  } = {
    mode: "all",
    base: null,
    changedFiles: null,
    plan: false,
    force: false,
    root: process.cwd()
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => argv[++i]
    if (a === "--") continue
    else if (a === "--mode") {
      const value = next()
      if (value !== undefined) out.mode = value
    } else if (a === "--working" || a === "--open") out.mode = "working"
    else if (a === "--committed") out.mode = "committed"
    else if (a === "--base") {
      const value = next()
      if (value !== undefined) out.base = value
    } else if (a === "--changed-files") {
      const value = next()
      if (value !== undefined) out.changedFiles = value
    } else if (a === "--plan" || a === "--dry-run") out.plan = true
    else if (a === "--force" || a === "--full") out.force = true
    else if (a === "--root") {
      const value = next()
      if (value !== undefined) out.root = value
    } else if (a === "-h" || a === "--help") {
      printHelp()
      process.exit(0)
    } else {
      console.error(`unknown arg: ${a}`)
      process.exit(2)
    }
  }
  return out
}

const printHelp = () => {
  console.error(`Usage: validate-changed.ts [options]

Input:
  --mode <working|committed|all>   default: all (<base>..HEAD + open changes + untracked)
  --working                        shorthand for --mode working (open changes only)
  --base <ref>                     base ref for committed/all (default: merge-base(origin/main,HEAD))
  --changed-files <path|->         feed a raw file list instead of git diff

Execution:
  --plan, --dry-run     print the plan, run nothing
  --force, --full       full pnpm check + lint-fix + test regardless of detection
  --root <path>         repo root (default: cwd)`)
}

type PlanCmd = { label: string; cwd: string; run: string[] }
type PlanPhase = { name: string; commands: PlanCmd[] }

const cmd = (label: string, pkg: string | null, script: string, root = process.cwd()): PlanCmd => ({
  label,
  cwd: pkg ? path.join(root, pkg) : root,
  run: ["pnpm", "run", script]
})
const rawCmd = (label: string, args: string[], root = process.cwd()): PlanCmd => ({
  label,
  cwd: root,
  run: args
})

/**
 * Fingerprint of tracked working-tree content vs HEAD (staged + unstaged).
 * Porcelain alone is not enough: lint-fix can reformat an already-dirty file
 * without changing the status line set.
 */
const gitWorktreeFingerprint = (root: string) => {
  const r = spawnSync("git", ["diff", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024
  })
  // git diff exits 0 with or without differences; non-zero is a real failure.
  if (r.status !== 0) return null
  return r.stdout ?? ""
}

const gitPorcelain = (root: string) => {
  const r = spawnSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" })
  if (r.status !== 0) return null
  return r.stdout ?? ""
}

/**
 * CI runs check-only lint; local runs lint-fix. If lint-fix rewrote files,
 * the working tree no longer matches what would be pushed — fail hard so the
 * agent commits the fixes (otherwise CI format:check / oxlint fails).
 */
const failIfLintFixDirtiedTree = (root: string, beforeFingerprint: string | null) => {
  if (beforeFingerprint === null) return
  const after = gitWorktreeFingerprint(root)
  if (after === null || after === beforeFingerprint) return

  const status = gitPorcelain(root) ?? ""
  console.error("\n✗ lint-fix rewrote the working tree (CI would fail on the uncommitted result).")
  console.error("  CI runs `pnpm lint` (format:check / no --fix); local runs `lint-fix`.")
  console.error("  Stage and commit these fixes, then re-run validate:changed:\n")
  for (const line of status.split("\n").filter(Boolean)) console.error(`  ${line}`)
  if (!status.trim()) {
    console.error("  (git status clean but `git diff HEAD` changed — check submodules/line endings)")
  }
  process.exit(1)
}

type LocalGates = {
  code: boolean
  shared: boolean
  api: boolean
  fe: boolean
  e2e: boolean
  linked_source: boolean
  api_rebuild: boolean
  fe_rebuild: boolean
}

const buildPlan = (g: LocalGates, files: string[], force: boolean, root = process.cwd()) => {
  if (force || g.shared) {
    return {
      buckets: "shared/full",
      phases: [
        { name: "check", commands: [cmd("root check", null, "check", root)] },
        { name: "lint-fix", commands: [cmd("root lint-fix", null, "lint-fix", root)] },
        { name: "test", commands: [rawCmd("root test:run", ["pnpm", "-r", "test:run"], root)] }
      ]
    }
  }

  const phases: PlanPhase[] = []
  const checkCmds: PlanCmd[] = []
  const lintCmds: PlanCmd[] = []
  const testCmds: PlanCmd[] = []

  // Local superset: an API change also typechecks e2e (catches api→e2e breaks).
  if (g.api_rebuild) {
    checkCmds.push(cmd("api check", "api", "check", root))
    lintCmds.push(cmd("api lint-fix", "api", "lint-fix", root))
    testCmds.push(cmd("api test:run", "api", "test:run", root))
  }
  if (g.fe_rebuild) {
    checkCmds.push(cmd("frontend check", "frontend", "check", root))
    lintCmds.push(cmd("frontend lint-fix", "frontend", "lint-fix", root))
  }
  if (g.e2e) {
    checkCmds.push(cmd("e2e check", "e2e", "check", root))
    lintCmds.push(cmd("e2e lint-fix", "e2e", "lint-fix", root))
  } else if (g.api_rebuild) {
    checkCmds.push(cmd("e2e check (api→e2e superset)", "e2e", "check", root))
  }
  if (files.some((f) => f.startsWith("scripts/"))) {
    checkCmds.push(rawCmd("scripts typecheck", ["pnpm", "run", "check:scripts"], root))
    testCmds.push(rawCmd("scripts tests", ["pnpm", "run", "test:scripts"], root))
  }

  if (checkCmds.length) phases.push({ name: "check", commands: checkCmds })
  if (lintCmds.length) phases.push({ name: "lint-fix", commands: lintCmds })
  if (testCmds.length) phases.push({ name: "test", commands: testCmds })

  const buckets = [`api=${g.api}`, `fe=${g.fe}`, `e2e=${g.e2e}`, `shared=${g.shared}`].join(" ")
  return { buckets, phases }
}

const toLocalGates = (files: string[], opts: { root: string; forceFull?: boolean }): LocalGates => {
  const linked = isLinkedSource(opts.root)
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
    fe_rebuild: !!shared || split.fe
  }
}

const run = async () => {
  const args = parseArgs(process.argv.slice(2))
  const root = args.root

  const { base, source } = args.base ? { base: args.base, source: args.base } : resolveDefaultBase(root)
  const files = getChangedFiles({
    changedFiles: args.changedFiles ?? undefined,
    mode: args.mode,
    base,
    root
  })

  const g = toLocalGates(files, { root, forceFull: args.force })
  const gates = deriveGates(files, { root, forceFull: args.force })

  console.log(`base: ${base} (${source})`)
  console.log(`mode: ${args.mode}, changed files: ${files.length}`)
  if (files.length) console.log(files.map((f) => `  ${f}`).join("\n"))

  if (!g.code && !args.force) {
    console.log("\nNo code changes detected — nothing to validate. (use --force for a full run)")
    return
  }

  const plan = buildPlan(g, files, args.force, root)
  console.log(`\ngates: ${plan.buckets}`)
  console.log(`  api_rebuild=${gates.api_rebuild} fe_rebuild=${gates.fe_rebuild} e2e=${g.e2e}`)

  if (!plan.phases.length) {
    console.log("\nNo affected packages — nothing to validate.")
    return
  }

  console.log("\nplan:")
  for (const phase of plan.phases) {
    for (const c of phase.commands) {
      console.log(`  [${phase.name}] ${c.label}: ${c.run.join(" ")}  (cwd: ${path.relative(root, c.cwd) || "."})`)
    }
  }

  if (args.plan) {
    console.log("\n--plan set, not running.")
    return
  }

  for (const phase of plan.phases) {
    const beforeLint = phase.name === "lint-fix" ? gitWorktreeFingerprint(root) : null
    for (const c of phase.commands) {
      console.log(`\n▶ ${c.label}`)
      const [bin, ...binArgs] = c.run
      if (!bin) throw new Error(`validate-changed: missing command for ${c.label}`)
      const r = spawnSync(bin, binArgs, { cwd: c.cwd, stdio: "inherit" })
      if (r.status !== 0) {
        console.error(`\n✗ ${c.label} failed (exit ${r.status ?? "signal " + r.signal})`)
        process.exit(typeof r.status === "number" ? r.status : 1)
      }
    }
    if (phase.name === "lint-fix") failIfLintFixDirtiedTree(root, beforeLint)
  }
  console.log("\n✓ validate-changed passed")
}

run().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
