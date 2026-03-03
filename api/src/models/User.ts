import { Context, Effect, Equivalence, pipe, S } from "effect"
import { UserProfileId } from "effect-app/ids"

export const FirstName = S.NonEmptyString255.pipe(S.withDefault("FirstName"))
export type FirstName = typeof FirstName.Type

export const LastName = S.NonEmptyString255.pipe(S.withDefault("LastName"))
export type LastName = typeof LastName.Type

export const FullName = S.Struct({
  firstName: FirstName,
  lastName: LastName
})
export type FullName = typeof FullName.Type

export const UserId = UserProfileId
export type UserId = UserProfileId

export const Role = S.Literal("manager", "user").pipe(S.withDefault("user" as const))
export type Role = typeof Role.Type

export const UserInfo = {
  get: (userId: UserId) => Effect.fail(new Error("User not found"))
}

export const User = S.Struct({
  id: UserId,
  name: FullName,
  email: S.String,
  role: Role,
  passwordHash: S.NonEmptyString255
})
export type User = typeof User.Type

export const defaultEqual = Equivalence.struct<User>(
  {
    id: Equivalence.String,
    name: Equivalence.struct({ firstName: Equivalence.String, lastName: Equivalence.String }),
    email: Equivalence.String,
    role: Equivalence.String,
    passwordHash: Equivalence.String
  }
)
