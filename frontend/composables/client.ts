import { makeClient, useMutation } from "@effect-app/vue/makeClient"
import { useToast } from "vue-toastification"
import { useIntl } from "./intl"
import { Effect, Layer, Struct } from "effect-app"
import { clientFor as clientFor_ } from "#resources/lib"
import { OperationsClient } from "#resources/Operations"
import { Commander } from "@effect-app/vue/experimental/commander"
import { Confirm } from "@effect-app/vue/experimental/confirm"
import { I18n } from "@effect-app/vue/experimental/intl"
import { WithToast } from "@effect-app/vue/experimental/withToast"
import * as Toast_ from "@effect-app/vue/experimental/toast"
import type {
  RequestHandler,
  RequestHandlers,
  RequestHandlerWithInput,
  Requests,
} from "effect-app/client/clientFor"
import type { RT } from "~/plugins/runtime"
import { camelCase } from "lodash"

export { useToast } from "vue-toastification"

export { Result, makeContext } from "@effect-app/vue"
export {
  pauseWhileProcessing,
  useIntervalPauseWhileProcessing,
  composeQueries,
  SuppressErrors,
  mapHandler,
  useMutation,
} from "@effect-app/vue"

export const useRuntime = () => useNuxtApp().$runtime

export const run = <A, E>(
  effect: Effect.Effect<A, E, RT>,
  options?:
    | {
        readonly signal?: AbortSignal
      }
    | undefined,
) => useRuntime().runPromise(effect, options)

export const runSync = <A, E>(effect: Effect.Effect<A, E, RT>) =>
  useRuntime().runSync(effect)

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
      dismiss: t.dismiss.bind(t),
    }
    return Toast_.wrap(toast)
  }),
)
const commanderLayer = Commander.Default.pipe(
  Layer.provide([intlLayer, toastLayer]),
)

const viewLayers = Layer.mergeAll(Router.Default, intlLayer, toastLayer)
const provideLayers = Layer.mergeAll(
  commanderLayer,
  viewLayers,
  WithToast.Default.pipe(Layer.provide(toastLayer)),
  Confirm.Default.pipe(Layer.provide(intlLayer)),
)

export const {
  buildFormFromSchema,
  makeUseAndHandleMutation,
  useAndHandleMutation,
  useCommand,
  useQuery,
  useSafeMutation,
  useSafeMutationWithState,
  useSuspenseQuery,
} = makeClient(useRuntime, provideLayers)

// Glorious rpc client helpers
// TODO:
// - reusable; extract to lib
// - reduce duplication for Types

export type ToCamel<S extends string | number | symbol> = S extends string
  ? S extends `${infer Head}_${infer Tail}`
    ? `${Uncapitalize<Head>}${Capitalize<ToCamel<Tail>>}`
    : Uncapitalize<S>
  : never

const mapQuery = <M extends Requests>(
  client: RequestHandlers<never, never, Omit<M, "meta">>,
) => {
  const queries = Struct.keys(client).reduce(
    (acc, key) => {
      ;(acc as any)[camelCase(key) + "Query"] = useQuery(client[key] as any)
      ;(acc as any)[camelCase(key) + "SuspenseQuery"] = useSuspenseQuery(
        client[key] as any,
      )
      return acc
    },
    {} as {
      [Key in keyof typeof client as `${ToCamel<string & Key>}Query`]: (typeof client)[Key] extends RequestHandlerWithInput<
        infer I,
        infer A,
        infer E,
        infer _R,
        infer Request
      >
        ? ReturnType<typeof useQuery<I, E, A, Request>>
        : (typeof client)[Key] extends RequestHandler<
              infer A,
              infer E,
              infer _R,
              infer Request
            >
          ? ReturnType<typeof useQuery<E, A, Request>>
          : never
    } & {
      // todo: or suspense as an Option?
      [Key in keyof typeof client as `${ToCamel<string & Key>}SuspenseQuery`]: (typeof client)[Key] extends RequestHandlerWithInput<
        infer I,
        infer A,
        infer E,
        infer _R,
        infer Request
      >
        ? ReturnType<typeof useSuspenseQuery<I, E, A, Request>>
        : (typeof client)[Key] extends RequestHandler<
              infer A,
              infer E,
              infer _R,
              infer Request
            >
          ? ReturnType<typeof useSuspenseQuery<E, A, Request>>
          : never
    },
  )
  return queries
}

const mapMutation = <M extends Requests>(
  client: RequestHandlers<never, never, Omit<M, "meta">>,
) => {
  const mutations = Struct.keys(client).reduce(
    (acc, key) => {
      ;(acc as any)[camelCase(key) + "Mutation"] = useMutation(
        client[key] as any,
      )
      return acc
    },
    {} as {
      [Key in keyof typeof client as `${ToCamel<string & Key>}Mutation`]: (typeof client)[Key] extends RequestHandlerWithInput<
        infer I,
        infer A,
        infer E,
        infer R,
        infer Request
      >
        ? ReturnType<typeof useMutation<I, E, A, R, Request>>
        : (typeof client)[Key] extends RequestHandler<
              infer A,
              infer E,
              infer R,
              infer Request
            >
          ? ReturnType<typeof useMutation<E, A, R, Request>>
          : never
    },
  )
  return mutations
}

// make available .query, .suspense and .mutate for each operation
// and a .helpers with all mutations and queries
export const mapClient = <M extends Requests>(
  client: RequestHandlers<never, never, Omit<M, "meta">>,
) => {
  const extended = Struct.keys(client).reduce(
    (acc, key) => {
      ;(acc as any)[key] = {
        ...client[key],
        query: useQuery(client[key] as any),
        suspense: useSuspenseQuery(client[key] as any),
        mutate: useMutation(client[key] as any),
      }
      return acc
    },
    {} as {
      [Key in keyof typeof client]: (typeof client)[Key] & {
        query: (typeof client)[Key] extends RequestHandlerWithInput<
          infer I,
          infer A,
          infer E,
          infer _R,
          infer Request
        >
          ? ReturnType<typeof useQuery<I, E, A, Request>>
          : (typeof client)[Key] extends RequestHandler<
                infer A,
                infer E,
                infer _R,
                infer Request
              >
            ? ReturnType<typeof useQuery<E, A, Request>>
            : never
        // TODO or suspense as Option?
        suspense: (typeof client)[Key] extends RequestHandlerWithInput<
          infer I,
          infer A,
          infer E,
          infer _R,
          infer Request
        >
          ? ReturnType<typeof useSuspenseQuery<I, E, A, Request>>
          : (typeof client)[Key] extends RequestHandler<
                infer A,
                infer E,
                infer _R,
                infer Request
              >
            ? ReturnType<typeof useSuspenseQuery<E, A, Request>>
            : never
        mutate: (typeof client)[Key] extends RequestHandlerWithInput<
          infer I,
          infer A,
          infer E,
          infer R,
          infer Request
        >
          ? ReturnType<typeof useMutation<I, E, A, R, Request>>
          : (typeof client)[Key] extends RequestHandler<
                infer A,
                infer E,
                infer R,
                infer Request
              >
            ? ReturnType<typeof useMutation<E, A, R, Request>>
            : never
      }
    },
  )
  return Object.assign(extended, {
    helpers: { ...mapMutation(client), ...mapQuery(client) },
  })
}

export const clientFor = <M extends Requests>(m: M) =>
  useRuntime().runSync(clientFor_(m).pipe(Effect.map(mapClient)))
export const useOperationsClient = () => useRuntime().runSync(OperationsClient)
