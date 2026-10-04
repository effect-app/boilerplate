#!/usr/bin/env node
/**
 * Root `prepare` helper: agent `gh` shim + native `.githooks` via core.hooksPath.
 *
 * Docker image builds set SKIP_PREPARE=true and run `pnpm install --prod`
 * without git. Soft-skip hooks config there (same contract as
 * install-patched-compilers.ts / configurator). The agent gh shim still
 * installs when the filesystem allows — it does not need git.
 */
import { execFileSync } from "node:child_process"
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"
import { errCode, errMessage } from "./lib/opts.ts"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

const installAgentGhShim = () => {
  const toolsBin = path.join(root, ".tools", "bin")
  const agentGh = path.join(root, "scripts", "agent-gh.ts")
  mkdirSync(toolsBin, { recursive: true })
  const shimPath = path.join(toolsBin, "gh")
  const shim = `#!/usr/bin/env bash
# Installed by scripts/install-git-hooks.ts — agent gh policy shim.
# Blocks coding-agent \`gh pr ready\`; use \`pnpm pr:ready\` instead.
set -euo pipefail
exec node ${JSON.stringify(agentGh)} "$@"
`
  writeFileSync(shimPath, shim, { encoding: "utf8", mode: 0o755 })
  try {
    chmodSync(shimPath, 0o755)
  } catch {
    // best-effort on platforms without chmod
  }
}

if (process.env.SKIP_PREPARE) {
  console.log("install-git-hooks: SKIP_PREPARE set, skipping")
  process.exit(0)
}

try {
  installAgentGhShim()
} catch (error: unknown) {
  console.error(`install-git-hooks: could not install agent gh shim: ${errMessage(error)}`)
}

for (const name of ["post-checkout", "pre-commit", "pre-push"]) {
  const p = path.join(root, ".githooks", name)
  if (existsSync(p)) {
    try {
      chmodSync(p, 0o755)
    } catch {
      // best-effort
    }
  }
}

try {
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], { cwd: root })
} catch (error: unknown) {
  const code = errCode(error)
  const msg = errMessage(error)
  // Docker / tarball / no-git: soft skip. Real worktree git failures still fail.
  if (
    code === "ENOENT"
    || /not a git repository/i.test(msg)
    || /spawnSync git/i.test(msg)
  ) {
    console.log(`install-git-hooks: skip hooksPath (${msg.split("\n")[0]})`)
    process.exit(0)
  }
  console.error(`install-git-hooks: could not configure native hooks dir: ${msg}`)
  process.exit(1)
}

process.exit(0)
