#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import { createReadStream, createWriteStream } from "node:fs"
import { appendFile, chmod, copyFile, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { pipeline } from "node:stream/promises"
import { createGunzip } from "node:zlib"
import { errCode, errMessage } from "./lib/opts.ts"

type CompilerPatchConfig = {
  tsgoRepo?: string
  tsgoReleaseTag?: string
}

type TsPackageJson = {
  name?: string
  version: string
}

type GithubAsset = {
  name: string
  browser_download_url: string
  digest?: string
}

type GithubRelease = {
  tag_name: string
  assets: GithubAsset[]
}

type TsgoMarker = {
  repo: string
  tag: string
  asset: string
  assetDigest: string | null
  archiveSha256: string | null
  binarySha256?: string
}

const rootRequire = createRequire(join(process.cwd(), "package.json"))
const packageJson = rootRequire("./package.json") as { compilerPatches?: CompilerPatchConfig }

if (process.env.SKIP_PREPARE) {
  console.log("SKIP_PREPARE set, skipping patched compiler install")
  process.exit(0)
}

const config: CompilerPatchConfig = packageJson.compilerPatches ?? {}
const tsgoRepo = process.env.TSGO_REPO ?? config.tsgoRepo ?? "effect-app/tsgo"
const configuredTag = process.env.TSGO_RELEASE_TAG ?? config.tsgoReleaseTag ?? "latest"
const githubToken = process.env.GITHUB_TOKEN ?? process.env.NODE_AUTH_TOKEN

const platformArch = `${process.platform}-${process.arch}`
const exe = process.platform === "win32" ? ".exe" : ""
const assetName = `tsgo-${platformArch}${exe}.gz`

const exists = async (path: string) =>
  stat(path).then(
    () => true,
    () => false
  )

const githubApiAuthHeaders = (url: string): Record<string, string> => {
  if (!githubToken) return {}
  if (new URL(url).hostname !== "api.github.com") return {}
  return { "authorization": `Bearer ${githubToken}` }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Transient GH API / CDN failures (common on Actions during outages). */
const isRetryableHttpStatus = (status: number) =>
  status === 408
  || status === 425
  || status === 429
  || status === 500
  || status === 502
  || status === 503
  || status === 504

type FetchOkInit = {
  headers?: Record<string, string>
}

const fetchOk = async (url: string, init?: FetchOkInit, { attempts = 6 }: { attempts?: number } = {}) => {
  let lastError: Error | undefined
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          "accept": "application/vnd.github+json",
          "user-agent": "@effect-app-boilerplate/compiler-installer",
          ...githubApiAuthHeaders(url),
          ...init?.headers
        }
      })
      if (response.ok) return response
      lastError = new Error(`GET ${url} failed: ${response.status} ${response.statusText}`)
      if (!isRetryableHttpStatus(response.status) || attempt === attempts) throw lastError
      const backoffMs = Math.min(30_000, 500 * 2 ** (attempt - 1))
      console.warn(`${lastError.message}; retry ${attempt}/${attempts} in ${backoffMs}ms`)
      await sleep(backoffMs)
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(errMessage(error))
      // Network throws (not Response) — retry those too.
      if (attempt === attempts) throw lastError
      if (
        error instanceof Error && error.message.startsWith("GET ") && !/failed: (408|425|429|5\d\d)/
          .test(error.message)
      ) {
        throw lastError
      }
      const backoffMs = Math.min(30_000, 500 * 2 ** (attempt - 1))
      console.warn(`${lastError.message}; retry ${attempt}/${attempts} in ${backoffMs}ms`)
      await sleep(backoffMs)
    }
  }
  throw lastError ?? new Error(`GET ${url} failed`)
}

