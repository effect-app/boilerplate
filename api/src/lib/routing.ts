/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { AllowAnonymous, AppMiddleware, getConf, RequireRoles } from "#resources/lib"
import { makeUserProfileFromAuthorizationHeader, makeUserProfileFromUserHeader, UserProfile } from "#services"
import { type LayerUtils } from "@effect-app/infra/api/layerUtils"
import { DefaultGenericMiddlewaresLive, makeRouter } from "@effect-app/infra/api/routing"
import { type Rpc, type RpcGroup, RpcServer } from "@effect/rpc"
import { type HandlersFrom } from "@effect/rpc/RpcGroup"
import { type RpcSerialization } from "@effect/rpc/RpcSerialization"
import { Effect, Exit, Layer, type NonEmptyReadonlyArray, Option, type Scope } from "effect-app"
import { NotLoggedInError, UnauthorizedError } from "effect-app/client"
import { type HttpHeaders, type HttpLayerRouter } from "effect-app/http"
import { type HandlersContext } from "effect-app/rpc/RpcMiddleware"
import { type Service } from "effect/Effect"
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

    return Effect.fn(function*(effect, { headers, rpc }) {
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
        return yield* Effect.provideService(effect, UserProfile, userProfile.value)
      } else if (!config?.allowAnonymous) {
        return yield* new NotLoggedInError({ message: "no auth" })
      }
      return yield* effect
    })
  })
)

const RequireRolesLive = Layer.effect(
  RequireRoles,
  Effect.gen(function*() {
    return Effect.fn(
      function*(effect, { rpc }) {
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

        return yield* effect
      }
    )
  })
)

// todo
export const mergeOptionalDependencies = <T extends { readonly dependencies?: ReadonlyArray<Layer.Layer.Any> }>(
  a: T
): T extends { dependencies: NonEmptyReadonlyArray<Layer.Layer.Any> } ? Layer<
    LayerUtils.GetLayersSuccess<T["dependencies"]>,
    LayerUtils.GetLayersError<T["dependencies"]>,
    LayerUtils.GetLayersContext<T["dependencies"]>
  >
  : Layer.Layer<never> => Layer.mergeAll(...(a.dependencies as any ?? [])) as any

// TODO; nicer to make one global RpcServer and endpoint, but use prefixes on the RpcGroups instead...
// but it's not currently supported; https://discord.com/channels/795981131316985866/1270891146213589074/1405494953186033774
export const makeServer = <R extends Rpc.Any>(group: RpcGroup.RpcGroup<R> & { meta: { moduleName: string } }) =>
  RpcServer
    .layerHttpRouter({
      spanPrefix: "RpcServer." + group.meta.moduleName,
      group,
      path: ("/rpc/" + group.meta.moduleName) as `/${typeof group.meta.moduleName}`,
      protocol: "http"
    })

const MiddlewareDefault = AppMiddleware.layer.pipe(Layer.provide([
  AllowAnonymousLive,
  RequireRolesLive,
  DefaultGenericMiddlewaresLive
]))

export class AppMiddlewareImpl extends AppMiddleware {
  static Default = this.layer.pipe(Layer.provide([
    AllowAnonymousLive,
    RequireRolesLive,
    DefaultGenericMiddlewaresLive
  ]))
  static Router = <R extends Rpc.Any>(
    group: RpcGroup.RpcGroup<R> & {
      meta: { moduleName: string }
      toLayerDynamic: <
        Handlers extends HandlersFrom<R>,
        EX = never,
        RX = never
      >(
        build:
          | Handlers
          | Effect.Effect<Handlers, EX, RX>
      ) => Layer.Layer<
        Rpc.ToHandler<R>,
        EX,
        | Exclude<RX, Scope>
        | HandlersContext<R, Handlers>
      >
    }
  ) =>
  <
    LayerOpts extends {
      effect: Effect.Effect<
        HandlersFrom<R>,
        any,
        any
      >
      dependencies?: ReadonlyArray<Layer.Layer.Any>
    }
  >(
    layerOpts: LayerOpts
  ): Layer.Layer<
    never,
    Effect.Effect.Error<LayerOpts["effect"]>,
    | Exclude<Effect.Effect.Context<LayerOpts["effect"]>, Service.MakeDepsOut<LayerOpts>>
    | Service.MakeDepsIn<LayerOpts>
    | Exclude<Rpc.Middleware<R>, AppMiddleware>
    | HandlersContext<R, Effect.Effect.Success<LayerOpts["effect"]>>
    | RpcSerialization
    | HttpLayerRouter.HttpRouter
  > =>
    makeServer(group).pipe(
      Layer.provide(MiddlewareDefault),
      Layer.provide(
        group
          .toLayerDynamic(
            layerOpts.effect as Effect<
              HandlersFrom<R>,
              Effect.Error<LayerOpts["effect"]>,
              Effect.Context<LayerOpts["effect"]>
            >
          )
          .pipe(Layer.provide(mergeOptionalDependencies(layerOpts)))
      )
    ) as any
}

export const { Router, matchAll } = makeRouter(AppMiddlewareImpl)
