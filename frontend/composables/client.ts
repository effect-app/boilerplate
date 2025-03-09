import { makeClient } from "@effect-app/vue/makeClient"
import { useToast } from "vue-toastification"
import { useIntl } from "./intl"
import { runtime, type RT } from "~/plugins/runtime"
import type { Effect } from "effect-app"
import { clientFor as clientFor_ } from "#resources/lib"
import type { Requests } from "effect-app/client/clientFor"
import { OperationsClient } from "#resources/Operations"

export { useToast } from "vue-toastification"

export { Result, makeContext } from "@effect-app/vue"
export {
  pauseWhileProcessing,
  useIntervalPauseWhileProcessing,
  composeQueries,
  SuppressErrors,
  mapHandler,
} from "@effect-app/vue"

const rt = computed(() => runtime.value?.runtime)

export const run = <A, E>(
  effect: Effect.Effect<A, E, RT>,
  options?:
    | {
        readonly signal?: AbortSignal
      }
    | undefined,
) => runtime.value!.runPromise(effect, options)

export const runSync = <A, E>(effect: Effect.Effect<A, E, RT>) =>
  runtime.value!.runSync(effect)

export const clientFor = <M extends Requests>(m: M) => runSync(clientFor_(m))
export const useOperationsClient = () => runSync(OperationsClient)

export const {
  buildFormFromSchema,
  makeUseAndHandleMutation,
  useAndHandleMutation,
  useSafeMutation,
  useSafeMutationWithState,
  useSafeQuery,
} = makeClient(useIntl, useToast, rt)
