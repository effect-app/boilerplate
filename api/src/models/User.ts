/* eslint-disable @typescript-eslint/unbound-method */
import * as Context from "effect-app/Context"
import type * as Effect from "effect-app/Effect"
import { pipe } from "effect-app/Function"
import { UserProfileId } from "effect-app/ids"
import * as S from "effect-app/Schema"
import * as Equivalence from "effect/Equivalence"
import * as SchemaGetter from "effect/SchemaGetter"

// Name-shaped arbitrary constraints (native arbitrary generation has no faker hook).
const nameSamples = S.makeFilter<string>(() => undefined, {
  arbitraryConstraint: { patterns: [{ source: "^[A-Z][a-z]{2,11}$", flags: "" }] }
})

export const FirstName = S
  .NonEmptyString255
  .pipe(
    S.check(nameSamples),
    S.withDefaultMake
  )

export type FirstName = typeof FirstName.Type

export const DisplayName = FirstName
export type DisplayName = typeof DisplayName.Type

export const LastName = S
  .NonEmptyString255
  .pipe(
    S.check(nameSamples),
    S.withDefaultMake
  )

export type LastName = typeof LastName.Type

export class FullName extends S.Opaque<FullName, FullName.Encoded>()(S.Struct({
  firstName: FirstName,
  lastName: LastName
})) {
  static render(this: void, fn: FullName) {
    return S.NonEmptyString2k(`${fn.firstName} ${fn.lastName}`)
  }

  static create(this: void, firstName: FirstName, lastName: LastName) {
    return FullName.make({ firstName, lastName })
  }
}

export function showFullName(fn: FullName) {
  return FullName.render(fn)
}

export function createFullName(firstName: string, lastName: string) {
  return { firstName, lastName }
}

export const UserId = UserProfileId
export type UserId = UserProfileId

export const Role = S.withDefaultMake(S.Literals(["manager", "user"]))
export type Role = S.Schema.Type<typeof Role>

export class UserFromIdResolver extends Context.Service<UserFromIdResolver, {
  readonly get: (userId: UserId) => Effect.Effect<User>
}>()("UserFromId") {
  static readonly getUser = (userId: UserId) => UserFromIdResolver.use((_) => _.get(userId))
}

export class User extends S.Opaque<User, User.Encoded>()(S.Struct({
  id: UserId.withConstructorDefault,
  name: FullName,
  email: S.Email,
  role: Role,
  passwordHash: S.NonEmptyString255
})) {
  static displayName(this: void, u: User) {
    return S.NonEmptyString2k(`${u.name.firstName} ${u.name.lastName}`)
  }
  static readonly resolver = UserFromIdResolver
}

export const UserFromId: S.Codec<User, string, UserFromIdResolver> = UserId.pipe(
  S.decodeTo(
    S.toType(User),
    {
      decode: SchemaGetter.transformEffect((id) => User.resolver.getUser(id)),
      encode: SchemaGetter.transform((u) => u.id)
    }
  )
)

export const defaultEqual = pipe(Equivalence.String, Equivalence.mapInput((u: User) => u.id))

// codegen:start {preset: model}
//
/* eslint-disable */
export namespace FullName {
  export interface Encoded extends S.StructNestedEncoded<typeof FullName> {}
}
export namespace User {
  export interface Encoded extends S.StructNestedEncoded<typeof User> {}
}
/* eslint-enable */
//
// codegen:end
//
