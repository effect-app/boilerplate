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
import type { Covariant } from "effect/Types"
import { dual } from "effect/Function"

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

// TODOS
// 2) proper Command definiton
// 3) various tests, here/on libs

export class CommandContext extends Context.Tag("CommandContext")<
  CommandContext,
  { action: string }
>() {}

namespace CommandDraft {
  export interface CommandDraft<
    Args extends ReadonlyArray<any>,
    // we really just need to keep track of the last inner and outer combinators' params
    ALastIC,
    ELastIC,
    RLastIC,
    ALastOC = ALastIC,
    ELastOC = ELastIC,
    RLastOC = Exclude<RLastIC, CommandContext>, // provided by the in between provideService
    // we let the user add inner combinators until they add an outer combinator
    // because mixing inner and outer combinators can lead to too complex/unsafe type relationships
    mode extends "inner" | "outer" = "inner",
  > {
    actionName: string
    action: string
    handlerE: (...args: Args) => Effect.Effect<any, any, any>
    innerCombinators: ((
      e: Effect.Effect<any, any, any>,
    ) => Effect.Effect<any, any, any>)[]
    outerCombinators: ((
      e: Effect.Effect<any, any, any>,
    ) => Effect.Effect<any, any, any>)[]

    ALastIC?: Covariant<ALastIC>
    ELastIC?: Covariant<ELastIC>
    RLastIC?: Covariant<RLastIC>
    ALastOC?: Covariant<ALastOC>
    ELastOC?: Covariant<ELastOC>
    RLastOC?: Covariant<RLastOC>
    mode?: Covariant<mode>
  }

  export const make = <
    Args extends ReadonlyArray<any>,
    AHandler,
    EHandler,
    RHandler,
  >(
    cd: CommandDraft<Args, AHandler, EHandler, RHandler> & {
      // so that AHandler, EHandler, RHandler gets properly inferred
      handlerE: (...args: Args) => Effect.Effect<AHandler, EHandler, RHandler>
    },
  ): CommandDraft<Args, AHandler, EHandler, RHandler> => {
    return cd
  }

  // add a new inner combinators which runs after the last inner combinator
  export const withCombinator = dual<
    <
      Args extends ReadonlyArray<any>,
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
      inner: (
        e: Effect.Effect<ALastIC, ELastIC, RLastIC>,
      ) => Effect.Effect<AIC, EIC, RIC>,
    ) => (
      cd: CommandDraft<
        Args,
        ALastIC,
        ELastIC,
        RLastIC,
        ALastOC,
        ELastOC,
        RLastOC,
        "inner" // <-- cannot add inner combinators after having added an outer combinator
      >,
    ) => CommandDraft<
      Args,
      AIC,
      EIC,
      RIC,
      AIC,
      EIC,
      Exclude<RIC, CommandContext>, // provided by the in between provideService
      "inner"
    >,
    <
      Args extends ReadonlyArray<any>,
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
        ALastIC,
        ELastIC,
        RLastIC,
        ALastOC,
        ELastOC,
        RLastOC,
        "inner" // <-- cannot add inner combinators after having added an outer combinator
      >,
      inner: (
        e: Effect.Effect<ALastIC, ELastIC, RLastIC>,
      ) => Effect.Effect<AIC, EIC, RIC>,
    ) => CommandDraft<
      Args,
      AIC,
      EIC,
      RIC,
      AIC,
      EIC,
      Exclude<RIC, CommandContext>, // provided by the in between provideService
      "inner"
    >
  >(2, (cd, inner) =>
    make({
      actionName: cd.actionName,
      action: cd.action,
      handlerE: cd.handlerE,
      innerCombinators: [...cd.innerCombinators, inner] as any,
      outerCombinators: cd.outerCombinators,
    }),
  )

  // will add a new outer combinator which runs after all the inner combinators and
  // after the last outer combinator
  export const withOuterCombinator = dual<
    <
      Args extends ReadonlyArray<any>,
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
      outer: (
        e: Effect.Effect<ALastOC, ELastOC, RLastOC>,
      ) => Effect.Effect<AOC, EOC, ROC>,
    ) => (
      cd: CommandDraft<
        Args,
        ALastIC,
        ELastIC,
        RLastIC,
        ALastOC,
        ELastOC,
        RLastOC,
        "inner" | "outer" // <-- whatever input is fine...
      >,
      // ...but "outer" mode is forced as output
    ) => CommandDraft<Args, ALastIC, ELastIC, RLastIC, AOC, EOC, ROC, "outer">,
    <
      Args extends ReadonlyArray<any>,
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
        ALastIC,
        ELastIC,
        RLastIC,
        ALastOC,
        ELastOC,
        RLastOC,
        "inner" | "outer" // <-- whatever input is fine...
      >,
      outer: (
        e: Effect.Effect<ALastOC, ELastOC, RLastOC>,
      ) => Effect.Effect<AOC, EOC, ROC>,
      // ...but "outer" mode is forced as output
    ) => CommandDraft<Args, ALastIC, ELastIC, RLastIC, AOC, EOC, ROC, "outer">
  >(
    2,
    (cd, outer) =>
      make({
        actionName: cd.actionName,
        action: cd.action,
        handlerE: cd.handlerE,
        innerCombinators: cd.innerCombinators,
        outerCombinators: [...cd.outerCombinators, outer] as any,
      }) as any,
  )

  export const withErrorReporter = <
    Args extends ReadonlyArray<any>,
    ALastIC,
    ELastIC,
    RLastIC,
    ALastOC,
    ELastOC,
    RLastOC,
  >(
    cd: CommandDraft<
      Args,
      ALastIC,
      ELastIC,
      RLastIC,
      ALastOC,
      ELastOC,
      RLastOC,
      "inner" | "outer"
    >,
  ) => {
    return withOuterCombinator(cd, self =>
      self.pipe(
        Effect.catchAllCause(
          Effect.fnUntraced(function* (cause) {
            if (Cause.isInterruptedOnly(cause)) {
              console.info(`Interrupted while trying to ${cd.actionName}`)
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
              const message = `Failure trying to ${cd.actionName}`
              yield* reportMessage(message, {
                action: cd.actionName,
                error: fail.value,
              })
              return
            }

            const extra = {
              action: cd.action,
              message: `Unexpected Error trying to ${cd.actionName}`,
            }
            yield* reportRuntimeError(cause, extra)
          }),
        ),
      ),
    )
  }

  export const buildWithoutErrorReporter = <
    Args extends ReadonlyArray<any>,
    ALastIC,
    ELastIC,
    RLastIC,
    ALastOC,
    ELastOC,
    RLastOC extends RT, // no other dependencies are allowed
  >(
    cd: CommandDraft<
      Args,
      ALastIC,
      ELastIC,
      RLastIC,
      ALastOC,
      ELastOC,
      RLastOC,
      "inner" | "outer" // <-- both can be built
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
    ) as any as (...args: Args) => Effect.Effect<ALastOC, ELastOC, RLastOC>

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
  }

  export const build = <
    Args extends ReadonlyArray<any>,
    ALastIC,
    ELastIC,
    RLastIC,
    ALastOC,
    ELastOC,
    RLastOC extends RT, // no other dependencies are allowed
  >(
    cd: CommandDraft<
      Args,
      ALastIC,
      ELastIC,
      RLastIC,
      ALastOC,
      ELastOC,
      RLastOC,
      "inner" | "outer" // <-- both can be built
    >,
  ) => pipe(cd, withErrorReporter, buildWithoutErrorReporter)
}

