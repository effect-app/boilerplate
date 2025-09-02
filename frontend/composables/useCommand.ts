/* eslint-disable unused-imports/no-unused-vars */
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
import { runFork } from "./client"
import { asResult, reportRuntimeError } from "@effect-app/vue"
import { reportMessage } from "@effect-app/vue/errorReporter"
import { OperationFailure, OperationSuccess } from "effect-app/Operations"
import { InvalidStateError, SupportedErrors } from "effect-app/client"
import type { RT } from "./runtime"
import type { Covariant } from "effect/Types"
import { dual } from "effect/Function"
import type { YieldWrap } from "effect/Utils"

/**
 * Command system for building type-safe, composable mutation handlers with built-in error reporting and state management.
 *
 * This module provides a fluent API for creating commands that can be executed directly in click handlers.
 * Commands support inner and outer combinators for customizing behavior, automatic error reporting,
 * toast notifications, and state tracking.
 *
 * @example
 * ```ts
 * const cmd = useCommand()
 *
 * const deleteUser = pipe(
 *   cmd.fn("deleteUser")(function* (userId: string) {
 *     return yield* userService.delete(userId)
 *   }),
 *   cmd.withDefaultToast(),
 *   CommandDraft.build
 * )
 *
 * // Usage in component
 * <button @click="deleteUser('123')" :disabled="deleteUser.waiting">
 *   {{ deleteUser.action }}
 * </button>
 * ```
 */

// TODOS
// 2) proper Command definiton instead of nested refs merged with updater fn

/**
 * Context service that provides the user-facing action name to command effects.
 * This context is automatically provided during command execution and contains
 * the internationalized action name.
 *
 * @example
 * ```ts
 * function* myCommandEffect() {
 *   const { action } = yield* CommandContext
 *   console.log(`Executing ${action}`)
 * }
 * ```
 */
export class CommandContext extends Context.Tag("CommandContext")<
  CommandContext,
  { action: string }
>() {}

/**
 * Namespace containing the command draft system for building composable commands.
 *
 * The CommandDraft system provides a type-safe, fluent API for building commands
 * with inner and outer combinators. Commands are built in stages:
 * 1. Create initial draft with handler
 * 2. Add inner combinators (run inside the command context)
 * 3. Add outer combinators (run outside the command context)
 * 4. Build final command
 */
export namespace CommandDraft {
  /**
   * Represents a command in draft state that can be composed with combinators.
   *
   * @template Args - The arguments array type for the command handler
   * @template ALastIC - Return type of the last inner combinator
   * @template ELastIC - Error type of the last inner combinator
   * @template RLastIC - Requirements type of the last inner combinator
   * @template ALastOC - Return type of the last outer combinator
   * @template ELastOC - Error type of the last outer combinator
   * @template RLastOC - Requirements type of the last outer combinator
   * @template mode - Whether the draft is in "inner" or "outer" combinator mode
   */
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

  /**
   * Creates a properly typed CommandDraft from the provided configuration.
   * This function primarily serves to ensure proper type inference.
   *
   * @template Args - The arguments array type for the command handler
   * @template AHandler - Return type of the handler effect
   * @template EHandler - Error type of the handler effect
   * @template RHandler - Requirements type of the handler effect
   * @param cd - The command draft configuration
   * @returns A properly typed CommandDraft
   */
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

  /**
   * Adds an inner combinator to the command draft. Inner combinators run after the handler
   * but before outer combinators, and have access to the CommandContext service.
   *
   * Inner combinators are executed in FIFO order - the last added combinator runs last.
   * Inner combinators cannot be added after outer combinators have been added.
   *
   * @param inner - The inner combinator function that transforms the effect
   * @param cd - The command draft in "inner" mode
   * @returns A new command draft with the inner combinator added
   *
   * @example
   * ```ts
   * const draft = pipe(
   *   myDraft,
   *   CommandDraft.withCombinator(effect =>
   *     effect.pipe(Effect.map(result => result.toUpperCase()))
   *   )
   * )
   * ```
   */
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

  /**
   * Adds an outer combinator to the command draft. Outer combinators run after all inner
   * combinators and do not have access to the CommandContext service.
   *
   * Outer combinators are executed in FIFO order - the last added combinator runs last.
   * Once an outer combinator is added, the draft switches to "outer" mode and no more
   * inner combinators can be added.
   *
   * @param outer - The outer combinator function that transforms the effect
   * @param cd - The command draft in "inner" or "outer" mode
   * @returns A new command draft in "outer" mode with the outer combinator added
   *
   * @example
   * ```ts
   * const draft = pipe(
   *   myDraft,
   *   CommandDraft.withOuterCombinator(effect =>
   *     effect.pipe(Effect.timeout(5000))
   *   )
   * )
   * ```
   */
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

