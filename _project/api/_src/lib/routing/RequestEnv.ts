/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
import { Role } from "@effect-app-boilerplate/models/User"
import type { RequestConfig } from "@effect-app-boilerplate/resources/lib"
import type { RequestContext } from "@effect-app/infra/RequestContext"
import { RequestContextContainer } from "@effect-app/infra/services/RequestContextContainer"
import type { REST, StructFields } from "@effect-app/schema"
import { NotLoggedInError, UnauthorizedError } from "api/errors.js"
import { Auth0Config, checkJWTI } from "api/middleware/auth.js"
import type {
  InsufficientScopeError,
  InvalidRequestError,
  InvalidTokenError,
  UnauthorizedError as JWTUnauthorizedError
} from "express-oauth2-jwt-bearer"
import {
  makeUserProfileFromAuthorizationHeader,
  makeUserProfileFromUserHeader,
  UserProfile
} from "../../services/UserProfile.js"
import { HttpServerRequest } from "../http.js"
import type { GetCTX } from "./ctx.js"

const authConfig = Auth0Config.runSync$

export class JWTError extends Data.TaggedClass("JWTError")<{
  error:
    | InsufficientScopeError
    | InvalidRequestError
    | InvalidTokenError
    | JWTUnauthorizedError
}> {}

const manager = "manager" as const

const EmptyLayer = Effect.unit.toLayerDiscard

const fakeLogin = true

const UserAuthorizationLive = <Req extends RequestConfig>(request: Req) =>
  Effect
    .gen(function*($) {
      if (!fakeLogin && !request.allowAnonymous) {
        yield* $(checkJWTI(authConfig).catchAll((err) => Effect.fail(new JWTError({ error: err }))))
      }
      const req = yield* $(HttpServerRequest)
      const r = (fakeLogin
        ? makeUserProfileFromUserHeader(req.headers["x-user"])
        : makeUserProfileFromAuthorizationHeader(
          req.headers["authorization"]
        ))
        .exit
        .runSync$
      const userProfile = Option.fromNullable(r.isSuccess() ? r.value : undefined)

      const rcc = yield* $(RequestContextContainer)
      yield* $(rcc.update((_): RequestContext => ({ ..._, userProfile: userProfile.value })))

      const up = userProfile.value
      if (!request.allowAnonymous && !up) {
        return yield* $(new NotLoggedInError())
      }

      const userRoles = userProfile
        .map((_) => _.roles.includes(manager as any) ? [Role("manager"), Role("user")] : [Role("user")])
        .getOrElse(() => [Role("user")])

      const allowedRoles: readonly Role[] = request.allowedRoles ?? ["user"]
      if (!allowedRoles.some((_) => userRoles.includes(_))) {
        return yield* $(new UnauthorizedError())
      }
      if (up) {
        return Layer.succeed(UserProfile, up)
      }
      return EmptyLayer
    })
    .withSpan("middleware")
    .unwrapLayer

export const RequestEnv = <Req extends RequestConfig>(handler: { Request: Req }) =>
  Layer.mergeAll(UserAuthorizationLive(handler.Request))

export type RequestEnv = Layer.Success<ReturnType<typeof RequestEnv>>

export function handleRequestEnv<
  R,
  M,
  PathA extends StructFields,
  CookieA extends StructFields,
  QueryA extends StructFields,
  BodyA extends StructFields,
  HeaderA extends StructFields,
  ReqA extends PathA & QueryA & BodyA,
  ResA extends StructFields,
  ResE,
  PPath extends `/${string}`
>(
  handler: RequestHandler<R, M, PathA, CookieA, QueryA, BodyA, HeaderA, ReqA, ResA, ResE, PPath>
) {
  return {
    handler: {
      ...handler,
      h: (pars: any) =>
        Effect
          .all({
            context: RequestContextContainer.get,
            userProfile: Effect.serviceOption(UserProfile).map((_) => _.getOrUndefined)
          })
          .flatMap((ctx) =>
            (handler.h as (i: any, ctx: GetCTX<typeof handler>) => Effect<R, ResE, ResA>)(pars, ctx as any /* TODO */)
          )
    },
    makeRequestLayer: RequestEnv(handler)
  }
}

export type Request<
  M,
  PathA extends StructFields,
  CookieA extends StructFields,
  QueryA extends StructFields,
  BodyA extends StructFields,
  HeaderA extends StructFields,
  ReqA extends PathA & QueryA & BodyA,
  PPath extends `/${string}`
> = REST.ReqRes<any, any> & {
  method: REST.Methods.Rest
  path: PPath
  Cookie?: CookieA
  Path?: PathA
  Body?: BodyA
  Query?: QueryA
  Headers?: HeaderA
  Tag: Tag<M, M>
  ReqA?: ReqA
}

export interface RequestHandlerBase<
  R,
  M,
  PathA extends StructFields,
  CookieA extends StructFields,
  QueryA extends StructFields,
  BodyA extends StructFields,
  HeaderA extends StructFields,
  ReqA extends PathA & QueryA & BodyA,
  ResA extends StructFields,
  ResE,
  PPath extends `/${string}`
> extends RequestConfig {
  adaptResponse?: any
  h: (i: PathA & QueryA & BodyA & {}) => Effect<R, ResE, ResA>
  Request: Request<M, PathA, CookieA, QueryA, BodyA, HeaderA, ReqA, PPath>
  Response: REST.ReqRes<any, any>
  ResponseOpenApi?: any
}

export interface RequestHandler<
  R,
  M,
  PathA extends StructFields,
  CookieA extends StructFields,
  QueryA extends StructFields,
  BodyA extends StructFields,
  HeaderA extends StructFields,
  ReqA extends PathA & QueryA & BodyA,
  ResA extends StructFields,
  ResE,
  PPath extends `/${string}`
> {
  adaptResponse?: any
  h: (i: PathA & QueryA & BodyA & {}, ctx: any /* TODO */) => Effect<R, ResE, ResA>
  Request: Request<M, PathA, CookieA, QueryA, BodyA, HeaderA, ReqA, PPath> & RequestConfig
  Response: REST.ReqRes<any, any>
  ResponseOpenApi?: any
}

export interface RequestHandlerOrig<
  R,
  M,
  PathA extends StructFields,
  CookieA extends StructFields,
  QueryA extends StructFields,
  BodyA extends StructFields,
  HeaderA extends StructFields,
  ReqA extends PathA & QueryA & BodyA,
  ResA extends StructFields,
  ResE,
  PPath extends `/${string}`
> {
  adaptResponse?: any
  h: (i: PathA & QueryA & BodyA & {}) => Effect<R, ResE, ResA>
  Request: Request<M, PathA, CookieA, QueryA, BodyA, HeaderA, ReqA, PPath> & RequestConfig
  Response: REST.ReqRes<any, any>
  ResponseOpenApi?: any
}
