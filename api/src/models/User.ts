/* eslint-disable @typescript-eslint/unbound-method */
import { Context, Effect, Equivalence, pipe, S } from "effect-app"
import { UserProfileId } from "effect-app/ids"

export const FirstName = S.NonEmptyString255.pipe(S.withDefaultMake)
export type FirstName = typeof FirstName.Type

export const DisplayName = FirstName
export type DisplayName = typeof DisplayName.Type

export const LastName = S.NonEmptyString255.pipe(S.withDefaultMake)
export type LastName = typeof LastName.Type

export class FullName extends S.ExtendedClass<FullName, FullName.Encoded>("FullName")({
  firstName: FirstName,
  lastName: LastName
}) {}

export const UserId = UserProfileId
export type UserId = UserProfileId

export const Role = S.withDefaultMake(S.Literal("manager", "user"))
export type Role = typeof Role.Type

export class UserFromIdResolver
  extends Context.TagId("UserFromId")<UserFromIdResolver, { get: (userId: UserId) => Effect.Effect<User> }>()
{
  static readonly get = (userId: UserId) => this.use((_) => _.get(userId))
}

export class User extends S.ExtendedClass<User, User.Encoded>("User")({
  id: UserId.withDefault,
  name: FullName,
  email: S.Email,
  role: Role,
  passwordHash: S.NonEmptyString255
}) {
  get displayName() {
    return S.NonEmptyString2k(this.name.firstName + " " + this.name.lastName)
  }
  static readonly resolver = UserFromIdResolver
}

export const UserFromId = S.transformOrFail(
  UserId,
  S.typeSchema(User),
  { decode: User.resolver.get, encode: (u) => Effect.succeed(u.id) }
)

export const defaultEqual = pipe(Equivalence.String, Equivalence.mapInput((u: User) => u.id))

// codegen:start {preset: model}
//
/* eslint-disable */
export namespace FullName {
  export interface Encoded extends S.Struct.Encoded<typeof FullName["fields"]> {}
}
export namespace User {
  export interface Encoded extends S.Struct.Encoded<typeof User["fields"]> {}
}
/* eslint-enable */
//
// codegen:end
//
