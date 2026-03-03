import { Effect, Fiber, Layer, ManagedRuntime } from "effect"

export const basicLayer = Layer.empty

export const basicRuntime = ManagedRuntime.make(basicLayer)

export function runMain<A, E>(eff: Effect.Effect<A, E, never>) {
  const keepAlive = setInterval(() => {}, 2 ** 31 - 1)
  const fiber = Effect.runFork(eff)

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
    Fiber.interrupt(fiber).pipe(Effect.runFork)
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

export type RT = unknown
