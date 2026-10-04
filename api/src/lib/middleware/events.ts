import { ClientEvents } from "#resources/Events"
import { Events } from "#services/Events"
import { makeSSE } from "@effect-app/infra/middlewares"
import * as Effect from "effect-app/Effect"

export const makeEvents = Effect.gen(function*() {
  const events = yield* Events
  // makeEvents is a handler factory: it returns the SSE handler Effect as a
  // value to be mounted on a route, not to be run here.
  // @effect-diagnostics-next-line returnEffectInGen:off
  return makeSSE(ClientEvents)(events.stream)
})
