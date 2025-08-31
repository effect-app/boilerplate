/* eslint-disable @typescript-eslint/no-explicit-any */
import { Cause, Context, Effect, Option, flow, Match, S } from "effect-app"
import type { YieldWrap } from "effect/Utils"
import { runFork } from "./client"
import { asResult, reportRuntimeError } from "@effect-app/vue"
import { reportMessage } from "@effect-app/vue/errorReporter"
import { OperationFailure, OperationSuccess } from "effect-app/Operations"
import { SupportedErrors } from "effect-app/client"

export class CommandContext extends Context.Tag("CommandContext")<
  CommandContext,
  { action: string }
>() {}

export const useCommand = () => {
  const withToast = useWithToast()
  const { intl } = useIntl()

  return {
    /** Version of confirmOrInterrupt that automatically includes the action name in the default messages */
    confirmOrInterrupt: Effect.fnUntraced(function* (
      message: string | undefined = undefined,
    ) {
      const context = yield* CommandContext
      yield* confirmOrInterrupt(
        message ??
          intl.value.formatMessage(
            { id: "handle.confirmation" },
            { action: context.action },
          ),
      )
    }),
    /** Version of withDefaultToast that automatically includes the action name in the default messages and uses intl */
    withDefaultToast: <A, E, R>(
      self: Effect.Effect<A, E, R>,
      errorRenderer?: (e: E) => string | undefined, // undefined falls back to default?
    ) =>
      Effect.gen(function* () {
        const { action } = yield* CommandContext

        const defaultWarnMessage = intl.value.formatMessage(
          { id: "handle.with_warnings" },
          { action },
        )
        const defaultErrorMessage = intl.value.formatMessage(
          { id: "handle.with_errors" },
          { action },
        )
        function renderError(e: E): string {
          if (errorRenderer) {
            const m = errorRenderer(e)
            if (m) {
              return m
            }
          }
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
          const e2: SupportedErrors | S.ParseResult.ParseError = e
          return Match.value(e2).pipe(
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
                    error: "-", // TODO consider again Cause.pretty(cause), // will be reported to Sentry/Otel anyway..
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
    /**
     * Define a Command
     * @param actionName The internal name of the action. will be used as Span. will be used to lookup user facing name via intl. `action.${actionName}`
     * @returns A function that can be called to execute the mutation, like directly in a `@click` handler. Error reporting is built-in.
     * the Effects have access to the `CommandContext` service, which contains the user-facing action name.
     * The function also has the following properties:
     * - action: The user-facing name of the action, as defined in the intl messages. Can be used e.g as Button label.
     * - result: The Result of the mutation
     * - waiting: Whether the mutation is currently in progress. (shorthand for .result.waiting). Can be used e.g as Button loading/disabled state.
     * Reporting status to the user is recommended to use the `withDefaultToast` helper, or render the .result inline
     */
    fn:
      (actionName: string) =>
      // TODO constrain/type Args
      <
        Eff extends YieldWrap<Effect.Effect<any, any, any>>,
        AEff,
        Args extends Array<any>,
      >(
        fn: (...args: Args) => Generator<Eff, AEff, never>,
        ...args: any[] // TODO
      ) => {
        const action = intl.value.formatMessage({
          id: `action.${actionName}`,
          defaultMessage: actionName,
        })
        const context = { action }

        const errorReporter = <A, E, R>(self: Effect.Effect<A, E, R>) =>
          self.pipe(
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
          Effect.provideService(CommandContext, context),
          _ => Effect.annotateCurrentSpan({ action }).pipe(Effect.zipRight(_)),
          errorReporter,
        )

        const [result, mut] = asResult(handler)
        return computed(() =>
          Object.assign(
            flow(
              mut,
              runFork,
              _ => {},
            ) /* make sure always create a new one, or the state won't properly propagate */,
            {
              action,
              result,
              waiting: result.value.waiting,
            },
          ),
        )
      },
  }
}
