import { BlogPost, BlogPostId } from "#models/Blog"
import { InvalidStateError, NotFoundError, OptimisticConcurrencyException } from "effect-app/client"
import { S, TaggedRequestFor } from "./lib.js"
import { BlogPostView } from "./views.js"
import { Struct } from "effect-app"

// codegen:start {preset: meta, sourcePrefix: src/resources/}
const Req = TaggedRequestFor("Blog")
// codegen:end

export class CreatePost extends Req.Command<CreatePost>()("CreatePost", Struct.pick(BlogPost.to.fields, ["title", "body"]), {
  allowRoles: ["user"],
  success: S.Struct({ id: BlogPostId }),
  error: S.Union([NotFoundError, InvalidStateError, OptimisticConcurrencyException])
}) {}

export class FindPost extends Req.Query<FindPost>()("FindPost", {
  id: BlogPostId
}, { allowAnonymous: true, allowRoles: ["user"], success: S.NullOr(BlogPostView) }) {}

export class GetPosts extends Req.Query<GetPosts>()("GetPosts", {}, {
  allowAnonymous: true,
  allowRoles: ["user"],
  success: S.Struct({
    items: S.Array(BlogPostView)
  })
}) {}

export class PublishProgress extends S.TaggedClass<PublishProgress>()("PublishProgress", {
  completed: S.NonNegativeInt,
  total: S.NonNegativeInt
}) {}

export class PublishComplete extends S.TaggedClass<PublishComplete>()("PublishComplete", {
  result: S.NonEmptyString
}) {}

export class PublishPost extends Req.Stream<PublishPost>()("PublishPost", {
  id: BlogPostId
}, {
  allowRoles: ["user"],
  success: S.Union([PublishProgress, PublishComplete]),
  error: S.Union([NotFoundError])
}) {}
