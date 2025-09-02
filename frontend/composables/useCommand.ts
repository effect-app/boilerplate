/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Cause,
  Context,
  Effect,
  Option,
  flow,
  Match,
  S,
  pipe,
} from "effect-app"
import type * as Result from "@effect-atom/atom/Result"
import type { YieldWrap } from "effect/Utils"
import { runFork } from "./client"
import { asResult, reportRuntimeError } from "@effect-app/vue"
import { reportMessage } from "@effect-app/vue/errorReporter"
import { OperationFailure, OperationSuccess } from "effect-app/Operations"
import { InvalidStateError, SupportedErrors } from "effect-app/client"
import type { RT } from "./runtime"

// TODOS
// 1) rewrite withToast and errorReporter as combinators
// 2) proper Command definiton
// 3) various tests, here/on libs

export class CommandContext extends Context.Tag("CommandContext")<
  CommandContext,
  { action: string }
>() {}

namespace CommandDraft {
  export interface CommandDraft<
    Args extends ReadonlyArray<any>,
    // TODO: we may do not want to keep track of the original types of the handler
    AHandler,
    EHandler,
    RHandler,
    // TODO: we may do not want to keep track of the actual types of inner combinators
    ICs extends ((
      e: Effect.Effect<any, any, any>,
    ) => Effect.Effect<any, any, any>)[],
    // TODO: we may do not want to keep track of the actual types of outer combinators
    OCs extends ((
      e: Effect.Effect<any, any, any>,
    ) => Effect.Effect<any, any, any>)[],
    // we let the user add inner combinators until they add an outer combinator
    // because mixing inner and outer combinators can lead to too complex/unsafe type relationships
    mode extends "inner" | "outer" = "inner",
    // we really just need to keep track of the last inner and outer combinators' params
    $ALastIC = AHandler,
    $ELastIC = EHandler,
    $RLastIC = RHandler,
    $ALastOC = $ALastIC,
    $ELastOC = $ELastIC,
    $RLastOC = Exclude<$RLastIC, CommandContext>, // provided by the in between provideService
  > {
    actionName: string
    action: string
    handlerE: (...args: Args) => Effect.Effect<AHandler, EHandler, RHandler>
    innerCombinators: ICs
    outerCombinators: OCs
  }

  export function make<
    Args extends ReadonlyArray<any>,
    AHandler,
    EHandler,
    RHandler,
    ICs extends ((
      e: Effect.Effect<any, any, any>,
    ) => Effect.Effect<any, any, any>)[],
    OCs extends ((
      e: Effect.Effect<any, any, any>,
    ) => Effect.Effect<any, any, any>)[],
  >(cd: CommandDraft<Args, AHandler, EHandler, RHandler, ICs, OCs>) {
    return cd
  }

  export function addInnerCombinator<
    Args extends ReadonlyArray<any>,
    AHandler,
    EHandler,
    RHandler,
    ICs extends ((
      e: Effect.Effect<any, any, any>,
    ) => Effect.Effect<any, any, any>)[],
    OCs extends ((
      e: Effect.Effect<any, any, any>,
    ) => Effect.Effect<any, any, any>)[],
    ALastIC,
    ELastIC,
    RLastIC,
    ALastOC,
    ELastOC,
    RLastOC,
    AIC,
    EIC,
    RIC,
  >(
    cd: CommandDraft<
      Args,
      AHandler,
      EHandler,
      RHandler,
      ICs,
      OCs,
      "inner",
      ALastIC,
      ELastIC,
      RLastIC,
      ALastOC,
      ELastOC,
      RLastOC
    >,
    inner: (
      e: Effect.Effect<ALastIC, ELastIC, RLastIC>,
    ) => Effect.Effect<AIC, EIC, RIC>,
  ): CommandDraft<
    Args,
    AHandler,
    EHandler,
    RHandler,
    ICs,
    OCs,
    "inner",
    AIC,
    EIC,
    RIC,
    AIC,
    EIC,
    Exclude<RIC, CommandContext> // provided by the in between provideService
  > {
    return make({
      actionName: cd.actionName,
      action: cd.action,
      handlerE: cd.handlerE,
      innerCombinators: [...cd.innerCombinators, inner] as any,
      outerCombinators: cd.outerCombinators,
    })
  }

  export function addOuterCombinator<
    Args extends ReadonlyArray<any>,
    AHandler,
    EHandler,
    RHandler,
    ICs extends ((
      e: Effect.Effect<any, any, any>,
    ) => Effect.Effect<any, any, any>)[],
    OCs extends ((
      e: Effect.Effect<any, any, any>,
    ) => Effect.Effect<any, any, any>)[],
    ALastIC,
    ELastIC,
    RLastIC,
    ALastOC,
    ELastOC,
    RLastOC,
    AOC,
    EOC,
    ROC,
  >(
    cd: CommandDraft<
      Args,
      AHandler,
      EHandler,
      RHandler,
      ICs,
      OCs,
      "inner" | "outer",
      ALastIC,
      ELastIC,
      RLastIC,
      ALastOC,
      ELastOC,
      RLastOC
    >,
    outer: (
      e: Effect.Effect<ALastOC, ELastOC, RLastOC>,
    ) => Effect.Effect<AOC, EOC, ROC>,
  ): CommandDraft<
    Args,
    AHandler,
    EHandler,
    RHandler,
    ICs,
    OCs,
    "outer",
    ALastIC,
    ELastIC,
    RLastIC,
    AOC,
    EOC,
    ROC
  > {
    return make({
      actionName: cd.actionName,
      action: cd.action,
      handlerE: cd.handlerE,
      innerCombinators: cd.innerCombinators,
      outerCombinators: [...cd.outerCombinators, outer] as any,
    })
  }
}

