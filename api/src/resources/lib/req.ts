import type { Role } from "#models/User"
import { NotLoggedInError, UnauthorizedError } from "@effect-app/infra/errors"
import { Duration, Layer, Request as EffectRequest } from "effect-app"
import { ApiClientFactory } from "effect-app/client/apiClientFactory"
import { makeRpcClient, type RPCContextMap } from "effect-app/client/req"

type CTXMap = {
  // we put `never`, because we can't access this service here in the client, and we also don't need to
  // TODO: a base map for client, that the server extends
  allowAnonymous: RPCContextMap.Inverted<"userProfile", never, typeof NotLoggedInError>
  // TODO: not boolean but `string[]`
  requireRoles: RPCContextMap.Custom<"", void, typeof UnauthorizedError, Array<string>>
}

export type RequestConfig = {
  /** Disable authentication requirement */
  allowAnonymous?: true
  /** Control the roles that are required to access the resource */
  allowRoles?: readonly Role[]
}

export const { TaggedRequest: Req } = makeRpcClient<RequestConfig, CTXMap>({
  allowAnonymous: NotLoggedInError,
  requireRoles: UnauthorizedError
})

export const RequestCacheLayers = Layer.mergeAll(
  Layer.setRequestCache(
    EffectRequest.makeCache({ capacity: 500, timeToLive: Duration.hours(8) })
  ),
  Layer.setRequestCaching(true),
  Layer.setRequestBatching(true)
)
export const clientFor = ApiClientFactory.makeFor(RequestCacheLayers)
