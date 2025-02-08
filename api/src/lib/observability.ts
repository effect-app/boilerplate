/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Metrics from "@effect/opentelemetry/Metrics"
import * as Resource from "@effect/opentelemetry/Resource"
import * as Tracer from "@effect/opentelemetry/Tracer"
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node"
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks"
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http"
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http"
import { ConsoleMetricExporter, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics"
import opentelemetry from "@opentelemetry/sdk-node"
import { BatchSpanProcessor, ConsoleSpanExporter, NoopSpanProcessor } from "@opentelemetry/sdk-trace-node"
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions"
import * as Sentry from "@sentry/node"
import { SentryPropagator, SentrySampler, SentrySpanProcessor, setupEventContextTrace, wrapContextManagerClass } from "@sentry/opentelemetry"
import { Context, Effect, Layer, Redacted } from "effect-app"
import { dropUndefinedT } from "effect-app/utils"
import fs from "fs"
import tcpPortUsed from "tcp-port-used"
import { BaseConfig } from "../config.js"
import { basicRuntime } from "./basicRuntime.js"

const localConsole = false

const appConfig = basicRuntime.runSync(BaseConfig)
const isRemote = appConfig.env !== "local-dev"

const ResourceLive = Resource.layer({
  serviceName: appConfig.serviceName,
  serviceVersion: appConfig.apiVersion,
  attributes: {
    [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: appConfig.env
  }
})

const checkTelemetryExporterRunning = Effect.promise<boolean>(() => tcpPortUsed.check(4318, "localhost")).pipe(
  Effect.tap((isTelemetryExporterRunning) =>
    Effect.sync(() => {
      if (isTelemetryExporterRunning) {
        fs.writeFileSync(
          "../.telemetry-exporter-running",
          isTelemetryExporterRunning.toString()
        )
      } else {
        if (fs.existsSync("../.telemetry-exporter-running")) fs.unlinkSync("../.telemetry-exporter-running")
      }
    })
  ),
  Effect.cached,
  Effect.runSync
)

const makeMetricsReader = Effect.gen(function*() {
  const isTelemetryExporterRunning = !isRemote
    && (yield* checkTelemetryExporterRunning)

  const makeMetricReader = !isTelemetryExporterRunning
    ? isRemote
      ? undefined
      : localConsole
      ? () =>
        [
          new PeriodicExportingMetricReader({
            exporter: new ConsoleMetricExporter()
          })
        ] as const
      : undefined
    : () =>
      [
        new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter({
            url: "http://127.0.0.1:9090/api/v1/otlp/v1/metrics"
          })
        })
      ] as const

  return { makeMetricReader }
})

export class MetricsReader extends Context.TagMakeId("MetricsReader", makeMetricsReader)<MetricsReader>() {
  static readonly Live = this.toLayer()
}

const filteredOps = ["Import.AllOperations", "Operations.FindOperation"]
const filteredPaths = ["/.well-known/local/server-health", ...filteredOps.map((op) => `/${op}`)]
const filteredMethods = ["OPTIONS"]
const filterAttrs = {
  "request.name": filteredOps,
  "http.request.path": filteredPaths,
  "http.target": filteredPaths,
  "http.url": filteredPaths,
  "http.route": filteredPaths,
  "url.path": filteredPaths,
  "http.method": filteredMethods,
  "http.request.method": filteredMethods
}
const filteredEntries = Object.entries(filterAttrs)

const setupSentry = (options?: Sentry.NodeOptions) => {
  Sentry.init({
    ...dropUndefinedT({
      // otherwise sentry will set it up and override ours
      skipOpenTelemetrySetup: true,
      dsn: Redacted.value(appConfig.sentry.dsn),
      environment: appConfig.env,
      enabled: isRemote,
      release: appConfig.apiVersion,
      normalizeDepth: 5, // default 3
      // Set tracesSampleRate to 1.0 to capture 100%
      // of transactions for performance monitoring.
      // We recommend adjusting this value in production
      tracesSampleRate: 1.0,
      ...options
    }),
    beforeSendTransaction(event) {
      const otelAttrs = (event.contexts?.["otel"]?.["attributes"] as any) ?? {}
      const traceData = (event.contexts?.["trace"]?.["data"] as any) ?? {}
      if (
        filteredEntries.some(([k, vs]) =>
          vs.some((v) =>
            otelAttrs[k] === v
            || traceData[k] === v
            || event.spans?.some((s) => s.data?.[k] === v)
          )
        )
      ) {
        return null
      }
      return event
    }
  })
}

const ConfigLive = Effect
  .gen(function*() {
    const isTelemetryExporterRunning = !isRemote
      && (yield* checkTelemetryExporterRunning)

    const { makeMetricReader } = yield* MetricsReader

    const mr = makeMetricReader?.()

    let props: Partial<opentelemetry.NodeSDKConfiguration> = dropUndefinedT({
      metricReader: mr ? mr[0] : undefined,
      spanProcessors: isTelemetryExporterRunning || localConsole
        ? [
          new BatchSpanProcessor(
            isTelemetryExporterRunning
              ? new OTLPTraceExporter({
                url: "http://localhost:4318/v1/traces"
              })
              : new ConsoleSpanExporter()
          )
        ]
        : [new NoopSpanProcessor()]
    })

    setupSentry(dropUndefinedT({}))

    const resource = yield* Resource.Resource

    if (isRemote) {
      const client = Sentry.getClient()!
      setupEventContextTrace(client)

      // You can wrap whatever local storage context manager you want to use
      const SentryContextManager = wrapContextManagerClass(
        AsyncLocalStorageContextManager
      )

      props = {
        // Sentry config
        spanProcessors: [
          new SentrySpanProcessor()
        ],
        textMapPropagator: new SentryPropagator(),
        contextManager: new SentryContextManager(),
        sampler: new SentrySampler(client)
      }
    }

    props = {
      instrumentations: [getNodeAutoInstrumentations()],

      resource,

      ...props
    }
    const sdk = new opentelemetry.NodeSDK(props)

    // Ensure OpenTelemetry Context & Sentry Hub/Scope is synced
    // seems to be always set by Sentry 8.0.0 anyway
    // setOpenTelemetryContextAsyncContextStrategy()

    sdk.start()
    yield* Effect.addFinalizer(() => Effect.promise(() => sdk.shutdown()))
  })
  .pipe(Layer.scopedDiscard, Layer.provide(Layer.mergeAll(MetricsReader.Live, ResourceLive)))

const MetricsLive = MetricsReader
  .use(({ makeMetricReader }) => makeMetricReader ? Metrics.layer(makeMetricReader) : Layer.empty)
  .pipe(
    Layer.unwrapEffect,
    Layer.provide(Layer.mergeAll(ResourceLive, MetricsReader.Live))
  )
const NodeSdkLive = Layer.mergeAll(ConfigLive, MetricsLive)
export const TracingLive = Layer.mergeAll(
  NodeSdkLive,
  Tracer.layerGlobal.pipe(Layer.provide(ResourceLive))
)
