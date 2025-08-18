import { NotLoggedInError, UnauthorizedError } from "effect-app/client"

// get rid of in resources and frontend
import { DefaultGenericMiddlewares } from "effect-app/middleware"
import { MiddlewareMaker, RpcMiddleware } from "effect-app/rpc"
import { contextMap, getConfig, RpcContextMap } from "effect-app/rpc/RpcContextMap"
import { UserProfile } from "./Userprofile.js"

export type RequestContextMap = {
  allowAnonymous: RpcContextMap.Inverted<typeof UserProfile, typeof NotLoggedInError>
  requireRoles: RpcContextMap.Custom<never, typeof UnauthorizedError, readonly string[]>
}
export const RequestContextMap = {
  allowAnonymous: RpcContextMap.makeInverted(UserProfile, NotLoggedInError),
  requireRoles: RpcContextMap.makeCustom(null as never, UnauthorizedError, Array<string>())
} as const
export const getConf = getConfig<RequestContextMap>()

export class AllowAnonymous extends RpcMiddleware.Tag<AllowAnonymous>()("AllowAnonymous", {
  dynamic: contextMap(RequestContextMap, "allowAnonymous")
}) {}

export class RequireRoles extends RpcMiddleware.Tag<RequireRoles>()("RequireRoles", {
  dynamic: contextMap(RequestContextMap, "requireRoles"),
  dependsOn: [AllowAnonymous]
}) {
}
export class AppMiddleware extends MiddlewareMaker
  .Tag<AppMiddleware>()("AppMiddleware", RequestContextMap)
  .middleware(RequireRoles)
  .middleware(AllowAnonymous)
  .middleware(...DefaultGenericMiddlewares)
{}
