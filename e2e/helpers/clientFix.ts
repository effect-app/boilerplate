import type * as Effect from "effect-app/Effect"

// tsgo bug workaround: `Client<M, ModuleName>` resolves each handler's `R` to
// `unknown` (instead of `never`) because `S.Codec.DecodingServices<...>` is not
// reduced. Re-infer A/E from the handler signature and replace R with never.
type FixHandler<T> = T extends { handler: (i: infer I) => Effect.Effect<infer A, infer E, infer _R> }
  ? Omit<T, "handler"> & { handler: (i: I) => Effect.Effect<A, E, never> }
  : T

export type FixedClient<C> = { [K in keyof C]: FixHandler<C[K]> }

export const fixClient = <C>(client: C): FixedClient<C> => client as FixedClient<C>
