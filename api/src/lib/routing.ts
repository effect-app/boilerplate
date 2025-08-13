/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { BaseConfig } from "#config"
import { contextMap, DefaultGenericMiddlewaresLive, getConfig, makeMiddleware, makeRouter, Middleware } from "@effect-app/infra/api/routing"
import { DefaultGenericMiddlewares } from "@effect-app/infra/api/routing/middleware/middleware-native"
import { NotLoggedInError, UnauthorizedError } from "@effect-app/infra/errors"
import { Layer } from "effect"
import { Effect, Exit, Option } from "effect-app"
import { RPCContextMap } from "effect-app/client/req"
import { type HttpHeaders } from "effect-app/http"
import { makeUserProfileFromAuthorizationHeader, makeUserProfileFromUserHeader, UserProfile } from "../services/UserProfile.js"
import { basicRuntime } from "./basicRuntime.js"
import { AppLogger } from "./logger.js"

export type RequestContextMap = {
  allowAnonymous: RPCContextMap.Inverted<typeof UserProfile, typeof NotLoggedInError>
  requireRoles: RPCContextMap.Custom<never, typeof UnauthorizedError, readonly string[]>
}
export const RequestContextMap = {
  allowAnonymous: RPCContextMap.makeInverted(UserProfile, NotLoggedInError),
  requireRoles: RPCContextMap.makeCustom(null as never, UnauthorizedError, Array<string>())
} as const
const getConf = getConfig<RequestContextMap>()

class AllowAnonymous extends Middleware.TagService<AllowAnonymous>()("AllowAnonymous", {
  dynamic: contextMap(RequestContextMap, "allowAnonymous")
})({
  effect: Effect.gen(function*() {
    const fakeLogin = true
    // const authConfig = yield* Auth0Config
    const makeUserProfile = fakeLogin
      ? ((headers: HttpHeaders.Headers) =>
        headers["x-user"] ? makeUserProfileFromUserHeader(headers["x-user"]) : Effect.succeed(undefined))
      : ((headers: HttpHeaders.Headers) =>
        headers["authorization"]
          ? makeUserProfileFromAuthorizationHeader(headers["authorization"])
          : Effect.succeed(undefined))

    return Effect.fn(function*({ headers, rpc }) {
      const config = getConf(rpc)
      // if (!config?.allowAnonymous) {
      //   yield* Effect.catchAll(
      //     checkJWTI({
      //       ...authConfig,
      //       issuer: authConfig.issuer + "/",
      //       jwksUri: `${authConfig.issuer}/.well-known/jwks.json`
      //     })(headers),
      //     (err) =>
      //       Effect.logError(err).pipe(
      //         Effect.andThen(Effect.fail(new NotLoggedInError({ message: err.message })))
      //       )
      //   )
      // }

      const r = makeUserProfile(headers)
        .pipe(Effect.exit, basicRuntime.runSync)
      if (!Exit.isSuccess(r)) {
        yield* AppLogger.logWarning("Parsing userInfo failed").pipe(Effect.annotateLogs("r", r))
      }

      const userProfile = Option.fromNullable(Exit.isSuccess(r) ? r.value : undefined)
      if (Option.isSome(userProfile)) {
        return Option.some(userProfile.value)
      } else if (!config?.allowAnonymous) {
        return yield* new NotLoggedInError({ message: "no auth" })
      }
      return Option.none()
    })
  })
}) {}

class RequireRoles extends Middleware.TagService<RequireRoles>()("RequireRoles", {
  dynamic: contextMap(RequestContextMap, "requireRoles"),
  wrap: true,
  dependsOn: [AllowAnonymous]
})({
  effect: Effect.gen(function*() {
    return Effect.fn(
      function*({ next, rpc }) {
        const config = getConf(rpc)
        const userProfile = yield* Effect.serviceOption(UserProfile)
        if (config?.requireRoles) {
          // TODO
          if (
            !userProfile.value
            || !config.requireRoles.every((role: any) => userProfile.value!.roles.includes(role))
          ) {
            return yield* new UnauthorizedError()
          }
        }

        return yield* next
      }
    )
  })
}) {
}

const mw = makeMiddleware(RequestContextMap)
  .middleware(RequireRoles)
  .middleware(AllowAnonymous)
  .middleware(...DefaultGenericMiddlewares)

const middleware = Object.assign(mw, {
  Default: mw.layer.pipe(Layer.provide([
    AllowAnonymous.Default,
    RequireRoles.Default,
    DefaultGenericMiddlewaresLive
  ]))
})

const baseConfig = basicRuntime.runSync(BaseConfig)
export const { Router, matchAll } = makeRouter(middleware, baseConfig.env !== "prod")
