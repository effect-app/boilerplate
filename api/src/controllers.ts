// codegen:start {preset: barrel, include: ./*/controllers.ts, import: default}
import accountsControllers from "./Accounts/controllers.js"
import blogControllers from "./Blog/controllers.js"
import operationsControllers from "./Operations/controllers.js"

export { accountsControllers, blogControllers, operationsControllers }
// codegen:end
