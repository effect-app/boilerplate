/* eslint-disable @typescript-eslint/no-explicit-any */
import * as MW from "#lib/middleware"
import { Events } from "#services"
import { reportError } from "@effect-app/infra/errorReporter"
import { flow } from "effect"
import { Config, Console, Effect, Layer } from "effect-app"
import { HttpMiddleware, HttpRouter } from "effect-app/http"
import { RpcSerialization } from "effect/unstable/rpc"
import { apiConfig, baseConfig } from "./config.js"

const prodOrigins: string[] = []
const demoOrigins: string[] = []

const CORSMiddleware = Effect
  .gen(function*() {
    const env = yield* baseConfig.env

    return HttpRouter.middleware(
      flow(
        MW.cors({
          allowedOrigins: env === "demo"
            ? (origin) => demoOrigins.includes(origin)
            : env === "prod"
            ? prodOrigins
            : () => true,
          credentials: true
        })
      ),
      // CORS has to be global to respond to OPTIONS
      { global: true }
    )
  })
  .pipe(Layer.unwrap)

const GZIPMiddleware = HttpRouter.middleware(MW.gzip)
const ForwardedHeadersMiddleware = HttpRouter.middleware(HttpMiddleware.xForwardedHeaders)

const RequestContextMiddleware = HttpRouter.middleware(MW.RequestContextMiddleware())

const HealthRoute = HttpRouter
  .use(
    Effect.fnUntraced(function*(router) {
      const cfg = yield* baseConfig.apiVersion

      // NO authtoken/requestcontext middleware!
      yield* router.add(
        "GET",
        "/.well-known/local/server-health",
        MW
          .serverHealth(cfg)
          .pipe(Effect.tapCause(reportError("server-health error")))
      )
    })
  )

const MainMiddleware = Layer.mergeAll(
  GZIPMiddleware.layer,
  CORSMiddleware,
  ForwardedHeadersMiddleware.layer,
  RequestContextMiddleware.layer
)

const EventsRoute = HttpRouter
  .use(
    Effect.fnUntraced(function*(router) {
      const handleEvents = yield* MW.makeEvents

      yield* router.add(
        "GET",
        "/events",
        handleEvents.pipe(Effect.tapCause((cause) => reportError("events error")(cause)))
      )
    })
  )
  .pipe(Layer.provide([Events.Default, MainMiddleware]))

const RootRoutes = Layer.mergeAll(
  HealthRoute,
  EventsRoute
)

const logServer = Effect
  .gen(function*() {
    const cfg = yield* Config.all({ server: apiConfig.server, apiVersion: baseConfig.apiVersion, env: baseConfig.env })
    // using Console.log for vscode to know we're ready
    yield* Console.log(
      `Running on http://${cfg.server.host}:${cfg.server.port} at version: ${cfg.apiVersion}. ENV: ${cfg.env}`
    )
  })
  .pipe(Layer.effectDiscard)

const ConfigureTracer = HttpMiddleware.layerTracerDisabledForUrls(["/.well-known/local/server-health"])

export const makeHttpServer = <E, R>(
  rpcRouter: Layer.Layer<never, E, R>
) =>
  HttpRouter
    .serve(
      logServer.pipe(
        Layer.provide([
          rpcRouter.pipe(Layer.provide(MainMiddleware)),
          RootRoutes
        ]),
        Layer.provide(RpcSerialization.layerNdjson)
      ),
      { middleware: HttpMiddleware.logger }
    )
    .pipe(Layer.provide(ConfigureTracer))
