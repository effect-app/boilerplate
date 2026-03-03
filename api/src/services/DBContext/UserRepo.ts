import { RepoConfig } from "#config"
import { RepoDefault } from "#lib/layers"
import { User, type UserId } from "#models/User"
import { Model } from "@effect-app/infra"
import { NotFoundError, NotLoggedInError } from "@effect-app/infra/errors"
import { generate } from "@effect-app/infra/test"
import { Array, Effect, Exit, Layer, Option, pipe, Request, RequestResolver, S } from "effect-app"
import { fakerArb } from "effect-app/faker"
import { Email } from "effect-app/Schema"
import fc from "fast-check"
import { Q } from "../lib.js"
import { UserProfile } from "../UserProfile.js"

export interface UserPersistenceModel extends User.Encoded {
  _etag: string | undefined
}

export type UserSeed = "sample" | ""

export class UserRepo extends Effect.Service<UserRepo>()("UserRepo", {
  dependencies: [RepoDefault],
  effect: Effect.gen(function*() {
    const cfg = yield* RepoConfig

    const makeInitial = yield* Effect.cached(Effect.sync(() => {
      const seed = cfg.fakeUsers === "seed" ? "seed" : cfg.fakeUsers === "sample" ? "sample" : ""
      const fakeUsers = pipe(
        Array
          .range(1, 8)
          .map((_, i): User => {
            const g = generate(S.A.make(User)).value
            const emailArb = fakerArb((_) => () =>
              _
                .internet
                .exampleEmail({ firstName: g.name.firstName, lastName: g.name.lastName })
            )
            return new User({
              ...g,
              email: Email(generate(emailArb(fc)).value),
              role: i === 0 || i === 1 ? "manager" : "user"
            })
          }),
        Array.toNonEmptyArray,
        Option
          .match({
            onNone: () => {
              throw new Error("must have fake users")
            },
            onSome: (_) => _
          })
      )
      const items = seed === "sample" ? fakeUsers : []
      return items
    }))

    return yield* Model.makeRepo("User", User, { makeInitial })
  })
}) {
  get tryGetCurrentUser() {
    return Effect.serviceOption(UserProfile).pipe(
      Effect.andThen((_) => _.pipe(Effect.mapError(() => new NotLoggedInError()))),
      Effect.andThen((_) => this.get(_.sub))
    )
  }

  get getCurrentUser() {
    return UserProfile.pipe(
      Effect.andThen((_) => this.get(_.sub))
    )
  }

  static readonly getUserByIdResolver = RequestResolver
    .makeBatched((requests: GetUserById[]) =>
      this.use((_) =>
        _
          .query(Q.where("id", "in", requests.map((_) => _.id)))
          .pipe(Effect.andThen((users) =>
            Effect.forEach(requests, (r) =>
              Request.complete(
                r,
                Array
                  .findFirst(users, (_) => _.id === r.id ? Option.some(Exit.succeed(_)) : Option.none())
                  .pipe(Option.getOrElse(() => Exit.fail(new NotFoundError({ type: "User", id: r.id }))))
              ), { discard: true })
          ))
      )
    )
    .pipe(
      RequestResolver.batchN(25),
      RequestResolver.contextFromServices(UserRepo)
    )
  static readonly UserFromIdLayer = User
    .resolver
    .toLayer(
      this.use((userRepo) =>
        this
          .getUserByIdResolver
          .pipe(
            Effect.provideService(this, userRepo),
            Effect.map((resolver) => ({
              get: (id: UserId) =>
                Effect
                  .request(GetUserById({ id }), resolver)
                  .pipe(Effect.orDie)
            }))
          )
      )
    )
    .pipe(Layer.provide(this.Default))
}

interface GetUserById extends Request.Request<User, NotFoundError<"User">> {
  readonly _tag: "GetUserById"
  readonly id: UserId
}
const GetUserById = Request.tagged<GetUserById>("GetUserById")
