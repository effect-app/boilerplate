/**
 * Action helpers that wait for side-effects to settle before continuing.
 *
 * Tests must not just fire actions — they must wait until the action has finished.
 * The best way is to wait for an expected behaviour change.
 *
 * **Approaches, ranked best → worst:**
 * 1. Wait for a measurable change on the page (preferred).
 *    - A counter or badge text has updated.
 *    - A row/item has been added, removed, or reordered in a list/table.
 *    - A field or label now shows a new value.
 *    - A dialog or panel has appeared or disappeared.
 * 2. Wait for a route change.
 * 3. Wait for a toast ({@link handleToast}).
 * 4. Wait for a network response ({@link waitForResponse}) — useful for debugging,
 *    but a request doesn't model the full action and isn't a UI-measurable change.
 * 5. Wait for transient states (disabled / loading) — fragile because they depend
 *    on temporality; the state may resolve before Playwright can observe it.
 *    ({@link actButton}, {@link actCard} fall into this category.)
 *
 *    Additionally, the behaviour of transient states is context-dependent and
 *    inconsistent across iterations. Example: a "Print" button on a list of 2
 *    delivery notes — after clicking for the first note the button re-enables
 *    (there's still a note left), but after the second click the button may stay
 *    disabled or disappear entirely (no more items). A wait-for-enabled assertion
 *    works on the first iteration but hangs or fails on the last, making the
 *    helper unreliable without caller-specific knowledge of the remaining state.
 *
 * **A note on flakiness and system load:**
 * Tests that rely on timing (transient states, fixed delays) may appear stable
 * when run in isolation on a quiet machine — the most ideal of circumstances.
 * Running tests in parallel or on a loaded CI runner amplifies timing variance
 * and exposes the underlying flakiness. But the real takeaway is not that
 * parallelism *causes* failures — it *reveals* that the test was never truly
 * reliable. If a test only passes under optimal lab conditions it will
 * eventually fail on real systems under load, and even more so where user
 * devices and slow connections are involved. Prefer waiting for deterministic,
 * observable state changes so tests remain stable regardless of system load.
 *
 * **Timeouts are a trade-off:**
 * We obviously cannot wait indefinitely — every assertion needs a reasonable
 * timeout. But generous timeouts come at a cost: when a test *does* fail, it
 * burns the full timeout before reporting. Multiply that across many assertions
 * and a suite that normally finishes in 10 minutes can balloon to an hour.
 * Keep timeouts tight enough to fail fast, but long enough to tolerate normal
 * variance. The best defence is still a deterministic wait condition — it
 * resolves as soon as the state is reached, so the timeout rarely matters.
 *
 * **Check for progress *and* failure, not just success:**
 * Instead of a single long timeout waiting for success, poll for multiple
 * signals in parallel:
 * - A progress indicator (e.g. a "Wird ausgeführt" toast) confirms the action
 *   started — reset your patience.
 * - A failure toast gives immediate feedback — fail the test right away
 *   instead of waiting for a timeout.
 * - A success toast or state change confirms completion.
 *
 * This way the happy path resolves as soon as it finishes, and errors are
 * caught immediately rather than after a long timeout. The result: less
 * flakiness, faster feedback on both success and failure.
 */
import { type Locator, type Page, type Response } from "playwright"
import { expect } from "playwright/test"
import * as adapter from "./adapter.js"

/**
 * CSS selector for a single toast container. Locators in {@link handleToast} /
 * {@link handleToastFailure} scope to this class so substring matches don't
 * accidentally hit body text. The toast library differs per project
 * (vue-toastification, Vuetify, PrimeVue, …), so a project may override it by
 * exporting `toastSelector` from its project-local `adapter.ts`; otherwise it
 * defaults to vue-toastification's class.
 */
const TOAST_SELECTOR: string = (adapter as { toastSelector?: string }).toastSelector
  ?? ".Vue-Toastification__toast"
/**
 * Attribute set on a toast container once its outcome (success / warnings /
 * failure / error) has been observed.  Subsequent toast locators filter it out
 * via `:not([data-e2e-toast-handled])`, so the next {@link handleToast} call
 * never sees a stale toast even if vue-toastification's exit animation hasn't
 * finished.  Progress toasts are deliberately NOT marked — they must remain
 * matchable so deadline extension keeps working across the action's lifetime.
 */
