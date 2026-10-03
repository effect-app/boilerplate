/**
 * Persist the last HEAD SHA that passed the agent ship gate.
 * pre-push and `pnpm pr:ready` share this so the same commit is never double-paid.
 *
 * Path: `.run/agent-ship-gate.json` (under gitignored `.run/`).
 */
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import type { LooseOpts } from "./opts.ts"

export type ShipGateCache = {
  sha?: string
  validatedAt?: string
  automatedSha?: string
  automatedAt?: string
  staticSha?: string
  staticAt?: string
}

type ShipGateWriteOpts = LooseOpts & {
  stage?: "static" | "automated" | "complete"
  writeFileSync?: (file: string, data: string, encoding?: string) => void
  mkdirSync?: (dir: string, opts?: { recursive?: boolean }) => unknown
  now?: () => Date
}

export const SHIP_GATE_CACHE_REL = path.join(".run", "agent-ship-gate.json")

/** @param {string} [root] */
export const shipGateCachePath = (root = process.cwd()) => path.join(root, SHIP_GATE_CACHE_REL)

/**
 * @param {string} [root]
 * @param {{ runGit?: (args: string[], opts: { cwd: string }) => { status: number | null, stdout: string } }} [opts]
 * @returns {string | null} full SHA or null
 */
export const readHeadSha = (root = process.cwd(), opts: LooseOpts = {}) => {
  const runGit = opts.runGit
    ?? ((args: string[], runOpts: { cwd?: string }) => {
      const result = spawnSync("git", args, {
        encoding: "utf8",
        cwd: runOpts.cwd,
        shell: false
      })
      return { status: result.status, stdout: result.stdout ?? "" }
    })
  const result = runGit(["rev-parse", "HEAD"], { cwd: root })
  if (result.status !== 0) return null
  const sha = String(result.stdout).trim()
  return /^[0-9a-f]{40}$/i.test(sha) ? sha.toLowerCase() : null
}

/**
 * Checkpoints, cheapest first — each one implies the ones before it:
 *   static    — `pnpm validate:changed` passed (what a draft push pays)
 *   automated — plus affected e2e (none automatically in this template)
 *   complete  — plus recorded browser E2E evidence
 */
export const SHIP_GATE_STAGES = ["static", "automated", "complete"]

/**
 * @param {string} [root]
 * @param {{ readFileSync?: typeof fs.readFileSync }} [opts]
 * @returns {{ sha?: string, validatedAt?: string, automatedSha?: string, automatedAt?: string, staticSha?: string, staticAt?: string } | null}
 */
export const readShipGateCache = (root = process.cwd(), opts: LooseOpts = {}): ShipGateCache | null => {
  const readFileSync = opts.readFileSync ?? ((file: string) => fs.readFileSync(file, "utf8"))
  const file = shipGateCachePath(root)
  const readSha = (value: unknown) => {
    const normalized = typeof value === "string" ? value.trim().toLowerCase() : ""
    return /^[0-9a-f]{40}$/i.test(normalized) ? normalized : undefined
  }
  try {
    const raw = readFileSync(file, "utf8")
    const parsed: unknown = JSON.parse(raw)
    if (parsed === null || typeof parsed !== "object") return null
    const record = parsed as Record<string, unknown>
    const sha = readSha(record.sha)
    const automatedSha = readSha(record.automatedSha) ?? sha
    const staticSha = readSha(record.staticSha) ?? automatedSha
    if (!sha && !automatedSha && !staticSha) return null
    const automatedAt = typeof record.automatedAt === "string"
      ? record.automatedAt
      : typeof record.validatedAt === "string"
      ? record.validatedAt
      : undefined
    return {
      sha,
      validatedAt: typeof record.validatedAt === "string" ? record.validatedAt : undefined,
      automatedSha,
      automatedAt,
      staticSha,
      staticAt: typeof record.staticAt === "string" ? record.staticAt : automatedAt
    }
  } catch {
    return null
  }
}

