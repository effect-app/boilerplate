import type { ClientEvents } from "#resources"
import { storeId } from "@effect-app/infra/Store/Memory"
import { Context, Effect, Layer, PubSub, Stream } from "effect-app"
import type { NonEmptyReadonlyArray } from "effect/Array"

export class Events extends Context.Service<Events>()("Events", {
  make: Effect.gen(function*() {
    const q = yield* PubSub.unbounded<{ evt: ClientEvents; namespace: string }>()
    const svc = {
      publish: (...evts: NonEmptyReadonlyArray<ClientEvents>) =>
        storeId.asEffect().pipe(
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
