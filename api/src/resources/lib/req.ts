import { Layer } from "effect-app"
import { makeRpcClient } from "effect-app/client"
import { ApiClientFactory } from "effect-app/client/apiClientFactory"
import { RequestContextMap } from "./middleware.js"

export const { TaggedRequest: Req, TaggedRequestFor } = makeRpcClient(RequestContextMap)

export const RequestCacheLayers = Layer.empty
export const clientFor = ApiClientFactory.makeFor(RequestCacheLayers)
