#!/usr/bin/env node
/**
 * Husky pre-push entry for coding agents only.
 *
 * Humans: no-op (exit 0) — self-responsible; not forced by the hook.
 *
 * Agents:
 *   - Draft PR or no open PR: static gate only — step 1 below. A push that does
 *     not compile helps nobody, draft or not; what draft buys is skipping the
 *     expensive half (browser e2e), not skipping correctness.
 *   - Ready-for-review PR (or unknown PR state): full ship gate below.
 *   - Publishing runs this same gate whichever way it is reached: `pnpm pr:ready`
 *     explicitly, or raw `gh pr ready`, which the shim gates rather than refuses.
 *     See scripts/agent-pr-ready.ts + scripts/agent-gh.ts.
 *
 * Ship gate (when enforced):
 *   1. `pnpm validate:changed` (check / lint-fix / unit for touched packages)
 *   2. If browser E2E is affected, require an explicit attestation that the
 *      relevant specs were run locally. This template has no automated e2e
 *      stack, so the selection and the run are the agent's judgement.
 *
 * Each step is cached per HEAD SHA (`.run/agent-ship-gate.json`), so the static
 * work a draft push paid for is not repeated when the PR is published.
 *
 * Detection: GROK_AGENT / T3_AGENT / AI_AGENT / Claude / Cursor / Codex env.
 * Humans only: SKIP_AGENT_PREPUSH=1 git push
 * Agents must never set that flag or use git push --no-verify.
 */
import { spawnSync } from "node:child_process"
import path from "node:path"
import process from "node:process"
import { createInterface } from "node:readline"
import { fileURLToPath } from "node:url"
import { isCodingAgent } from "./lib/agent-env.ts"
import { resolveOpenPrState, shipGateScopeForPush } from "./lib/agent-pr-state.ts"
import { isShipGateForce, isShipGateShaCached, isShipGateStaticCached, readHeadSha, readShipGateCache, writeShipGateCache } from "./lib/agent-ship-gate-cache.ts"
import { classify, getChangedFiles, isLinkedSource, resolveDefaultBase } from "./lib/changes.ts"
import { errMessage, type LooseOpts } from "./lib/opts.ts"

export { isCodingAgent }

/**
 * Same path rules as scripts/lib/changes.ts: does this change set affect
 * browser E2E?
 * @param {string[]} files
 * @param {{ root?: string, forceFull?: boolean }} [opts]
 */
export const resolveAgentE2ePlan = (files: string[], opts: LooseOpts = {}) => {
  const root = opts.root ?? process.cwd()
  const linked = isLinkedSource(root)
  const split = classify(files, { linkedSource: linked })
  const shared = split.shared || opts.forceFull === true
  return {
    has_e2e: shared || split.e2e,
    shared
  }
}

const run = (label: string, args: string[], opts: LooseOpts = {}) => {
  console.error(`agent ship-gate: ${label}`)
  const [cmd, ...cmdArgs] = args
  if (!cmd) throw new Error(`agent ship-gate: missing command for ${label}`)
  const result = spawnSync(cmd, cmdArgs, {
    stdio: "inherit",
    shell: true,
    cwd: opts.cwd ?? process.cwd(),
    env: opts.env ?? process.env
  })
  const status = result.status === null ? 1 : result.status
  if (status !== 0) {
    console.error(`agent ship-gate: failed: ${label} (exit ${status})`)
    process.exit(status)
  }
}

export const isWorktreeClean = (root = process.cwd(), opts: LooseOpts = {}) => {
  const runGit = opts.runGit
    ?? ((args: string[], runOpts: { cwd?: string }) =>
      spawnSync("git", args, { cwd: runOpts.cwd, encoding: "utf8", shell: false }))
  const result = runGit(["status", "--porcelain=v1", "--untracked-files=normal"], { cwd: root })
  return result.status === 0 && String(result.stdout ?? "").trim() === ""
}

const attestationLimitMs = 5000

/**
 * Ask the agent to attest that the affected browser E2E specs were run. Only an
 * explicit yes within {@link attestationLimitMs} passes; no input, "no", a
 * timeout, or a non-interactive terminal blocks the gate.
 * @param {NodeJS.ProcessEnv} [env]
 */
export const askBrowserE2eAttestation = (env: NodeJS.ProcessEnv = process.env): Promise<boolean> => {
  if (!process.stdin.isTTY || env["CI"]) {
    console.error(
      "agent ship-gate: browser E2E is affected but this session has no interactive terminal for the run attestation."
    )
    console.error("  Run the relevant Playwright specs locally, then push from an interactive terminal.")
    return Promise.resolve(false)
  }
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr })
    let settled = false
    const finish = (value: boolean) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      rl.close()
      resolve(value)
    }
    const timer = setTimeout(() => {
      console.error("")
      console.error("agent ship-gate: timed out waiting for an answer — blocked.")
      finish(false)
    }, attestationLimitMs)
    rl.question(
      "agent ship-gate: browser E2E is affected. Have you run the relevant Playwright specs? [y/N] ",
      (answer) => {
        const yes = ["y", "yes"].includes(answer.trim().toLowerCase())
        finish(yes)
      }
    )
  })
}

