import { Router } from "#lib/routing"
import { HelloWorldRsc } from "#resources"
import { GetHelloWorld } from "#resources/HelloWorld"
import { UserView } from "#resources/views/UserView"
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
            Effect.map((u): UserView =>
              new UserView({
                id: u.id,
                role: u.role,
                displayName: S.NonEmptyString2k(`${u.name.firstName} ${u.name.lastName}`)
              })
            ),
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
          randomUser: generate(S.toArbitrary(UserView)).value
        })
      },
      *SetState(req) {
        if (req.fail) {
          return yield* new InvalidStateError("Heute nicht möglich")
        }
        state = req.state
      }
    })
  }
})