const TOAST_HANDLED_ATTR = "data-e2e-toast-handled"

/**
 * Mark a toast as handled and dispatch a click on its container in one
 * evaluate (single round-trip; no Playwright actionability waits).  The
 * attribute makes the next handleToast's `:not([data-e2e-toast-handled])`
 * filter skip this toast immediately; the click triggers the toast library's
 * dismiss so the toast is removed from internal state — without that, long
 * test runs could hit a library's max-visible-toasts cap and silently drop
 * later toasts.  Exit animation is already 0s via the CSS in
 * `disableToastAnimation`.
 */
const markToastHandled = async (toast: Locator): Promise<void> => {
  await toast.first().evaluate(
    (el, [attr, selector]) => {
      const container = ((el as HTMLElement).closest(selector) ?? el) as HTMLElement
      container.setAttribute(attr, "1")
      container.click()
    },
    [TOAST_HANDLED_ATTR, TOAST_SELECTOR] as const
  )
}

const markVisibleTerminalToastsHandled = async (page: Page, action: string): Promise<void> => {
  const toastBase = page.locator(`${TOAST_SELECTOR}:not([${TOAST_HANDLED_ATTR}])`)
  const terminalToasts = [
    toastBase.filter({ hasText: `${action} erfolgreich, mit Warnungen` }),
    toastBase.filter({ hasText: `${action} erfolgreich` }),
    toastBase.filter({ hasText: `${action} fehlgeschlagen` }),
    toastBase.filter({ hasText: `${action} unerwarteter Fehler` })
  ]

  for (const toast of terminalToasts) {
    while (await toast.first().isVisible().catch(() => false)) {
      await markToastHandled(toast)
    }
  }
}

/**
 * Execute {@link callback} while waiting for a matching network response.
 *
 * Useful for debugging (did the request fire / succeed?) but not ideal as a
 * stability signal — a response is not a UI-measurable change.
 *
 * @param page - Playwright page instance.
 * @param callback - Action to perform (e.g. a click).
 * @param responseCallback - Predicate that identifies the expected response.
 * @param responseOption - Optional overrides; default Playwright timeout is 30 s.
 * @returns The value returned by {@link callback}.
 */
/** A resource command class identified by its dotted `id` (e.g. `"WorkflowA/PackList.SaveItems"`). */
export type RpcResource = { readonly id: string }

/** Predicate matching a Playwright {@link Response}, or a resource to derive one from. */
export type ResponseMatch =
  | ((response: Response) => boolean | Promise<boolean>)
  | RpcResource

/**
 * Build a Playwright response predicate from a resource command class.
 *
 * Resource ids follow `${path}.${action}` (e.g. `"WorkflowA/PackList.SaveItems"`);
 * RPC URLs follow `/rpc/${path}?action=${action}`. Splitting on the last dot
 * gives both halves, and the `action` is matched with `[?&]action=NAME(&|$)`
 * so that prefixes (e.g. `Pack` vs `PackArticles`) don't collide.
 */
export function rpcResponseMatcher(
  resource: RpcResource
): (r: Response) => boolean {
  const dot = resource.id.lastIndexOf(".")
  const path = resource.id.slice(0, dot)
  const action = resource.id.slice(dot + 1)
  const pathFragment = `/rpc/${path}`
  const actionRe = new RegExp(`[?&]action=${action}(?:&|$)`)
  return (r) => r.url().includes(pathFragment) && actionRe.test(r.url())
}

/** Normalize a {@link ResponseMatch} to a plain predicate. */
export const toResponsePredicate = (
  match: ResponseMatch
): (r: Response) => boolean | Promise<boolean> =>
  // Resource command classes are functions too, so check for `.id` (the
  // resource identifier) rather than `typeof match === "function"`.
  typeof (match as RpcResource).id === "string"
    ? rpcResponseMatcher(match as RpcResource)
    : match as (r: Response) => boolean | Promise<boolean>

export const waitForResponse = async <T>(
  page: Page,
  callback: () => Promise<T> | T,
  responseCallback: ResponseMatch,
  responseOption?: { timeout?: number }
) => {
  const [, result] = await Promise.all([
    page.waitForResponse(toResponsePredicate(responseCallback), responseOption),
    callback()
  ])
  return result
}

