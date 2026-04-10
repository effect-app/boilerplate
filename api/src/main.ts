import { faker } from "@faker-js/faker"
import { Effect, Layer } from "effect-app"
import { setFaker } from "effect-app/faker"
import { api } from "./api.js"
import { MergedConfig } from "./config.js"
import { runMain } from "./lib/basicRuntime.js"
import { AppLogger } from "./lib/logger.js"

setFaker(faker)
const logConfig = Effect.gen(function*() {
  const cfg = yield* MergedConfig
  yield* AppLogger.logInfo(`Config: ${JSON.stringify(cfg, undefined, 2)}`)
})

const program = api
  .pipe(
    Layer.provide(logConfig.pipe(Layer.effectDiscard))
  )

// NOTE: all dependencies should have been provided, for us to be able to run the program.
// if you get a type error here on the R argument, you haven't provided that dependency yet, or not at the appropriate time / location
runMain(Layer.launch(program))
