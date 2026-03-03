import * as HttpMiddleware from "effect/unstable/http/HttpMiddleware"

export * from "@effect-app/infra/api/middlewares"

// codegen:start {preset: barrel, include: ./middleware/*.ts}
export * from "./middleware/events.js"
// codegen:end

export const gzip = HttpMiddleware.make((app) => app)

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
  void options
  return <A>(httpApp: A): A => httpApp
}
