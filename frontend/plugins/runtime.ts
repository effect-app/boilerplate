/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Layer from "effect/Layer"
import { Effect, Logger, LogLevel, Option } from "effect-app"
import { WebSdkLive } from "~/utils/observability"
import "effect-app/builtin"
import { ref } from "vue"
import { HttpClient } from "effect-app/http"
import { FetchHttpClient } from "@effect/platform"
import { ApiClientFactory } from "effect-app/client/apiClientFactory"
import { useRuntimeConfig } from "nuxt/app"
import { Atom } from "@effect-atom/atom"
import { RpcClient, RpcSerialization } from "@effect/rpc"
import { initializeAsync } from "@effect-app/vue"

export const versionMatch = ref(true)

async function makeRuntime(feVersion: string, disableTracing: boolean) {
  const OurHttpClient = Layer.effect(
    HttpClient.HttpClient,
    Effect.map(
      HttpClient.HttpClient,
      HttpClient.tap(r =>
        Effect.sync(() => {
          const remoteFeVersion = r.headers["x-fe-version"]
          if (remoteFeVersion) {
            versionMatch.value = feVersion === remoteFeVersion
          }
        }),
      ),
    ),
  ).pipe(
    Layer.provideMerge(FetchHttpClient.layer),
    Layer.provideMerge(
      Layer.succeed(FetchHttpClient.RequestInit, { credentials: "include" }),
    ),
  )

  const apiLayers = ApiClientFactory.layer({
    url: "/api/api",
    headers: Option.none(),
  }).pipe(Layer.provide(OurHttpClient))

  const globalLayers = (
    disableTracing
      ? Layer.empty
      : WebSdkLive({
          serviceName: "effect-app-boilerplate-frontend",
          serviceVersion: feVersion,
          attributes: {},
        })
  ).pipe(Layer.provideMerge(Logger.minimumLogLevel(LogLevel.Debug)))

  const rt = await initializeAsync(
    apiLayers.pipe(Layer.provideMerge(globalLayers)),
  )

  Atom.runtime.addGlobalLayer(globalLayers)

  return Object.assign(rt, { OurHttpClient, globalLayers })
}

// TODO: make sure the runtime provides these
export type RT = ApiClientFactory

export default defineNuxtPlugin(async _nuxtApp => {
  const config = useRuntimeConfig()
  const isRemote = config.public.env !== "local-dev"
  const disableTracing = !isRemote || !config.public.telemetry

  const runtime = await makeRuntime(
    config.public.feVersion,
    disableTracing,
    // config.public.env,
    // isRemote,
    // !isRemote && !config.public.telemetry,
  )

  const RpcClientProtocolLayers = (path: string) =>
    Layer.provideMerge(
      RpcClient.layerProtocolHttp({
        url: "/api/api/rpc" + path,
      }).pipe(Layer.provide(RpcSerialization.layerJson)),
      runtime.OurHttpClient,
    )
  return {
    provide: {
      runtime,
      RpcClientProtocolLayers,
    },
  }
})
