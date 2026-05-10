import { Role } from "#models/User"
import * as Context from "effect-app/Context"
import { UserProfileId } from "effect-app/ids"
import * as S from "effect-app/Schema"

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
