import { FakeSendgrid } from "@effect-app/infra/Emailer/fake"
import { Sendgrid } from "@effect-app/infra/Emailer/Sendgrid"
import { Operations } from "@effect-app/infra/Operations"
import { OperationsRepo } from "@effect-app/infra/OperationsRepo"
import { StoreMakerLayer } from "@effect-app/infra/Store/index"
import { NodeServices } from "@effect/platform-node"
import * as HttpClientNode from "@effect/platform-node/NodeHttpClient"
import * as HttpNode from "@effect/platform-node/NodeHttpServer"
import { Context, Effect, Layer, Option, Redacted } from "effect-app"
import { createServer } from "http"
import { apiConfig, baseConfig } from "../config.js"

export const RepoDefault = Effect
  .gen(function*() {
    const cfg = yield* apiConfig.storage
    return StoreMakerLayer(cfg)
  })
  .pipe(Layer.unwrap)

export const RepoTest = StoreMakerLayer({ url: Redacted.make("mem://"), prefix: "test_", dbName: "test" })

export const EmailerLive = Effect
  .gen(function*() {
    const cfg = yield* baseConfig.sendgrid
    return cfg.apiKey
      ? Sendgrid(cfg)
      : FakeSendgrid
  })
  .pipe(Layer.unwrap)

export const OperationsDefault = Operations.Live.pipe(
  Layer.provide(Layer.effect(OperationsRepo, OperationsRepo.make).pipe(Layer.provide(RepoTest)))
)

export const Platform = HttpClientNode.layerUndici

export const ApiPortTag = Context.Service<{ port: number }>("@services/ApiPortTag")

export const HttpServerLive = Effect
  .gen(function*() {
    let cfg = yield* apiConfig.server
    const portOverride = yield* Effect.serviceOption(ApiPortTag)
    if (Option.isSome(portOverride)) cfg = { ...cfg, port: portOverride.value.port }

    return HttpNode.layer(() => {
      const s = createServer()
      s.on("request", (req) => {
        if (req.url === "/events") {
          req.socket.setTimeout(0)
          req.socket.setNoDelay(true)
          req.socket.setKeepAlive(true)
        }
      })

      return s
    }, { port: cfg.port, host: cfg.host })
  })
  .pipe(
    Layer.unwrap,
    Layer.provide(NodeServices.layer)
  )
