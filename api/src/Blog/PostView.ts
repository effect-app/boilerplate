import { UserViewFromId } from "#api/Accounts/UserResolver"
import { S } from "#resources/lib"
import { BlogPost } from "./models.js"

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
