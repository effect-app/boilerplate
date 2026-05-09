import { User } from "#models/User"
import { S } from "#resources/lib"

export class UserItem extends S.Opaque<UserItem, UserItem.Encoded>()(S.Struct({
  id: User.fields.id,
  name: S.NonEmptyString2k
})) {}

// codegen:start {preset: model}
//
/* eslint-disable */
export namespace UserItem {
  export interface Encoded extends S.StructNestedEncoded<typeof UserItem> {}
}
/* eslint-enable */
//
// codegen:end
//
