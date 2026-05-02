import { BlogPost } from "#models/Blog"
import { S } from "#resources/lib"

export class BlogPostView extends S.Opaque<BlogPostView, BlogPostView.Encoded>()(S.Struct({
  ...BlogPost.fields
  //...BlogPost.to.fields,
 // author: UserViewFromId
})) {} //.pipe(S.encodeKeys({ author: "authorId"}))) {}

// codegen:start {preset: model}
//
/* eslint-disable */
export namespace BlogPostView {
  export interface Encoded extends S.StructNestedEncoded<typeof BlogPostView> {}
}
/* eslint-enable */
//
// codegen:end