/**
 * Click a Vuetify `v-btn` and wait for a busy state to appear then resolve.
 *
 * Falls back gracefully if the button becomes invisible (e.g. dialog closes).
 *
 * **Caveat:** relies on transient state — if the action resolves before
 * Playwright observes the busy state the assertion may time-out.
 *
 * @param locator - Locator pointing to the `v-btn` element.
 * @param signal - `"disabled"` (default) waits for the disabled attribute;
 *   `"loading"` waits for the `v-btn--loading` class.
 */
export async function actButton(locator: Locator, signal: "disabled" | "loading" = "disabled") {
  await expect(locator).toBeEnabled()
  const busy = signal === "loading"
    ? expect(locator).toHaveClass(/v-btn--loading/)
    : expect(locator).toBeDisabled()
  const done = signal === "loading"
    ? () => expect(locator).not.toHaveClass(/v-btn--loading/)
    : () => expect(locator).toBeEnabled()
  await Promise.all([
    Promise.race([busy, expect(locator).not.toBeVisible()]),
    locator.click()
  ])
  await Promise.race([done(), expect(locator).not.toBeVisible()])
}

/**
 * Click a Vuetify `v-card` and wait for its disabled state to appear then disappear.
 *
 * Falls back gracefully if the card becomes invisible (e.g. page navigates).
 *
 * **Caveat:** relies on transient state — same temporality risk as {@link actButton}.
 *
 * @param locator - Locator pointing to the `v-card` element.
 */
export async function actCard(locator: Locator) {
  await Promise.all([
    expect(locator).toHaveClass(/v-card--disabled/),
    locator.click()
  ])
  await Promise.race([expect(locator).not.toHaveClass(/v-card--disabled/), expect(locator).not.toBeVisible()])
}

/**
 * Execute an action and wait for a success toast to appear, then dismiss it.
 *
 * Automatically derives progress / failure / warning toast texts from the
 * success text using the `handle.*` intl patterns:
 * - `"{action} wird ausgeführt..."` — progress (adds
 *   {@link options.progressTimeout}, default 5 s).
 * - `"{action} fehlgeschlagen"` / `"unerwarteter Fehler"` — immediate failure.
 * - `"{action} erfolgreich, mit Warnungen"` — treated as failure unless
 *   {@link options.allowWarnings} is `true`.
 *
 * If the action succeeds or fails very quickly the progress toast may never
 * appear — that is fine, it is only used to add time to the deadline.
 *
 * **Note:** if the user cancels the operation (e.g. dismisses a confirmation
 * dialog) no toast may appear at all. In that case `handleToast` will time
 * out. Callers should handle cancellation separately *before* calling this.
 *
 * @param page - Playwright page instance.
 * @param action - The action name (e.g. `"Drucken"`). Toast texts are derived
 *   automatically: `"{action} erfolgreich"`, `"{action} fehlgeschlagen"`, etc.
 * @param callback - The action that triggers the toast (e.g. a form submit).
 * @param options.timeout - Initial timeout in ms (default 10 000).
 * @param options.allowWarnings - Accept "mit Warnungen" toasts as success.
 * @param options.progressTimeout - Time added when a progress toast appears or
 *   changes text (default 5 000).
 */
