import { User } from "#models/User"
import { S } from "#resources/lib"

export class UserItem extends S.ExtendedClass<UserItem, UserItem.Encoded>("UserItem")({
  id: User.fields.id,
  name: S.NonEmptyString2k
}) {}

// codegen:start {preset: model}
//
/* eslint-disable */
export namespace UserItem {
  export interface Encoded extends S.Struct.Encoded<typeof UserItem["fields"]> {}
}
/* eslint-enable */
//
// codegen:end
//
