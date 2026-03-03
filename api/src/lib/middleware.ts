import { HttpApp, HttpServerRequest } from "@effect/platform"
import { Context, Effect } from "effect-app"
import { HttpHeaders, HttpMiddleware, HttpServerResponse } from "effect-app/http"
import { type ReadonlyRecord } from "effect/Record"
import z from "zlib"

export * from "@effect-app/infra/api/middlewares"

// codegen:start {preset: barrel, include: ./middleware/*.ts}
export * from "./middleware/events.js"
// codegen:end

export const gzip = HttpMiddleware.make(
  (app) =>
    Effect.gen(function*() {
      const r = yield* app
      const body = r.body
      if (
        body._tag !== "Uint8Array"
        || body.contentLength === 0
      ) return r

      const req = yield* HttpServerRequest.HttpServerRequest
      if (
        !req
          .headers["accept-encoding"]
          ?.split(",")
          .map((_) => _.trim())
          .includes("gzip")
      ) return r

      // TODO: a stream may be better, for realtime compress?
      const buffer = yield* Effect.async<Buffer>((cb) =>
        z.gzip(body.body, (err, r) => cb(err ? Effect.die(err) : Effect.succeed(r)))
      )

      return HttpServerResponse.uint8Array(
        buffer,
        {
          cookies: r.cookies,
          status: r.status,
          statusText: r.statusText,
          contentType: body.contentType,
          headers: HttpHeaders.fromInput({ ...r.headers, "Content-Encoding": "gzip" })
        }
      )
    })
)

/**
 * a modified version that takes a function to determine if the origin is allowed.
 */
export const cors = (options?: {
  readonly allowedOrigins?: ReadonlyArray<string> | ((origin: string) => boolean)
  readonly allowedMethods?: ReadonlyArray<string>
  readonly allowedHeaders?: ReadonlyArray<string>
  readonly exposedHeaders?: ReadonlyArray<string>
  readonly maxAge?: number
  readonly credentials?: boolean
}) => {
  const opts = {
    allowedOrigins: ["*"],
    allowedMethods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
    allowedHeaders: [],
    exposedHeaders: [],
    credentials: false,
    ...options
  }
  const makeAllowedOrigins = (allowedOrigins: ReadonlyArray<string> | ((origin: string) => boolean)) => {
    if (typeof allowedOrigins === "function") {
      return (originHeader: string | undefined) => {
        if (originHeader && allowedOrigins(originHeader)) {
          return {
            "access-control-allow-origin": originHeader,
            vary: "Origin"
          }
        }
        return undefined
      }
    }

    const isAllowedOrigin = (origin: string) => allowedOrigins.includes(origin)

    return (originHeader: string | undefined): ReadonlyRecord<string, string> | undefined => {
      if (!originHeader) return undefined
      if (allowedOrigins.length === 0) {
        return { "access-control-allow-origin": "*" }
      }

      if (allowedOrigins.length === 1) {
        return {
          "access-control-allow-origin": allowedOrigins[0]!,
          vary: "Origin"
        }
      }

      if (isAllowedOrigin(originHeader)) {
        return {
          "access-control-allow-origin": originHeader,
          vary: "Origin"
        }
      }

      return undefined
    }
  }

  const allowOrigin = makeAllowedOrigins(opts.allowedOrigins)

  const allowMethods = opts.allowedMethods.length > 0
    ? { "access-control-allow-methods": opts.allowedMethods.join(", ") }
    : undefined

  const allowCredentials = opts.credentials
    ? { "access-control-allow-credentials": "true" }
    : undefined

  const allowHeaders = (
    accessControlRequestHeaders: string | undefined
  ): ReadonlyRecord<string, string> | undefined => {
    if (opts.allowedHeaders.length === 0 && accessControlRequestHeaders) {
      return {
        vary: "Access-Control-Request-Headers",
        "access-control-allow-headers": accessControlRequestHeaders
      }
    }

    if (opts.allowedHeaders) {
      return {
        "access-control-allow-headers": opts.allowedHeaders.join(",")
      }
    }

    return undefined
  }

  const exposeHeaders = opts.exposedHeaders.length > 0
    ? { "access-control-expose-headers": opts.exposedHeaders.join(",") }
    : undefined

  const maxAge = opts.maxAge
    ? { "access-control-max-age": opts.maxAge.toString() }
    : undefined

  const headersFromRequest = (request: HttpServerRequest.HttpServerRequest) => {
    const origin = request.headers["origin"]
    return HttpHeaders.unsafeFromRecord({
      ...allowOrigin(origin),
      ...allowCredentials,
      ...exposeHeaders
    })
  }

  const headersFromRequestOptions = (request: HttpServerRequest.HttpServerRequest) => {
    const origin = request.headers["origin"]!
    const accessControlRequestHeaders = request.headers["access-control-request-headers"]
    return HttpHeaders.unsafeFromRecord({
      ...allowOrigin(origin),
      ...allowCredentials,
      ...exposeHeaders,
      ...allowMethods,
      ...allowHeaders(accessControlRequestHeaders),
      ...maxAge
    })
  }

  const preResponseHandler = (
    request: HttpServerRequest.HttpServerRequest,
    response: HttpServerResponse.HttpServerResponse
  ) => Effect.succeed(HttpServerResponse.setHeaders(response, headersFromRequest(request)))

  return <E, R>(httpApp: HttpApp.Default<E, R>): HttpApp.Default<E, R> =>
    Effect.withFiberRuntime((fiber) => {
      const request = Context.unsafeGet(fiber.currentContext, HttpServerRequest.HttpServerRequest)
      if (request.method === "OPTIONS") {
        return Effect.succeed(HttpServerResponse.empty({
          status: 204,
          headers: headersFromRequestOptions(request)
        }))
      }
      return Effect.zipRight(HttpApp.appendPreResponseHandler(preResponseHandler), httpApp)
    })
}
