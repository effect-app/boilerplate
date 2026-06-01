import { InvalidStateError } from "effect-app/client"
import { RequestContext } from "effect-app/RequestContext"
import { S, TaggedRequestFor } from "./lib.ts"
import { UserView } from "./views.ts"

// codegen:start {preset: meta, sourcePrefix: src/resources/}
const Req = TaggedRequestFor("HelloWorld")
// codegen:end

export class GetHelloWorld extends Req.Query<GetHelloWorld>()("GetHelloWorld", {
  echo: S.String
}, {
  allowAnonymous: true,
  allowRoles: ["user"],
  success: S.Struct({
    now: S.Date.withConstructorDefault,
    echo: S.String,
    state: S.String,
    context: RequestContext,
    currentUser: S.NullOr(UserView),
    randomUser: UserView
  })
}) {}

export class SetState extends Req.Command<SetState>()("SetState", {
  state: S.String,
  fail: S.Boolean
}, { error: InvalidStateError, allowAnonymous: true, allowRoles: ["user"] }) {}