export async function handleToast(
  page: Page,
  action: string,
  callback: () => Promise<void>,
  options?: { timeout?: number; allowWarnings?: boolean; progressTimeout?: number }
) {
  await markVisibleTerminalToastsHandled(page, action)

  const timeout = options?.timeout ?? 10_000
  const progressTimeout = options?.progressTimeout ?? 5_000
  let deadline = Date.now() + timeout

  const toastBase = page.locator(`${TOAST_SELECTOR}:not([${TOAST_HANDLED_ATTR}])`)
  const successToast = toastBase.filter({ hasText: `${action} erfolgreich` })
  const progressToast = toastBase.filter({ hasText: `${action} wird ausgeführt` })
  const failureToast = toastBase.filter({ hasText: `${action} fehlgeschlagen` })
  const errorToast = toastBase.filter({ hasText: `${action} unerwarteter Fehler` })
  const warningsToast = toastBase.filter({ hasText: `${action} erfolgreich, mit Warnungen` })
  let lastProgressText: string | null = null
  const refreshProgressDeadline = async () => {
    const current = await progressToast.first().textContent({ timeout: 250 }).catch(() => null)
    if (current !== null && current !== lastProgressText) {
      lastProgressText = current
      deadline += progressTimeout
    }
  }
  const waitForProgressTextChange = (previous: string, timeout: number) =>
    page
      .waitForFunction(
        ({ selector, handledAttr, progressPrefix, previous }) =>
          Array
            .from(document.querySelectorAll(`${selector}:not([${handledAttr}])`))
            .some((el) => {
              const text = el.textContent ?? ""
              return text.includes(progressPrefix) && text !== previous
            }),
        {
          selector: TOAST_SELECTOR,
          handledAttr: TOAST_HANDLED_ATTR,
          progressPrefix: `${action} wird ausgeführt`,
          previous
        },
        { timeout }
      )
      .then(() => "progress-changed" as const)

  const waitForResult = async (): Promise<"success" | "warnings"> => {
    while (true) {
      const remaining = Math.max(deadline - Date.now(), 1)
      const checks: Promise<"success" | "progress" | "failure" | "error" | "warnings">[] = [
        successToast
          .first()
          .waitFor({ state: "visible", timeout: remaining })
          .then(() => "success" as const),
        progressToast
          .first()
          .waitFor({ state: "visible", timeout: remaining })
          .then(() => "progress" as const),
        failureToast
          .first()
          .waitFor({ state: "visible", timeout: remaining })
          .then(() => "failure" as const),
        errorToast
          .first()
          .waitFor({ state: "visible", timeout: remaining })
          .then(() => "error" as const),
        warningsToast
          .first()
          .waitFor({ state: "visible", timeout: remaining })
          .then(() => "warnings" as const)
      ]

      const result = await Promise.race(checks)
      for (const p of checks) p.catch(() => {})

      if (result === "success") {
        // "erfolgreich, mit Warnungen" also substring-matches the success locator
        if (await warningsToast.first().isVisible()) {
          if (!options?.allowWarnings) {
            throw new Error(`Warnings toast detected: "${action} erfolgreich, mit Warnungen"`)
          }
          return "warnings"
        }
        return "success"
      }
      if (result === "warnings") {
        if (options?.allowWarnings) return "warnings"
        throw new Error(`Warnings toast detected: "${action} erfolgreich, mit Warnungen"`)
      }
      if (result === "failure") throw new Error(`Failure toast detected: "${action} fehlgeschlagen"`)
      if (result === "error") throw new Error(`Error toast detected: "${action} unerwarteter Fehler"`)

      // progress spotted — extend deadline and keep waiting for a terminal toast
      await refreshProgressDeadline()
      const remainingAfterProgress = Math.max(deadline - Date.now(), 1)
      const progressChecks: Promise<
        "success" | "progress-hidden" | "progress-changed" | "failure" | "error" | "warnings"
      >[] = [
        successToast
          .first()
          .waitFor({ state: "visible", timeout: remainingAfterProgress })
          .then(() => "success" as const),
        progressToast
          .first()
          .waitFor({ state: "hidden", timeout: remainingAfterProgress })
          .then(() => "progress-hidden" as const),
        failureToast
          .first()
          .waitFor({ state: "visible", timeout: remainingAfterProgress })
          .then(() => "failure" as const),
        errorToast
          .first()
          .waitFor({ state: "visible", timeout: remainingAfterProgress })
          .then(() => "error" as const),
        warningsToast
          .first()
          .waitFor({ state: "visible", timeout: remainingAfterProgress })
          .then(() => "warnings" as const)
      ]
      if (lastProgressText !== null) {
        progressChecks.push(waitForProgressTextChange(lastProgressText, remainingAfterProgress))
      }
      const progressResult = await Promise.race(progressChecks)
      for (const p of progressChecks) p.catch(() => {})
      if (progressResult === "progress-hidden" || progressResult === "progress-changed") {
        await refreshProgressDeadline()
        continue
      }
      if (progressResult === "success") {
        if (await warningsToast.first().isVisible()) {
          if (!options?.allowWarnings) {
            throw new Error(`Warnings toast detected: "${action} erfolgreich, mit Warnungen"`)
          }
          return "warnings"
        }
        return "success"
      }
      if (progressResult === "warnings") {
        if (options?.allowWarnings) return "warnings"
        throw new Error(`Warnings toast detected: "${action} erfolgreich, mit Warnungen"`)
      }
      if (progressResult === "failure") throw new Error(`Failure toast detected: "${action} fehlgeschlagen"`)
      throw new Error(`Error toast detected: "${action} unerwarteter Fehler"`)
    }
  }

  const [outcome] = await Promise.all([waitForResult(), callback()])

  // Mark this outcome toast as handled (DOM attribute, single round-trip) so
  // the next handleToast call's `:not([data-e2e-toast-handled])` filter skips
  // it.  No click, no animation wait, no `toHaveCount(0)` poll.
  await markToastHandled(outcome === "warnings" ? warningsToast : successToast)
}

