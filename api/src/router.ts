/* eslint-disable @typescript-eslint/no-explicit-any */
import * as MW from "#api/lib/middleware"
import { RpcSerialization } from "@effect/rpc"
import { Console, Context, Effect, Layer } from "effect-app"
import { HttpMiddleware, HttpRouter, HttpServer } from "effect-app/http"
import { BaseConfig, MergedConfig } from "./config.js"
import { Events } from "./services.js"

const AllRoutes = HttpRouter
  .Default
  .use((router) =>
    Effect.gen(function*() {
      const cfg = yield* BaseConfig
      yield* router.get("/events", yield* MW.makeEvents)
      yield* router.get("/.well-known/local/server-health", MW.serverHealth(cfg.apiVersion))
    })
  )
  .pipe(Layer.provide([Events.Default]))

const logServer = Effect
  .gen(function*() {
    const cfg = yield* MergedConfig
    // using Console.log for vscode to know we're ready
    yield* Console.log(
      `Running on http://${cfg.host}:${cfg.port} at version: ${cfg.apiVersion}. ENV: ${cfg.env}`
    )
  })
  .pipe(Layer.effectDiscard)

export class Test extends Context.Reference<Test>()("test123", { defaultValue: () => "no" }) {}

export const makeHttpServer = <E, R>(
  router: Layer<never, E, R>
) =>
  logServer.pipe(
    Layer.provide(HttpRouter.Default.unwrap((root) =>
      root.pipe(
        Effect.provideService(Test, "yes"),
        MW.RequestContextMiddleware(),
        MW.gzip,
        MW.cors(),
        // we trust proxy and handle the x-forwarded etc headers
        HttpMiddleware.xForwardedHeaders,
        HttpServer.serve(HttpMiddleware.logger)
      )
    )),
    Layer.provide(router),
    Layer.provide(AllRoutes),
    Layer.provide(RpcSerialization.layerJson),
    Layer.provide(Layer.succeed(Test, "1"))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  )
