/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { BaseConfig } from "#config"
import { AllowAnonymous, getConf, RequireRoles, RpcMiddleware } from "#resources/lib"
import { makeUserProfileFromAuthorizationHeader, makeUserProfileFromUserHeader, UserProfile } from "#services"
import { DefaultGenericMiddlewaresLive, makeRouter } from "@effect-app/infra/api/routing"
import { Effect, Exit, Layer } from "effect"
import { Option } from "effect-app"
import { NotLoggedInError, UnauthorizedError } from "effect-app/client"
import { type HttpHeaders } from "effect-app/http"
import { basicRuntime } from "./basicRuntime.js"
import { AppLogger } from "./logger.js"

const AllowAnonymousLive = Layer.effect(
  AllowAnonymous,
  Effect.gen(function*() {
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
)

const RequireRolesLive = Layer.effect(
  RequireRoles,
  Effect.gen(function*() {
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
)

const middleware = Object.assign(RpcMiddleware, {
  Default: RpcMiddleware.layer.pipe(Layer.provide([
    AllowAnonymousLive,
    RequireRolesLive,
    DefaultGenericMiddlewaresLive
  ]))
})

const baseConfig = basicRuntime.runSync(BaseConfig)
export const { Router, matchAll } = makeRouter(middleware, baseConfig.env !== "prod")
