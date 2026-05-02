import { S } from "effect-app"
import { UserFromId } from "./User.js"

export const BlogPostId = S.prefixedStringId<BlogPostId>()("post", "BlogPostId")
export interface BlogPostIdBrand {
  readonly BlogPostId: unique symbol
}
export type BlogPostId = S.StringId & BlogPostIdBrand & `post-${string}`

export class BlogPost extends S.Opaque<BlogPost, BlogPost.Encoded>()(
  S
    .Struct({
      id: BlogPostId.withDefault,
      title: S.NonEmptyString255,
      body: S.NonEmptyString2k,
      createdAt: S.Date.withDefault,
      author: UserFromId
    })
    .pipe(S.encodeKeys({ author: "authorId" }))
) {}

// codegen:start {preset: model}
//
/* eslint-disable */
export namespace BlogPost {
  export interface Encoded extends S.StructNestedEncoded<typeof BlogPost> {}
}
/* eslint-enable */
//
// codegen:end
