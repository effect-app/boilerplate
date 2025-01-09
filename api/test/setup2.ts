/* eslint-disable no-var */
import { api } from "#api/api"
import { basicLayer, basicRuntime } from "#api/lib/basicRuntime"
import { ApiPortTag } from "#api/lib/layers"
import * as HttpClientNode from "@effect/platform-node/NodeHttpClient"
import { Config, Effect, Layer, ManagedRuntime } from "effect-app"
import { ApiClientFactory } from "effect-app/client"
import type { Runtime } from "effect/Runtime"

const POOL_ID = process.env["VITEST_POOL_ID"]
const PORT = 40000 + parseInt(POOL_ID ?? "1")

const ApiLive = api
  .pipe(Layer.provide(Layer.succeed(ApiPortTag, { port: PORT })))

const ApiClientLive = Config
  .all({
    url: Config.string("apiUrl").pipe(Config.withDefault("http://127.0.0.1:" + PORT)),
    headers: Config
      .hashMap(Config.string(), "headers")
      .pipe(Config.option)
  })
  .pipe(Effect.andThen(ApiClientFactory.layer), Layer.unwrapEffect, Layer.provide(HttpClientNode.layer))

const appLayer = ApiLive
  .pipe(Layer.provideMerge(
    Layer
      .mergeAll(
        basicLayer,
        ApiClientLive
      )
  ))

type LayerA<T> = T extends Layer.Layer<unknown, unknown, infer A> ? A : never
type AppLayer = LayerA<typeof appLayer>

declare global {
  var runtime: Runtime<AppLayer>
  var cleanup: () => Promise<void>
}

beforeAll(async () => {
  if (globalThis.runtime) return
  console.log(`[${POOL_ID}] Creating runtime`)

  const rt = ManagedRuntime
    .make(appLayer)

  globalThis.cleanup = () => basicRuntime.runPromise(rt.disposeEffect)
  globalThis.runtime = await rt
    .runtime()
    .catch((error: unknown) => {
      console.error(error)
      throw error
    })
}, 30 * 1000)

afterAll(async () => {
  if (globalThis.cleanup) {
    console.log(`[${POOL_ID}] Destroying runtime`)
    await globalThis.cleanup().catch((error) => {
      console.error(error)
      throw error
    })
  }
})
