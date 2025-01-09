import { initializeSync } from "@effect-app/vue/runtime"
import { FetchHttpClient } from "@effect/platform"
import { HashMap, Layer } from "effect"
import { ApiClientFactory, type ApiConfig } from "effect-app/client"
import { typedKeysOf } from "effect-app/utils"
import { readFileSync } from "fs"

export function makeRuntime(config: ApiConfig) {
  const layers = ApiClientFactory.layer(config).pipe(Layer.provide(FetchHttpClient.layer))
  const runtime = initializeSync(layers)

  return runtime
}

export function makeHeaders(namespace: string, role?: "manager") {
  const basicAuthCredentials = process.env["BASIC_AUTH_CREDENTIALS"]
  let cookie: string | undefined = undefined
  if (role) {
    const f = readFileSync("./storageState." + role + ".json", "utf-8")
    const p = JSON.parse(f) as { cookies: { name: string; value: string }[] }
    const cookies = p.cookies
    cookie = cookies.map((_) => `${_.name}=${_.value}`).join(";")
  }
  return <Record<string, string>> {
    ...(basicAuthCredentials
      ? { "authorization": `Basic ${Buffer.from(basicAuthCredentials).toString("base64")}` }
      : undefined),
    ...(cookie ? { "Cookie": cookie } : undefined),
    "x-store-id": namespace
  }
}

export function makeHeadersHashMap(namespace: string, role?: "manager") {
  const headers = makeHeaders(namespace, role)
  const keys = typedKeysOf(headers)
  return HashMap.make(...keys.map((_) => [_, headers[_]!] as const))
}

type Env = ApiClientFactory
export type SupportedEnv = Env // Effect.DefaultEnv |

export function toBase64(b: string) {
  if (typeof window != "undefined" && window.btoa) {
    return window.btoa(b)
  }
  return Buffer.from(b, "utf-8").toString("base64")
}
