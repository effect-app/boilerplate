import {
  Cause,
  Context,
  type Exit,
  Effect,
  Option,
  flow,
  Match,
  S,
} from "effect-app"
import type { YieldWrap } from "effect/Utils"
import { runFork } from "./client"
import { asResult, reportRuntimeError } from "@effect-app/vue"
import { reportMessage } from "@effect-app/vue/errorReporter"
import { OperationFailure, OperationSuccess } from "effect-app/Operations"
import { SupportedErrors } from "effect-app/client"

export class MutationContext extends Context.Tag("MutationContext")<
  MutationContext,
  { action: string }
>() {}

export interface MessageOpts<
  A,
  E,
  I = void,
  A2 = A,
  E2 = E,
  ESuccess = never,
  RSuccess = never,
  EError = never,
  RError = never,
  EDefect = never,
  RDefect = never,
> {
  /** set to `undefined` to use default message */
  successMessage?:
    | ((a: A2, i: I) => Effect.Effect<string | undefined, ESuccess, RSuccess>)
    | undefined
  /** set to `undefined` to use default message */
  failMessage?:
    | ((e: E2, i: I) => Effect.Effect<string | undefined, EError, RError>)
    | undefined
  /** set to `undefined` to use default message */
  defectMessage?:
    | ((
        e: Cause.Cause<E2>,
        i: I,
      ) => Effect.Effect<string | undefined, EDefect, RDefect>)
    | undefined
}

export const useMutation = () => {
  const withToast = useWithToast()
  const { intl } = useIntl()

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
    /** Version of withDefaultToast that automatically includes the action name in the default messages and uses intl */
    withDefaultToast: <A, E, R>(self: Effect.Effect<A, E, R>) =>
      Effect.gen(function* () {
        const { action } = yield* MutationContext

        const defaultWarnMessage = intl.value.formatMessage(
          { id: "handle.with_warnings" },
          { action },
        )
        const defaultErrorMessage = intl.value.formatMessage(
          { id: "handle.with_errors" },
          { action },
        )
        function renderError(e: unknown): string {
          if (!S.is(SupportedErrors)(e) && !S.ParseResult.isParseError(e)) {
            if (typeof e === "object" && e !== null) {
              if ("message" in e) {
                return `${e.message}`
              }
              if ("_tag" in e) {
                return `${e._tag}`
              }
            }
            return ""
          }
          return Match.value(e).pipe(
            Match.tags({
              ParseError: e => {
                console.warn(e.toString())
                return intl.value.formatMessage({ id: "validation.failed" })
              },
            }),
            Match.orElse(e => `${e.message ?? e._tag ?? e}`),
          )
        }

        return yield* self.pipe(
          withToast({
            onWaiting: intl.value.formatMessage(
              { id: "handle.waiting" },
              { action },
            ),
            onSuccess: a =>
              intl.value.formatMessage({ id: "handle.success" }, { action }) +
              (S.is(OperationSuccess)(a) && a.message ? "\n" + a.message : ""),
            onFailure: Option.match({
              onNone: () =>
                intl.value.formatMessage(
                  { id: "handle.unexpected_error" },
                  {
                    action,
                    error: "-", // TODO Cause.pretty(cause), // will be reported to Sentry/Otel anyway..
                  },
                ),
              onSome: e =>
                S.is(OperationFailure)(e)
                  ? {
                      level: "warn",
                      message:
                        defaultWarnMessage + e.message ? "\n" + e.message : "",
                    }
                  : `${defaultErrorMessage}:\n` + renderError(e),
            }),
          }),
        )
      }),
    fn:
      (actionName: string) =>
      // TODO constrain Args
      // TODO constrain final result type to have never E, and Exit<A,E> in A.
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

        const errorReporter = <A, E, R, E2>(
          self: Effect.Effect<Exit.Exit<A, E>, E2, R>,
        ) =>
          self.pipe(
            Effect.flatten,
            Effect.catchAllCause(
              Effect.fnUntraced(function* (cause) {
                if (Cause.isInterruptedOnly(cause)) {
                  console.info(`Interrupted while trying to ${actionName}`)
                  return
                }

                const fail = Cause.failureOption(cause)
                if (Option.isSome(fail)) {
                  // if (fail.value._tag === "SuppressErrors") {
                  //   console.info(
                  //     `Suppressed error trying to ${action}`,
                  //     fail.value,
                  //   )
                  //   return
                  // }
                  const message = `Failure trying to ${actionName}`
                  yield* reportMessage(message, {
                    action: actionName,
                    error: fail.value,
                  })
                  return
                }

                const extra = {
                  action,
                  message: `Unexpected Error trying to ${actionName}`,
                }
                yield* reportRuntimeError(cause, extra)
              }),
            ),
          )

        const handler = Effect.fn(actionName)(
          fn,
          ...args,
          Effect.provideService(MutationContext, mutationContext),
          _ => Effect.annotateCurrentSpan({ action }).pipe(Effect.zipRight(_)),
          errorReporter,
        ) // todo; args

        const [result, mut] = asResult(i => handler(i).pipe(Effect.flatten)) // flatten only because we expect already Exit<A,E> in fn/args.
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