/**
 * @param {string} root
 * @param {string} sha
 * @param {{ stage?: "static" | "automated" | "complete", readFileSync?: typeof fs.readFileSync, writeFileSync?: typeof fs.writeFileSync, mkdirSync?: typeof fs.mkdirSync, now?: () => Date }} [opts]
 */
export const writeShipGateCache = (root: string, sha: string, opts: ShipGateWriteOpts = {}) => {
  const writeFileSync = opts.writeFileSync ?? ((file: string, data: string) => {
    fs.writeFileSync(file, data, "utf8")
  })
  const mkdirSync = opts.mkdirSync ?? ((dir: string, mkdirOpts?: { recursive?: boolean }) => {
    fs.mkdirSync(dir, mkdirOpts)
  })
  const now = opts.now ?? (() => new Date())
  const stage = opts.stage ?? "complete"
  const normalized = String(sha).trim().toLowerCase()
  if (!/^[0-9a-f]{40}$/i.test(normalized)) {
    throw new Error(`writeShipGateCache: invalid sha ${sha}`)
  }
  // Never demote the same commit: a draft push (static) landing after a full
  // run would otherwise make the next publish re-pay e2e it already passed.
  if (SHIP_GATE_STAGES.indexOf(stage) < cachedStage(normalized, readShipGateCache(root, opts))) return
  const file = shipGateCachePath(root)
  const at = now().toISOString()
  const value = stage === "static"
    ? { staticSha: normalized, staticAt: at }
    : stage === "automated"
    ? { automatedSha: normalized, automatedAt: at, staticSha: normalized, staticAt: at }
    : {
      sha: normalized,
      validatedAt: at,
      automatedSha: normalized,
      automatedAt: at,
      staticSha: normalized,
      staticAt: at
    }
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

/**
 * Highest checkpoint the cache records for `headSha`, as an index into
 * SHIP_GATE_STAGES; -1 when the cache describes another commit.
 *
 * @param {string | null | undefined} headSha
 * @param {{ sha?: string, automatedSha?: string, staticSha?: string } | null | undefined} cache
 */
export const cachedStage = (headSha: string | null | undefined, cache: ShipGateCache | null | undefined) => {
  if (isShipGateShaCached(headSha, cache)) return 2
  if (isShipGateAutomationCached(headSha, cache)) return 1
  if (isShipGateStaticCached(headSha, cache)) return 0
  return -1
}

/**
 * @param {string | null | undefined} headSha
 * @param {{ sha: string } | null | undefined} cache
 */
export const isShipGateShaCached = (headSha: string | null | undefined, cache: ShipGateCache | null | undefined) => {
  if (!headSha || !cache?.sha) return false
  return headSha.toLowerCase() === cache.sha.toLowerCase()
}

/**
 * @param {string | null | undefined} headSha
 * @param {{ automatedSha?: string, sha?: string } | null | undefined} cache
 */
export const isShipGateAutomationCached = (
  headSha: string | null | undefined,
  cache: ShipGateCache | null | undefined
) => {
  if (!headSha) return false
  const cachedSha = cache?.automatedSha ?? cache?.sha
  return Boolean(cachedSha && headSha.toLowerCase() === cachedSha.toLowerCase())
}

/**
 * Has `pnpm validate:changed` already passed for this commit — via a draft
 * push, a ready push, or a publish?
 *
 * @param {string | null | undefined} headSha
 * @param {{ staticSha?: string, automatedSha?: string, sha?: string } | null | undefined} cache
 */
export const isShipGateStaticCached = (headSha: string | null | undefined, cache: ShipGateCache | null | undefined) => {
  if (!headSha) return false
  const cachedSha = cache?.staticSha ?? cache?.automatedSha ?? cache?.sha
  return Boolean(cachedSha && headSha.toLowerCase() === cachedSha.toLowerCase())
}

/**
 * Force re-run even when SHA is cached.
 * @param {NodeJS.ProcessEnv} [env]
 */
export const isShipGateForce = (env: NodeJS.ProcessEnv = process.env) => {
  const v = env["AGENT_SHIP_GATE_FORCE"]
  if (v == null || v === "") return false
  const s = String(v).toLowerCase()
  return s !== "0" && s !== "false" && s !== "no" && s !== "off"
}
