import * as Sentry from "@sentry/vue"

export default defineNuxtPlugin(nuxtApp => {
  const config = useRuntimeConfig()
  Sentry.init({
    app: nuxtApp.vueApp,
    release: config.public.feVersion,
    normalizeDepth: 5, // default 3
    enabled: config.public.env !== "local-dev",
    dsn: "???",

    // Set tracesSampleRate to 1.0 to capture 100%
    // of transactions for performance monitoring.
    // We recommend adjusting this value in production
    tracesSampleRate: 1.0,
    beforeSend(event, hint) {
      if (
        // skip handled errors
        hint.originalException &&
        typeof hint.originalException === "object" &&
        "name" in hint.originalException &&
        hint.originalException["name"] === "HandledError"
      ) {
        console.warn("Sentry: skipped HandledError", hint.originalException)
        return null
      }
      return event
    },
  })
})
