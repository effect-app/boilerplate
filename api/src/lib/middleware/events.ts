import { Events } from "#api/Events"
import { ClientEvents } from "#api/resources/Events"
import { makeSSE } from "@effect-app/infra/api/middlewares"
import { Effect } from "effect-app"

export const makeEvents = Effect.gen(function*() {
  const events = yield* Events
  return Effect.gen(function*() {
    const stream = yield* events.stream
    return yield* makeSSE(ClientEvents)(stream)
  })
})
