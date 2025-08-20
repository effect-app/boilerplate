import process from "process"
import { fileURLToPath } from "url"
import fs from "fs"

import rootPj from "../package.json"

const getPath = (pack: string) => {
  const isAbsolute = (rootPj.resolutions as any)[pack].startsWith("file:/")
  let pathStr = (rootPj.resolutions as any)[pack].replace(
    "file:",
    isAbsolute ? "/" : "../",
  )
  if (isAbsolute) {
    const currentPath = __dirname
    const pathParts = currentPath.split("/")
    const depth = pathParts.length
    pathStr = "../".repeat(depth) + pathStr.substring(1)
  }
  return fileURLToPath(new URL(pathStr, import.meta.url))
}

// use `pnpm effa link` in the root project
// `pnpm effa unlink` to revert
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const localLibs = !!(rootPj.resolutions as any)["effect-app"]

// https://v3.nuxtjs.org/api/configuration/nuxt.config
export default defineNuxtConfig({
  typescript: {
    tsConfig: { compilerOptions: { moduleResolution: "bundler" } },
  },

  sourcemap: {
    server: true,
    client: true,
  },

  alias: {
    "#resources": fileURLToPath(
      new URL("../api/src/resources", import.meta.url),
    ),
    "#models": fileURLToPath(new URL("../api/src/models", import.meta.url)),
    ...(localLibs
      ? {
          effect: getPath("effect") + "/dist/esm",
          "effect-app": getPath("effect-app") + "/dist",
          "@effect-app/vue": getPath("@effect-app/vue") + "/src",
          "@effect-app/vue-components": getPath("@effect-app/vue-components"),
        }
      : {}),
  },

  build: {
    transpile: ["vuetify"]
      // workaround for commonjs/esm module prod issue
      // https://github.com/nuxt/framework/issues/7698
      .concat(
        process.env["NODE_ENV"] === "production" ? ["vue-toastification"] : [],
      ),
  },

  runtimeConfig: {
    basicAuthCredentials: "",
    apiRoot: "http://127.0.0.1:3610",
    public: {
      telemetry:
        fs.existsSync("../.telemetry-exporter-running") &&
        fs.readFileSync("../.telemetry-exporter-running", "utf-8") === "true",
      baseUrl: "http://localhost:4000",
      feVersion: "-1",
      env: process.env["ENV"] ?? "local-dev",
    },
  },

  modules: ["@vueuse/nuxt"],

  // app doesn't need SSR, but also it causes problems with linking schema package.
  ssr: false,

  vite: {
    build: {
      minify: "terser",
      terserOptions: { keep_classnames: true },
      sourcemap: true,
    },
    optimizeDeps: {
      // noDiscovery: true, // this breaks; "validator/lib/isEmail.js" has no default export
      include: [
        "@mdi/js",
        "@unhead/vue",
        "reconnecting-eventsource",
        "mitt",
        "@tanstack/vue-query",
        "effect-app/Function",
        "effect-app/utils",
        "@effect-app/vue/routeParams",
        "@effect-app/vue/form",
        ..."@vue/devtools-core, @vue/devtools-kit, vue-timeago3, date-fns/locale/de, vue-virtual-scroller, vue-toastification, @effect-app/vue, effect/Layer, effect/Runtime, effect/Request, @opentelemetry/semantic-conventions, effect-app/Schema, @effect/platform, effect-app/client/apiClientFactory, effect-app, @tanstack/vue-query-devtools, @effect-app/vue-components, effect-app/Effect, @effect/opentelemetry/WebSdk, @opentelemetry/exporter-trace-otlp-http, @opentelemetry/sdk-trace-web, @sentry/vue, @sentry/browser, @sentry/opentelemetry, @opentelemetry/api, effect-app/client/errors, @effect/platform/HttpClientError, effect, date-fns, effect-app/Operations, effect-app/rpc, change-case, papaparse, effect-app/faker, effect-app/ids, xlsx, effect/Function, @fp-ts/optic"
          .split(",")
          .map(_ => _.trim()),
      ],
    },
    plugins: process.env["CI"]
      ? [
          // sentryVitePlugin({
          //   org: "???",
          //   project: "effect-app-boilerplate-api",
          //   authToken: "???",
          //   sourcemaps: {
          //     assets: "./.nuxt/dist/**",
          //   },
          //   debug: true,
          // }),
        ]
      : [],
  },

  compatibilityDate: "2024-09-04",
})
