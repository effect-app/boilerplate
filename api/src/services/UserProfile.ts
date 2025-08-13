import { UserProfile } from "#resources/lib"
import { parseJwt } from "@effect-app/infra/api/routing/schema/jwt"
import { S } from "effect-app"

export { UserProfile } from "#resources/lib/Userprofile"

export namespace UserProfileService {
  export interface Id {
    readonly _: unique symbol
  }
}

const userProfileFromJson = S.parseJson(UserProfile)
const userProfileFromJWT = parseJwt(UserProfile)
export const makeUserProfileFromAuthorizationHeader = (
  authorization: string | undefined
) => S.decodeUnknown(userProfileFromJWT)(authorization)
export const makeUserProfileFromUserHeader = (user: string | string[] | undefined) =>
  S.decodeUnknown(userProfileFromJson)(user)
