// codegen:start {preset: barrel, include: ./*.Controllers.ts, import: default}
import accountsControllers from "./Accounts.Controllers.ts"
import helloWorldControllers from "./HelloWorld.Controllers.ts"

export { accountsControllers, helloWorldControllers }
// codegen:end
