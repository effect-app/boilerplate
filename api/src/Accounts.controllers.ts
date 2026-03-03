import { Router } from "#lib/routing"
import { AccountsRsc } from "#resources"
import { UserRepo } from "#services"

export default Router(AccountsRsc)({
  dependencies: [UserRepo.Default],
  *effect(match) {
    const userRepo = yield* UserRepo
    return match({
      GetMe: userRepo.getCurrentUser
    })
  }
})
