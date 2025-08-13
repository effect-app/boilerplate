import { middleware } from "#lib/routing"
import { User } from "#models/User"
import { GetHelloWorld, HelloWorldRpc, meta } from "#resources/HelloWorld.alt"
import { UserRepo } from "#services"
import { getRequestContext } from "@effect-app/infra/api/setupRequest"
import { generate } from "@effect-app/infra/test"
import { RpcServer } from "@effect/rpc"
import { Effect, Layer, S } from "effect-app"

// TODO: make this simpler in one go, similar to effect-app Router?
// probably just make one global RpcServer and endpoint, but use prefixes on the RpcGroups instead...
const server = RpcServer
  .layerHttpRouter({
    spanPrefix: "RpcServer." + meta.moduleName,
    group: HelloWorldRpc,
    path: ("/rpc/" + meta.moduleName) as `/${typeof meta.moduleName}`,
    protocol: "http"
  })
export default Layer
  .provide(
    server,
    HelloWorldRpc
      .toLayerDynamic(Effect.gen(function*() {
        const userRepo = yield* UserRepo
        return {
          // TODO: generator support? *Get({ echo }) { - but then need to handle the span stacktrace, like in effect-app Router
          Get: Effect.fn(function*({ echo }) {
            const context = yield* getRequestContext
            const user = yield* userRepo
              .tryGetCurrentUser
              .pipe(
                Effect.catchTags({
                  "NotLoggedInError": () => Effect.succeed(null),
                  "NotFoundError": () => Effect.succeed(null)
                })
              )

            return new GetHelloWorld.success({
              context,
              echo,
              currentUser: user,
              randomUser: generate(S.A.make(User)).value
            })
          })
        }
      }))
  )
  // would be kind of nice if we could just pass { effect, dependencies } to toLayerDynamic call, just like Effect.Service and effect-app Router?
  .pipe(Layer.provide([UserRepo.Default, middleware.Default]))
