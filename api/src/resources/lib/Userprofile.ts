import { Role } from "#models/User"
import { Context } from "effect-app"
import { UserProfileId } from "effect-app/ids"
import * as S from "./schema.js"

// TODO: move back to services, and remove reference need in resources or frontend
export class UserProfile extends Context.assignTag<UserProfile>("UserProfile")(
  S.Class<UserProfile>("UserProfile")({
    sub: UserProfileId,
    roles: S.Array(Role).withDefault.pipe(S.fromKey("https://nomizz.com/roles"))
  })
) {
}
