import { initializeAsync } from "@effect-app/vue/runtime"
import { E2E_FLAGS_HEADER, encodeE2EFlags } from "@macs-scanner/api/lib/e2e"
import { ApiClientFactory, type ApiConfig } from "effect-app/client/apiClientFactory"
import * as Layer from "effect-app/Layer"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import { readFileSync } from "fs"
import { resolveStorageState } from "../playwright.config.ts"
import { type Company, resolveStorageStateName } from "./companyPorts.ts"
import { E2EContext } from "./runtime.ts"

export async function makeRuntime(namespace: string, config: ApiConfig) {
  const layers = ApiClientFactory.layer(config).pipe(
    Layer.provide(FetchHttpClient.layer),
    Layer.merge(Layer.succeed(E2EContext, E2EContext.of({ namespace })))
  )
  const runtime = await initializeAsync(layers)

  return runtime
}

export function makeHeaders(
  namespace: string,
  port: number | null,
  role?: "user" | "manager",
  company?: Company
) {
  const basicAuthCredentials = process.env["BASIC_AUTH_CREDENTIALS"]
  let cookie: string | undefined = undefined
  if (role) {
    const stateFile = company
      ? resolveStorageStateName(`storageState.${role}.json`, company)
      : `storageState.${role}.json`
    const f = readFileSync(resolveStorageState(stateFile), "utf-8")
    const p = JSON.parse(f) as { cookies: { name: string; value: string }[] }
    const cookies = p.cookies
    cookie = cookies.map((_) => `${_.name}=${_.value}`).join(";")
  }
  return <Record<string, string>> {
    ...(basicAuthCredentials
      ? { "authorization": `Basic ${Buffer.from(basicAuthCredentials).toString("base64")}` }
      : undefined),
    ...(cookie ? { "Cookie": cookie } : undefined),
    "x-store-id": namespace,
    "x-port": port?.toString() ?? undefined,
    [E2E_FLAGS_HEADER]: encodeE2EFlags([{ _tag: "PrintSkip" }, { _tag: "AbasShortCircuit" }])
  }
}

type Env = ApiClientFactory
export type SupportedEnv = Env // Effect.DefaultEnv |

export function toBase64(b: string) {
  if (typeof window != "undefined" && window.btoa) {
    return window.btoa(b)
  }
  return Buffer.from(b, "utf-8").toString("base64")
}
