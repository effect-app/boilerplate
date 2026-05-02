import { NotLoggedInError, UnauthorizedError } from "effect-app/client"

// get rid of in resources and frontend
import { DefaultGenericMiddlewares } from "effect-app/middleware"
import { MiddlewareMaker, RpcContextMap, RpcMiddleware } from "effect-app/rpc"
import { type UserProfile } from "./Userprofile.js"

export const RequestContextMap = RpcContextMap.makeMap({
  allowAnonymous: RpcContextMap.makeInverted<UserProfile>()(NotLoggedInError),
  requireRoles: RpcContextMap.makeCustom()(UnauthorizedError, Array<string>())
})

export class AllowAnonymous extends RpcMiddleware.Tag<AllowAnonymous>()("AllowAnonymous", {
  dynamic: RequestContextMap.get("allowAnonymous")
}) {}

export class RequireRoles extends RpcMiddleware.Tag<RequireRoles>()("RequireRoles", {
  dynamic: RequestContextMap.get("requireRoles"),
  dependsOn: [AllowAnonymous]
}) {
}
export class AppMiddleware extends MiddlewareMaker
  .Tag<AppMiddleware>()("AppMiddleware", RequestContextMap)
  .middleware(RequireRoles)
  .middleware(AllowAnonymous)
  .middleware(...DefaultGenericMiddlewares)
{}
