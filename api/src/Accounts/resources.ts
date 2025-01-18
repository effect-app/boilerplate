import { S } from "#resources/lib"
import { NotFoundError } from "effect-app/client"
import { User, UserId } from "./models.js"
import { UserView } from "./UserView.js"

export class GetMe extends S.Req<GetMe>()("GetMe", {}, { success: User, failure: NotFoundError }) {}

export class IndexUsers extends S.Req<IndexUsers>()("IndexUsers", {
  filterByIds: S.NonEmptyArray(UserId)
}, {
  allowAnonymous: true,
  allowRoles: ["user"],
  success: S.Struct({
    users: S.Array(UserView)
  })
}) {}

// codegen:start {preset: meta, sourcePrefix: src/}
export const meta = { moduleName: "Accounts" } as const
// codegen:end

export * as AccountsRsc from "./resources.js"