// TODO: wip
export interface Command<A, Args extends ReadonlyArray<any>> {
  get: ComputedRef<{
    action: string
    result: Result.Result<void | A, never>
    waiting: boolean
  }>
  handler: (...a: Args) => Effect.Effect<void | A, never, never>
  set: (...args: Args) => void
}

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
    withDefaultToast: <A, E>(
      self: Effect.Effect<A, E, CommandContext>,
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
     * the Effects **only** have access to the `CommandContext` service, which contains the user-facing action name.
     * The function also has the following properties:
     * - action: The user-facing name of the action, as defined in the intl messages. Can be used e.g as Button label.
     * - result: The Result of the mutation
     * - waiting: Whether the mutation is currently in progress. (shorthand for .result.waiting). Can be used e.g as Button loading/disabled state.
     * Reporting status to the user is recommended to use the `withDefaultToast` helper, or render the .result inline
     */
    fnOld:
      (actionName: string) =>
      // TODO constrain/type combinators
      <
        Eff extends YieldWrap<Effect.Effect<any, any, CommandContext | RT>>,
        AEff,
        Args extends Array<any>,
        $WrappedEffectError = Eff extends YieldWrap<
          Effect.Effect<infer _, infer E, infer __>
        >
          ? E
          : never,
      >(
        fn: (...args: Args) => Generator<Eff, AEff, CommandContext | RT>,
        // TODO: combinators can freely take A, E, R and change it to whatever they want, as long as the end result Requires not more than CommandContext | RT
        ...combinators: ((
          e: Effect.Effect<AEff, $WrappedEffectError, CommandContext>,
        ) => Effect.Effect<AEff, $WrappedEffectError, CommandContext | RT>)[]
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

        // TODO: override span stack set by Effect.fn as it points here instead of to the caller of Command.fn.
        // perhaps copying Effect.fn implementation is better than using it?
        const handler = Effect.fn(actionName)(
          fn,
          ...(combinators as [any]),
          // all must be within the Effect.fn to fit within the Span
          Effect.provideService(CommandContext, context),
          _ => Effect.annotateCurrentSpan({ action }).pipe(Effect.zipRight(_)),
          errorReporter,
        ) as (...args: Args) => Effect.Effect<AEff, $WrappedEffectError, RT>

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

    fn:
      (actionName: string) =>
      <
        Args extends Array<any>,
        Eff extends YieldWrap<Effect.Effect<any, any, CommandContext | RT>>,
        AEff,
        $EEff = Eff extends YieldWrap<Effect.Effect<infer _, infer E, infer __>>
          ? E
          : never,
        $REff = Eff extends YieldWrap<Effect.Effect<infer _, infer __, infer R>>
          ? R
          : never,
      >(
        handler: (...args: Args) => Generator<Eff, AEff, CommandContext | RT>,
      ) => {
        const action = intl.value.formatMessage({
          id: `action.${actionName}`,
          defaultMessage: actionName,
        })

        const handlerE = Effect.fnUntraced(handler) as (
          ...args: Args
        ) => Effect.Effect<AEff, $EEff, $REff>

        return CommandDraft.make({
          actionName,
          action,
          handlerE,
          innerCombinators: [],
          outerCombinators: [],
        })
      },

    build: <Args extends ReadonlyArray<any>, A, E, R extends RT>(
      cd: CommandDraft.CommandDraft<
        Args,
        any,
        any,
        any,
        any,
        any,
        "inner" | "outer",
        any,
        any,
        any,
        A,
        E,
        R
      >,
    ) => {
      const context = { action: cd.action }

      const theHandler = pipe(
        cd.handlerE,
        ...(cd.innerCombinators as [any]),
        Effect.provideService(CommandContext, context),
        _ =>
          Effect.annotateCurrentSpan({ action: cd.action }).pipe(
            Effect.zipRight(_),
          ),
        ...(cd.outerCombinators as [any]),
        Effect.withSpan(cd.actionName),
      ) as any as (...args: Args) => Effect.Effect<A, E, R>

      const [result, mut] = asResult(theHandler)

      return computed(() =>
        Object.assign(
          flow(
            mut,
            runFork,
            _ => {},
          ) /* make sure always create a new one, or the state won't properly propagate */,
          {
            action: cd.action,
            result,
            waiting: result.value.waiting,
          },
        ),
      )
    },
  }
}

class MyTag extends Context.Tag("MyTag")<MyTag, { mytag: string }>() {}

const commandTest = CommandDraft.make({
  actionName: "actionName",
  action: "action",
  handlerE: Effect.fnUntraced(function* (str: string) {
    yield* MyTag
    yield* CommandContext

    if (str.length < 3) {
      return yield* new InvalidStateError("too short")
    } else {
      return [str.length, str] as const
    }
  }),
  innerCombinators: [],
  outerCombinators: [],
})

const addInnerCombinatorTest1 = CommandDraft.addInnerCombinator(
  commandTest,
  x =>
    x.pipe(
      Effect.catchTag("InvalidStateError", e =>
        Effect.succeed([-1 as number, e.message] as const),
      ),
    ),
)

const addInnerCombinatorTest2 = CommandDraft.addInnerCombinator(
  addInnerCombinatorTest1,
  x =>
    x.pipe(
      Effect.map(([f, s]) => f),
      Effect.provideService(MyTag, { mytag: "test" }),
    ),
)
