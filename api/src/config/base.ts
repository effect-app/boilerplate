import { Config as C, Redacted, S } from "effect-app"

const FROM = {
  name: S.NonEmptyString255("@effect-app/boilerplate"),
  email: S.Email("noreply@example.com")
}

const serviceName_ = "effect-app-boilerplate"

export const env = C.string("env").pipe(C.withDefault("local-dev"))
export const apiVersion = C.string("apiVersion").pipe(C.withDefault("local-dev"))
export const serviceName = C.succeed(serviceName_)

export const sendgrid = C.all({
  realMail: C.boolean("realMail").pipe(C.withDefault(false)),
  apiKey: C.redacted("sendgridApiKey").pipe(C.withDefault(
    Redacted.make("")
  )),
  defaultFrom: C.succeed(FROM),
  subjectPrefix: env.pipe(C.map((env) => env === "prod" ? "" : `[${serviceName_}] [${env}] `))
})

export const sentry = C.all({
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

export const SB_PREFIX = "Endpoint=sb://"
