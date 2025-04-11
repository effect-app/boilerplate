import { AppLogger } from "#api/lib/logger"
import { reportError } from "@effect-app/infra/errorReporter"
import { logJson } from "@effect-app/infra/logger/jsonLogger"
import { PlatformLogger } from "@effect/platform"
import { NodeFileSystem } from "@effect/platform-node"
import { defaultTeardown, type RunMain, type Teardown } from "@effect/platform/Runtime"
import * as Sentry from "@sentry/node"
import { constantCase } from "change-case"
import { Cause, Console, Effect, Fiber, Layer, ManagedRuntime } from "effect-app"
import { dual } from "effect-app/Function"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Logger from "effect/Logger"
import * as Level from "effect/LogLevel"
import type * as Runtime from "effect/Runtime"

const envProviderConstantCase = ConfigProvider.mapInputPath(
  ConfigProvider.fromEnv({
    pathDelim: "_", // i'd prefer "__"
    seqDelim: ","
  }),
  constantCase
)

const levels = {
  [Level.Trace.label]: Level.Trace,
  [Level.Debug.label]: Level.Debug,
  [Level.Info.label]: Level.Info,
  [Level.Warning.label]: Level.Warning,
  [Level.Error.label]: Level.Error
}

const configuredLogLevel = process.env["LOG_LEVEL"]
const configuredEnv = process.env["ENV"]

const logLevel = configuredLogLevel
  ? levels[configuredLogLevel]
  : configuredEnv && configuredEnv === "prod"
  ? Level.Info
  : Level.Debug
if (!logLevel) throw new Error(`Invalid LOG_LEVEL: ${configuredLogLevel}`)

const devLog = Logger
  .withSpanAnnotations(Logger.logfmtLogger)
  .pipe(
    PlatformLogger.toFile("./dev.log")
  )

const addDevLog = Logger.addScoped(devLog).pipe(Layer.provide(NodeFileSystem.layer))

export const basicLayer = Layer.mergeAll(
  Logger.minimumLogLevel(logLevel),
  Effect
    .sync(() =>
      configuredEnv && configuredEnv !== "local-dev"
        ? logJson
        : process.env["NO_CONSOLE_LOG"]
        ? Layer.mergeAll(
          Logger.remove(Logger.defaultLogger),
          addDevLog
        )
        : Layer.mergeAll(
          Logger.replace(Logger.defaultLogger, Logger.withSpanAnnotations(Logger.prettyLogger())),
          addDevLog
        )
    )
    .pipe(Layer.unwrapEffect),
  Layer.setConfigProvider(envProviderConstantCase)
)

export const basicRuntime = ManagedRuntime.make(basicLayer)
await basicRuntime.runtime()

const reportMainError = <E>(cause: Cause.Cause<E>) =>
  Cause.isInterruptedOnly(cause) ? Effect.void : reportError("Main")(cause)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const runMainPlatform: RunMain = dual((args) => Effect.isEffect(args[0]), (effect: Effect.Effect<any, any>, options?: {
  readonly disableErrorReporting?: boolean | undefined
  readonly disablePrettyLogger?: boolean | undefined
  readonly teardown?: Teardown | undefined
}) => {
  const teardown = options?.teardown ?? defaultTeardown
  const keepAlive = setInterval(() => {}, 2 ** 31 - 1)

  const fiber = Effect.runFork(
    options?.disableErrorReporting === true
      ? effect
      : Effect.tapErrorCause(effect, (cause) => {
        if (Cause.isInterruptedOnly(cause)) {
          return Effect.void
        }
        return AppLogger.logError(cause)
      })
  )

  let signaled = !import.meta.hot

  fiber.addObserver((exit) => {
    clearInterval(keepAlive)
    teardown(exit, (code) => {
      if (signaled) process.exit(code)
    })
  })

  function onSigint() {
    signaled = true
    process.removeListener("SIGINT", onSigint)
    process.removeListener("SIGTERM", onSigint)
    fiber.unsafeInterruptAsFork(fiber.id())
  }

  process.once("SIGINT", onSigint)
  process.once("SIGTERM", onSigint)

  if (import.meta.hot) {
    import.meta.hot.accept(async () => {})
    import.meta.hot.dispose(async () => {
      await basicRuntime.runPromise(Fiber.interrupt(fiber))
    })
  }
})

export function runMain<A, E>(eff: Effect<A, E, never>, filterReport?: (cause: Cause.Cause<E>) => boolean) {
  return runMainPlatform(
    eff
      .pipe(
        Effect.tapErrorCause((cause) => !filterReport || filterReport(cause) ? reportMainError(cause) : Effect.void),
        Effect.ensuring(basicRuntime.disposeEffect),
        Effect.provide(basicLayer),
        Effect.ensuring(
          Effect
            .andThen(
              Console.log("Flushing Sentry"),
              Effect.promise(() => Sentry.flush(15_000)).pipe(Effect.flatMap((_) => Console.log("Sentry flushed", _)))
            )
        )
      ),
    { disablePrettyLogger: true, disableErrorReporting: true }
  )
}

export type RT = typeof basicRuntime.runtime extends Runtime.Runtime<infer R> ? R : never
