import { HelloWorldRsc } from "#resources"
import type { QueryObserverOptionsCustom, WatchSource } from "@effect-app/vue"
import { type InitialDataFunction } from "@tanstack/vue-query"
import { Effect, type S, type Request, type Schema } from "effect-app"

// please note, this is all super verbose atm because we haven't adjusted the query and mutation helpers yet!
export const useHelloWorld = () => {
  const client = clientFor(HelloWorldRsc)

  // temp
  type A = S.Schema.Type<(typeof HelloWorldRsc.GetHelloWorld)["success"]>
  type E = S.Schema.Type<(typeof HelloWorldRsc.GetHelloWorld)["failure"]>
  const api = client.SetState

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
    setStateMutation: api.handler,
  }
}

// temp
type Cruft = // what it really just is is Constructor type of Schema

    | "_tag"
    | Request.RequestTypeId
    | typeof Schema.symbolSerializable
    | typeof Schema.symbolWithResult
