import { FetchHttpClient } from "@effect/platform"
import { RpcClient, RpcSerialization } from "@effect/rpc"
import { Layer } from "effect-app"

export const RpcClientProtocolLayers = (path: string) =>
  Layer.provideMerge(
    RpcClient.layerProtocolHttp({
      url: "http://localhost:3610/rpc" + path,
    }).pipe(Layer.provide(RpcSerialization.layerJson)),
    FetchHttpClient.layer,
  )