  /**
   * Adds automatic error reporting to the command draft. This outer combinator
   * catches all failures and reports them through the application's error reporting system.
   *
   * Handles different types of errors:
   * - Interruptions: Logged as info
   * - Known failures: Reported with action context
   * - Runtime errors: Reported with full error details
   *
   * @param cd - The command draft to add error reporting to
   * @returns A new command draft with error reporting added as an outer combinator
   *
   * @example
   * ```ts
   * const draft = pipe(
   *   myDraft,
   *   CommandDraft.withErrorReporter
   * )
   * ```
   */
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

  /**
   * Builds the final command from a draft without adding default error reporting.
   * Use this when you want to handle errors manually or have already added custom error handling.
   *
   * The built command returns a computed ref containing:
   * - A function that executes the command when called
   * - action: The internationalized action name
   * - result: The result state of the command execution
   * - waiting: Boolean indicating if the command is currently executing
   *
   * @template Args - The arguments array type for the command handler
   * @template RLastOC - Requirements type (must extend RT - no other dependencies allowed)
   * @param cd - The command draft to build (can be in "inner" or "outer" mode)
   * @returns A computed ref with the executable command and its state
   *
   * @example
   * ```ts
   * const myCommand = pipe(
   *   myDraft,
   *   CommandDraft.buildWithoutDefaultErrorReporter
   * )
   *
   * // Usage
   * const cmd = myCommand.value
   * cmd("argument") // Execute command
   * cmd.waiting // Check if executing
   * ```
   */
  export const buildWithoutDefaultErrorReporter = <
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

  /**
   * Builds the final command from a draft with default error reporting included.
   * This is the most common way to build commands as it automatically adds error reporting.
   *
   * Equivalent to: `pipe(cd, withErrorReporter, buildWithoutDefaultErrorReporter)`
   *
   * The built command returns a computed ref containing:
   * - A function that executes the command when called
   * - action: The internationalized action name
   * - result: The result state of the command execution
   * - waiting: Boolean indicating if the command is currently executing
   *
   * @template Args - The arguments array type for the command handler
   * @template RLastOC - Requirements type (must extend RT - no other dependencies allowed)
   * @param cd - The command draft to build (can be in "inner" or "outer" mode)
   * @returns A computed ref with the executable command and its state
   *
   * @example
   * ```ts
   * const deleteUser = pipe(
   *   cmd.fn("deleteUser")(function* (userId: string) {
   *     return yield* userService.delete(userId)
   *   }),
   *   CommandDraft.build
   * )
   *
   * // Usage in component
   * <button @click="deleteUser('123')" :disabled="deleteUser.waiting">
   *   {{ deleteUser.action }}
   * </button>
   * ```
   */
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
  ) => pipe(cd, withErrorReporter, buildWithoutDefaultErrorReporter)
}

// TODO: wip
export interface CommandI<A, Args extends ReadonlyArray<any>> {
  get: ComputedRef<{
    action: string
    result: Result.Result<void | A, never>
    waiting: boolean
  }>
  set: (...args: Args) => void
}

/**
 * Composable that provides command creation utilities with internationalization and toast integration.
 *
 * Returns an object containing:
 * - fn: Creates a new command draft from an action name and handler
 * - withDefaultToast: Adds automatic toast notifications to commands
 * - confirmOrInterrupt: Utility for confirmation dialogs within commands
 *
 * The returned utilities automatically integrate with the application's i18n system
 * and toast notification system.
 *
 * @returns Command creation utilities with i18n and toast integration
 *
 * @example
 * ```ts
 * const cmd = useCommand()
 *
 * const saveData = pipe(
 *   cmd.fn("saveData")(function* (data: SaveRequest) {
 *     return yield* dataService.save(data)
 *   }),
 *   cmd.withDefaultToast(),
 *   CommandDraft.build
 * )
 * ```
 */
