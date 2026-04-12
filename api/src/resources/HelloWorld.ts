import { RequestContext } from "@effect-app/infra/RequestContext"
import { InvalidStateError } from "effect-app/client"
import { S, TaggedRequestFor } from "./lib.js"
import { UserView } from "./views.js"

// codegen:start {preset: meta, sourcePrefix: src/resources/}
const Req = TaggedRequestFor("HelloWorld")
// codegen:end

class Response extends S.Class<Response>("Response")({
  now: S.Date.withDefault,
  echo: S.String,
  state: S.String,
  context: RequestContext,
  currentUser: S.NullOr(UserView),
  randomUser: UserView
}) {}

export class GetHelloWorld extends Req<GetHelloWorld>()("GetHelloWorld", {
  echo: S.String
}, { allowAnonymous: true, allowRoles: ["user"], success: Response }) {}

export class SetState extends Req<SetState>()("SetState", {
  state: S.String,
  fail: S.Boolean
}, { error: InvalidStateError, allowAnonymous: true, allowRoles: ["user"] }) {}
