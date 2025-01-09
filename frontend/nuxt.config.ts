import process from "process"
import { fileURLToPath } from "url"
import fs from "fs"

import rootPj from "../package.json"

// use `pnpm effa link` in the root project
// `pnpm effa unlink` to revert
const a = fs.existsSync("../libs")
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const localLibs = a || !!(rootPj.resolutions as any)["effect-app"]

const b = a ? "../libs" : "../../../effect-app/libs"

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
          "effect-app": fileURLToPath(
            new URL(b + "/packages/effect-app/src", import.meta.url),
          ),
          "@effect-app/vue": fileURLToPath(
            new URL(b + "/packages/vue/src", import.meta.url),
          ),
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

  modules: ["@vueuse/nuxt", "@hebilicious/vue-query-nuxt"],

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
        "effect-app/utils",
        "@effect-app/vue/routeParams",
        "@effect-app/vue/form",
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
