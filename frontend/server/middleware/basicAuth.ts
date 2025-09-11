import type { IncomingMessage } from "http"

export default defineEventHandler((event) => {
  const config = useRuntimeConfig()
  const base64Credentials = event.req.headers?.authorization?.split(" ")?.[1]

  const { originalUrl } = event.req as IncomingMessageExtended

  let allow = !config.basicAuthCredentials
    || config.basicAuthCredentials === "false"
    || (originalUrl
      && (originalUrl.startsWith("/api/")
        || originalUrl.startsWith("/.")
        || originalUrl === "/api"
        || originalUrl === "/manifest.json"
        || originalUrl.startsWith("/_nuxt/")
        || originalUrl.startsWith("/icons/")))

  if (!allow && base64Credentials) {
    const credentials = Buffer.from(base64Credentials, "base64").toString(
      "ascii"
    )

    const [username, password] = credentials.split(":")
    const [requiredUserName, requiredPassword] = config.basicAuthCredentials.split(":")

    allow = username === requiredUserName && password === requiredPassword
  }

  if (!allow) {
    event.res.statusCode = 401
    event.res.setHeader("WWW-Authenticate", "Basic realm=\"boilerplate\"")
    event.res.end("Unauthorized")
  }
})

interface IncomingMessageExtended extends IncomingMessage {
  originalUrl?: string
}
