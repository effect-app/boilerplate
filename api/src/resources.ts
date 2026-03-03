import type {} from "@effect/platform/HttpClient"

export { ClientEvents } from "./resources/Events.js"

// codegen:start {preset: barrel, include: ./resources/*.ts, exclude: [./resources/index.ts, ./resources/lib.ts, ./resources/integrationEvents.ts, ./resources/Messages.ts, ./resources/views.ts, ./resources/Events.ts], export: { as: 'PascalCase', postfix: 'Rsc' }}
export * as AccountsRsc from "./resources/Accounts.js"
export * as HelloWorldRsc from "./resources/HelloWorld.js"
export * as OperationsRsc from "./resources/Operations.js"
// codegen:end