export const useCommand = () => {
  const withToast = useWithToast()
  const { intl } = useIntl()

  // fn and withDefaultToast depend on intl and withToast
  // so I keep their definitions here

  /**
   * Creates a new command draft from an action name and handler function.
   *
   * The action name is used for:
   * - Span naming in tracing
   * - Looking up the internationalized action name via `action.${actionName}` key
   *
   * @param actionName - The internal action name for tracing and i18n lookup
   * @returns A curried function that accepts a generator handler and returns a CommandDraft
   *
   * @example
   * ```ts
   * const cmd = useCommand()
   *
   * const deleteUser = cmd.fn("deleteUser")(function* (userId: string) {
   *   const { action } = yield* CommandContext
   *   console.log(`Executing: ${action}`)
   *   return yield* userService.delete(userId)
   * })
   * ```
   */
  const fn =
    (actionName: string) =>
    <
      Args extends Array<any>,
      Eff extends YieldWrap<Effect.Effect<any, any, any>>,
      AEff,
      $EEff = Eff extends YieldWrap<Effect.Effect<infer _, infer E, infer __>>
        ? E
        : never,
      $REff = Eff extends YieldWrap<Effect.Effect<infer _, infer __, infer R>>
        ? R
        : never,
    >(
      handler: (...args: Args) => Generator<Eff, AEff, any>,
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

  /**
   * Adds automatic toast notifications to a command draft for success, failure, and waiting states.
   *
   * Provides default internationalized messages for:
   * - Waiting state: Shows "Processing {action}..." message
   * - Success state: Shows "Success: {action}" with optional operation message
   * - Failure state: Shows appropriate error message based on error type
   *
   * @param errorRenderer - Optional custom error renderer function. Return undefined to use default rendering.
   * @returns A function that accepts a CommandDraft and returns it with toast notifications added
   *
   * @example
   * ```ts
   * const cmd = useCommand()
   *
   * const saveUser = pipe(
   *   cmd.fn("saveUser")(function* (user: User) {
   *     return yield* userService.save(user)
   *   }),
   *   cmd.withDefaultToast((error) => {
   *     if (error._tag === "ValidationError") return "Please check your input"
   *     return undefined // Use default error rendering
   *   }),
   *   CommandDraft.build
   * )
   * ```
   */
  const withDefaultToast = <
    Args extends ReadonlyArray<any>,
    ALastIC,
    ELastIC,
    RLastIC,
    ALastOC,
    ELastOC,
    RLastOC,
  >(
    errorRenderer?: (e: ELastIC) => string | undefined, // undefined falls back to default?
  ) => {
    return (
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
    ) =>
      CommandDraft.withCombinator(
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
                (S.is(OperationSuccess)(a) && a.message
                  ? "\n" + a.message
                  : ""),
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
                          defaultWarnMessage + e.message
                            ? "\n" + e.message
                            : "",
                      }
                    : `${defaultErrorMessage}:\n` + renderError(e),
              }),
            }),
          )
        }),
      )
  }

  return {
    /**
     * Utility for showing confirmation dialogs within command effects.
     * Automatically includes the action name in default confirmation messages.
     *
     * Can be used within command handlers to request user confirmation before
     * proceeding with potentially destructive operations. Uses the CommandContext
     * to access the current action name for messaging.
     *
     * @param message - Optional custom confirmation message. If not provided, uses default i18n message.
     * @yields The confirmation dialog effect
     * @throws Interrupts the command if user cancels
     *
     * @example
     * ```ts
     * const cmd = useCommand()
     *
     * const deleteUser = cmd.fn("deleteUser")(function* (userId: string) {
     *   yield* cmd.confirmOrInterrupt("Are you sure you want to delete this user?")
     *   return yield* userService.delete(userId)
     * })
     * ```
     */
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
    withDefaultToast,
    fn,
  }
}

class MyTag extends Context.Tag("MyTag")<MyTag, { mytag: string }>() {}
class MyTag2 extends Context.Tag("MyTag2")<MyTag2, { mytag2: string }>() {}

// useCommand().build(addOuterCombinatorTest1Fail)
// useCommand().build(addOuterCombinatorTest1Ok)

// const addInnerCombinatorTestFail = Command.withCombinator(
//   addOuterCombinatorTest1Ok,
//   x => x,
// )

const pipeTest1 = pipe(
  CommandDraft.make({
    actionName: "actionName",
    action: "action",
    handlerE: Effect.fnUntraced(function* ({ some: str }: { some: string }) {
      yield* MyTag
      yield* CommandContext

      // won't build at the end of the pipeline because it is not provided
      // yield* MyTag2

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
        MyTag.pipe(Effect.andThen(service => ({ tag: service.mytag, n }))),
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
    self.pipe(Effect.provideService(MyTag, { mytag: "outer" })),
  ),
  CommandDraft.buildWithoutDefaultErrorReporter,
)

const Cmd = useCommand()

const pipeTest2 = pipe(
  Cmd.fn("actionName")(function* ({ some: str }: { some: string }) {
    yield* MyTag
    yield* CommandContext

    // won't build at the end of the pipeline because it is not provided
    // yield* MyTag2

    if (str.length < 3) {
      return yield* new InvalidStateError("too short")
    } else {
      return [str.length, str] as const
    }
  }),
  CommandDraft.withCombinator(self =>
    self.pipe(
      Effect.provideService(MyTag, { mytag: "inner" }),
      Effect.catchTag("InvalidStateError", e =>
        Effect.succeed([-1 as number, e.message] as const),
      ),
    ),
  ),
  Cmd.withDefaultToast(),
  CommandDraft.build,
)
