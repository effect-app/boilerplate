import { Effect, Equivalence, Option, S } from "effect-app"
import { UserProfileId } from "effect-app/ids"

export const FirstName = S.NonEmptyString255.pipe(
  S.withConstructorDefault(() => Option.some(S.NonEmptyString255("FirstName")))
)
export type FirstName = typeof FirstName.Type

export const LastName = S.NonEmptyString255.pipe(
  S.withConstructorDefault(() => Option.some(S.NonEmptyString255("LastName")))
)
export type LastName = typeof LastName.Type

export const FullName = S.Struct({
  firstName: FirstName,
  lastName: LastName
})
export type FullName = typeof FullName.Type

export const UserId = UserProfileId
export type UserId = UserProfileId

export const Role = S.Literal("manager", "user").pipe(S.withConstructorDefault(() => Option.some("user" as const)))
export type Role = typeof Role.Type

export const UserInfo = {
  get: (_userId: UserId) => Effect.fail(new Error("User not found"))
}

export const User = S.Struct({
  id: UserId,
  name: FullName,
  email: S.String,
  role: Role,
  passwordHash: S.NonEmptyString255
})
export type User = typeof User.Type

export const defaultEqual = Equivalence.Struct(
  {
    id: Equivalence.String,
    name: Equivalence.Struct({ firstName: Equivalence.String, lastName: Equivalence.String }),
    email: Equivalence.String,
    role: Equivalence.String,
    passwordHash: Equivalence.String
  }
)
