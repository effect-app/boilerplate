import { matchFor } from "api/lib/routing.js"
import { Q, UserRepo } from "api/services.js"
import { Array } from "effect"
import { Effect, Order } from "effect-app"
import { UsersRsc } from "resources.js"
import type { UserView } from "resources/views.js"

export default matchFor(UsersRsc)([
  UserRepo.Default
], ({ IndexUsers }) =>
  Effect.gen(function*() {
    const userRepo = yield* UserRepo
    return {
      IndexUsers: IndexUsers((req) =>
        userRepo
          .query(Q.where("id", "in", req.filterByIds))
          .pipe(Effect.andThen((users) => ({
            users: Array.sort(users, Order.mapInput(Order.string, (_: UserView) => _.displayName))
          })))
      )
    }
  }))
