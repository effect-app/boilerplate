import { OperationsDefault } from "#api/lib/layers"
import { matchFor, Router } from "#api/lib/routing"
import { Operations } from "@effect-app/infra/Operations"
import { Effect } from "effect-app"
import { OperationsRsc } from "./resources.js"

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
