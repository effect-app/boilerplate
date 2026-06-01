import type { ClientEvents } from "#resources/Events"
import * as Context from "effect-app/Context"
import * as Effect from "effect-app/Effect"
import * as Layer from "effect-app/Layer"
import { storeId } from "effect-app/Store"
import type { NonEmptyReadonlyArray } from "effect/Array"
import * as PubSub from "effect/PubSub"
import * as Stream from "effect/Stream"

export class Events extends Context.Service<Events>()("Events", {
  make: Effect.gen(function*() {
    const q = yield* PubSub.unbounded<{ evt: ClientEvents; namespace: string }>()
    const svc = {
      publish: (...evts: NonEmptyReadonlyArray<ClientEvents>) =>
        storeId.pipe(
          Effect.map((namespace) => PubSub.publishAll(q, evts.map((evt) => ({ evt, namespace }))))
        ),
      subscribe: PubSub.subscribe(q),
      stream: Stream.fromPubSub(q)
    }
    return svc
  })
}) {
  static Default = Layer.effect(this, this.make)
}
