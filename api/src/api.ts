// import { writeOpenapiDocsI } from "@effect-app/infra/api/writeDocs"
import * as Layer from "effect-app/Layer"
import { HttpServerLive } from "./lib/layers.ts"
import { matchAll } from "./lib/routing.ts"
import { makeHttpServer } from "./router.ts"
import * as routes from "./routes.ts"

const router = matchAll(routes)

export const api = makeHttpServer(router)
  .pipe(
    Layer.provide(HttpServerLive)
  )
