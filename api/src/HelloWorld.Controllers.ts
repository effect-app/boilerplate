import { Router } from "#lib/routing"
import * as HelloWorldRsc from "#resources/HelloWorld"
import { GetHelloWorld } from "#resources/HelloWorld"
import { UserView } from "#resources/views/UserView"
import { UserRepo } from "#services/DBContext/UserRepo"
import { generate } from "@effect-app/infra/test"
import { InvalidStateError } from "effect-app/client"
import * as Effect from "effect-app/Effect"
import * as S from "effect-app/Schema"
import { getRequestContext } from "effect-app/setupRequest"

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
            Effect.map((u) =>
              UserView.make({
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

        return GetHelloWorld.success.make({
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
