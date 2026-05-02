import { UserId } from "#models/User"
import { clientFor } from "#resources/lib"
import { Context, Effect, Exit, Request, RequestResolver, SchemaGetter, SchemaIssue } from "effect"
import { Array, type NonEmptyArray, Option, S } from "effect-app"
import { ApiClientFactory, type NotFoundError } from "effect-app/client"
import * as UsersRsc from "../Users.js"
import { UserView } from "../views/UserView.js"
import { NonEmptyString255 } from "effect-app/Schema"


const makeUserViews = Effect.fn(function*() {
  const apiClientFactory = yield* ApiClientFactory

  class GetUserViewById extends Request.TaggedClass("GetUserViewById")<
    {
      readonly id: UserId
    },
    UserView,
    NotFoundError<"User">
  > {}

  const client = clientFor(UsersRsc)

  const getUserViewByIdResolver = yield* RequestResolver
    .make((entries: NonEmptyArray<Request.Entry<GetUserViewById>>) =>
      client.pipe(
        Effect.provideService(ApiClientFactory, apiClientFactory),
        Effect.flatMap(
          (userClient) =>
            Array.toNonEmptyArray(entries.map((_) => _.request)).pipe(
              Option.map((_) =>
                userClient.IndexUsers.handler({ filterByIds: _.map((_) => _.id) }).pipe(
                  Effect.map((_) => _.users),
                  Effect.orDie
                )
              ),
              Option.getOrElse(() => Effect.succeed([]))
            )
        ),
        Effect.flatMap(
          (users) =>
            Effect.forEach(entries, (entry) => {
              const u = users.find((_) => _.id === entry.request.id)
              return Request.complete(
                entry,
                u
                  ? Exit.succeed(u)
                  : Exit.succeed(
                    UserView.make({
                        id: entry.request.id,
                        displayName: NonEmptyString255("(entfernt)"),
                        role: "user"
                      })
                  ) // Exit.fail(new NotFoundError({ type: "User", id: r.id }))
              )
            }, { discard: true })
        ),
        Effect.provideContext(entries[0].context),
        Effect.orDie,
        Effect.catchCause((cause) =>
          Effect.forEach(
            entries,
            (entry) => Request.failCause(entry, cause),
            { discard: true }
          )
        )
      )
    )
    .pipe(
      RequestResolver.batchN(25),
      RequestResolver.withCache({ capacity: 1_000 })
    )

  return (id: UserId) =>
    Effect.request(new GetUserViewById({ id }), getUserViewByIdResolver).pipe(
      Effect.orDie,
      Effect.withSpan("UserViewFromIdResolver.getById " + id)
    )
})

export class UserViews
  extends Context.Service<UserViews, Effect.Success<ReturnType<typeof makeUserViews>>>()("UserViews")
{
  static readonly make = makeUserViews
}

export const UserViewFromId: S.Codec<UserView, string, UserViews> = UserId.pipe(
  S.decodeTo(S.toType(UserView), {
    decode: SchemaGetter.transformOrFail((id) => UserViews.use((_) => _(id))),
    encode: SchemaGetter.transformOrFail(
      (u) =>
        Effect.try({ try: () => u.id, catch: (e) => new SchemaIssue.InvalidValue(Option.none(), { message: `${e}` }) })
    )
  })
)