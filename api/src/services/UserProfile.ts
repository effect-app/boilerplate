import { UserProfile } from "#resources/lib"
import { parseJwt } from "@effect-app/infra/api/routing/schema/jwt"
import type { Effect } from "effect"
import { S } from "effect-app"
import type { SchemaError } from "effect/Schema"

export { UserProfile } from "#resources/lib/Userprofile"

export namespace UserProfileService {
  export interface Id {
    readonly _: unique symbol
  }
}

const userProfileFromJson = S.fromJsonString(UserProfile.Codec)
const userProfileFromJWT = parseJwt(UserProfile.Codec)

// Workaround: Schema.encodeKeys has a TypeScript inference limitation where it cannot resolve
// DecodingServices through its complex mapped type, falling back to `unknown` from the `Top` constraint.
// The actual decode has no service requirements — the `unknown` R is a false positive.
function decodeProfile(schema: typeof userProfileFromJson): (input: unknown) => Effect.Effect<UserProfile, SchemaError>
function decodeProfile(schema: typeof userProfileFromJWT): (input: unknown) => Effect.Effect<UserProfile, SchemaError>
function decodeProfile(schema: S.Top) {
  return S.decodeUnknownEffect(schema)
}

export const makeUserProfileFromAuthorizationHeader = (
  authorization: string | undefined
) => decodeProfile(userProfileFromJWT)(authorization)
export const makeUserProfileFromUserHeader = (user: string | string[] | undefined) =>
  decodeProfile(userProfileFromJson)(user)
