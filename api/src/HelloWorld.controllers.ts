import { Router } from "#lib/routing"
import { User } from "#models/User"
import { HelloWorldRsc } from "#resources"
import { GetHelloWorld } from "#resources/HelloWorld"
import { UserRepo } from "#services"
import { getRequestContext } from "@effect-app/infra/api/setupRequest"
import { generate } from "@effect-app/infra/test"
import { Effect, S } from "effect-app"
import { InvalidStateError } from "effect-app/client"

let state: string = "initial"
export default Router(HelloWorldRsc)({
  dependencies: [UserRepo.Default],
  *effect(match) {
    const userRepo = yield* UserRepo

    return match({
      *GetHelloWorld({ echo }) {
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
          state,
          currentUser: user,
          randomUser: generate(S.A.make(User)).value
        })
      },
      *SetState(req) {
        return yield* new InvalidStateError("Heute nicht möglich")
        state = req.state
      }
    })
  }
})
