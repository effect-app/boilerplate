import { reportError } from "@effect-app/infra/errorReporter"
import { logJson } from "@effect-app/infra/logger/jsonLogger"
import { NodeFileSystem } from "@effect/platform-node"
import * as Sentry from "@sentry/node"
import { Cause, Console, Effect, Fiber, Layer, ManagedRuntime, References } from "effect-app"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Logger from "effect/Logger"
import type * as LogLevel from "effect/LogLevel"
import type { ManagedRuntime as ManagedRuntimeType } from "effect/ManagedRuntime"
import * as Runtime from "effect/Runtime"

const envProviderConstantCase = ConfigProvider.fromEnv().pipe(ConfigProvider.constantCase)

const levels: Record<string, LogLevel.LogLevel> = {
  Trace: "Trace",
  Debug: "Debug",
  Info: "Info",
  Warning: "Warn",
  Error: "Error"
}

const configuredLogLevel = process.env["LOG_LEVEL"]
const configuredEnv = process.env["ENV"]

const logLevel: LogLevel.LogLevel = configuredLogLevel
  ? levels[configuredLogLevel] ?? (() => {
    throw new Error(`Invalid LOG_LEVEL: ${configuredLogLevel}`)
  })()
  : configuredEnv && configuredEnv === "prod"
  ? "Info"
  : "Debug"

const devLog = Logger.formatLogFmt.pipe(
  Logger.toFile("./dev.log")
)

export const basicLayer = Layer
  .mergeAll(
    Layer.succeed(References.MinimumLogLevel, logLevel),
    Effect
      .sync(() =>
        configuredEnv && configuredEnv !== "local-dev"
          ? logJson
          : process.env["NO_CONSOLE_LOG"]
          ? Logger.layer([devLog])
          : Logger.layer([Logger.consolePretty(), devLog])
      )
      .pipe(Layer.unwrap),
    ConfigProvider.layer(envProviderConstantCase)
  )
  .pipe(Layer.provide(NodeFileSystem.layer))

export const basicRuntime = ManagedRuntime.make(basicLayer)
await basicRuntime.services()

const reportMainError = <E>(cause: Cause.Cause<E>) =>
  Cause.hasInterruptsOnly(cause) ? Effect.void : reportError("Main")(cause)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const runMainPlatform = Runtime.makeRunMain(({ fiber, teardown }) => {
  let signaled = !import.meta.hot

  fiber.addObserver((exit) => {
    teardown(exit, (code) => {
      if (signaled) process.exit(code)
    })
  })

  function onSigint() {
    signaled = true
    process.removeListener("SIGINT", onSigint)
    process.removeListener("SIGTERM", onSigint)
    fiber.interruptUnsafe(fiber.id)
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

export function runMain<A, E>(eff: Effect.Effect<A, E, never>, filterReport?: (cause: Cause.Cause<E>) => boolean) {
  return runMainPlatform(
    eff
      .pipe(
        Effect.tapCause((cause) => !filterReport || filterReport(cause) ? reportMainError(cause) : Effect.void),
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
    { disableErrorReporting: true }
  )
}

export type RT = ManagedRuntimeType.Services<typeof basicRuntime>
