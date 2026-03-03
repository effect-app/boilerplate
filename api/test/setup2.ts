/* eslint-disable no-var */
import { api } from "#api"
import { basicLayer, basicRuntime } from "#lib/basicRuntime"
import { ApiPortTag } from "#lib/layers"
import * as HttpClientNode from "@effect/platform-node/NodeHttpClient"
import { Config, Effect, Layer, ManagedRuntime, S } from "effect-app"
import { ApiClientFactory } from "effect-app/client"

const POOL_ID = process.env["VITEST_POOL_ID"]
const PORT = 40000 + parseInt(POOL_ID ?? "1")

const ApiLive = api
  .pipe(Layer.provide(Layer.succeed(ApiPortTag, { port: PORT })))

const ApiClientLive = Effect
  .gen(function*() {
    const url = yield* Config.string("apiUrl").pipe(Config.withDefault("http://127.0.0.1:" + PORT))
    const headers = yield* Config
      .schema(Config.Record(S.String, S.String), "headers")
      .pipe(Config.option)
    return ApiClientFactory.layer({ url, headers })
  })
  .pipe(Layer.unwrap, Layer.provide(HttpClientNode.layerUndici))

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  var managedRuntime: ManagedRuntime.ManagedRuntime<AppLayer, any>
  var cleanup: () => Promise<void>
}

beforeAll(async () => { // eslint-disable-line @typescript-eslint/require-await
  if (globalThis.managedRuntime) return
  console.log(`[${POOL_ID}] Creating runtime`)

  const rt = ManagedRuntime
    .make(appLayer)

  globalThis.cleanup = () => basicRuntime.runPromise(rt.disposeEffect)
  globalThis.managedRuntime = rt
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
