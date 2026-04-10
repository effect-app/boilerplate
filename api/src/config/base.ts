import { Config as C, Redacted, S } from "effect-app"

const FROM = {
  name: S.NonEmptyString255("@effect-app/boilerplate"),
  email: S.Email("noreply@example.com")
}

const serviceName = "effect-app-boilerplate"

export const envConfig = C.string("env").pipe(C.withDefault("local-dev"))

export const SendgridConfig = C.all({
  realMail: C.boolean("realMail").pipe(C.withDefault(false)),
  apiKey: C.redacted("sendgridApiKey").pipe(C.withDefault(
    Redacted.make("")
  )),
  defaultFrom: C.succeed(FROM),
  subjectPrefix: envConfig.pipe(C.map((env) => env === "prod" ? "" : `[${serviceName}] [${env}] `))
})

export const BaseConfig = C.all({
  apiVersion: C.string("apiVersion").pipe(C.withDefault("local-dev")),
  serviceName: C.succeed(serviceName),
  env: envConfig,
  sendgrid: SendgridConfig,
  sentry: C.all({
    dsn: C
      .redacted("dsn")
      .pipe(
        C.nested("sentry"),
        C.withDefault(
          Redacted.make(
            "???"
          )
        )
      )
  })
  //  log: C.string("LOG").
})
type ConfigA<Cfg> = Cfg extends C.Config<infer A> ? A : never
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface BaseConfig extends ConfigA<typeof BaseConfig> {}

export const SB_PREFIX = "Endpoint=sb://"