/**
 * Execute an action while watching command toasts and a durable postcondition.
 *
 * Success/progress toasts are treated as command signals: useful for fast
 * feedback and progress extension, but not required when the durable
 * postcondition proves the page/domain state caught up. Failure/error toasts
 * still fail fast.
 *
 * Use this for commands where a terminal toast is reliable feedback but can be
 * missed by the browser under load, or where the toast can arrive before the UI
 * has finished query invalidation / rerender.
 */
export async function handleToastOrPostcondition(
  page: Page,
  action: string,
  callback: () => Promise<void>,
  postcondition: () => Promise<void>,
  options?: { timeout?: number; allowWarnings?: boolean; progressTimeout?: number }
) {
  await markVisibleTerminalToastsHandled(page, action)

  const timeout = options?.timeout ?? 10_000
  const progressTimeout = options?.progressTimeout ?? 5_000
  let deadline = Date.now() + timeout

  const toastBase = page.locator(`${TOAST_SELECTOR}:not([${TOAST_HANDLED_ATTR}])`)
  const successToast = toastBase.filter({ hasText: `${action} erfolgreich` })
  const progressToast = toastBase.filter({ hasText: `${action} wird ausgeführt` })
  const failureToast = toastBase.filter({ hasText: `${action} fehlgeschlagen` })
  const errorToast = toastBase.filter({ hasText: `${action} unerwarteter Fehler` })
  const warningsToast = toastBase.filter({ hasText: `${action} erfolgreich, mit Warnungen` })
  let lastProgressText: string | null = null
  const refreshProgressDeadline = async () => {
    const current = await progressToast.first().textContent({ timeout: 250 }).catch(() => null)
    if (current !== null && current !== lastProgressText) {
      lastProgressText = current
      deadline += progressTimeout
    }
  }
  const waitForProgressTextChange = (previous: string, timeout: number) =>
    page
      .waitForFunction(
        ({ selector, handledAttr, progressPrefix, previous }) =>
          Array
            .from(document.querySelectorAll(`${selector}:not([${handledAttr}])`))
            .some((el) => {
              const text = el.textContent ?? ""
              return text.includes(progressPrefix) && text !== previous
            }),
        {
          selector: TOAST_SELECTOR,
          handledAttr: TOAST_HANDLED_ATTR,
          progressPrefix: `${action} wird ausgeführt`,
          previous
        },
        { timeout }
      )
      .then(() => "progress-changed" as const)

  const waitForResult = async (): Promise<"success" | "warnings" | "failure" | "error"> => {
    while (true) {
      const remaining = Math.max(deadline - Date.now(), 1)
      const checks: Promise<"success" | "progress" | "failure" | "error" | "warnings">[] = [
        successToast
          .first()
          .waitFor({ state: "visible", timeout: remaining })
          .then(() => "success" as const),
        progressToast
          .first()
          .waitFor({ state: "visible", timeout: remaining })
          .then(() => "progress" as const),
        failureToast
          .first()
          .waitFor({ state: "visible", timeout: remaining })
          .then(() => "failure" as const),
        errorToast
          .first()
          .waitFor({ state: "visible", timeout: remaining })
          .then(() => "error" as const),
        warningsToast
          .first()
          .waitFor({ state: "visible", timeout: remaining })
          .then(() => "warnings" as const)
      ]

      const result = await Promise.race(checks)
      for (const p of checks) p.catch(() => {})

      if (result !== "progress") return result

      await refreshProgressDeadline()
      const remainingAfterProgress = Math.max(deadline - Date.now(), 1)
      const progressChecks: Promise<
        "success" | "progress-hidden" | "progress-changed" | "failure" | "error" | "warnings"
      >[] = [
        successToast
          .first()
          .waitFor({ state: "visible", timeout: remainingAfterProgress })
          .then(() => "success" as const),
        progressToast
          .first()
          .waitFor({ state: "hidden", timeout: remainingAfterProgress })
          .then(() => "progress-hidden" as const),
        failureToast
          .first()
          .waitFor({ state: "visible", timeout: remainingAfterProgress })
          .then(() => "failure" as const),
        errorToast
          .first()
          .waitFor({ state: "visible", timeout: remainingAfterProgress })
          .then(() => "error" as const),
        warningsToast
          .first()
          .waitFor({ state: "visible", timeout: remainingAfterProgress })
          .then(() => "warnings" as const)
      ]
      if (lastProgressText !== null) {
        progressChecks.push(waitForProgressTextChange(lastProgressText, remainingAfterProgress))
      }
      const progressResult = await Promise.race(progressChecks)
      for (const p of progressChecks) p.catch(() => {})
      if (progressResult === "progress-hidden" || progressResult === "progress-changed") {
        await refreshProgressDeadline()
        continue
      }
      return progressResult
    }
  }

  const toastPromise = waitForResult()
    .then((result) => ({ _tag: "toast" as const, result }))
    .catch((error: unknown) => ({ _tag: "toast-timeout" as const, error }))
  const statePromise = (async () => {
    await callback()
    await postcondition()
    return { _tag: "postcondition" as const }
  })()

  const first = await Promise.race([toastPromise, statePromise])
  if (first._tag === "postcondition") {
    const lateToastGraceMs = Math.min(1000, Math.max(deadline - Date.now(), 1))
    const lateToast = await Promise.race([
      toastPromise,
      page.waitForTimeout(lateToastGraceMs).then(() => ({ _tag: "no-late-toast" as const }))
    ])
    if (lateToast._tag === "toast") {
      if (lateToast.result === "failure") throw new Error(`Failure toast detected: "${action} fehlgeschlagen"`)
      if (lateToast.result === "error") throw new Error(`Error toast detected: "${action} unerwarteter Fehler"`)
      if (lateToast.result === "warnings" && !options?.allowWarnings) {
        throw new Error(`Warnings toast detected: "${action} erfolgreich, mit Warnungen"`)
      }
      await markToastHandled(lateToast.result === "warnings" ? warningsToast : successToast)
    }
    return
  }

  if (first._tag === "toast-timeout") {
    await statePromise
    return
  }

  if (first.result === "failure") {
    statePromise.catch(() => {})
    throw new Error(`Failure toast detected: "${action} fehlgeschlagen"`)
  }
  if (first.result === "error") {
    statePromise.catch(() => {})
    throw new Error(`Error toast detected: "${action} unerwarteter Fehler"`)
  }
  if (first.result === "warnings" && !options?.allowWarnings) {
    statePromise.catch(() => {})
    throw new Error(`Warnings toast detected: "${action} erfolgreich, mit Warnungen"`)
  }

  await markToastHandled(first.result === "warnings" ? warningsToast : successToast)
  await statePromise
}

