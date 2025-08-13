import { Role } from "#models/User"
import { parseJwt } from "@effect-app/infra/api/routing/schema/jwt"
import { Context, S } from "effect-app"
import { UserProfileId } from "effect-app/ids"

export class UserProfile extends Context.assignTag<UserProfile>("UserProfile")(
  S.Class<UserProfile>("UserProfile")({
    sub: UserProfileId,
    roles: S.Array(Role).withDefault.pipe(S.fromKey("https://nomizz.com/roles"))
  })
) {
}

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
