/* eslint-disable @typescript-eslint/no-explicit-any */
import * as MW from "#lib/middleware"
import { Events } from "#services"
import { reportError } from "@effect-app/infra/errorReporter"
import { RpcSerialization } from "@effect/rpc"
import { FiberRef, flow } from "effect"
import { Console, Effect, Layer } from "effect-app"
import { HttpLayerRouter, HttpMiddleware } from "effect-app/http"
import { BaseConfig, MergedConfig } from "./config.js"

const prodOrigins: string[] = []
const demoOrigins: string[] = []

const localOrigins = [
  "http://localhost:4000"
]

const CORSMiddleware = Effect
  .gen(function*() {
    const { env } = yield* BaseConfig

    return HttpLayerRouter.middleware(
      flow(
        MW.cors({
          allowedOrigins: env === "demo"
            ? (origin) => demoOrigins.includes(origin)
            : env === "prod"
            ? prodOrigins
            : localOrigins
        })
      ),
      // CORS has to be global to respond to OPTIONS
      { global: true }
    )
  })
  .pipe(Layer.unwrapEffect)

const GZIPMiddleware = HttpLayerRouter.middleware(MW.gzip)
const ForwardedHeadersMiddleware = HttpLayerRouter.middleware(HttpMiddleware.xForwardedHeaders)

// const authTokenFromCookie = Effect
//   .gen(function*() {
//     const secret = yield* authConfig
//     return HttpLayerRouter.middleware(MW.authTokenFromCookie(secret)).layer
//   })
//   .pipe(Layer.unwrapEffect)

const RequestContextMiddleware = HttpLayerRouter.middleware()(MW.RequestContextMiddleware())

const HealthRoute = HttpLayerRouter
  .use(
    Effect.fnUntraced(function*(router) {
      const cfg = yield* BaseConfig

      // NO authtoken/requestcontext middleware!
      yield* router.add(
        "GET",
        "/.well-known/local/server-health",
        MW
          .serverHealth(cfg.apiVersion)
          .pipe(Effect.tapErrorCause(reportError("server-health error")))
      )
    })
  )

const MainMiddleware = [
  GZIPMiddleware.layer,
  CORSMiddleware,
  ForwardedHeadersMiddleware.layer,
  RequestContextMiddleware.layer
  // authTokenFromCookie
] as const

const EventsRoute = HttpLayerRouter
  .use(
    Effect.fnUntraced(function*(router) {
      const handleEvents = yield* MW.makeEvents

      yield* router.add(
        "GET",
        "/events",
        handleEvents.pipe(Effect.tapErrorCause(reportError("events error")))
      )
    })
  )
  .pipe(Layer.provide([Events.Default, ...MainMiddleware]))

const RootRoutes = Layer.mergeAll(
  HealthRoute,
  EventsRoute
)

const logServer = Effect
  .gen(function*() {
    const cfg = yield* MergedConfig
    // using Console.log for vscode to know we're ready
    yield* Console.log(
      `Running on http://${cfg.host}:${cfg.port} at version: ${cfg.apiVersion}. ENV: ${cfg.env}`
    )
  })
  .pipe(Layer.effectDiscard)

const ConfigureTracer = Layer.effectDiscard(
  FiberRef.set(
    HttpMiddleware.currentTracerDisabledWhen,
    (r) => r.method === "OPTIONS" || r.url === "/.well-known/local/server-health"
  )
)
export const makeHttpServer = <E, R>(
  rpcRouter: Layer<never, E, R>
) =>
  HttpLayerRouter.serve(
    logServer.pipe(
      Layer.provide([
        rpcRouter.pipe(Layer.provide(MainMiddleware)),
        RootRoutes
      ]),
      Layer.provide(RpcSerialization.layerJson),
      Layer.provide(ConfigureTracer)
    ),
    { middleware: HttpMiddleware.logger }
  )
