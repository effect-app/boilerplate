import { ClientEvents } from "#resources/Events"
import { Events } from "#services/Events"
import { makeSSE } from "@effect-app/infra/middlewares"
import * as Effect from "effect-app/Effect"

export const makeEvents = Effect.gen(function*() {
  const events = yield* Events
  return makeSSE(ClientEvents)(events.stream)
})
