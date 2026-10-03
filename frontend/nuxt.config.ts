import fs from "fs"
import path from "path"
import process from "process"
import { fileURLToPath } from "url"

interface PkgExports {
  [key: string]: unknown
}

const resolveExportTarget = (target: unknown): string =>
  typeof target === "string"
    ? target
    : typeof target === "object" && target !== null
    ? Object.values(target as Record<string, unknown>).find((v): v is string => typeof v === "string") ?? ""
    : ""

// Walk parent directories from `start` looking for `node_modules/<pkg>/package.json`.
const findPkgJson = (pkg: string, start: string): string | null => {
  let dir = start
  while (true) {
    const candidate = path.join(dir, "node_modules", pkg, "package.json")
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

// Read package.json `exports` for `pkg`. Concrete subpaths are returned as-is;
// pattern entries (e.g. "./*") are expanded by scanning their target dist
// directory and skipping anything under `internal/`.
const collectPkgSubpaths = (pkg: string): string[] => {
  const pkgJsonPath = findPkgJson(pkg, fileURLToPath(new URL(".", import.meta.url)))
  if (!pkgJsonPath) {
    console.warn(`[nuxt.config] package not found: ${pkg}`)
    return []
  }
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8")) as { exports?: PkgExports }
  const exportsMap = pkgJson.exports ?? {}
  const pkgRoot = path.dirname(pkgJsonPath)
  const out = new Set<string>()

  // patterns mapped to null (forbidden subpaths) — e.g. "./*/index", "./internal/*"
  const blockedRegexes: RegExp[] = []
  for (const [key, val] of Object.entries(exportsMap)) {
    if (val !== null || !key.startsWith("./")) continue
    const re = "^" + key.slice(2).replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$"
    blockedRegexes.push(new RegExp(re))
  }
  const isBlocked = (subpath: string) => blockedRegexes.some((r) => r.test(subpath))

  for (const key of Object.keys(exportsMap)) {
    if (key === "./package.json") continue
    if (key.includes("internal")) continue
    if (exportsMap[key] === null) continue
    if (key === ".") {
      out.add(pkg)
      continue
    }

    if (!key.includes("*")) {
      out.add(`${pkg}${key.slice(1)}`)
      continue
    }

    // Pattern export, e.g. "./*" → "./dist/*.ts".
    const targetStr = resolveExportTarget(exportsMap[key])
    if (!targetStr) continue

    const [keyPrefix, keySuffix = ""] = key.slice(2).split("*")
    const targetRel = targetStr.startsWith("./") ? targetStr.slice(2) : targetStr
    const [targetPrefix, targetSuffix = ""] = targetRel.split("*")
    // dir = path up to last "/" in targetPrefix; basePrefix = chars after that "/"
    const lastSlash = targetPrefix.lastIndexOf("/")
    const dir = path.join(pkgRoot, lastSlash >= 0 ? targetPrefix.slice(0, lastSlash) : ".")
    const basePrefix = lastSlash >= 0 ? targetPrefix.slice(lastSlash + 1) : targetPrefix
    if (!fs.existsSync(dir)) continue

    const walk = (sub: string) => {
      const abs = path.join(dir, sub)
      for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
        const rel = sub ? `${sub}/${entry.name}` : entry.name
        if (entry.isDirectory()) {
          walk(rel)
          continue
        }
        if (!entry.name.startsWith(basePrefix) || !entry.name.endsWith(targetSuffix)) continue
        const middle = entry.name.slice(basePrefix.length, entry.name.length - targetSuffix.length)
        const subpath = `${keyPrefix}${middle}${keySuffix}`
        if (isBlocked(subpath)) continue
        out.add(`${pkg}/${subpath}`)
      }
    }
    walk("")
  }
  return [...out].sort()
}

// effect/effect-app expose `internal/**` files in node_modules but NOT in package exports;
// vite's `effect/**/*` glob would pull them in and break pre-bundling.
// resolve concrete public subpaths from each package's `exports` map instead.
const isNodeOnly = (id: string) => /\/(NodeSdk|node)(\/|$)/i.test(id) || id.endsWith("/node")
const isAsset = (id: string) => /\.(css|scss|sass|less|svg|png|jpg|jpeg|gif|woff2?|ttf|eot)$/i.test(id)
// Is `pkg`'s main export resolved to source (`./src/…`) rather than a built
// `./dist`? True in the workspace (linked) where `exports` points at src;
// false when consuming the published package (whose `publishConfig.exports`
// points at dist). Drives the @effect-app/vue-components handling below: its
// src is .vue SFCs (can't be esbuild-prebundled), but its dist is plain ESM
// (must be prebundled like any dep). Everything must work in BOTH modes.
const pkgPointsToSrc = (pkg: string): boolean => {
  const pkgJsonPath = findPkgJson(pkg, fileURLToPath(new URL(".", import.meta.url)))
  if (!pkgJsonPath) return false
  const dot = (JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8")) as { exports?: PkgExports }).exports?.["."]
  return resolveExportTarget(dot).startsWith("./src/")
}
const vcLinked = pkgPointsToSrc("@effect-app/vue-components")

const fmls = (vcLinked
  ? []
  : [
    ...collectPkgSubpaths("effect"),
    ...collectPkgSubpaths("effect-app"),
    ...collectPkgSubpaths("@effect-app/vue"),
    ...collectPkgSubpaths("@effect-app/vue-components"),
    ...collectPkgSubpaths("@effect/atom-vue"),
    ...collectPkgSubpaths("@effect/opentelemetry")
  ])
  .filter((id) => !isNodeOnly(id) && !isAsset(id) && id !== "effect/schema")

// https://v3.nuxtjs.org/api/configuration/nuxt.config
export default defineNuxtConfig({
  typescript: {
    tsConfig: { compilerOptions: { moduleResolution: "bundler" } }
  },

  sourcemap: {
    server: true,
    client: true
  },

  alias: {
    "#resources": fileURLToPath(
      new URL("../api/src/resources", import.meta.url)
    ),
    "#models": fileURLToPath(new URL("../api/src/models", import.meta.url))
    // effect/effect-app/@effect-app/* resolve to their `src` via the workspace
    // packages' `exports` (published builds use `publishConfig.exports` → dist).
    // No alias overrides needed.
  },

  build: {
    // When linked, @effect-app/vue-components is consumed from src (.vue SFCs);
    // transpile it so Nuxt runs it through the vue/SFC pipeline. Unlinked it is
    // built ESM and needs no transpile.
    transpile: ["vuetify", ...(vcLinked ? ["@effect-app/vue-components"] : [])]
      // workaround for commonjs/esm module prod issue
      // https://github.com/nuxt/framework/issues/7698
      .concat(
        process.env["NODE_ENV"] === "production" ? ["vue-toastification"] : []
      )
  },

  runtimeConfig: {
    basicAuthCredentials: "",
    apiRoot: "http://127.0.0.1:3610",
    public: {
      telemetry: fs.existsSync("../.telemetry-exporter-running")
        && fs.readFileSync("../.telemetry-exporter-running", "utf-8") === "true",
      baseUrl: "http://localhost:4000",
      feVersion: "-1",
      env: process.env["ENV"] ?? "local-dev"
    }
  },

  modules: ["@vueuse/nuxt"],

  // app doesn't need SSR, but also it causes problems with linking schema package.
  ssr: false,

  // Don't let Nuxt's auto-import (unimport) transform the linked effect/
  // effect-app sources. They live under repos/ (pnpm-symlinked) so Nuxt treats
  // them as project source and runs the auto-import transform on them — unlike
  // node_modules, which unimport excludes by default. The transform then sees
  // a free identifier in a lib file that happens to match an app composable
  // (e.g. `client`, `intl`) and injects `import { client } from "#imports"`,
  // fabricating a lib→app edge. Since those composables import effect back,
  // that's a cycle that surfaces as a runtime TDZ error in the prod build.
  imports: {
    transform: {
      exclude: [/[\\/]repos[\\/]effect(?:-app)?[\\/]/]
    }
  },

  experimental: {
    viteEnvironmentApi: true
  },

  vite: {
    build: {
      minify: "terser",
      terserOptions: { keep_classnames: true },
      sourcemap: true,
      rollupOptions: {
        // @sentry/node-core is pulled in transitively via effect-app internals.
        // it imports node:util which can't be bundled for the browser.
        external: [
          /@sentry\/node-core/,
          /@sentry\/node(?!-)/,
          /@effect\/platform-node/
        ]
      }
    },
    optimizeDeps: {
      // noDiscovery: true, // this breaks; "validator/lib/isEmail.js" has no default export
      // When linked, @effect-app/vue-components resolves to src (.vue SFCs) which
      // esbuild's dep prebundle can't transform — exclude it so vite processes it
      // through the vue plugin. Unlinked it is built ESM and prebundles normally.
      // RTM exports both Schema and schema; esbuild flattens both to effect_Schema.js.
      exclude: ["effect/schema", ...(vcLinked ? ["@effect-app/vue-components"] : [])],
      esbuildOptions: {
        loader: {
          ".ts": "ts"
        }
      },
      rolldownOptions: {
        moduleTypes: {
          ".ts": "ts"
        }
      },
      include: [
        ...fmls,
        "xlsx",
        "@opentelemetry/api",
        "@opentelemetry/exporter-trace-otlp-http",
        "@opentelemetry/sdk-trace-web",
        "@opentelemetry/semantic-conventions",
        "@mdi/js",
        "@unhead/vue",
        "reconnecting-eventsource",
        "mitt",
        "@tanstack/vue-query",
        "@vue/devtools-core",
        "@vue/devtools-kit",
        "vue-timeago3",
        "vue-toastification",
        "date-fns",
        "date-fns/locale/de",
        "change-case",
        "papaparse"
      ]
    },
    plugins: process.env["CI"]
      ? [
        // sentryVitePlugin({
        //   org: "???",
        //   project: "effect-app-boilerplate-frontend",
        //   authToken: "???",
        //   sourcemaps: {
        //     assets: "./.nuxt/dist/**",
        //   },
        //   debug: true,
        // }),
      ]
      : []
  },

  compatibilityDate: "2024-09-04"
})
