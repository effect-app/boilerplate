import { Effect, Fiber, Layer, ManagedRuntime } from "effect"

// Minimal v4 setup - defer runtime initialization
export const basicLayer = Layer.empty

export const basicRuntime = ManagedRuntime.make(basicLayer)

const runMainPlatform = (effect: Effect.Effect<unknown, unknown, never>) => {
  const keepAlive = setInterval(() => {}, 2 ** 31 - 1)
  const fiber = Effect.runFork(effect)

  let signaled = !import.meta.hot

  fiber.addObserver((exit) => {
    clearInterval(keepAlive)
    if (signaled) {
      process.exit(exit._tag === "Failure" ? 1 : 0)
    }
  })

  function onSigint() {
    signaled = true
    process.removeListener("SIGINT", onSigint)
    process.removeListener("SIGTERM", onSigint)
    Effect.runFork(Fiber.interrupt(fiber))
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

export function runMain<A, E>(eff: Effect.Effect<A, E, never>) {
  return runMainPlatform(eff)
}

export type RT = never
