import { UserFromIdResolver } from "#Accounts/models"
import { UserRepo } from "#Accounts/UserRepo"
import { RepoDefault } from "#api/lib/layers"
import { Model } from "@effect-app/infra"
import { Effect } from "effect"
import { Context } from "effect-app"
import { NonEmptyString255, NonEmptyString2k } from "effect-app/Schema"
import { BlogPost } from "./models.js"

export type BlogPostSeed = "sample" | ""

export class BlogPostRepo extends Effect.Service<BlogPostRepo>()("BlogPostRepo", {
  dependencies: [RepoDefault, UserRepo.Default, UserRepo.UserFromIdLayer],
  effect: Effect.gen(function*() {
    const seed = "sample"
    const userRepo = yield* UserRepo
    const resolver = yield* UserFromIdResolver

    const makeInitial = yield* Effect.cached(
      seed === "sample"
        ? userRepo
          .all
          .pipe(
            Effect.andThen((users) =>
              users
                .flatMap((_) => [_, _])
                .map((user, i) =>
                  new BlogPost({
                    title: NonEmptyString255("Test post " + i),
                    body: NonEmptyString2k("imma test body"),
                    author: user
                  }, true)
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
}