// TODO: wip
export interface CommandI<A, Args extends ReadonlyArray<any>> {
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

  const fn =
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
    }

  const withDefaultToast = <
    Args extends ReadonlyArray<any>,
    ALastIC,
    ELastIC,
    RLastIC,
    ALastOC,
    ELastOC,
    RLastOC,
  >(
    cd: CommandDraft.CommandDraft<
      Args,
      ALastIC,
      ELastIC,
      RLastIC,
      ALastOC,
      ELastOC,
      RLastOC,
      "inner"
    >,
    errorRenderer?: (e: ELastIC) => string | undefined, // undefined falls back to default?
  ) => {
    return CommandDraft.withCombinator(
      cd,
      Effect.fn(function* (self) {
        const { action } = cd

        const defaultWarnMessage = intl.value.formatMessage(
          { id: "handle.with_warnings" },
          { action },
        )
        const defaultErrorMessage = intl.value.formatMessage(
          { id: "handle.with_errors" },
          { action },
        )
        function renderError(e: ELastIC): string {
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
    )
  }

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
    withDefaultToast,
    fn,
  }
}

class MyTag extends Context.Tag("MyTag")<MyTag, { mytag: string }>() {}

// useCommand().build(addOuterCombinatorTest1Fail)
// useCommand().build(addOuterCombinatorTest1Ok)

// const addInnerCombinatorTestFail = Command.withCombinator(
//   addOuterCombinatorTest1Ok,
//   x => x,
// )

const pipeTest = pipe(
  CommandDraft.make({
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
  }),
  CommandDraft.withCombinator(self =>
    self.pipe(
      Effect.catchTag("InvalidStateError", e =>
        Effect.succeed([-1 as number, e.message] as const),
      ),
    ),
  ),
  CommandDraft.withCombinator(self =>
    self.pipe(
      Effect.map(([f]) => f),
      Effect.provideService(MyTag, { mytag: "inner" }),
    ),
  ),
  CommandDraft.withOuterCombinator(self =>
    self.pipe(
      Effect.andThen(n =>
        MyTag.pipe(Effect.andThen(service => service.mytag + n)),
      ),
    ),
  ),
  // fail because you cannot add inner combinators after outer combinators
  //
  // Command.withCombinator(self =>
  //   self.pipe(
  //     Effect.map(([f]) => f),
  //     Effect.provideService(MyTag, { mytag: "test" }),
  //   ),
  // ),
  CommandDraft.withErrorReporter,
  //
  // fail because MyTag has not been provided
  // CommandDraft.build,
  //
  CommandDraft.withOuterCombinator(self =>
    self.pipe(Effect.provideService(MyTag, { mytag: "outern" })),
  ),
  CommandDraft.build,
)
