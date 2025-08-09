/* eslint-disable @typescript-eslint/no-explicit-any */
import { initializeSync } from "@effect-app/vue/runtime"
import * as Layer from "effect/Layer"
import * as Runtime from "effect/Runtime"
import { Effect, Option } from "effect-app"
import { WebSdkLive } from "~/utils/observability"
import "effect-app/builtin"
import { ref } from "vue"
import { HttpClient } from "effect-app/http"
import { FetchHttpClient } from "@effect/platform"
import { ApiClientFactory } from "effect-app/client/apiClientFactory"
import { type useRuntimeConfig } from "nuxt/app"
import { Atom } from "@effect-atom/atom-vue"

export const versionMatch = ref(true)

function makeRuntime(feVersion: string, disableTracing: boolean) {
  const apiLayers = ApiClientFactory.layer({
    url: "/api/api",
    headers: Option.none(),
  }).pipe(
    Layer.provide(
      Layer.effect(
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
      ),
    ),
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(
      Layer.succeed(FetchHttpClient.RequestInit, { credentials: "include" }),
    ),
  )

  const globalLayers = disableTracing
    ? Layer.empty
    : WebSdkLive({
        serviceName: "effect-app-boilerplate-frontend",
        serviceVersion: feVersion,
        attributes: {},
      })

  const rt: {
    runtime: Runtime.Runtime<RT>
    clean: () => void
  } = initializeSync(apiLayers.pipe(Layer.provideMerge(globalLayers)))

  Atom.runtime.addGlobalLayer(globalLayers)

  return {
    ...rt,
    runFork: Runtime.runFork(rt.runtime),
    runSync: Runtime.runSync(rt.runtime),
    runPromise: Runtime.runPromise(rt.runtime),
    runCallback: Runtime.runCallback(rt.runtime),
  }
}

// TODO: make sure the runtime provides these
export type RT = ApiClientFactory

/*
  We read the configuration from the global var sent by server, embedded in the html document.
  The reason for this is, that we want to have the configuration available before the Nuxt app is initialized.
  Otherwise we can only initialize the runtime in nuxt plugin, script setup or middleware,
  which means we cannot do anything with the runtime in the root of modules, etc.

  Now we can use things like clientFor, which leverage the runtime, and export clients directly from modules.
*/
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const config = (globalThis as any).__NUXT__.config as ReturnType<
  typeof useRuntimeConfig
>
const isRemote = config.public.env !== "local-dev"
const disableTracing = !isRemote || !config.public.telemetry

export const runtime = makeRuntime(
  config.public.feVersion,
  disableTracing,
  // config.public.env,
  // isRemote,
  // !isRemote && !config.public.telemetry,
)
