import { Context, Effect, Option, flow } from "effect-app"
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
        return computed(() => ({
          action,
          result,
          mutate: flow(mut, runFork, _ => {}),
          mutation: handler,
          waiting: result.value.waiting,
        }))
      },
  }
}
