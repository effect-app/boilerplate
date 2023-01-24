import type { User } from "@effect-app-boilerplate/types/User"
import { makeAllDSL, makeOneDSL } from "@effect-app/infra/services/Repository"

export const Users$ = makeAllDSL<User, never>()
export const User$ = makeOneDSL<User, never>()
