/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { BaseConfig } from "#config"
import { contextMap, DefaultGenericMiddlewares, makeNewMiddleware, makeRouter, Middleware } from "@effect-app/infra/api/routing"
import { NotLoggedInError, UnauthorizedError } from "@effect-app/infra/errors"
import { Context, Effect, Exit, Option } from "effect-app"
import type { RPCContextMap } from "effect-app/client/req"
import { makeUserProfileFromAuthorizationHeader, UserProfile } from "../services/UserProfile.js"
import { basicRuntime } from "./basicRuntime.js"
import { AppLogger } from "./logger.js"

export type RequestContextMap = {
  allowAnonymous: RPCContextMap.Inverted<UserProfile, typeof NotLoggedInError>
  // TODO: not boolean but `string[]`
  requireRoles: RPCContextMap.Custom<never, typeof UnauthorizedError, readonly string[]>
}

const dynamic = contextMap<RequestContextMap>()

class AllowAnonymous
  extends Middleware.Tag<AllowAnonymous>()("AllowAnonymous", { dynamic: dynamic("allowAnonymous") })({
    effect: Effect.gen(function*() {
      return Effect.fn(function*({ config, headers }) {
        // if (!config?.allowAnonymous) {
        //   yield* Effect.catchAll(
        //     checkJWTI({
        //       ...authConfig,
        //       issuer: authConfig.issuer + "/",
        //       jwksUri: `${authConfig.issuer}/.well-known/jwks.json`
        //     }),
        //     (err) =>
        //       Effect.logError(err).pipe(
        //         Effect.andThen(Effect.fail(new NotLoggedInError({ message: err.message })))
        //       )
        //   )
        // }

        const r = makeUserProfileFromAuthorizationHeader(
          headers["authorization"]
        )
          .pipe(Effect.exit, basicRuntime.runSync)
        if (!Exit.isSuccess(r)) {
          yield* AppLogger.logWarning("Parsing userInfo failed").pipe(Effect.annotateLogs("r", r))
        }

        const userProfile = Option.fromNullable(Exit.isSuccess(r) ? r.value : undefined)
        if (Option.isSome(userProfile)) {
          return Option.some(Context.make(UserProfile, userProfile.value))
        } else if (!config?.allowAnonymous) {
          return yield* new NotLoggedInError({ message: "no auth" })
        }
        return Option.none()
      })
    })
  })
{}

class RequireRoles extends Middleware.Tag<RequireRoles>()("RequireRoles", { dynamic: dynamic("requireRoles") })({
  effect: Effect.gen(function*() {
    return Effect.fn(
      function*({ config }) {
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

        return Option.none<Context<never>>()
      }
    )
  })
}) {
  static dependsOn = [AllowAnonymous]
}

const middleware = makeNewMiddleware<RequestContextMap>()(...DefaultGenericMiddlewares)
  .addDynamicMiddleware(AllowAnonymous)
  .addDynamicMiddleware(RequireRoles)

const baseConfig = basicRuntime.runSync(BaseConfig)
export const { Router, matchAll, matchFor } = makeRouter(middleware, baseConfig.env !== "prod")
