/* eslint-disable @typescript-eslint/no-explicit-any */
import { initializeSync } from "@effect-app/vue/runtime"
import * as Layer from "effect/Layer"
import * as Runtime from "effect/Runtime"
import { Effect, Option } from "effect-app"
import { WebSdkLive } from "~/utils/observability"
import "effect-app/builtin"
import { ref, shallowRef } from "vue"
import { HttpClient } from "effect-app/http"
import { FetchHttpClient } from "@effect/platform"
import { ApiClientFactory } from "effect-app/client/apiClientFactory"
import { defineNuxtPlugin, useRuntimeConfig } from "nuxt/app"

export const versionMatch = ref(true)

export const runtime = shallowRef<ReturnType<typeof makeRuntime>>()

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
  )

  const rt: {
    runtime: Runtime.Runtime<RT>
    clean: () => void
  } = initializeSync(
    // TODO: tracing when deployed
    disableTracing
      ? apiLayers
      : apiLayers.pipe(
          Layer.merge(
            WebSdkLive({
              serviceName: "effect-app-boilerplate-frontend",
              serviceVersion: feVersion,
              attributes: {},
            }),
          ),
        ),
  )
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

export default defineNuxtPlugin(_ => {
  const config = useRuntimeConfig()

  const rt = makeRuntime(
    config.public.feVersion,
    config.public.env !== "local-dev" || !config.public.telemetry,
  )

  runtime.value = rt
})
