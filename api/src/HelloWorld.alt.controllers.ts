import { middleware } from "#lib/routing"
import { User } from "#models/User"
import { GetHelloWorld, HelloWorldRpc } from "#resources/HelloWorld.alt"
import { UserRepo } from "#services"
import { getRequestContext } from "@effect-app/infra/api/setupRequest"
import { generate } from "@effect-app/infra/test"
import { Effect, S } from "effect-app"

export default middleware.Router(HelloWorldRpc)({
  dependencies: [UserRepo.Default],
  effect: Effect.gen(function*() {
    const userRepo = yield* UserRepo
    return {
      // TODO: generator support? *Get({ echo }) { - but then need to handle the span stacktrace, like in effect-app Router
      Get: Effect.fn(function*({ echo }) {
        const context = yield* getRequestContext
        // yield* Effect.context<"not provided">()
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
  })
})
