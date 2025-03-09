import { Duration, Effect } from "effect-app"
import { NotFoundError } from "effect-app/client/errors"
import { Operation, OperationFailure, OperationId } from "effect-app/Operations"
import { clientFor } from "./lib.js"
import * as S from "./lib/schema.js"

export class FindOperation extends S.Req<FindOperation>()("FindOperation", {
  id: OperationId
}, { allowAnonymous: true, allowRoles: ["user"], success: S.NullOr(Operation) }) {}

// codegen:start {preset: meta, sourcePrefix: src/resources/}
export const meta = { moduleName: "Operations" } as const
// codegen:end

// Extensions
export const OperationsClient = Effect.gen(function*() {
  const opsClient = yield* clientFor({ FindOperation, meta })

  function refreshAndWaitAForOperation<R2, E2, A2>(
    refresh: Effect<A2, E2, R2>,
    cb?: (op: Operation) => void
  ) {
    return <R, E>(act: Effect<OperationId, E, R>) =>
      Effect.tap(
        waitForOperation(
          Effect.tap(act, refresh),
          cb
        ),
        refresh
      )
  }

  function refreshAndWaitAForOperation_<R2, E2, A2, R, E>(
    act: Effect<OperationId, E, R>,
    refresh: Effect<A2, E2, R2>,
    cb?: (op: Operation) => void
  ) {
    return Effect.tap(
      waitForOperation(
        Effect.tap(act, refresh),
        cb
      ),
      refresh
    )
  }

  function refreshAndWaitForOperation<R2, E2, A2>(refresh: Effect<A2, E2, R2>, cb?: (op: Operation) => void) {
    return <Req, R, E>(act: (req: Req) => Effect<OperationId, E, R>) => (req: Req) =>
      refreshAndWaitAForOperation_(act(req), refresh, cb)
  }

  function refreshAndWaitForOperation_<Req, R2, E2, A2, R, E>(
    act: (req: Req) => Effect<OperationId, E, R>,
    refresh: Effect<A2, E2, R2>,
    cb?: (op: Operation) => void
  ) {
    return (req: Req) => refreshAndWaitAForOperation_(act(req), refresh, cb)
  }

  function waitForOperation<R, E>(
    self: Effect<OperationId, E, R>,
    cb?: (op: Operation) => void
  ) {
    return Effect.andThen(self, (r) => _waitForOperation(r, cb))
  }

  function waitForOperation_(cb?: (op: Operation) => void) {
    return <Req, R, E>(self: (req: Req) => Effect<OperationId, E, R>) => (req: Req) =>
      Effect.andThen(self(req), (r) => _waitForOperation(r, cb))
  }

  const isFailure = S.is(OperationFailure)

  function _waitForOperation(id: OperationId, cb?: (op: Operation) => void) {
    return Effect
      .gen(function*() {
        let r = yield* opsClient.FindOperation.handler({ id })
        while (r) {
          if (cb) cb(r)
          const result = r.result
          if (result) return isFailure(result) ? yield* Effect.fail(result) : yield* Effect.succeed(result)
          yield* Effect.sleep(Duration.seconds(2))
          r = yield* opsClient.FindOperation.handler({ id })
        }
        return yield* new NotFoundError({ type: "Operation", id })
      })
    // .pipe(Effect.provide(Layer.setRequestCaching(false)))
  }

  return Object.assign(opsClient, {
    refreshAndWaitAForOperation,
    refreshAndWaitAForOperation_,
    refreshAndWaitForOperation,
    refreshAndWaitForOperation_,
    waitForOperation,
    waitForOperation_
  })
})
