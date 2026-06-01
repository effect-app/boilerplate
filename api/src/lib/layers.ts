import { FakeSendgrid } from "@effect-app/infra/Emailer/fake"
import { Sendgrid } from "@effect-app/infra/Emailer/Sendgrid"
import { StoreMakerLayer } from "@effect-app/infra/Store/index"
import * as HttpClientNode from "@effect/platform-node/NodeHttpClient"
import * as HttpNode from "@effect/platform-node/NodeHttpServer"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient"
import * as Context from "effect-app/Context"
import * as Effect from "effect-app/Effect"
import * as Layer from "effect-app/Layer"
import * as Option from "effect-app/Option"
import * as Redacted from "effect/Redacted"
import fs from "fs"
import { createServer } from "http"

import { apiConfig, baseConfig } from "../config.ts"

const ClientLive = SqliteClient
  .layer({
    filename: "./.data/db.db"
  })
  .pipe(Layer.provide(
    Effect
      .gen(function*() {
        const path = "./.data"
        if (!fs.existsSync(path)) {
          fs.mkdirSync(path)
        }
      })
      .pipe(Layer.effectDiscard)
  ))

export const RepoDefault = Effect
  .gen(function*() {
    const cfg = yield* apiConfig.storage
    return StoreMakerLayer(cfg).pipe(Layer.provide(ClientLive))
  })
  .pipe(Layer.unwrap)

export const RepoTest = StoreMakerLayer({ url: Redacted.make("mem://"), prefix: "test_", dbName: "test" }).pipe(
  Layer.provide(ClientLive)
)

export const EmailerLive = Effect
  .gen(function*() {
    const cfg = yield* baseConfig.sendgrid
    return cfg.apiKey
      ? Sendgrid(cfg)
      : FakeSendgrid
  })
  .pipe(Layer.unwrap)

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
