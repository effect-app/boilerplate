import { makeClient } from "@effect-app/vue/makeClient"
import { useToast } from "vue-toastification"
import { useIntl } from "./intl"
import type { Effect } from "effect-app"
import { clientFor as clientFor_ } from "#resources/lib"
import type {
  RequestHandler,
  RequestHandlerWithInput,
  Requests,
} from "effect-app/client/clientFor"
import { OperationsClient } from "#resources/Operations"
import { useQueryClient } from "@tanstack/vue-query"
import { makeQueryKey } from "@effect-app/vue"

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

export const useUpdateQuery = () => {
  const queryClient = useQueryClient()

  const f: {
    <A>(
      query: RequestHandler<A, any, any, any>,
      updater: (data: NoInfer<A>) => NoInfer<A>,
    ): void
    <I, A>(
      query: RequestHandlerWithInput<I, A, any, any, any>,
      input: I,
      updater: (data: NoInfer<A>) => NoInfer<A>,
    ): void
  } = (query: any, updateOrInput: any, updaterMaybe?: any) => {
    const updater = updaterMaybe !== undefined ? updaterMaybe : updateOrInput
    const key =
      updaterMaybe !== undefined
        ? [...makeQueryKey(query), updateOrInput]
        : makeQueryKey(query)
    const data = queryClient.getQueryData(key)
    if (data) {
      queryClient.setQueryData(key, updater)
    } else {
      console.warn(`Query data for key ${key} not found`, key)
    }
  }
  return f
}

export const {
  buildFormFromSchema,
  makeUseAndHandleMutation,
  useAndHandleMutation,
  useSafeMutation,
  useSafeMutationWithState,
  useSafeQuery,
} = makeClient(useIntl, useToast, shallowRef(runtime.runtime)) // TODO