const resolveNativeTsgoBinary = () => {
  const nativePreviewPackageJsonPath = rootRequire.resolve("@typescript/native-preview/package.json")
  const nativePreviewRequire = createRequire(nativePreviewPackageJsonPath)
  const platformPackageName = `@typescript/native-preview-${platformArch}`
  const platformPackageJsonPath = nativePreviewRequire.resolve(`${platformPackageName}/package.json`)
  return join(dirname(platformPackageJsonPath), "lib", process.platform === "win32" ? "tsgo.exe" : "tsgo")
}

const getTsgoVersion = (binaryPath: string) => {
  const result = spawnSync(binaryPath, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  })
  if (result.error || result.status !== 0) return null
  return (result.stdout?.split(/\r?\n/)[0] ?? "").trim() || null
}

const appendStepSummary = async (markdown: string) => {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (!summaryPath) return
  await appendFile(summaryPath, markdown)
}

const getRelease = async (): Promise<GithubRelease> => {
  const releasePath = configuredTag === "latest" ? "latest" : `tags/${configuredTag}`
  const response = await fetchOk(`https://api.github.com/repos/${tsgoRepo}/releases/${releasePath}`)
  return response.json() as Promise<GithubRelease>
}

const downloadAsset = async (asset: GithubAsset, destination: string) => {
  const response = await fetchOk(asset.browser_download_url, {
    headers: { "accept": "application/octet-stream" }
  })
  await mkdir(dirname(destination), { recursive: true })
  if (response.body == null) throw new Error(`GET ${asset.browser_download_url} returned empty body`)
  await pipeline(response.body, createWriteStream(destination))
}

const sha256File = async (path: string) => {
  const hash = createHash("sha256")
  hash.update(await readFile(path))
  return hash.digest("hex")
}

const readExpectedSha = async (release: GithubRelease) => {
  const sums = release.assets.find((asset) => asset.name === "SHA256SUMS")
  if (!sums) return undefined

  const response = await fetchOk(sums.browser_download_url, {
    headers: { "accept": "application/octet-stream" }
  })
  const text = await response.text()
  for (const line of text.split(/\r?\n/)) {
    const [sha, name] = line.trim().split(/\s+/)
    if (name === assetName) return sha
  }
  return undefined
}

const releaseAssetSha = (asset: GithubAsset) => asset.digest?.replace(/^sha256:/, "")

