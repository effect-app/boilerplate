import { reportError } from "@effect-app/infra/errorReporter"
import { logJson } from "@effect-app/infra/logger/jsonLogger"
import { NodeFileSystem } from "@effect/platform-node"
import * as Sentry from "@sentry/node"
import dotenv from "dotenv"
import { Cause, Console, Effect, Fiber, Layer, ManagedRuntime, pipe, References } from "effect-app"
import * as ConfigProvider from "effect/ConfigProvider"
import * as Logger from "effect/Logger"
import type * as LogLevel from "effect/LogLevel"
import type { ManagedRuntime as ManagedRuntimeType } from "effect/ManagedRuntime"
import * as Runtime from "effect/Runtime"
import { DevTools } from "effect/unstable/devtools"
import { TracingLive } from "./observability.js"

const envProviderConstantCase = ConfigProvider.fromEnv().pipe(ConfigProvider.constantCase)
const baseConfigProvider = ConfigProvider.layer(envProviderConstantCase)

const levels: Record<string, LogLevel.LogLevel> = {
  Trace: "Trace",
  Debug: "Debug",
  Info: "Info",
  Warning: "Warn",
  Error: "Error"
}

const handleDotEnv = Effect.gen(function*() {
  const envFile = "./.env.local"

  const { error } = dotenv.config({ path: envFile })
  if (error) {
    console.log("did not load .env.local")
  } else {
    console.log("loading env from: " + envFile)
  }
})

const configProvider = baseConfigProvider.pipe(
  Layer.provide(Layer.effectDiscard(handleDotEnv))
)

const logLayers = Effect
  .gen(function*() {
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

    const addDevLog = Logger.layer([devLog], { mergeWithExisting: true }).pipe(Layer.provide(NodeFileSystem.layer))
    const log = configuredEnv && configuredEnv !== "local-dev"
      ? logJson
      : process.env["NO_CONSOLE_LOG"]
      ? Layer.mergeAll(
        Logger.layer([]),
        addDevLog
      )
      : Layer.mergeAll(
        Logger.layer([Logger.consolePretty()]),
        addDevLog
      )
    return Layer.succeed(References.MinimumLogLevel, logLevel).pipe(Layer.merge(log))
  })
  .pipe(Layer.unwrap)

const devTools = Effect
  .sync(() => pipe(process.env["DT"] ? DevTools.layer() : Layer.empty, Layer.provideMerge(TracingLive)))
  .pipe(Layer.unwrap)

export const basicLayer = logLayers.pipe(
  Layer.provideMerge(devTools),
  Layer.provideMerge(configProvider)
)

export const basicRuntime = ManagedRuntime.make(basicLayer)
const services = await basicRuntime.context()

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
        Effect.provideContext(services),
        Effect.ensuring(basicRuntime.disposeEffect),
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
