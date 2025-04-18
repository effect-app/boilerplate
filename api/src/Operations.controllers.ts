import { matchFor, Router } from "#lib/routing"
import { OperationsRsc } from "#resources"
import { Operations } from "#services"
import { Effect } from "effect-app"
import { OperationsDefault } from "./lib/layers.js"

export default Router(OperationsRsc)({
  dependencies: [OperationsDefault],
  effect: Effect.gen(function*() {
    const operations = yield* Operations

    return matchFor(OperationsRsc)({
      FindOperation: ({ id }) =>
        operations
          .find(id)
          .pipe(Effect.andThen((_) => _.value ?? null))
    })
  })
})
