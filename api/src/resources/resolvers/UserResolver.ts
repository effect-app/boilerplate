import { Effect, Exit, Request, RequestResolver } from "effect"
import { Array, Option, pipe, S } from "effect-app"
import { ApiConfig, NotFoundError } from "effect-app/client"
import { HttpClient } from "effect-app/http"
import { type Schema } from "effect-app/Schema"
import { UserId } from "models/User.js"
import { clientFor } from "resources/lib.js"
import * as UsersRsc from "../Users.js"
import { UserView } from "../views/UserView.js"

interface GetUserViewById extends Request.Request<UserView, NotFoundError<"User">> {
  readonly _tag: "GetUserViewById"
  readonly id: UserId
}
const GetUserViewById = Request.tagged<GetUserViewById>("GetUserViewById")

const userClient = clientFor(UsersRsc)

const getUserViewByIdResolver = RequestResolver
  .makeBatched((requests: GetUserViewById[]) =>
    userClient
      .IndexUsers
      .handler({ filterByIds: pipe(requests.map((_) => _.id), Array.toNonEmptyArray, Option.getOrUndefined)! })
      .pipe(
        Effect.andThen(({ users }) =>
          Effect.forEach(requests, (r) =>
            Request.complete(
              r,
              Array
                .findFirst(users, (_) => _.id === r.id ? Option.some(Exit.succeed(_)) : Option.none())
                .pipe(Option.getOrElse(() => Exit.fail(new NotFoundError({ type: "User", id: r.id }))))
            ), { discard: true })
        ),
        Effect.orDie
      )
  )
  .pipe(RequestResolver.batchN(25), RequestResolver.contextFromServices(HttpClient.HttpClient, ApiConfig.Tag))

// TODO: How to globally cache - right now we had to move the RequestCache from the runtime to clientFor
export const UserViewFromId: Schema<UserView, string, ApiConfig | HttpClient.HttpClient> = S.transformOrFail(
  UserId,
  S.typeSchema(UserView),
  {
    decode: (id) => Effect.request(GetUserViewById({ id }), getUserViewByIdResolver).pipe(Effect.orDie),
    encode: (u) => Effect.succeed(u.id)
  }
)
