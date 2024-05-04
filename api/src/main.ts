import { basicLayer, basicRuntime, reportMainError } from "./lib/basicRuntime.js"

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { RunMain } from "@effect/platform/Runtime"
import { defaultTeardown } from "@effect/platform/Runtime"
import { faker } from "@faker-js/faker"
import { api } from "api/api.js"
import { Cause, Effect, Fiber, Layer, pipe } from "effect-app"
import { setFaker } from "effect-app/faker"
import { MergedConfig } from "./config.js"
import { TracingLive } from "./observability.js"
import * as DevTools from "@effect/experimental/DevTools"

const runMainPlatform: RunMain = (
  effect,
  options
) => {
  const teardown = options?.teardown ?? defaultTeardown
  const keepAlive = setInterval(() => {}, 2 ** 31 - 1)

  const fiber = Effect.runFork(
    options?.disableErrorReporting === true
      ? effect
      : Effect.tapErrorCause(effect, (cause) => {
        if (Cause.isInterruptedOnly(cause)) {
          return Effect.void
        }
        return Effect.logError(cause)
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
}

function runMain<A, E>(eff: Effect<A, E, never>) {
  return runMainPlatform(
    eff
      .pipe(
        Effect.tapErrorCause(reportMainError),
        Effect.provide(basicLayer)
      )
  )
}

setFaker(faker)
const logConfig = pipe(
  MergedConfig,
  Effect.andThen((cfg) => console.debug(`Config: ${JSON.stringify(cfg, undefined, 2)}`))
)

const program = api
  .pipe(
    Layer.provide(logConfig.pipe(Layer.scopedDiscard)),
    Layer.provide(process.env["DT"] ? DevTools.layer() : Layer.empty),
    Layer.provideMerge(TracingLive)
  )

// NOTE: all dependencies should have been provided, for us to be able to run the program.
// if you get a type error here on the R argument, you haven't provided that dependency yet, or not at the appropriate time / location
runMain(Layer.launch(program))
