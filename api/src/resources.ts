import type {} from "@effect/platform/HttpClient"

export { ClientEvents } from "./resources/Events.js"

// TODO
//// codegen:start {preset: barrel, include: ./*/resources.ts, export: { as: 'PascalCase', postfix: 'Rsc' }}
export { AccountsRsc } from "./Accounts/resources.js"
export { BlogRsc } from "./Blog/resources.js"
export { HelloWorldRsc } from "./HelloWorld/resources.js"
export { OperationsRsc } from "./Operations/resources.js"
//// codegen:end
