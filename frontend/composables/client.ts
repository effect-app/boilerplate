import { makeClient } from "@effect-app/vue/makeClient"
import { useToast } from "vue-toastification"
import { useIntl } from "./intl"
import { Effect } from "effect-app"
import { clientFor as clientFor_ } from "#resources/lib"
import { OperationsClient } from "#resources/Operations"
import type { Requests } from "effect-app/client"

export { useToast } from "vue-toastification"

export { Result, makeContext } from "@effect-app/vue"
export {
  pauseWhileProcessing,
  useIntervalPauseWhileProcessing,
  composeQueries,
  SuppressErrors,
  mapHandler,
} from "@effect-app/vue"

export const run = <A, E>(
  effect: Effect.Effect<A, E, RT>,
  options?:
    | {
        readonly signal?: AbortSignal
      }
    | undefined,
) => runtime.runPromise(effect, options)

export const runSync = <A, E>(effect: Effect.Effect<A, E, RT>) =>
  runtime.runSync(effect)

export const clientFor = <M extends Requests>(m: M) => runSync(clientFor_(m))
export const useOperationsClient = () => runSync(OperationsClient)

export const {
  buildFormFromSchema,
  makeUseAndHandleMutation,
  useAndHandleMutation,
  useAndHandleMutationResult,
  useSafeMutation,
  useSafeMutationWithState,
  useSafeQuery,
  useSafeSuspenseQuery,
} = makeClient(useIntl, useToast, shallowRef(runtime.runtime)) // TODO

export const confirm = (message = "Sind sie Sicher?") =>
  Effect.sync(() => window.confirm(message))

export const confirmOrInterrupt = (message = "Sind sie Sicher?") =>
  confirm(message).pipe(
    Effect.flatMap(result => (result ? Effect.void : Effect.interrupt)),
  )
