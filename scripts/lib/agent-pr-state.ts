/**
 * Resolve whether the current branch's open PR should enforce the agent ship gate.
 *
 * Modes:
 *   none    — no open PR (or closed/merged): static gate only
 *   draft   — open draft PR: static gate only (no e2e)
 *   ready   — open non-draft PR: full ship gate on every agent push
 *   unknown — gh missing / failed: fail closed (run the full gate)
 */
import { spawnSync } from "node:child_process"
import process from "node:process"
import { errCode, errMessage, type LooseOpts } from "./opts.ts"

export type PrMode = "none" | "draft" | "ready" | "unknown"
type PrPayload = { isDraft?: boolean; state?: string; number?: number; url?: string }
export type OpenPrState = { mode: PrMode; pr: PrPayload | null; detail?: string }
type RunGh = (
  args: string[],
  runOpts: { cwd?: string; env?: NodeJS.ProcessEnv }
) => { status: number | null; stdout?: string | null; stderr?: string | null; error?: { code?: string } }

/**
 * @param {{ isDraft?: boolean, state?: string } | null | undefined} pr
 * @returns {"none" | "draft" | "ready"}
 */
export const classifyPrPayload = (pr: PrPayload | null | undefined) => {
  if (pr == null) return "none"
  const state = String(pr.state ?? "").toUpperCase()
  if (state === "CLOSED" || state === "MERGED") return "none"
  if (pr.isDraft === true) return "draft"
  return "ready"
}

/**
 * @param {"none" | "draft" | "ready" | "unknown"} mode
 * @returns {boolean}
 */
export const shouldRunShipGateOnPush = (mode: PrMode) => mode === "ready" || mode === "unknown"

/**
 * How much of the gate a push pays for.
 *
 * Nothing is free any more: a push that does not compile, lint or pass unit
 * tests is worthless to a reviewer whether or not the PR says "draft", and it
 * costs a CI run to find out. What draft buys is the *expensive* half — API and
 * browser e2e stay on the publish path.
 *
 * @param {"none" | "draft" | "ready" | "unknown"} mode
 * @returns {"full" | "static"}
 */
export const shipGateScopeForPush = (mode: PrMode) => shouldRunShipGateOnPush(mode) ? "full" : "static"

/**
 * @param {{
 *   cwd?: string
 *   env?: NodeJS.ProcessEnv
 *   runGh?: (args: string[], opts: { cwd: string, env: NodeJS.ProcessEnv }) =>
 *     { status: number | null, stdout: string, stderr: string }
 * }} [opts]
 * @returns {{ mode: "none" | "draft" | "ready" | "unknown", pr: { number?: number, url?: string, isDraft?: boolean, state?: string } | null, detail?: string }}
 */
/** Strip ANSI color codes so `gh --json` stays parseable when color is forced. */
// eslint-disable-next-line no-control-regex -- ESC is precisely what is matched here
const stripAnsi = (text: string) => String(text).replace(/\u001b\[[0-9;]*m/g, "")

/** Return the JSON object while ignoring shell integration noise around it. */
const extractJsonObject = (text: string) => {
  const cleaned = stripAnsi(text).trim()
  const start = cleaned.indexOf("{")
  const end = cleaned.lastIndexOf("}")
  if (start === -1 || end === -1 || end < start) return cleaned
  return cleaned.slice(start, end + 1)
}

export const resolveOpenPrState = (opts: LooseOpts & { runGh?: RunGh } = {}): OpenPrState => {
  const cwd = opts.cwd ?? process.cwd()
  const env = { ...(opts.env ?? process.env) }
  delete env.FORCE_COLOR
  delete env.CLICOLOR_FORCE
  env.NO_COLOR = "1"
  env.CLICOLOR = "0"
  env.GH_FORCE_TTY = "0"
  env.TERM = "dumb"
  const runGh = opts.runGh
    ?? ((args: string[], runOpts: { cwd?: string; env?: NodeJS.ProcessEnv }) => {
      const result = spawnSync("gh", args, {
        encoding: "utf8",
        cwd: runOpts.cwd,
        env: runOpts.env,
        shell: false
      })
      return {
        status: result.status,
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        error: result.error
      }
    })

  const result = runGh(
    ["pr", "view", "--json", "number,url,isDraft,state"],
    { cwd, env }
  )

  if (result.error && errCode(result.error) === "ENOENT") {
    return { mode: "unknown", pr: null, detail: "gh not found on PATH" }
  }

  const status = result.status === null ? 1 : result.status
  const stderr = stripAnsi(result.stderr ?? "").trim()
  const stdout = extractJsonObject(result.stdout ?? "")

  // No PR for this branch — free push (open a draft when ready to share).
  if (status !== 0) {
    const combined = `${stderr}\n${stdout}`.toLowerCase()
    if (
      combined.includes("no pull requests found")
      || combined.includes("could not resolve to a pullrequest")
      || combined.includes("no pr found")
      || combined.includes("not found")
    ) {
      return { mode: "none", pr: null, detail: stderr.trim() || "no open PR" }
    }
    return {
      mode: "unknown",
      pr: null,
      detail: stderr.trim() || stdout || `gh pr view exited ${status}`
    }
  }

  if (!stdout) {
    return { mode: "unknown", pr: null, detail: "gh pr view returned empty JSON" }
  }

  try {
    const parsed: unknown = JSON.parse(stdout)
    const pr: PrPayload = parsed !== null && typeof parsed === "object" ? parsed : {}
    const mode = classifyPrPayload(pr)
    return { mode, pr, detail: mode === "none" ? `PR ${pr.number} is ${pr.state}` : undefined }
  } catch (error: unknown) {
    return {
      mode: "unknown",
      pr: null,
      detail: `failed to parse gh pr view JSON: ${errMessage(error)}`
    }
  }
}
