import { Duration, Layer, Request as EffectRequest } from "effect-app"
import { makeRpcClient } from "effect-app/client"
import { ApiClientFactory } from "effect-app/client/apiClientFactory"
import { RequestContextMap } from "./middleware.js"

export const { TaggedRequest: Req } = makeRpcClient(RequestContextMap)

export const RequestCacheLayers = Layer.mergeAll(
  Layer.setRequestCache(
    EffectRequest.makeCache({ capacity: 500, timeToLive: Duration.hours(8) })
  ),
  Layer.setRequestCaching(true),
  Layer.setRequestBatching(true)
)
export const clientFor = ApiClientFactory.makeFor(RequestCacheLayers)
