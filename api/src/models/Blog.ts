import { S } from "effect-app"
import { UserFromId } from "./User.js"

export const BlogPostId = S.prefixedStringId<BlogPostId>()("post", "BlogPostId")
export interface BlogPostIdBrand {
  readonly BlogPostId: unique symbol
}
export type BlogPostId = S.StringId & BlogPostIdBrand & `post-${string}`

export class BlogPost extends S.ExtendedClass<BlogPost, BlogPost.Encoded>()({
  id: BlogPostId.withDefault,
  title: S.NonEmptyString255,
  body: S.NonEmptyString2k,
  createdAt: S.Date.withDefault,
  author: S.propertySignature(UserFromId).pipe(S.fromKey("authorId"))
}) {}

// codegen:start {preset: model}
//
/* eslint-disable */
export namespace BlogPost {
  export interface Encoded extends S.Struct.Encoded<typeof BlogPost["fields"]> {}
}
/* eslint-enable */
//
// codegen:end
