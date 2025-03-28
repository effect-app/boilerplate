import { matchFor, Router } from "#api/lib/routing"
import { Q, UserRepo } from "#api/services"
import { UsersRsc } from "#resources"
import type { UserView } from "#resources/views"
import { Array } from "effect"
import { Effect, Order } from "effect-app"

export default Router(UsersRsc)({
  dependencies: [UserRepo.Default],
  effect: Effect.gen(function*() {
    const userRepo = yield* UserRepo

    return matchFor(UsersRsc)({
      IndexUsers: (req) =>
        userRepo
          .query(Q.where("id", "in", req.filterByIds))
          .pipe(Effect.andThen((users) => ({
            users: Array.sort(users, Order.mapInput(Order.string, (_: UserView) => _.displayName))
          })))
    })
  })
})
