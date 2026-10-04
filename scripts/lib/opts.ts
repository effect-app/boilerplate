/** Shared loose options bag for maintenance scripts. */
export type LooseOpts = {
  cwd?: string
  env?: NodeJS.ProcessEnv
  force?: boolean
  root?: string
  base?: string
  mode?: string
  input?: string
  allowFail?: boolean
  jq?: string
  readFileSync?: (path: string, encoding?: string) => string
  stillApplies?: (recorded: string, head: string) => boolean
  runGit?: (
    args: string[],
    runOpts: { cwd?: string }
  ) => { status: number | null; stdout?: string | null }
  log?: (msg: string) => void
  timeoutMs?: number
  headers?: Record<string, string>
  pollSeconds?: number
  linkedSource?: boolean
  forceFull?: boolean
  [key: string]: unknown
}

export const errCode = (error: unknown): string | undefined => {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = error.code
    return typeof code === "string" ? code : undefined
  }
  return undefined
}

export const errMessage = (error: unknown): string => error instanceof Error ? error.message : String(error)

export const flagString = (value: string | boolean | undefined, fallback = ""): string =>
  typeof value === "string" ? value : fallback
