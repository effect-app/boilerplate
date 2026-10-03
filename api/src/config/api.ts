import * as Config from "effect-app/Config"
import { secretURL } from "effect-app/Config/SecretURL"
import * as SecretURL from "effect-app/Config/SecretURL"
import { env, serviceName } from "./base.ts"

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
    .String("prefix")
    .pipe(
      Config
        .nested("storage"),
      Config
        .orElse(() => env.pipe(Config.map((env) => (env === "prod" ? "" : `${env}_v${STORAGE_VERSION}_`))))
    )
})

export const repo = Config.all({
  fakeData: Config.String("fakeData").pipe(Config.withDefault("")),
  fakeUsers: Config.String("fakeUsers").pipe(Config.withDefault("sample"))
})

const port = Config.Int("port").pipe(Config.withDefault(3610))
export const host = Config.String("host").pipe(Config.withDefault("0.0.0.0"))
export const server = Config.all({
  host,
  port,
  devPort: Config.Int("devPort").pipe(Config.orElse(() => port.pipe(Config.map((_) => _ + 1)))),
  baseUrl: Config.String("baseUrl").pipe(Config.withDefault("http://localhost:4000"))
})

export * from "./base.ts"
