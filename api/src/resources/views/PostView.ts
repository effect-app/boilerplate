import { BlogPost } from "#models/Blog"
import { S } from "#resources/lib"
import { UserViewFromId } from "../resolvers/UserResolver.js"

export class BlogPostView extends S.ExtendedClass<BlogPostView, BlogPostView.Encoded>()({
  ...BlogPost.omit("author"),
  author: S.propertySignature(UserViewFromId).pipe(S.fromKey("authorId"))
}) {}

// codegen:start {preset: model}
//
/* eslint-disable */
export namespace BlogPostView {
  export interface Encoded extends S.Struct.Encoded<typeof BlogPostView["fields"]> {}
}
/* eslint-enable */
//
// codegen:end
