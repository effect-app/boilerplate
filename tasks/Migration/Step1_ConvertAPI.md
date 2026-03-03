# Step 1: Convert API to Effect v4

## Objective
Migrate the `api` package from Effect v3 to Effect v4, converting TypeScript imports and API usage in dependency order.

## API Structure Analysis

### Dependency Order (lowest to highest)
1. `lib/*` - utility functions
2. `config/*` - configuration setup
3. `models/*` - data models and schemas
4. `resources/*` - resource definitions
5. `services/*` - business logic services (depends on models/resources)
6. `controllers/*` - HTTP controllers (depends on services)
7. `api.ts`, `router.ts` - route setup
8. `main.ts` - entry point

## Conversion Process

- [ ] 1.1: Convert `lib/*` files
- [ ] 1.2: Convert `config/*` files
- [ ] 1.3: Convert `models/*` files and schemas
- [ ] 1.4: Convert `resources/*` files
- [ ] 1.5: Convert `services.ts` and `services/*` files
- [ ] 1.6: Convert controller files
- [ ] 1.7: Convert `api.ts` and `router.ts`
- [ ] 1.8: Convert `main.ts`
- [ ] 1.9: Run `pnpm check` and fix type errors
- [ ] 1.10: Run `pnpm lint-fix` and verify no errors

## Migration Notes

Key v3→v4 changes to watch for:
- `Either` → `Result`
- `Schema<A, I, R>` with 3 params → `Codec<A, I, R>` (when R is present)
- `Effect.Service` → `ServiceMap.Service`
- `effect/Either` → `effect/Result`
- Import paths: `@effect/*` → `effect/unstable/*` where applicable
- `Effect.dieMessage` → `Effect.die`
- Schema functions: `decodeUnknown` → `decodeUnknownEffect`, etc.

## Progress

