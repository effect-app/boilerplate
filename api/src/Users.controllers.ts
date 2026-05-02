import { Router } from "#lib/routing"
import { UsersRsc } from "#resources"
import type { UserView } from "#resources/views"
import { Q, UserRepo } from "#services"
import { Array } from "effect"
import { Effect, Order } from "effect-app"

export default Router(UsersRsc)({
  dependencies: [UserRepo.Default],
  *effect(match) {
    const userRepo = yield* UserRepo

    return match({
      IndexUsers: (req) =>
        userRepo
          .query(Q.where("id", "in", req.filterByIds))
          .pipe(Effect.map((users) => ({
            users: Array.sort(users, Order.mapInput(Order.String, (_: UserView) => _.displayName))
          })))
    })
  }
})
