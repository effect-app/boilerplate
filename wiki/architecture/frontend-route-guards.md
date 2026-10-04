<!-- Space: SA -->
<!-- Parent: Architecture -->
<!-- Parent: Architecture (shared) -->
<!-- Title: Frontend Route Guards and Async Setup -->

# Frontend Route Guards and Async Setup

Page setup is not a guard. If a page must decide whether it is allowed to load, make that decision in route middleware so the page component is never created for the wrong route state.

## Guard before setup

Use `definePageMeta({ middleware })` for any route eligibility check that can redirect:

- the user lacks the required claim, role, claimed resource, or workflow state;
- the route param is valid but currently points at the wrong step;
- a lightweight query is needed only to choose the route to enter.

The middleware must `return navigateTo(...)` or `return abortNavigation(...)`. Do not call `navigateTo(...)` from top-level `<script setup>` and then let setup continue.

```ts
const guard = async () => {
  const session = await run(loadCurrentSession())
  if (session?._tag !== "active") return navigateTo("/login")

  const [, data] = await client.List.suspense()
  if (data.value.needsEarlierStep) {
    return navigateTo({ name: "workflow-earlier-step" })
  }
}

definePageMeta({ middleware: guard })
```

Authenticated layouts (`default`, `import`) own the session via `SessionProvider` (`provide`/`inject`). Middleware cannot inject — it reads the same session atoms. After middleware passes, setup may assume the page is allowed to mount. Keep a narrow runtime assertion when TypeScript cannot see the middleware's guarantee. Discriminants use `throw abortSetup(...)` (native control-flow). Nullable fields that the page binds use `required(...)`, which throws the same interrupt and returns `NonNullable<T>` so the type lives on the binding (Vue auto-import preserves return types, not `never`). Not a classic `Error` — `FixedNuxtErrorBoundary` and Sentry already drop interrupt-only `CauseException` so an in-flight nav (e.g. logout) does not paint an error over the next page:

```ts
if (session?._tag !== "active") throw abortSetup("MiddlewareGuard")
const entityId = required(session.entityId, "MiddlewareGuard")
```

## Navigation must interrupt setup work

If async work starts in setup and the user navigates away before it settles, that work must be cancelled, aborted, or interrupted. A route change must not leave a pending setup promise that later mutates stale page state, emits toasts, holds locks, or blocks Nuxt's navigation lifecycle.

Prefer avoiding the problem:

- Put redirect decisions in route middleware, before component setup runs.
- Keep middleware guard queries small and side-effect-free.
- Move durable or must-finish work to commands, operations, or backend workflows; page setup should only load the page.

When setup genuinely owns cancellable work, tie it to route/component lifetime with the local cancellation primitive for that work: `AbortController`, Effect interruption, `onScopeDispose`, or `onBeforeRouteLeave`. The cleanup must run on both normal unmount and route replacement.

## Watchers are not entry guards

Watch `session.state`, route params, or query state only for changes after the page has loaded. The initial entry decision still belongs in middleware. A watcher can redirect after the user's claim changes, but it should not be the only thing preventing invalid setup from running.

## Middleware boundaries

Middleware is for route selection, not page behavior:

- no mutations except authentication/session refresh that the global middleware already owns;
- no subscriptions, event sources, hardware listeners, or timers;
- no durable workflow starts;
- no UI state setup.

If the code needs component refs, template state, hardware listeners, form state, or command handlers, it belongs in setup after the guard has passed.
