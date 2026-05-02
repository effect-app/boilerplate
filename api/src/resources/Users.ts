import { UserId } from "#models/User"
import { S, TaggedRequestFor } from "./lib.js"
import { UserView } from "./views/UserView.js"


// codegen:start {preset: meta, sourcePrefix: src/resources/}
const Req = TaggedRequestFor("Users")
// codegen:end

export class IndexUsers extends Req.Query<IndexUsers>()("IndexUsers", {
  filterByIds: S.NonEmptyArray(UserId)
}, {
  allowAnonymous: true,
  allowRoles: ["user"],
  success: S.Struct({
    users: S.Array(UserView)
  })
}) {}


