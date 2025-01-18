/* eslint-disable @typescript-eslint/no-explicit-any */
import * as MW from "#api/lib/middleware"
import { Console, Effect, Layer } from "effect-app"
import { HttpMiddleware, HttpRouter, HttpServer } from "effect-app/http"
import { BaseConfig, MergedConfig } from "./config.js"
import { Events } from "./Events.js"

class RootAppRouter extends HttpRouter.Tag("RootAppRouter")<RootAppRouter>() {}
const AllRoutes = RootAppRouter
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

export const makeHttpServer = <E, R, E3, R3>(
  router: { layer: Layer<never, E, R>; Router: HttpRouter.HttpRouter.TagClass<any, any, E3, R3> }
) =>
  logServer.pipe(
    Layer.provide(
      RootAppRouter.unwrap((root) =>
        router.Router.unwrap((app) =>
          HttpRouter.concat(root, app).pipe(
            MW.RequestContextMiddleware(),
            MW.gzip,
            MW.cors(),
            // we trust proxy and handle the x-forwarded etc headers
            HttpMiddleware.xForwardedHeaders,
            HttpServer.serve(HttpMiddleware.logger)
          )
        )
      )
    ),
    Layer.provide(router.layer),
    Layer.provide(AllRoutes)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  )
