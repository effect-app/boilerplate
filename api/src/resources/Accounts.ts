import { User } from "#models/User"
import { NotFoundError } from "effect-app/client/errors"
import { S } from "./lib.js"

export class GetMe extends S.Req<GetMe>()("GetMe", {}, { success: User, failure: NotFoundError }) {}

// codegen:start {preset: meta, sourcePrefix: src/resources/}
export const meta = { moduleName: "Accounts" } as const
// codegen:end
