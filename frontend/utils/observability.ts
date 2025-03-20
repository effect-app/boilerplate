import { layer } from "@effect/opentelemetry/WebSdk"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-web"
import type * as Resources from "@opentelemetry/resources"
import * as Sentry from "@sentry/vue"
import { browserTracingIntegration } from "@sentry/browser"
import {
  SentrySpanProcessor,
  SentryPropagator,
} from "@sentry/opentelemetry-node"
import type { App } from "vue"
import otelApi from "@opentelemetry/api"
import { isErrorSilenced } from "effect-app/client/errors"
import { Layer, Effect } from "effect-app"

// import {
//   ConsoleSpanExporter,
//   SimpleSpanProcessor,
// } from "@opentelemetry/tracing"
// import { CollectorTraceExporter } from "@opentelemetry/exporter-collector"
// import { WebTracerProvider } from "@opentelemetry/web"
// import { ZoneContextManager } from "@opentelemetry/context-zone"
// import { B3Propagator } from "@opentelemetry/propagator-b3"

// const provider = new WebTracerProvider()

// // Configure a span processor and exporter for the tracer
// provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()))
// provider.addSpanProcessor(new SimpleSpanProcessor(new CollectorTraceExporter())) // url is optional and can be omitted - default is http://localhost:55681/v1/trace

// provider.register({
//   contextManager: new ZoneContextManager(),
//   propagator: new B3Propagator(),
// })
type Primitive = number | string | boolean | bigint | symbol | null | undefined
const annotateTags = (_tags: { [key: string]: Primitive }) => {
  // tags["user.role"] = store.user?.role
}

// watch(
//   store,
//   ({ user }) => {
//     Sentry.setUser({ id: user?.id, username: user?.displayName })
//   },
//   { immediate: true },
// )

export const setupSentry = (app: App<Element>, isRemote: boolean) => {
  const config = useRuntimeConfig()
  Sentry.init({
    app,
    environment: config.public.env,
    release: config.public.feVersion,
    enabled: isRemote,
    dsn: "FIXME",
    integrations: [
      browserTracingIntegration({
        //routingInstrumentation: Sentry.vueRouterInstrumentation(router),
        //tracePropagationTargets: ["localhost", /^\//],
      }),
    ],
    // Set tracesSampleRate to 1.0 to capture 100%
    // of transactions for performance monitoring.
    // We recommend adjusting this value in production
    tracesSampleRate: 1.0,
    beforeSendTransaction(event) {
      if (event.transaction === "eventsource: receive event") {
        return null
      }
      if (!event.tags) {
        event.tags = {}
      }
      annotateTags(event.tags)
      return event
    },
    beforeSend(event, hint) {
      if (
        // skip handled errors
        hint.originalException &&
        typeof hint.originalException === "object" &&
        isErrorSilenced(hint.originalException)
      ) {
        console.warn("Sentry: skipped HandledError", hint.originalException)
        return null
      }
      if (!event.tags) {
        event.tags = {}
      }
      annotateTags(event.tags)
      return event
    },
  })
}

export const WebSdkLive = (resource: {
  readonly serviceName: string
  readonly serviceVersion: string
  readonly attributes: Resources.ResourceAttributes
}) =>
  layer(() => ({
    resource,
    spanProcessor: [
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          headers: {}, // magic here !!!

          url: "http://localhost:4000/api/traces",
        }),
      ),
    ],
  }))

export const SentrySdkLive = (
  resource: {
    readonly serviceName: string
    readonly serviceVersion: string
    readonly attributes: Resources.ResourceAttributes
  },
  _env: string,
) =>
  Layer.merge(
    Layer.effectDiscard(
      Effect.sync(() => {
        otelApi.propagation.setGlobalPropagator(new SentryPropagator())
      }),
    ),
    layer(() => ({
      resource,
      spanProcessor: [new SentrySpanProcessor()],
    })),
  )

// registerInstrumentations({
//   instrumentations: [
//     new FetchInstrumentation({
//      // client is running on port 1234
//       ignoreUrls: [/localhost:1234\/sockjs-node/],
//       propagateTraceHeaderCorsUrls: ['http://localhost:7777'],
//       clearTimingResources: true,
//     }),
//   ],
// });

// const webTracer = provider.getTracer('tracer-web');
// const singleSpan = webTracer.startSpan(`fetch-span-start`);

// context.with(setSpan(context.active(), singleSpan), () => {
//   // ping an endpoint
//   fetch('http://localhost:7777/hello', {
//     method: 'GET',
//     headers: {
//       'Accept': 'application/json',
//       'Content-Type': 'application/json',
//     },
//   });
//     singleSpan.end();
// });
