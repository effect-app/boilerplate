import { UserId } from "models/User.js"
import { S } from "./lib.js"
import { UserView } from "./views/UserView.js"

export class IndexUsers extends S.Req<IndexUsers>()("IndexUsers", {
  filterByIds: S.NonEmptyArray(UserId)
}, {
  allowAnonymous: true,
  allowRoles: ["user"],
  success: S.Struct({
    users: S.Array(UserView)
  })
}) {}

// codegen:start {preset: meta, sourcePrefix: src/resources/}
export const meta = { moduleName: "Users" } as const
// codegen:end