/**
 * Execute an action and wait for a **failure** toast to appear, then dismiss it.
 *
 * Inverse of {@link handleToast}: succeeds when a failure/error toast is seen;
 * throws immediately if a success toast appears instead.
 *
 * Use this when a command is expected to fail (e.g. validation error, conflict)
 * and you want to assert the failure is surfaced to the user.
 *
 * @param page - Playwright page instance.
 * @param action - The action name (e.g. `"Übernehmen"`). Toast texts are derived
 *   automatically: `"{action} fehlgeschlagen"`, `"{action} unerwarteter Fehler"`.
 * @param callback - The action that triggers the toast (e.g. a button click).
 * @param options.timeout - Initial timeout in ms (default 10 000).
 * @param options.progressTimeout - Time added when a progress toast appears or
 *   changes text (default 5 000).
 */
export async function handleToastFailure(
  page: Page,
  action: string,
  callback: () => Promise<void>,
  options?: { timeout?: number; progressTimeout?: number }
) {
  await markVisibleTerminalToastsHandled(page, action)

  const timeout = options?.timeout ?? 10_000
  const progressTimeout = options?.progressTimeout ?? 5_000
  let deadline = Date.now() + timeout

  const toastBase = page.locator(`${TOAST_SELECTOR}:not([${TOAST_HANDLED_ATTR}])`)
  const successToast = toastBase.filter({ hasText: `${action} erfolgreich` })
  const progressToast = toastBase.filter({ hasText: `${action} wird ausgeführt` })
  const failureToast = toastBase.filter({ hasText: `${action} fehlgeschlagen` })
  const errorToast = toastBase.filter({ hasText: `${action} unerwarteter Fehler` })
  let lastProgressText: string | null = null
  const refreshProgressDeadline = async () => {
    const current = await progressToast.first().textContent({ timeout: 250 }).catch(() => null)
    if (current !== null && current !== lastProgressText) {
      lastProgressText = current
      deadline += progressTimeout
    }
  }
  const waitForProgressTextChange = (previous: string, timeout: number) =>
    page
      .waitForFunction(
        ({ selector, handledAttr, progressPrefix, previous }) =>
          Array
            .from(document.querySelectorAll(`${selector}:not([${handledAttr}])`))
            .some((el) => {
              const text = el.textContent ?? ""
              return text.includes(progressPrefix) && text !== previous
            }),
        {
          selector: TOAST_SELECTOR,
          handledAttr: TOAST_HANDLED_ATTR,
          progressPrefix: `${action} wird ausgeführt`,
          previous
        },
        { timeout }
      )
      .then(() => "progress-changed" as const)

  const waitForResult = async (): Promise<"failure" | "error"> => {
    while (true) {
      const remaining = Math.max(deadline - Date.now(), 1)
      const checks: Promise<"success" | "progress" | "failure" | "error">[] = [
        successToast
          .first()
          .waitFor({ state: "visible", timeout: remaining })
          .then(() => "success" as const),
        progressToast
          .first()
          .waitFor({ state: "visible", timeout: remaining })
          .then(() => "progress" as const),
        failureToast
          .first()
          .waitFor({ state: "visible", timeout: remaining })
          .then(() => "failure" as const),
        errorToast
          .first()
          .waitFor({ state: "visible", timeout: remaining })
          .then(() => "error" as const)
      ]

      const result = await Promise.race(checks)
      for (const p of checks) p.catch(() => {})

      if (result === "success") {
        throw new Error(`Expected failure but got success toast: "${action} erfolgreich"`)
      }
      if (result === "failure" || result === "error") return result

      // progress spotted — extend deadline and keep waiting for a terminal toast
      await refreshProgressDeadline()
      const remainingAfterProgress = Math.max(deadline - Date.now(), 1)
      const progressChecks: Promise<"success" | "progress-hidden" | "progress-changed" | "failure" | "error">[] = [
        successToast
          .first()
          .waitFor({ state: "visible", timeout: remainingAfterProgress })
          .then(() => "success" as const),
        progressToast
          .first()
          .waitFor({ state: "hidden", timeout: remainingAfterProgress })
          .then(() => "progress-hidden" as const),
        failureToast
          .first()
          .waitFor({ state: "visible", timeout: remainingAfterProgress })
          .then(() => "failure" as const),
        errorToast
          .first()
          .waitFor({ state: "visible", timeout: remainingAfterProgress })
          .then(() => "error" as const)
      ]
      if (lastProgressText !== null) {
        progressChecks.push(waitForProgressTextChange(lastProgressText, remainingAfterProgress))
      }
      const progressResult = await Promise.race(progressChecks)
      for (const p of progressChecks) p.catch(() => {})
      if (progressResult === "progress-hidden" || progressResult === "progress-changed") {
        await refreshProgressDeadline()
        continue
      }
      if (progressResult === "success") {
        throw new Error(`Expected failure but got success toast: "${action} erfolgreich"`)
      }
      return progressResult
    }
  }

  const [outcome] = await Promise.all([waitForResult(), callback()])

  await markToastHandled(outcome === "failure" ? failureToast : errorToast)
}
