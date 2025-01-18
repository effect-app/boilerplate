import { S } from "#resources/lib"
import { InvalidStateError, NotFoundError, OptimisticConcurrencyException } from "effect-app/client"
import { OperationId } from "effect-app/Operations"
import { BlogPost, BlogPostId } from "./models.js"
import { BlogPostView } from "./PostView.js"

export class CreatePost extends S.Req<CreatePost>()("CreatePost", BlogPost.pick("title", "body"), {
  allowRoles: ["user"],
  success: S.Struct({ id: BlogPostId }),
  failure: S.Union(NotFoundError, InvalidStateError, OptimisticConcurrencyException)
}) {}

export class FindPost extends S.Req<FindPost>()("FindPost", {
  id: BlogPostId
}, { allowAnonymous: true, allowRoles: ["user"], success: S.NullOr(BlogPostView) }) {}

export class GetPosts extends S.Req<GetPosts>()("GetPosts", {}, {
  allowAnonymous: true,
  allowRoles: ["user"],
  success: S.Struct({
    items: S.Array(BlogPostView)
  })
}) {}

export class PublishPost extends S.Req<PublishPost>()("PublishPost", {
  id: BlogPostId
}, { allowRoles: ["user"], success: OperationId, failure: S.Union(NotFoundError) }) {}

// codegen:start {preset: meta, sourcePrefix: src/}
export const meta = { moduleName: "Blog" } as const
// codegen:end

export * as BlogRsc from "./resources.js"
