import { Config, Effect } from "effect-app"
import { secretURL } from "effect-app/Config/SecretURL"
import * as SecretURL from "effect-app/Config/SecretURL"
import { BaseConfig } from "./base.js"

const STORAGE_VERSION = "1"

export const StorageConfig = Config.all({
  url: secretURL("url")
    .pipe(
      Config.withDefault(SecretURL.fromString("disk://.data")),
      Config.nested("storage")
    ),
  dbName: BaseConfig.pipe(
    Config.map(({ env, serviceName }) => `${serviceName}${env === "prod" ? "" : env === "demo" ? "-demo" : "-dev"}`)
  ),
  prefix: Config
    .string("prefix")
    .pipe(
      Config
        .nested("storage"),
      Config
        .orElse(() => BaseConfig.pipe(Config.map(({ env }) => (env === "prod" ? "" : `${env}_v${STORAGE_VERSION}_`))))
    )
})

export const AUTH_DISABLED = process.env["AUTH_DISABLED"] === "true"

export const RepoConfig = Config.all({
  fakeData: Config.string("fakeData").pipe(Config.withDefault("")),
  fakeUsers: Config.string("fakeUsers").pipe(Config.withDefault("sample"))
})

const port = Config.int("port").pipe(Config.withDefault(3610))
export const ApiConfig = Config.all({
  host: Config.string("host").pipe(Config.withDefault("0.0.0.0")),
  port,
  devPort: Config.int("devPort").pipe(Config.orElse(() => port.pipe(Config.map((_) => _ + 1)))),
  baseUrl: Config.string("baseUrl").pipe(Config.withDefault("http://localhost:4000")),

  repo: RepoConfig,

  storage: StorageConfig
})

type ConfigA<Cfg> = Cfg extends Config.Config<infer A> ? A : never

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ApiConfig extends ConfigA<typeof ApiConfig> {}

export interface ApiMainConfig extends ApiConfig, BaseConfig {}

export const MergedConfig = ApiConfig
  .asEffect()
  .pipe(
    Effect.andThen((apiConfig) => Effect.map(BaseConfig.asEffect(), (baseConfig) => ({ ...baseConfig, ...apiConfig }))),
    Effect.cached,
    Effect.runSync
  )
