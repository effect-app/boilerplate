import { Config } from "effect-app"
import { secretURL } from "effect-app/Config/SecretURL"
import * as SecretURL from "effect-app/Config/SecretURL"
import { env, serviceName } from "./base.js"

const STORAGE_VERSION = "1"

export const storage = Config.all({
  url: secretURL("url")
    .pipe(
      Config.withDefault(SecretURL.fromString("sqlite://")),
      Config.nested("storage")
    ),
  dbName: Config.all({ env, serviceName }).pipe(
    Config.map(({ env, serviceName }) => `${serviceName}${env === "prod" ? "" : env === "demo" ? "-demo" : "-dev"}`)
  ),
  prefix: Config
    .string("prefix")
    .pipe(
      Config
        .nested("storage"),
      Config
        .orElse(() => env.pipe(Config.map((env) => (env === "prod" ? "" : `${env}_v${STORAGE_VERSION}_`))))
    )
})

export const repo = Config.all({
  fakeData: Config.string("fakeData").pipe(Config.withDefault("")),
  fakeUsers: Config.string("fakeUsers").pipe(Config.withDefault("sample"))
})

const port = Config.int("port").pipe(Config.withDefault(3610))
export const host = Config.string("host").pipe(Config.withDefault("0.0.0.0"))
export const server = Config.all({
  host,
  port,
  devPort: Config.int("devPort").pipe(Config.orElse(() => port.pipe(Config.map((_) => _ + 1)))),
  baseUrl: Config.string("baseUrl").pipe(Config.withDefault("http://localhost:4000"))
})

export * from "./base.js"