const installTsgo = async (): Promise<string | null> => {
  let targetPath: string
  try {
    targetPath = resolveNativeTsgoBinary()
  } catch (error: unknown) {
    if (errCode(error) === "MODULE_NOT_FOUND") {
      console.log("@typescript/native-preview not found, skipping tsgo compiler patch")
      return null
    }
    throw error
  }

  try {
    const release = await getRelease()
    const asset = release.assets.find((releaseAsset) => releaseAsset.name === assetName)
    if (!asset) {
      throw new Error(`Release ${release.tag_name} has no ${assetName} asset in ${tsgoRepo}`)
    }

    const markerPath = `${targetPath}.effect-app.json`
    const expectedArchiveSha = await readExpectedSha(release)
    const markerBase = {
      repo: tsgoRepo,
      tag: release.tag_name,
      asset: assetName,
      assetDigest: asset.digest ?? null,
      archiveSha256: expectedArchiveSha ?? releaseAssetSha(asset) ?? null
    }

    if (await exists(markerPath)) {
      const current: TsgoMarker = JSON.parse(await readFile(markerPath, "utf8"))
      if (
        current.repo === markerBase.repo
        && current.tag === markerBase.tag
        && current.asset === markerBase.asset
        && current.assetDigest === markerBase.assetDigest
        && current.archiveSha256 === markerBase.archiveSha256
        && current.binarySha256
        && (await exists(targetPath))
        && (await sha256File(targetPath)) === current.binarySha256
      ) {
        console.log(`tsgo already patched from ${tsgoRepo}@${release.tag_name}`)
        return targetPath
      }
    }

    const archivePath = `${targetPath}.${release.tag_name}.${assetName}`
    const tmpPath = `${targetPath}.effect-app-${process.pid}-${Date.now()}${exe}`
    await downloadAsset(asset, archivePath)

    if (markerBase.archiveSha256) {
      const actualSha = await sha256File(archivePath)
      if (actualSha !== markerBase.archiveSha256) {
        throw new Error(`Checksum mismatch for ${assetName}: expected ${markerBase.archiveSha256}, got ${actualSha}`)
      }
    }

    const originalPath = `${targetPath}.stock`
    if (!(await exists(originalPath)) && (await exists(targetPath))) {
      await copyFile(targetPath, originalPath)
    }

    await pipeline(createReadStream(archivePath), createGunzip(), createWriteStream(tmpPath, { mode: 0o755 }))
    await chmod(tmpPath, 0o755)
    if (await exists(targetPath)) {
      await rm(targetPath)
    }
    await rename(tmpPath, targetPath)
    const marker = {
      ...markerBase,
      binarySha256: await sha256File(targetPath)
    }
    await writeFile(markerPath, `${JSON.stringify(marker, null, 2)}\n`)
    console.log(`Patched tsgo from ${tsgoRepo}@${release.tag_name}`)
    return targetPath
  } catch (error: unknown) {
    // GH API / CDN outages must not fail `pnpm install` (e2e, lint, tests still need
    // node_modules). Fall back to the stock native-preview binary already on disk.
    const message = errMessage(error)
    console.warn(`tsgo patch skipped after failure (${message}); using stock @typescript/native-preview`)
    await appendStepSummary(
      `### Patched compiler (tsgo)\n\n⚠️ patch download failed; using stock binary\n\n\`\`\`\n${message}\n\`\`\`\n`
    )
    return targetPath
  }
}

const patchTypeScript = () => {
  try {
    const tsPkg = rootRequire("typescript/package.json") as TsPackageJson
    const version = tsPkg.version
    // TNB is a 6.x-shaped host over in-process tsgo. The LS `patch` rewrites
    // typescript.js / _tsc.js for the JS checker; that would break the bridge.
    // The @effect/language-service tsserver plugin still loads via tsconfig.
    if (tsPkg.name === "typescript-native-bridge" || version.includes("-bridge.")) {
      console.log(`Skipping effect-language-service patch for ${tsPkg.name}@${version}`)
      return
    }
    if (!version.startsWith("6.")) {
      console.log(`Skipping effect-language-service patch for TypeScript ${version}`)
      return
    }
    const patchCliPath = rootRequire.resolve("@effect/language-service/cli.js")
    execFileSync(process.execPath, [patchCliPath, "patch"], { stdio: "inherit" })
  } catch (error: unknown) {
    if (errCode(error) === "MODULE_NOT_FOUND") {
      console.log("TypeScript not found (production install), skipping effect-language-service patch")
      return
    }
    throw error
  }
}

const patchOxlint = () => {
  try {
    const effectTsgoPackagePath = rootRequire.resolve("@effect/tsgo/package.json")
    const effectTsgoCliPath = join(dirname(effectTsgoPackagePath), "dist", "effect-tsgo.cjs")
    execFileSync(process.execPath, [effectTsgoCliPath, "patch", "--no-typescript", "--oxlint"], { stdio: "inherit" })
  } catch (error: unknown) {
    if (errCode(error) === "MODULE_NOT_FOUND") {
      console.log("@effect/tsgo not found (production install), skipping Oxlint patch")
      return
    }
    throw error
  }
}

const tsgoBinaryPath = await installTsgo()
patchTypeScript()
patchOxlint()

if (tsgoBinaryPath && (await exists(tsgoBinaryPath))) {
  const version = getTsgoVersion(tsgoBinaryPath)
  if (version) {
    console.log(`tsgo version: ${version}`)
    await appendStepSummary(`### Patched compiler (tsgo)\n\n\`${version}\`\n`)
  }
}
