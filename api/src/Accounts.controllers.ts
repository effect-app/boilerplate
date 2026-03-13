import { Router } from "#lib/routing"
import { AccountsRsc } from "#resources"
import { UserItem } from "#resources/views/UserItem"
import { UserRepo } from "#services"
import { S } from "effect-app"

export default Router(AccountsRsc)({
  dependencies: [UserRepo.Default],
  *effect(match) {
    const userRepo = yield* UserRepo
    return match({
      *Index() {
        const users = yield* userRepo.all
        return users.map((u) =>
          new UserItem({
            id: u.id,
            name: S.NonEmptyString2k(`${u.name.firstName} ${u.name.lastName}`)
          })
        )
      },
      GetMe: userRepo.getCurrentUser
    })
  }
})
