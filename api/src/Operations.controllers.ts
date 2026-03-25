import { Router } from "#lib/routing"
import { OperationsRsc } from "#resources"
import { Operations } from "#services"
import { Effect } from "effect-app"
import type { OperationId } from "effect-app/Operations"
import { OperationsDefault } from "./lib/layers.js"

export default Router(OperationsRsc)({
  dependencies: [OperationsDefault],
  *effect(match) {
    const operations = yield* Operations

    return match({
      FindOperation: ({ id }: { id: OperationId }) =>
        operations
          .find(id)
          .pipe(Effect.map((_) => _.value ?? null))
    })
  }
})
