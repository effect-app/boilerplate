import type * as Effect from "effect-app/Effect"

// tsgo workaround: in complex shipments-branch e2e specs (Bauhaus splitting,
// variants), tsgo still resolves each handler's R channel to `unknown` instead
// of `never` because S.Codec.DecodingServices<...> is not reduced. The trunk
// commit `2b9857da0` removed the global fixClient workaround because per-company
// tsconfig sharding fixed the simpler cases on main, but on shipments the
// splitting helpers + variant specs combine enough resource modules that the
// bug still fires. We keep this shim locally until the underlying tsgo issue
// is patched upstream. Re-infer A/E from the handler signature and replace R
// with never.
type FixHandler<T> = T extends { handler: (i: infer I) => Effect.Effect<infer A, infer E, infer _R> }
  ? Omit<T, "handler"> & { handler: (i: I) => Effect.Effect<A, E, never> }
  : T

export type FixedClient<C> = { [K in keyof C]: FixHandler<C[K]> }

export const fixClient = <C>(client: C): FixedClient<C> => client as FixedClient<C>
