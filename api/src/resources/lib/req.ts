import { makeRpcClient } from "effect-app/client"
import { ApiClientFactory } from "effect-app/client/apiClientFactory"
import * as Layer from "effect-app/Layer"
import { AppMiddleware } from "./middleware.js"

export const { TaggedRequestFor } = makeRpcClient(AppMiddleware)

export const RequestCacheLayers = Layer.empty
export const clientFor = ApiClientFactory.makeFor(RequestCacheLayers)
