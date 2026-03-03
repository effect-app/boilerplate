import { Role } from "#models/User"
import { S, ServiceMap } from "effect-app"
import { UserProfileId } from "effect-app/ids"

// TODO: move back to services, and remove reference need in resources or frontend
export class UserProfile extends ServiceMap.assignTag<UserProfile>("UserProfile")(
  S.Class<UserProfile>("UserProfile")({
    sub: UserProfileId,
    roles: S.Array(Role).withDefault
  })
) {
  static readonly fromEncoded = S.encodeKeys({ roles: "https://nomizz.com/roles" })(this)
}
