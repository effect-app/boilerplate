/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { BaseConfig } from "#config"
import { RequestCacheLayers } from "#resources/lib"
import { EmptyContextProvider, makeMiddleware, makeRouter } from "@effect-app/infra/api/routing"
import { NotLoggedInError, UnauthorizedError } from "@effect-app/infra/errors"
import type { RequestContext } from "@effect-app/infra/RequestContext"
import { Context, Effect, Exit, Layer, Option } from "effect-app"
import type { GetEffectContext, RPCContextMap } from "effect-app/client/req"
import { HttpHeaders, HttpServerRequest } from "effect-app/http"
import { makeUserProfileFromAuthorizationHeader, makeUserProfileFromUserHeader, UserProfile } from "../services/UserProfile.js"
import { basicRuntime } from "./basicRuntime.js"
import { AppLogger } from "./logger.js"

export interface CTX {
  context: RequestContext
}

export type CTXMap = {
  allowAnonymous: RPCContextMap.Inverted<"userProfile", UserProfile, typeof NotLoggedInError>
  // TODO: not boolean but `string[]`
  requireRoles: RPCContextMap.Custom<"", never, typeof UnauthorizedError, Array<string>>
}

// export const Auth0Config = Config.all({
//   audience: Config.string("audience").pipe(Config.nested("auth0"), Config.withDefault("http://localhost:3610")),
//   issuer: Config.string("issuer").pipe(
//     Config.nested("auth0"),
//     Config.withDefault("https://effect-app-boilerplate-dev.eu.auth0.com")
//   )
// })

const middleware = makeMiddleware<CTXMap, HttpServerRequest.HttpServerRequest>()({
  contextProvider: EmptyContextProvider,
  execute: (maker) =>
    Effect.gen(function*() {
      return maker((schema, handler, moduleName) => {
        const fakeLogin = true
        // const authConfig = yield* Auth0Config
        const makeUserProfile = fakeLogin
          ? ((headers: HttpHeaders.Headers) =>
            headers["x-user"] ? makeUserProfileFromUserHeader(headers["x-user"]) : Effect.succeed(undefined))
          : ((headers: HttpHeaders.Headers) =>
            headers["authorization"]
              ? makeUserProfileFromAuthorizationHeader(headers["authorization"])
              : Effect.succeed(undefined))

        const buildContext = (headers: any) =>
          Effect
            .gen(function*() {
              const config = "config" in schema ? schema.config : undefined
              let ctx = Context.empty()

              // Check JWT
              // TODO
              // if (!fakeLogin && !request.allowAnonymous) {
              //   yield* Effect.catchAll(
              //     checkJWTI({
              //       ...authConfig,
              //       issuer: authConfig.issuer + "/",
              //       jwksUri: `${authConfig.issuer}/.well-known/jwks.json`
              //     }),
              // (err) =>
              //   Effect.logError(err).pipe(
              //     Effect.andThen(Effect.fail(new NotLoggedInError({ message: err.message })))
              //   )
              //   )
              // }

              const r = yield* Effect.exit(makeUserProfile(headers))
              if (!Exit.isSuccess(r)) {
                yield* AppLogger.logWarning("Parsing userInfo failed").pipe(Effect.annotateLogs("r", r))
              }
              const userProfile = Option.fromNullable(Exit.isSuccess(r) ? r.value : undefined)
              if (Option.isSome(userProfile)) {
                ctx = ctx.pipe(Context.add(UserProfile, userProfile.value))
              } else if (!config?.allowAnonymous) {
                return yield* new NotLoggedInError({ message: "no auth" })
              }

              if (config?.requireRoles) {
                // TODO
                if (
                  !userProfile.value
                  || !config.requireRoles.every((role: any) => userProfile.value!.roles.includes(role))
                ) {
                  return yield* new UnauthorizedError()
                }
              }

              return ctx as Context.Context<GetEffectContext<CTXMap, typeof schema["config"]>>
            })

        return (req, headers) =>
          Effect.gen(function*() {
            yield* Effect.annotateCurrentSpan("request.name", moduleName ? `${moduleName}.${req._tag}` : req._tag)

            const httpReq = yield* HttpServerRequest.HttpServerRequest
            const allHeaders = HttpHeaders.merge(httpReq.headers, headers)

            return yield* handler(req, allHeaders).pipe(
              Effect.provide(Layer.provideMerge(
                Layer.effectContext(buildContext(allHeaders)),
                RequestCacheLayers
              ))
            )
          })
      })
    })
})

const baseConfig = basicRuntime.runSync(BaseConfig)
export const { Router, matchAll, matchFor } = makeRouter(middleware, baseConfig.env !== "prod")
