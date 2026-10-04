import { makeRpcClient } from "effect-app/client"
import { ApiClientFactory } from "effect-app/client/apiClientFactory"
import { DatabaseError, InvalidStateError, NotFoundError, NotLoggedInError, OptimisticConcurrencyException, UnauthorizedError } from "effect-app/client/errors"
import * as Layer from "effect-app/Layer"
import * as S from "effect-app/Schema"
import { AppMiddleware } from "./middleware.ts"

const Sup = S.Union([
  InvalidStateError,
  OptimisticConcurrencyException,
  NotFoundError,
  NotLoggedInError,
  UnauthorizedError,
  // A DB infra failure can surface from any repo-backed handler; allow + encode
  // it on every request so the api/client/FE treat it as a known (500-class)
  // error instead of a type mismatch.
  DatabaseError
])

export const { TaggedRequestFor } = makeRpcClient(AppMiddleware, Sup)

export const RequestCacheLayers = Layer.empty
export const clientFor = ApiClientFactory.makeFor(RequestCacheLayers)
