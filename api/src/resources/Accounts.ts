import { User } from "#models/User"
import { NotFoundError } from "effect-app/client/errors"
import { S } from "./lib.js"
import { UserItem } from "./views/UserItem.js"

export class Index extends S.Req<Index>()("Index", {}, { success: S.Array(UserItem), allowAnonymous: true }) {}

export class GetMe extends S.Req<GetMe>()("GetMe", {}, { success: User, error: NotFoundError }) {}

// codegen:start {preset: meta, sourcePrefix: src/resources/}
export const meta = { moduleName: "Accounts" } as const
// codegen:end
