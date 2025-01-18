import { UserView } from "#api/Accounts/UserView"
import { S } from "#resources/lib"
import { RequestContext } from "@effect-app/infra/RequestContext"

class Response extends S.Class<Response>()({
  now: S.Date.withDefault,
  echo: S.String,
  context: RequestContext,
  currentUser: S.NullOr(UserView),
  randomUser: UserView
}) {}

export class GetHelloWorld extends S.Req<GetHelloWorld>()("GetHelloWorld", {
  echo: S.String
}, { allowAnonymous: true, allowRoles: ["user"], success: Response }) {}

// codegen:start {preset: meta, sourcePrefix: src/}
export const meta = { moduleName: "HelloWorld" } as const
// codegen:end
export * as HelloWorldRsc from "./resources.js"
