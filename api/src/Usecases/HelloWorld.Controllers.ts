import { User } from "@effect-app-boilerplate/api/models/User"
import { HelloWorldRsc } from "@effect-app-boilerplate/api/resources"
import { generateFromArbitrary } from "@effect-app/infra/test.arbs"
import { matchFor } from "api/lib/matchFor.js"
import { UserRepo } from "api/services.js"
import { Effect, S } from "effect-app"

const helloWorld = matchFor(HelloWorldRsc)

export default helloWorld.controllers({
  Get: helloWorld.Get(({ echo }, { Response, context }) =>
    UserRepo
      .getCurrentUser
      .pipe(
        Effect.catchTags({
          "NotLoggedInError": () => Effect.succeed(null),
          "NotFoundError": () => Effect.succeed(null)
        })
      )
      .andThen((user) =>
        new Response({
          context,
          echo,
          currentUser: user,
          randomUser: generateFromArbitrary(S.A.make(User)).value
        })
      )
  )
})