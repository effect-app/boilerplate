import { NotLoggedInError, RPCContextMap, UnauthorizedError } from "effect-app/client"
import { contextMap, getConfig, makeMiddleware, Middleware } from "effect-app/rpc"
import { DefaultGenericMiddlewares } from "effect-app/rpc/middleware-native"

// get rid of in resources and frontend
import { UserProfile } from "./Userprofile.js"

export type RequestContextMap = {
  allowAnonymous: RPCContextMap.Inverted<typeof UserProfile, typeof NotLoggedInError>
  requireRoles: RPCContextMap.Custom<never, typeof UnauthorizedError, readonly string[]>
}
export const RequestContextMap = {
  allowAnonymous: RPCContextMap.makeInverted(UserProfile, NotLoggedInError),
  requireRoles: RPCContextMap.makeCustom(null as never, UnauthorizedError, Array<string>())
} as const
export const getConf = getConfig<RequestContextMap>()

export class AllowAnonymous extends Middleware.Tag<AllowAnonymous>()("AllowAnonymous", {
  dynamic: contextMap(RequestContextMap, "allowAnonymous")
}) {}

export class RequireRoles extends Middleware.Tag<RequireRoles>()("RequireRoles", {
  dynamic: contextMap(RequestContextMap, "requireRoles"),
  dependsOn: [AllowAnonymous]
}) {
}
export const RpcMiddleware = makeMiddleware(RequestContextMap)
  .middleware(RequireRoles)
  .middleware(AllowAnonymous)
  .middleware(...DefaultGenericMiddlewares)
