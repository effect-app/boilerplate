<!-- Space: SA -->
<!-- Parent: Architecture -->
<!-- Title: Error Model — Data vs Schema tagged errors -->

# Data.TaggedError vs Schema.TaggedErrorClass

Use `Data.TaggedError` when the error is part of an in-process implementation contract. It can carry rich local detail: native causes, handles, driver objects, internal state, opaque values, and diagnostic-only fields. It is cheap and honest: "this is a typed Effect error inside this process."

Use `Schema.TaggedErrorClass` when the error is part of a protocol contract. Examples include RPC, HTTP API, persistence, worker messages, durable workflows, public client/server boundaries. It says: "this error has a stable encoded shape, and callers may decode it somewhere else."

So the split is better described as **local diagnostic error vs contractual transport error**, not strictly internal service vs boundary. SQL is a good example: effect's `SqlError` uses schema-backed errors because SQL errors become a shared structured vocabulary, not just local implementation failures.

> In this codebase, "boundary" is not only RPC/HTTP. There are three serialization boundaries: **RPC/wire** (handlers → frontend), **DurableDeferred / cluster / activity-result** (the workflow engine persists the error channel), and **persisted domain state** (e.g. an aggregate's `state.processing.error` → DB + frontend). An error that crosses any of these must be schema-backed _for that boundary_; an error that crosses none can stay `Data`.

## Avoid One-For-One Duplication

Generally, do not create one-for-one Schema clones of Data errors. That usually preserves the wrong abstraction. Instead, translate at the boundary into the smaller vocabulary the caller can act on.

```ts
// internal
class PgTimeout extends Data.TaggedError("PgTimeout")<{
  readonly query: string
  readonly cause: unknown
}> {}

class PoolExhausted extends Data.TaggedError("PoolExhausted")<{
  readonly pending: number
  readonly cause: unknown
}> {}

// boundary
class ServiceUnavailable extends Schema.TaggedErrorClass<ServiceUnavailable>()(
  "ServiceUnavailable",
  {
    reason: Schema.Literal("database-timeout", "capacity"),
    message: Schema.String
  }
) {}
```

Then map many local failures into one boundary failure:

```ts
Effect.mapError((error) => {
  switch (error._tag) {
    case "PgTimeout":
      return new ServiceUnavailable({
        reason: "database-timeout",
        message: "The database did not respond in time"
      })
    case "PoolExhausted":
      return new ServiceUnavailable({
        reason: "capacity",
        message: "The service is temporarily overloaded"
      })
  }
})
```

That "loss of detail" is not a bug. It is the boundary doing its job. The internal error can keep `cause`, query text, driver codes, stack, retry metadata, and other diagnostic detail. The boundary error should expose only what is stable, serializable, safe, and useful to the remote caller.

## Preserve Causes Locally

Do not preserve raw causes as part of a schema error contract unless the cause has been deliberately modeled as sanitized, stable data. Raw `cause` values are diagnostic material, not protocol material. They may contain native errors, provider details, stack traces, private data, request objects, resources, or values that cannot be decoded somewhere else.

Preserve rich causes locally through:

- logs
- spans
- metrics
- error reporting
- defect or failure reporting pipelines
- diagnostic identifiers that can be correlated later

> **Don't hand-serialize causes.** Do not `String(cause)` / `JSON.stringify(error)` / `Cause.pretty(...)` into span attributes or log fields. Effect's OpenTelemetry integration already serializes a `Cause` structurally (exception type, message, stack, nested causes). When you swallow a failure (`Effect.result`/`Effect.exit`/`catch*`) and continue, surface the original with `yield* Effect.logError(cause)` (or `Effect.tapErrorCause(Effect.logError)` before the catch) and let the runtime export it. Manual stringification is lossy, unsearchable, and duplicates what the framework does better.

Expose schema errors as stable decision data:

```ts
class UploadDocumentFailed
  extends Schema.TaggedErrorClass<UploadDocumentFailed>()(
    "UploadDocumentFailed",
    {
      documentId: Schema.String,
      reason: Schema.Literal(
        "storage-unavailable",
        "invalid-document",
        "provider-rejected"
      ),
      retryable: Schema.Boolean,
      diagnosticId: Schema.optional(Schema.String)
    }
  )
{}
```

The schema error should answer: "what can the caller do now?"

The local cause should answer: "what actually happened, for operators and debugging?"

For example, a local `BlobStorage` failure may preserve the provider-specific cause:

```ts
class BlobPutFailed extends Data.TaggedError("BlobPutFailed")<{
  readonly key: string
  readonly cause: unknown
}> {}
```

But a cluster entity or workflow boundary should translate that into the domain operation that failed:

```ts
Effect
  .mapError((error) =>
    new UploadDocumentFailed({
      documentId,
      reason: "storage-unavailable",
      retryable: true,
      diagnosticId
    })
  )
  .pipe(
    Effect.tapErrorCause((cause) => Effect.logError(cause))
  )
```

The remote workflow should not decide based on "the storage provider returned X" unless the workflow's domain is storage management. It should decide based on stable business semantics: retry later, compensate, stop, continue, or surface a user-facing failure.

## Use Reason For Structured Detail

The Effect repo often uses an outer error wrapper plus an inner `reason` tagged union. The outer `_tag` names the broad subsystem or operation that failed; the inner `reason._tag` names the specific variant.

This shows up in low-level HTTP errors:

```ts
class HttpClientError extends Data.TaggedError("HttpClientError")<{
  readonly reason: HttpClientErrorReason
}> {}

type HttpClientErrorReason =
  | TransportError
  | EncodeError
  | DecodeError
  | StatusCodeError
  | EmptyBodyError
```

It also shows up in schema-backed SQL errors:

```ts
class SqlError extends Schema.TaggedErrorClass<SqlError>()("SqlError", {
  reason: SqlErrorReason
}) {}

const SqlErrorReason = Schema.Union([
  ConnectionError,
  UniqueViolation,
  ConstraintError
])
```

For domain boundaries, use the same shape when callers need broad grouping and specific decisions:

```ts
const UploadDocumentFailedReason = Schema.Union([
  Schema.TaggedStruct("StorageUnavailable", {}),
  Schema.TaggedStruct("InvalidDocument", {
    field: Schema.String
  }),
  Schema.TaggedStruct("ProviderRejected", {
    code: Schema.String
  })
])

class UploadDocumentFailed
  extends Schema.TaggedErrorClass<UploadDocumentFailed>()(
    "UploadDocumentFailed",
    {
      reason: UploadDocumentFailedReason,
      retryable: Schema.Boolean,
      diagnosticId: Schema.optional(Schema.String)
    }
  )
{}
```

This keeps the outer error aligned with the operation the caller attempted, while `reason` preserves structured decision detail. It also avoids exposing infra implementation variants directly to a workflow or remote caller.

## Boundary Errors Must Be Translatable

This is the **primary reason** the boundary vocabulary is structured rather than a formatted string: errors that reach a user have to be localized. A `message` baked on the server is a single language — the frontend cannot translate it.

So the structured shape _is_ the translation contract:

- `_tag` + `reason._tag` → the i18n key (`errors.uploadDocumentFailed.invalidDocument`).
- `reason`'s fields → the interpolation params (`{ expected, actual }`, `{ status }`, `{ code }`).
- `retryable` → drives UI affordances (show a "retry" button) without parsing text.

```ts
// frontend
const text = t(`errors.${error._tag}.${error.reason._tag}`, error.reason)
```

Consequences:

- Put everything the user-facing string needs into `reason` as typed fields — never only inside a prose `message`.
- A `message` field, if present, is **ops/log text, not user copy**. Don't render raw server `message` to end users; translate from `_tag`/`reason`. (The same applies to control-flow errors like a workflow's `InvalidStateError` — a server-language string there is a fallback, not the localized surface.)
- Adding a new failure mode = adding a `reason` variant (+ its translation key), not a new free-text string.

