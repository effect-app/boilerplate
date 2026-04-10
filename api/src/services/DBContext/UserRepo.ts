import { apiConfig } from "#config"
import { RepoDefault } from "#lib/layers"
import { User, UserFromIdResolver, type UserId } from "#models/User"
import { Model } from "@effect-app/infra"
import { NotFoundError, NotLoggedInError } from "@effect-app/infra/errors"
import { generate } from "@effect-app/infra/test"
import { Array, Context, Effect, Exit, Layer, Option, pipe, Request, RequestResolver, S } from "effect-app"
import { fakerArb } from "effect-app/faker"
import { Email } from "effect-app/Schema"
import fc from "fast-check"
import { Q } from "../lib.js"
import { UserProfile } from "../UserProfile.js"

export interface UserPersistenceModel extends S.Codec.Encoded<typeof User> {
  _etag: string | undefined
}

export type UserSeed = "sample" | ""

export class UserRepo extends Context.Service<UserRepo>()("UserRepo", {
  make: Effect.gen(function*() {
    const cfg = yield* apiConfig.repo

    const makeInitial = yield* Effect.cached(Effect.sync(() => {
      const seed = cfg.fakeUsers === "seed" ? "seed" : cfg.fakeUsers === "sample" ? "sample" : ""
      const fakeUsers = pipe(
        Array
          .range(1, 8)
          .map((_, i): User => {
            const g = generate(S.toArbitrary(User)).value
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

    const repo = yield* Model.makeRepo("User", User, { makeInitial })
    return Object.assign(repo, {
      get tryGetCurrentUser() {
        return Effect.gen(function*() {
          const userProfile = yield* Effect.serviceOption(UserProfile)
          if (Option.isNone(userProfile)) {
            return yield* new NotLoggedInError()
          }
          return yield* repo.get(userProfile.value.sub)
        })
      },
      get getCurrentUser() {
        return Effect.gen(function*() {
          const profile = yield* UserProfile
          return yield* repo.get(profile.sub)
        })
      }
    })
  })
}) {
  static DefaultWithoutDependencies = Layer.effect(this, this.make)
  static Default = this.DefaultWithoutDependencies.pipe(
    Layer.provide(RepoDefault)
  )

  static readonly getUserByIdResolver = Effect.gen(function*() {
    const userRepo = yield* UserRepo
    return RequestResolver
      .make((entries: [Request.Entry<GetUserById>, ...Array<Request.Entry<GetUserById>>]) =>
        Effect.gen(function*() {
          const users = yield* userRepo.query(Q.where("id", "in", entries.map((e) => e.request.id)))
          for (const entry of entries) {
            const user = Array.findFirst(users, (u) => u.id === entry.request.id)
            entry.completeUnsafe(
              Option.match(user, {
                onNone: () => Exit.fail(new NotFoundError({ type: "User", id: entry.request.id })),
                onSome: (u) => Exit.succeed(u)
              })
            )
          }
        })
      )
      .pipe(RequestResolver.batchN(25))
  })

  static readonly UserFromIdLayer = Layer
    .effect(
      UserFromIdResolver,
      Effect.gen(function*() {
        const resolver = yield* UserRepo.getUserByIdResolver
        return {
          get: (id: UserId) =>
            Effect
              .request(GetUserById({ id }), resolver)
              .pipe(Effect.orDie)
        }
      })
    )
    .pipe(Layer.provide(this.Default))
}

interface GetUserById extends Request.Request<User, NotFoundError<"User">> {
  readonly _tag: "GetUserById"
  readonly id: UserId
}
const GetUserById = Request.tagged<GetUserById>("GetUserById")
