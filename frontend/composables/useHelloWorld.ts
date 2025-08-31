import { HelloWorldRsc } from "#resources"
import type { QueryObserverOptionsCustom, WatchSource } from "@effect-app/vue"
import { type InitialDataFunction } from "@tanstack/vue-query"
import {
  Context,
  Effect,
  type S,
  type Request,
  type Schema,
  Option,
  flow,
} from "effect-app"
import type { YieldWrap } from "effect/Utils"
import { runFork } from "./client"

export class MutationContext extends Context.Tag("MutationContext")<
  MutationContext,
  { action: string }
>() {}

export const useMutation = () => {
  const withToast = useWithToast()
  return {
    /** Version of confirmOrInterrupt that automatically includes the action name in the default messages */
    confirmOrInterrupt: Effect.fnUntraced(function* (
      message: string | undefined = undefined,
    ) {
      const mutationContext = yield* MutationContext
      // TODO: i18n
      yield* confirmOrInterrupt(
        message ?? `${mutationContext.action} - Sind sie Sicher?`,
      )
    }),
    /** Version of withDefaultToast that automatically includes the action name in the default messages */
    withDefaultToast: <A, E, R>(self: Effect.Effect<A, E, R>) =>
      Effect.gen(function* () {
        const mutationContext = yield* MutationContext
        // TODO: i18n
        return yield* self.pipe(
          withToast({
            onWaiting: `${mutationContext.action} ladet..`,
            onSuccess: `${mutationContext.action} komplett`,
            onFailure: err =>
              `${mutationContext.action} fehler: ${Option.getOrElse(err, () => "Unbekannt")}`,
          }),
        )
      }),
    fn:
      (actionName: string) =>
      // TODO
      <
        Eff extends YieldWrap<Effect.Effect<any, any, any>>,
        AEff,
        Args extends Array<any>,
      >(
        fn: (...args: Args) => Generator<Eff, AEff, never>,
        ...args: any[] // TODO
      ) => {
        const action = actionName // TODO: translate t(actionName)
        const mutationContext = { action }
        const handler = Effect.fn(actionName)(
          fn,
          ...args,
          Effect.provideService(MutationContext, mutationContext),
        ) // todo; args
        const [result, mut] = useSafeMutation({
          handler,
          name: action,
          // That's so that you can do a constructor input with the mutation :/
          Request: null as any /* TODO */,
        })
        return computed(() =>
          Object.assign(mut, fn, {
            action,
            result,
            mutate: flow(mut, runFork, _ => {}),
            waiting: result.value.waiting,
          }),
        )
      },
  }
}

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
