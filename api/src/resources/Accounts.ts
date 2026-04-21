import { User } from "#models/User"
import { NotFoundError } from "effect-app/client/errors"
import { S, TaggedRequestFor } from "./lib.js"
import { UserItem } from "./views/UserItem.js"

// codegen:start {preset: meta, sourcePrefix: src/resources/}
const Req = TaggedRequestFor("Accounts")
// codegen:end

export class Index extends Req.Query<Index>()("Index", {}, { success: S.Array(UserItem), allowAnonymous: true }) {}

export class GetMe extends Req.Query<GetMe>()("GetMe", {}, { success: User, error: NotFoundError }) {}
