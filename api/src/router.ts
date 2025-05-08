/* eslint-disable @typescript-eslint/no-explicit-any */
import * as MW from "#lib/middleware"
import { Events } from "#services"
import { Router } from "@effect-app/infra/api/routing"
import { reportError } from "@effect-app/infra/errorReporter"
import { RpcSerialization } from "@effect/rpc"
import { FiberRef, flow } from "effect"
import { Console, Effect, Layer } from "effect-app"
import { HttpMiddleware, HttpRouter, HttpServer } from "effect-app/http"
import { BaseConfig, MergedConfig } from "./config.js"

const prodOrigins: string[] = []
const demoOrigins: string[] = []

const localOrigins = [
  "http://localhost:4000"
]

const RootRoutes = <E, R>(
  rpcRoutes: Layer<never, E, R>
) =>
  HttpRouter
    .Default
    .use(Effect.fnUntraced(function*(router) {
      const cfg = yield* BaseConfig
      const { env } = yield* BaseConfig
      const rpcRouter = yield* Router.router
      const handleEvents = yield* MW.makeEvents

      const middleware = flow(
        // MW.authTokenFromCookie(secret),
        MW.RequestContextMiddleware(),
        MW.gzip,
        MW.cors({
          credentials: true,
          allowedOrigins: env === "demo"
            ? (origin) => demoOrigins.includes(origin)
            : env === "prod"
            ? prodOrigins
            : localOrigins
        }),
        // we trust proxy and handle the x-forwarded etc headers
        HttpMiddleware.xForwardedHeaders
      )

      yield* router.get(
        "/.well-known/local/server-health",
        MW.serverHealth(cfg.apiVersion).pipe(Effect.tapErrorCause(reportError("server-health error")))
      )
      yield* router.mountApp(
        "/rpc",
        rpcRouter.pipe(middleware)
      )
      yield* router.get("/events", handleEvents.pipe(Effect.tapErrorCause(reportError("events error")), middleware))
    }))
    .pipe(Layer.provide([Events.Default, Router.Live.pipe(Layer.provide(rpcRoutes))]))

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
  logServer.pipe(
    Layer.provide(HttpRouter.Default.unwrap(HttpServer.serve(HttpMiddleware.logger))),
    Layer.provide(RootRoutes(rpcRouter)),
    Layer.provide(RpcSerialization.layerJson),
    Layer.provide(ConfigureTracer)
  )
