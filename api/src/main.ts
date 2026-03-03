import { faker } from "@faker-js/faker"
import { Effect, Layer } from "effect-app"
import { setFaker } from "effect-app/faker"
import { DevTools } from "effect/unstable/devtools"
import { api } from "./api.js"
import { MergedConfig } from "./config.js"
import { runMain } from "./lib/basicRuntime.js"
import { AppLogger } from "./lib/logger.js"
import { TracingLive } from "./lib/observability.js"

setFaker(faker)
const logConfig = Effect.gen(function*() {
  const cfg = yield* MergedConfig
  yield* AppLogger.logInfo(`Config: ${JSON.stringify(cfg, undefined, 2)}`)
})

const program = api
  .pipe(
    Layer.provide(logConfig.pipe(Layer.effectDiscard)),
    Layer.provide(process.env["DT"] ? DevTools.layer() : Layer.empty),
    Layer.provideMerge(TracingLive)
  )

runMain(Layer.launch(program))
