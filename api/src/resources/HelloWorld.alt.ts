import { RequestContext } from "@effect-app/infra/RequestContext"
import { RpcGroup } from "@effect/rpc"
import { middlewareGroup } from "effect-app/rpc"
import { RpcMiddleware, S } from "./lib.js"
import { UserView } from "./views.js"

class Response extends S.Class<Response>("Response")({
  now: S.Date.withDefault,
  echo: S.String,
  context: RequestContext,
  currentUser: S.NullOr(UserView),
  randomUser: UserView
}) {}

export class GetHelloWorld extends S.Req<GetHelloWorld>()("GetHelloWorld", {
  echo: S.String
}, { allowAnonymous: true, allowRoles: ["user"], success: Response }) {}

// codegen:start {preset: meta, sourcePrefix: src/resources/}
export const meta = { moduleName: "HelloWorld.alt" } as const
// codegen:end

export const HelloWorldRpc = Object.assign(
  middlewareGroup(RpcMiddleware)(RpcGroup
    .make(
      RpcMiddleware.rpc("Get", {
        payload: GetHelloWorld.fields,
        // TODO: add fromTaggedRequeset with config support instead
        success: GetHelloWorld.success,
        config: GetHelloWorld.config
      })
    )),
  { meta } // todo; auto
)
