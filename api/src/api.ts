// import { writeOpenapiDocsI } from "@effect-app/infra/api/writeDocs"
import { Layer } from "effect-app"
import * as controllers from "./controllers.js"
import { HttpServerLive } from "./lib/layers.js"
import { matchAll } from "./lib/routing.js"
import { makeHttpServer } from "./router.js"

const router = matchAll(controllers)

export const api = makeHttpServer(router)
  .pipe(
    Layer.provide(HttpServerLive)
  )
