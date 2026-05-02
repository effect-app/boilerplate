import { User } from "#models/User"
import { S } from "#resources/lib"

export class UserView extends S.Opaque<UserView, UserView.Encoded>()(S.Struct({
  id: User.fields.id,
  role: User.fields.role,
  displayName: S.NonEmptyString2k
})) {}

// codegen:start {preset: model}
//
/* eslint-disable */
export namespace UserView {
  export interface Encoded extends S.StructNestedEncoded<typeof UserView> {}
}
/* eslint-enable */
//
// codegen:end
//
