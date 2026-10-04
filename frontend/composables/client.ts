/* eslint-disable @typescript-eslint/no-explicit-any */

import { clientFor as clientFor_ } from "#resources/lib"
import { Commander } from "@effect-app/vue/commander"
import { Confirm } from "@effect-app/vue/confirm"
import { I18n } from "@effect-app/vue/intl"
import { makeClient, useMutation } from "@effect-app/vue/makeClient"
import type { makeIntl } from "@effect-app/vue/makeIntl"
import * as Toast_ from "@effect-app/vue/toast"
import { WithToast } from "@effect-app/vue/withToast"
import * as Effect from "effect-app/Effect"
import * as Layer from "effect-app/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import { useToast } from "vue-toastification"
import type { RT } from "~/plugins/runtime"
import { useIntl } from "./intl"

export { useToast } from "vue-toastification"

export { AsyncResult } from "@effect-app/vue/lib"
export { mapHandler, pauseWhileProcessing, useIntervalPauseWhileProcessing } from "@effect-app/vue/lib"
export { makeContext } from "@effect-app/vue/makeContext"
export { composeQueries } from "@effect-app/vue/query"
export { useMutation }

export const useRuntime = () => useNuxtApp().$runtime

export const run = <A, E>(
  effect: Effect.Effect<A, E, RT>,
  options?:
    | {
      readonly signal?: AbortSignal
    }
    | undefined
) => useRuntime().runPromise(effect, options)

export const runSync = <A, E>(effect: Effect.Effect<A, E, RT>) => useRuntime().runSync(effect)

const intlLayer = I18n.toLayer(Effect.sync(useIntl as ReturnType<typeof makeIntl>["useIntl"]))
// TODO: use optional CurrentToastId to auto assign toastId when not null?
const toastLayer = Toast_.Toast.toLayer(
  Effect.sync(() => {
    const t = useToast()
    const toast = {
      error: t.error.bind(t),
      info: t.info.bind(t),
      success: t.success.bind(t),
      warning: t.warning.bind(t),
      dismiss: t.dismiss.bind(t)
    }
    return Toast_.wrap(toast)
  })
)
const commanderLayer = Commander.Default.pipe(
  Layer.provide([intlLayer, toastLayer])
)

const globalLayers = Effect.sync(() => useRuntime().globalLayers).pipe(
  Layer.unwrap
)
const viewLayers = Layer.mergeAll(Router.Default, intlLayer, toastLayer)
const provideLayers = Layer
  .mergeAll(
    commanderLayer,
    viewLayers,
    WithToast.Default.pipe(Layer.provide(toastLayer)),
    Confirm.Default.pipe(Layer.provide(intlLayer))
  )
  .pipe(Layer.provideMerge(globalLayers))

// argh, deprecation comments get stripped by unimport, so we group them under "Legacy" now.
export const { Command, clientFor } = makeClient(
  () => ManagedRuntime.make(provideLayers, { memoMap: useRuntime().memoMap }),
  clientFor_,
  Router.Default
)
