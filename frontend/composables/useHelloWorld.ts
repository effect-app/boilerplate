import { HelloWorldRsc } from "#resources"
import type { SetState } from "#resources/HelloWorld"
import type {
  MutationOptions,
  QueryObserverOptionsCustom,
  WatchSource,
} from "@effect-app/vue"
import type { InitialDataFunction } from "@tanstack/vue-query"
import { Effect, type S, type Request, type Schema } from "effect-app"
import type { SupportedErrors, UnauthorizedError } from "effect-app/client"
import type { YieldWrap } from "effect/Utils"
import { runFork, useAndHandleMutationResult } from "./client"



// please note, this is all super verbose atm because we haven't adjusted the query and mutation helpers yet!
export const useHelloWorld = () => {
  const client = clientFor(HelloWorldRsc)

  // temp
  type A = S.Schema.Type<(typeof HelloWorldRsc.GetHelloWorld)["success"]>
  type E = S.Schema.Type<(typeof HelloWorldRsc.GetHelloWorld)["failure"]>
  const api = client.SetState
  const setStateMutation = Object.assign(
    <Eff extends YieldWrap<Effect.Effect<any, SupportedErrors, never>>, AEff>(
      mapHandler: (
        handler: Effect.Effect<void, SupportedErrors, never>,
        input: Omit<HelloWorldRsc.SetState, Cruft>,
      ) => Generator<Eff, AEff, never>,
      options?: Omit<
        MutationOptions<
          void,
          UnauthorizedError,
          never,
          void,
          UnauthorizedError,
          never,
          Omit<SetState, Cruft>
        >,
        "mapHandler"
      > & { action?: string },
    ) =>
      useAndHandleMutationResult(api, options?.action ?? "Set State", {
        mapHandler: Effect.fnUntraced(mapHandler),
        ...options,
      }),
    {
      with: <
        Args extends readonly any[],
        Eff extends YieldWrap<Effect.Effect<any, SupportedErrors, never>>,
        AEff,
      >(
        _mapHandler: (
          handler: (
            i: Omit<HelloWorldRsc.SetState, Cruft>,
          ) => Effect.Effect<void, SupportedErrors, never>,
        ) => (...args: Args) => Generator<Eff, AEff, never>,
        options?: Omit<
          MutationOptions<
            void,
            UnauthorizedError,
            never,
            void,
            UnauthorizedError,
            never,
            Omit<SetState, Cruft>
          >,
          "mapHandler"
        > & { action?: string },
      ) => {
        // todo: instead of using `mapHandler` before calling useAndHandleMutationResult
        // we should make a new useAndHandleMutationResult and build it in natively as replacement to `options: { mapHandler }`
        // as right now we only wrap the api handler, and not also the query invalidating. while if you want to navigate, you should invalidate queries...
        // although, perhaps invalidating queries simply should be an async operation?
        const [result, mutate] = useAndHandleMutationResult(
          mapHandler(api, handler => Effect.fn(api.name)(_mapHandler(handler))), // todo: the span should be set with the stacktrace pointing towards where this function was called from!
          options?.action ?? "Set State",
          options,
        )

        return computed(() =>
          Object.assign((...args: Args) => mutate(...args), {
            action: mutate.action,
            mutate: (...args: Args) => {
              runFork(mutate(...args)) // it's good that error handling is done by `useAndHandleMutationResult`
            }, // like Atom we could add an optional options: { mode: "value" | "promise" | "promiseExit" } changing the return type from `void` to `Promise<A> (with flattenExit - squash throw), or `Promise<Exit<A, E>>`
            //}),
            result: result.value,
            waiting: result.value.waiting,
          }),
        )
      },
    },
  )

  return {
    // TODO: make a curry version of `useSafeSuspenseQuery` so we can just `useSafeSuspenseQuery(client.GetHelloWorld)`
    getHelloWorldQuery: Object.assign(
      (
        arg:
          | Omit<HelloWorldRsc.GetHelloWorld, Cruft>
          | WatchSource<Omit<HelloWorldRsc.GetHelloWorld, Cruft>>,
        options?: QueryObserverOptionsCustom<A, E> & {
          initialData: A | InitialDataFunction<A>
        },
      ) =>
        useSafeSuspenseQuery(client.GetHelloWorld, arg, options).pipe(
          Effect.map(([result, refresh]) =>
            computed(() => ({ result: result.value, refresh })),
          ),
        ),
      {
        query: (
          arg:
            | Omit<HelloWorldRsc.GetHelloWorld, Cruft>
            | WatchSource<Omit<HelloWorldRsc.GetHelloWorld, Cruft>>,
          options?: QueryObserverOptionsCustom<A, E> & {
            initialData: A | InitialDataFunction<A>
          },
        ) =>
          run(
            useSafeSuspenseQuery(client.GetHelloWorld, arg, options).pipe(
              Effect.map(([result, refresh]) =>
                computed(() => ({ result: result.value, refresh })),
              ),
            ),
          ),
      },
    ),

    // TODO: make a curry version of `useAndHandleMutationResult`, so we can just `useAndHandleMutationResult(client.SetState)`
    // we should then also share state...
    // todo: fix types
    setStateMutation,
  }
}

// temp
type Cruft = // what it really just is is Constructor type of Schema

    | "_tag"
    | Request.RequestTypeId
    | typeof Schema.symbolSerializable
    | typeof Schema.symbolWithResult
