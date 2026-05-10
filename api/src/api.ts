// import { writeOpenapiDocsI } from "@effect-app/infra/api/writeDocs"
import * as Layer from "effect-app/Layer"
import { HttpServerLive } from "./lib/layers.js"
import { matchAll } from "./lib/routing.js"
import { makeHttpServer } from "./router.js"
import * as routes from "./routes.js"

const router = matchAll(routes)

export const api = makeHttpServer(router)
  .pipe(
    Layer.provide(HttpServerLive)
  )
