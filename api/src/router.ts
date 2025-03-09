/* eslint-disable @typescript-eslint/no-explicit-any */
import * as MW from "#api/lib/middleware"
import { Console, Context, Effect, FiberRef, flow, Layer } from "effect-app"
import { HttpMiddleware, HttpRouter, HttpServer } from "effect-app/http"
import { BaseConfig, MergedConfig } from "./config.js"
import { Events } from "./services.js"
import { RpcSerialization } from "@effect/rpc"

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

  export const Test = Context.GenericTag("test123")
  export const Test2 = FiberRef.unsafeMake("no")

export const makeHttpServer = <E, R, E3, R3>(
  router: Layer<never, E, R>
) =>
  logServer.pipe(
    Layer.provide(HttpRouter.Default.serve(flow(
      Effect.provideService(Test, "yes"), Effect.locally(Test2, "yes"),
                  MW.RequestContextMiddleware(),
            MW.gzip,
            MW.cors(),
            HttpMiddleware.logger,
            // we trust proxy and handle the x-forwarded etc headers
            HttpMiddleware.xForwardedHeaders,
            Effect.withSpan("http")
    )
    )),
    // Layer.provide(
    //   RootAppRouter.unwrap((root) =>
    //       root.pipe(
    //         // TODO: how to get these to activate for the rpc routes?
    //         MW.RequestContextMiddleware(),
    //         MW.gzip,
    //         MW.cors(),
    //         // we trust proxy and handle the x-forwarded etc headers
    //         HttpMiddleware.xForwardedHeaders,
    //         HttpServer.serve(HttpMiddleware.logger)
    //       )
    //     )
    // ),
    Layer.provide(router),
    //Layer.provide(AllRoutes),
    Layer.provide(RpcSerialization.layerJson),
    Layer.provide(Layer.succeed(Test, "no"))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  )
