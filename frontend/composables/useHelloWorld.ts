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

// please note, this is all super verbose atm because we haven't adjusted the query and mutation helpers yet!
export const useHelloWorld = () => {
  const client = clientFor(HelloWorldRsc)

  // temp
  type A = S.Schema.Type<(typeof HelloWorldRsc.GetHelloWorld)["success"]>
  type E = S.Schema.Type<(typeof HelloWorldRsc.GetHelloWorld)["failure"]>

  return {
    // TODO: make a curry version of `useSafeSuspenseQuery` so we can just `useSafeSuspenseQuery(client.GetHelloWorld)`
    getHelloWorld: (
      arg:
        | Omit<HelloWorldRsc.GetHelloWorld, Cruft>
        | WatchSource<Omit<HelloWorldRsc.GetHelloWorld, Cruft>>,
      options?: QueryObserverOptionsCustom<A, E> & {
        initialData: A | InitialDataFunction<A>
      },
    ) => useSafeSuspenseQuery(client.GetHelloWorld, arg, options),

    // TODO: make a curry version of `useAndHandleMutation`, so we can just `useAndHandleMutation(client.SetState)`
    // we should then also share state...
    // todo: fix types
    setStateMutation: <
      Eff extends YieldWrap<Effect.Effect<any, SupportedErrors, never>>,
      AEff,
    >(
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
      useAndHandleMutation(client.SetState, options?.action ?? "Set State", {
        mapHandler: Effect.fnUntraced(mapHandler),
        ...options,
      }),
  }
}

// temp
type Cruft = // what it really just is is Constructor type of Schema

    | "_tag"
    | Request.RequestTypeId
    | typeof Schema.symbolSerializable
    | typeof Schema.symbolWithResult
