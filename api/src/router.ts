/* eslint-disable @typescript-eslint/no-explicit-any */
import * as MW from "#lib/middleware"
import { Events } from "#services"
import { Console, Effect, Layer } from "effect-app"
import { HttpRouter } from "effect-app/http"
import { RpcSerialization } from "effect/unstable/rpc"
import { BaseConfig, MergedConfig } from "./config.js"

const HealthRoute = HttpRouter
  .use(
    Effect.fnUntraced(function*(router) {
      const cfg = yield* BaseConfig

      // NO authtoken/requestcontext middleware!
      yield* router.add(
        "GET",
        "/.well-known/local/server-health",
        MW.serverHealth(cfg.apiVersion)
      )
    })
  )

const EventsRoute = HttpRouter
  .use(
    Effect.fnUntraced(function*(router) {
      const handleEvents = yield* MW.makeEvents

      yield* router.add(
        "GET",
        "/events",
        handleEvents
      )
    })
  )
  .pipe(Layer.provide(Events.Default))

void HealthRoute
void EventsRoute

const logServer = Effect
  .gen(function*() {
    const cfg = yield* MergedConfig
    // using Console.log for vscode to know we're ready
    yield* Console.log(
      `Running on http://${cfg.host}:${cfg.port} at version: ${cfg.apiVersion}. ENV: ${cfg.env}`
    )
  })
  .pipe(Layer.effectDiscard)

export const makeHttpServer = <E, R>(
  rpcRouter: Layer.Layer<never, E, R>
) =>
  HttpRouter
    .serve(
      logServer.pipe(
        Layer.provide(rpcRouter),
        Layer.provide(RpcSerialization.layerJson)
      )
    )
