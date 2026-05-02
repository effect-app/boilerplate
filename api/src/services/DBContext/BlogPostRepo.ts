import { RepoDefault } from "#lib/layers"
import { BlogPost } from "#models/Blog"
import { UserFromIdResolver } from "#models/User"
import { Model } from "@effect-app/infra"
import { Effect, Layer } from "effect"
import { Context } from "effect-app"
import { NonEmptyString255, NonEmptyString2k } from "effect-app/Schema"
import { UserRepo } from "./UserRepo.js"

export type BlogPostSeed = "sample" | ""

export class BlogPostRepo extends Context.Service<BlogPostRepo>()("BlogPostRepo", {
  make: Effect.gen(function*() {
    const seed = "sample"
    const userRepo = yield* UserRepo
    const resolver = yield* UserFromIdResolver

    const makeInitial = yield* Effect.cached(
      seed === "sample"
        ? userRepo
          .all
          .pipe(
            Effect.map((users) =>
              users
                .flatMap((_) => [_, _])
                .map((user, i) =>
                  BlogPost.make({
                    title: NonEmptyString255("Test post " + i),
                    body: NonEmptyString2k("imma test body"),
                    author: user
                  })
                )
            )
          )
        : Effect.succeed([])
    )

    return yield* Model.makeRepo(
      "BlogPost",
      BlogPost,
      {
        makeInitial,
        schemaContext: Context.make(UserFromIdResolver, resolver)
      }
    )
  })
}) {
  static readonly Default = Layer.effect(BlogPostRepo, this.make).pipe(
    Layer.provide([RepoDefault, UserRepo.Default, UserRepo.UserFromIdLayer])
  )
}
