import { Router } from "#lib/routing"
import { BlogPost } from "#models/Blog"
import { BlogRsc } from "#resources"
import { PublishComplete, PublishProgress } from "#resources/Blog"
import { BogusEvent } from "#resources/Events"
import { BlogPostRepo, Events, UserRepo } from "#services"
import { Duration, Effect, Stream } from "effect"
import { Option } from "effect-app"
import { NonEmptyString, NonNegativeInt } from "effect-app/Schema"

export default Router(BlogRsc)({
  dependencies: [
    BlogPostRepo.Default,
    UserRepo.Default,
    Events.Default
  ],
  *effect(match) {
    const blogPostRepo = yield* BlogPostRepo
    const userRepo = yield* UserRepo
    const events = yield* Events

    return match({
      FindPost: (req) =>
        blogPostRepo
          .find(req.id)
          .pipe(Effect.map(Option.getOrNull)),
      GetPosts: blogPostRepo
        .all
        .pipe(Effect.map((items) => ({ items }))),
      CreatePost: (req) =>
        userRepo
          .getCurrentUser
          .pipe(
            Effect.map((author) => (BlogPost.make({ ...req, author }))),
            Effect.tap(blogPostRepo.save)
          ),
      PublishPost: (req) =>
        Stream.unwrap(
          blogPostRepo.get(req.id).pipe(
            Effect.map((post) => {
              console.log("publishing post", post)

              const targets = ["google", "twitter", "facebook"] as const
              const total = NonNegativeInt(targets.length)

              return Stream
                .make(new PublishProgress({ completed: NonNegativeInt(0), total }))
                .pipe(
                  Stream.concat(
                    Stream.fromIterable(targets).pipe(
                      Stream.zipWithIndex,
                      Stream.mapEffect(([, idx]) =>
                        Effect
                          .sleep(Duration.seconds(4))
                          .pipe(
                            Effect.tap(() => events.publish(new BogusEvent())),
                            Effect.as(
                              new PublishProgress({
                                completed: NonNegativeInt(idx + 1),
                                total
                              })
                            )
                          )
                      )
                    )
                  ),
                  Stream.concat(
                    Stream.make(
                      new PublishComplete({
                        result: NonEmptyString("the answer to the universe is 41")
                      })
                    )
                  )
                )
            })
          )
        )
    })
  }
})
