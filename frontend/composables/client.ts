/* eslint-disable @typescript-eslint/no-explicit-any */

import { clientFor as clientFor_ } from "#resources/lib"
import { OperationsClient } from "#resources/Operations"
import { Commander } from "@effect-app/vue/experimental/commander"
import { Confirm } from "@effect-app/vue/experimental/confirm"
import { I18n } from "@effect-app/vue/experimental/intl"
import * as Toast_ from "@effect-app/vue/experimental/toast"
import { WithToast } from "@effect-app/vue/experimental/withToast"
import { LegacyMutation, makeClient } from "@effect-app/vue/makeClient"
import { Effect, Layer, ManagedRuntime } from "effect-app"
import { useToast } from "vue-toastification"
import type { RT } from "~/plugins/runtime"
import { useIntl } from "./intl"

export { useToast } from "vue-toastification"

export { makeContext, Result } from "@effect-app/vue"
export { composeQueries, mapHandler, pauseWhileProcessing, SuppressErrors, useIntervalPauseWhileProcessing, useMutation } from "@effect-app/vue"

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

const intlLayer = I18n.toLayer(Effect.sync(useIntl))
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
  Layer.unwrapEffect
)
const viewLayers = Layer.mergeAll(Router.Default, intlLayer, toastLayer)
const provideLayers = Layer
  .mergeAll(
    LegacyMutation.Default.pipe(Layer.provide([toastLayer, intlLayer])),
    commanderLayer,
    viewLayers,
    WithToast.Default.pipe(Layer.provide(toastLayer)),
    Confirm.Default.pipe(Layer.provide(intlLayer))
  )
  .pipe(Layer.provideMerge(globalLayers))

// argh, deprecation comments get stripped by unimport, so we group them under "Legacy" now.
export const { Command, clientFor, legacy } = makeClient(
  () => ManagedRuntime.make(provideLayers, useRuntime().memoMap),
  clientFor_,
  Router.Default
)

export const useOperationsClient = () => useRuntime().runSync(OperationsClient)
