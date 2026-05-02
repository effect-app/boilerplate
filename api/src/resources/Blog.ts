import { BlogPost, BlogPostId } from "#models/Blog"
import { InvalidStateError, NotFoundError, OptimisticConcurrencyException } from "effect-app/client"
import { OperationId } from "effect-app/Operations"
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

export class PublishPost extends Req.Command<PublishPost>()("PublishPost", {
  id: BlogPostId
}, { allowRoles: ["user"], success: OperationId, error: S.Union([NotFoundError]) }) {}

