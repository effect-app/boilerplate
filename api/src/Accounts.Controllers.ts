import { Router } from "#lib/routing"
import * as AccountsRsc from "#resources/Accounts"
import { UserItem } from "#resources/views/UserItem"
import { UserRepo } from "#services/DBContext/UserRepo"
import * as S from "effect-app/Schema"

export default Router(AccountsRsc)({
  dependencies: [UserRepo.Default],
  *effect(match) {
    const userRepo = yield* UserRepo
    return match({
      *Index() {
        const users = yield* userRepo.all
        return users.map((u) =>
          UserItem.make({
            id: u.id,
            name: S.NonEmptyString2k(`${u.name.firstName} ${u.name.lastName}`)
          })
        )
      },
      GetMe: () => userRepo.getCurrentUser
    })
  }
})