## Keep Shared Schemas Strict

Exported/shared schemas are contracts. Keep their variant space explicit and strict, especially for error unions that clients, RPC, cluster, durable workflows, or persisted state decode. Do not put a catch-all arm such as `Schema.Unknown`, `Schema.Defect`, or `UnknownError.fromUnknown` into an exported union just because an upstream service can return arbitrary data.

When an inbound adapter needs tolerant parsing, use a separate local decode schema at that boundary:

```ts
// shared/client contract
const PartnerErrorResponse = Schema.Union([
  KnownPartnerError,
  UnknownPartnerError
])

// local inbound adapter only
const PartnerErrorResponseFromWire = Schema.Union([
  KnownPartnerError,
  UnknownPartnerError.fromUnknown
])
```

The adapter may collapse unrecognized upstream payloads into the explicit `UnknownPartnerError` value. After that, downstream code should carry the strict shared schema. This preserves exhaustiveness for clients and prevents "anything decodes" catch-alls from silently weakening persisted or wire contracts.

## Rule Of Thumb

- If downstream code needs to `catchTag` inside the same process, `Data` is enough.
- If the value appears in an `Rpc.make({ error })`, `HttpApiSchema`, persistence schema, or cross-process message, use `Schema`.
- If every field in the error is naturally schema-worthy and the error is already public API, use `Schema.TaggedErrorClass` from the start.
- If the error includes `unknown`, native exceptions, resources, request objects, spans, or private diagnostics, keep it as `Data` and map it.
- If you feel tempted to duplicate every variant, you probably have not chosen the caller-facing error vocabulary yet.
- Across cluster, RPC, workflow, or durable boundaries, prefer errors named after the domain operation that failed, not the infra subsystem that happened to fail.
- Use an inner `reason` tagged union when one broad error needs several stable, caller-actionable variants.
- If the error can reach a user, treat `_tag` + `reason` (+ fields) as the translation contract; never depend on a server-formatted `message` for user copy.
- Never `String`/`JSON.stringify`/`Cause.pretty` a cause into a span or log field — `Effect.logError(cause)` and let OTel serialize it.

The clean mental model is: **internal errors explain what happened; boundary errors describe what the caller may do with it.**