/**
 * Agent ship gate. Shared by pre-push (every agent push) and `pnpm pr:ready`.
 *
 * `scope: "static"` stops after validate:changed — what a draft / no-PR push
 * runs. Full scope additionally requires the browser E2E attestation when the
 * change set affects e2e.
 *
 * Caches HEAD SHA under `.run/agent-ship-gate.json` so push + ready never
 * double-run for an already-validated commit. Force: AGENT_SHIP_GATE_FORCE=1.
 */
type AgentShipGateOpts = LooseOpts & {
  scope?: "full" | "static"
  askAttestation?: typeof askBrowserE2eAttestation
}

export const runAgentShipGate = async (opts: AgentShipGateOpts = {}) => {
  const root = opts.root ?? process.cwd()
  const env = opts.env ?? process.env
  const force = opts.force === true || isShipGateForce(env)
  const scope = opts.scope === "static" ? "static" : "full"
  const headSha = readHeadSha(root)
  const cache = readShipGateCache(root)

  if (!isWorktreeClean(root)) {
    console.error("agent ship-gate: worktree is dirty — commit the changes, then push again")
    process.exit(1)
  }

  const alreadyCached = scope === "static"
    ? isShipGateStaticCached(headSha, cache)
    : isShipGateShaCached(headSha, cache)

  if (!force && headSha && alreadyCached) {
    console.error(
      `agent ship-gate: skip — ${headSha.slice(0, 12)} already validated${
        scope === "static" ? " (static)" : ""
      } (cache .run/agent-ship-gate.json; force with AGENT_SHIP_GATE_FORCE=1)`
    )
    return { status: "cached", sha: headSha, scope }
  }

  const staticCached = !force && headSha && isShipGateStaticCached(headSha, cache)

  if (scope === "static") {
    run("pnpm validate:changed", ["pnpm", "validate:changed"], { cwd: root })

    if (!isWorktreeClean(root)) {
      console.error("agent ship-gate: validation rewrote files — commit the changes, then push again")
      process.exit(1)
    }

    if (headSha) {
      try {
        writeShipGateCache(root, headSha, { stage: "static" })
      } catch (error) {
        console.error(`agent ship-gate: could not write static cache: ${errMessage(error)}`)
      }
    }

    console.error("agent ship-gate: static ok — browser e2e runs on publish (`pnpm pr:ready`)")
    return { status: "ok", sha: headSha, scope }
  }

  // E2E plan from shared kernel (same files / base as validate:changed default)
  const { base } = resolveDefaultBase(root)
  const files = getChangedFiles({ mode: "all", base, root })
  const plan = resolveAgentE2ePlan(files, { root })

  // 1) Static gate — once per push / publish.
  if (staticCached) {
    console.error(`agent ship-gate: skip pnpm validate:changed — ${headSha?.slice(0, 12)} already passed it`)
  } else {
    run("pnpm validate:changed", ["pnpm", "validate:changed"], { cwd: root })
  }

  if (!isWorktreeClean(root)) {
    console.error("agent ship-gate: validation rewrote files — commit the changes, then push again")
    process.exit(1)
  }

  // 2) Browser E2E attestation.
  if (!plan.has_e2e) {
    console.error("agent ship-gate: no e2e affected by this change set — skip e2e")
  } else {
    const ask = opts.askAttestation ?? askBrowserE2eAttestation
    const attested = await ask(env)
    if (!attested) {
      console.error(
        "agent ship-gate: browser E2E attestation missing — run the relevant specs, then push again."
      )
      process.exit(1)
    }
    console.error("agent ship-gate: browser E2E attestation ok")
  }

  if (headSha) {
    try {
      writeShipGateCache(root, headSha)
      console.error(`agent ship-gate: cached ${headSha.slice(0, 12)} (.run/agent-ship-gate.json)`)
    } catch (error) {
      console.error(`agent ship-gate: could not write cache: ${errMessage(error)}`)
    }
  }

  console.error("agent ship-gate: ok")
  return { status: "ok", sha: headSha, scope }
}

const thisFile = fileURLToPath(import.meta.url)
const invokedAs = process.argv[1] ? path.resolve(process.argv[1]) : ""

if (invokedAs === thisFile) {
  if (!isCodingAgent()) {
    process.exit(0)
  }

  const root = process.cwd()
  const prState = resolveOpenPrState({ cwd: root })
  const scope = shipGateScopeForPush(prState.mode)

  if (scope === "static") {
    const why = prState.mode === "draft"
      ? `draft PR${prState.pr?.number != null ? ` #${prState.pr.number}` : ""}`
      : "no open PR"
    console.error(`agent pre-push: ${why} — static gate only (browser e2e on publish via pnpm pr:ready)`)
  } else if (prState.mode === "unknown") {
    console.error(
      `agent pre-push: PR state unknown (${prState.detail ?? "gh failed"}) — fail closed, running ship gate`
    )
  } else {
    console.error(
      `agent pre-push: ready PR${prState.pr?.number != null ? ` #${prState.pr.number}` : ""} — running ship gate`
    )
  }

  await runAgentShipGate({ root, scope })
  process.exit(0)
}
