/* eslint-disable @typescript-eslint/no-explicit-any */
import { Rpc, RpcClient, RpcGroup, RpcSerialization } from "@effect/rpc"
import { Config, Context, Effect, flow, HashMap, Layer, Option, Predicate, S, Struct } from "effect-app"
import type { Client, Requests } from "effect-app/client/clientFor"
import { HttpClient, HttpClientRequest } from "effect-app/http"
import { typedKeysOf, typedValuesOf } from "effect-app/utils"

export interface ApiConfig {
  url: string
  headers: Option<HashMap<string, string>>
}

export const DefaultApiConfig = Config.all({
  url: Config.string("apiUrl").pipe(Config.withDefault("/api")),
  headers: Config
    .hashMap(
      Config.string(),
      "headers"
    )
    .pipe(Config.option)
})

type Req = S.Schema.All & {
  new(...args: any[]): any
  _tag: string
  fields: S.Struct.Fields
  success: S.Schema.Any
  failure: S.Schema.Any
  config?: Record<string, any>
}

const makeApiClientFactory = (config: ApiConfig) =>
  Effect.gen(function*() {
    const baseClient = yield* HttpClient.HttpClient
    const client = baseClient.pipe(
      HttpClient.mapRequest(HttpClientRequest.prependUrl(config.url + "/rpc")),
      HttpClient.mapRequest(
        HttpClientRequest.setHeaders(config.headers.pipe(Option.getOrElse(() => HashMap.empty())))
      )
    )

    const makeClientFor = <M extends Requests>(resource: M, requestLevelLayers = Layer.empty) => {
      type Filtered = {
        [K in keyof Requests as Requests[K] extends Req ? K : never]: Requests[K] extends Req ? Requests[K] : never
      }
      // TODO: Record.filter
      const filtered = typedKeysOf(resource).reduce((acc, cur) => {
        if (
          Predicate.isObject(resource[cur])
          && (resource[cur].success)
        ) {
          acc[cur as keyof Filtered] = resource[cur]
        }
        return acc
      }, {} as Record<keyof Filtered, Req>)

      const meta = (resource as any).meta as { moduleName: string }
      if (!meta) throw new Error("No meta defined in Resource!")

      const rpcs = RpcGroup.make(
        ...typedValuesOf(filtered).map((_) => {
          return Rpc.fromTaggedRequest(_ as any)
        })
      )

      class TheClient extends Context.Tag(meta.moduleName)<
        TheClient,
        RpcClient.RpcClient<RpcGroup.Rpcs<typeof rpcs>>
      >() {
        static layer = Layer.scoped(TheClient, RpcClient.make(rpcs))
      }

      const clientLayer = TheClient.layer.pipe(
        Layer.provide(
          RpcClient.layerProtocolHttp({
            url: "",
            transformClient: flow(
              HttpClient.mapRequest(HttpClientRequest.appendUrl("/" + meta.moduleName))
            )
          })
        ),
        Layer.provide(RpcSerialization.layerJson)
      )

      return (typedKeysOf(filtered)
        .reduce((prev, cur) => {
          const h = filtered[cur]!

          const Request = h
          const Response = h.success

          const requestName = `${meta.moduleName}.${cur as string}`
            .replaceAll(".js", "")

          const requestMeta = {
            Request,
            name: requestName
          }

          const localClient = client
            .pipe(
              HttpClient.mapRequest(HttpClientRequest.appendUrlParam("action", cur as string))
            )

          const fields = Struct.omit(Request.fields, "_tag")
          // @ts-expect-error doc
          prev[cur] = Object.keys(fields).length === 0
            ? {
              handler: TheClient.pipe(
                Effect.flatMap((client) => client[cur]!(new Request()) as Effect<any, any, never>),
                Effect.withSpan("client.request " + requestName, {
                  captureStackTrace: false,
                  attributes: { "request.name": requestName }
                }),
                Effect.provide(requestLevelLayers),
                Effect.provide(clientLayer), // TODO; make shared runtime for each request
                Effect.provide(Layer.succeed(HttpClient.HttpClient, localClient))
              ),
              ...requestMeta,
              raw: {
                handler: TheClient.pipe(
                  Effect.flatMap((client) => client[cur]!(new Request()) as Effect<any, any, never>),
                  Effect.flatMap((res) => S.encode(Response)(res)), // TODO,
                  Effect.withSpan("client.request " + requestName, {
                    captureStackTrace: false,
                    attributes: { "request.name": requestName }
                  }),
                  Effect.provide(requestLevelLayers),
                  Effect.provide(clientLayer), // TODO; make shared runtime for each request
                  Effect.provide(Layer.succeed(HttpClient.HttpClient, localClient))
                ),
                ...requestMeta
              }
            }
            : {
              handler: (req: any) =>
                TheClient.pipe(
                  Effect.flatMap((client) => client[cur]!(new Request(req)) as Effect<any, any, never>),
                  Effect.withSpan("client.request " + requestName, {
                    captureStackTrace: false,
                    attributes: { "request.name": requestName }
                  }),
                  Effect.provide(requestLevelLayers),
                  Effect.provide(clientLayer), // TODO; make shared runtime for each request
                  Effect.provide(Layer.succeed(HttpClient.HttpClient, localClient))
                ),

              ...requestMeta,
              raw: {
                handler: (req: any) =>
                  TheClient.pipe(
                    Effect.flatMap((client) => client[cur]!(new Request(req)) as Effect<any, any, never>),
                    Effect.flatMap((res) => S.encode(Response)(res)), // TODO,
                    Effect.withSpan("client.request " + requestName, {
                      captureStackTrace: false,
                      attributes: { "request.name": requestName }
                    }),
                    Effect.provide(requestLevelLayers),
                    Effect.provide(clientLayer), // TODO; make shared runtime for each request
                    Effect.provide(Layer.succeed(HttpClient.HttpClient, localClient))
                  ),

                ...requestMeta
              }
            }

          return prev
        }, {} as Client<M>))
    }

    function makeClientForCached(requestLevelLayers: Layer.Layer<never, never, never>) {
      const cache = new Map<any, Client<any>>()

      return <M extends Requests>(
        models: M
      ): Client<Omit<M, "meta">> => {
        const found = cache.get(models)
        if (found) {
          return found
        }
        const m = makeClientFor(models, requestLevelLayers)
        cache.set(models, m)
        return m
      }
    }

    return makeClientForCached
  })

/**
 * Used to create clients for resource modules.
 */
export class ApiClientFactory
  extends Context.TagId("ApiClientFactory")<ApiClientFactory, Effect.Success<ReturnType<typeof makeApiClientFactory>>>()
{
  static readonly layer = (config: ApiConfig) => this.toLayer(makeApiClientFactory(config))
  static readonly layerFromConfig = DefaultApiConfig.pipe(Effect.map(this.layer), Layer.unwrapEffect)

  static readonly makeFor =
    (requestLevelLayers: Layer.Layer<never, never, never>) => <M extends Requests>(resource: M) =>
      this
        .use((apiClientFactory) => apiClientFactory(requestLevelLayers))
        .pipe(Effect.map((f) => f(resource))) // don't rename f to clientFor or integration in vue project linked fucks up
}
