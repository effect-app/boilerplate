import { Role } from "#models/User"
import { Context, S } from "effect-app"
import { UserProfileId } from "effect-app/ids"

// TODO: move back to services, and remove reference need in resources or frontend
export class UserProfile extends Context.assignTag<UserProfile>("UserProfile")(
  S.Opaque<UserProfile>()(
    S
      .Struct({
        sub: UserProfileId,
        roles: S.Array(Role).withConstructorDefault
      })
      .pipe(S.encodeKeys({ roles: "https://nomizz.com/roles" }))
  )
) {}
