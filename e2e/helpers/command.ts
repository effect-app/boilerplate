/**
 * Command-trigger factory that derives its label and toast prefix from the
 * resource command class, keeping e2e tests in sync with the UI automatically.
 *
 * ## Motivation
 *
 * When a button label changes in the intl file, the test breaks immediately
 * (the locator no longer finds the element) rather than silently passing while
 * the toast assertion is checking for a stale string.  This eliminates the two
 * most common causes of "tests green but UI broken" drift:
 *   1. Button label renamed — old `getByRole("button", { name: "..." })` stops
 *      matching, test fails clearly.
 *   2. Toast prefix renamed — `handleToast("OldName", ...)` never sees the
 *      toast, test hangs until timeout.
 *
 * ## Label & toast-prefix derivation
 *
 * Given a resource command class such as `PickCarts.Assign` (whose `id` is
 * `"Standard/PickCarts.Assign"`), the intl key is computed as:
 *
 *   `action.Standard/PickCarts.Assign`
 *
 * then looked up in the German action messages (`deActionMessages`):
 *
 *   `"action.Standard/PickCarts.Assign": "Übernehmen"` → label = toast = "Übernehmen"
 *
 * For `_isLabel` ICU select patterns the `true` branch becomes the button label
 * and the `other` branch becomes the toast prefix:
 *
 *   `"action.Standard/Order.Cancel": "{_isLabel, select, true {Abbrechen} other {Auftrag stornieren}}"`
 *   → label = "Abbrechen", toastPrefix = "Auftrag stornieren"
 *
 * For ICU patterns with runtime variables, pass `vars` with the variable values
 * so that the resolved label and toast prefix match what the UI renders:
 *
 *   `"action.CartManagement.ChangeBlockedState"`:
 *   `"{_isLabel, select, true {Wagen {state, select, Blocked {blockieren} other {freigeben}}} other {...}}"`
 *   → with `vars: { state: "Blocked" }`: label = "Wagen blockieren"
 *
 * ## Option layers
 *
 * Options resolve in three layers, each overriding the previous:
 *   1. `command(resource, options)` — creation-time defaults
 *   2. `.bind(page, options)` — bind-time defaults (override layer 1)
 *   3. `.click(pw, options)` — per-click overrides (override layers 1 & 2)
 *
 * `vars` are **merged** across layers (`{ ...createVars, ...bindVars, ...clickVars }`).
 * All other options (`label`, `toastPrefix`, `exact`) cascade: click > bind > create > ICU-resolved.
 *
 * ## Usage
 *
 * ### Bound (page embedded — preferred)
 *
 * Use the `command` fixture or `PomBase.command` field — both bind `page` once:
 *
 * ```ts
 * // in a spec:
 * test("…", async ({ command }) => {
 *   await command(PickCarts.Assign).click()
 * })
 *
 * // in a POM:
 * class MyPOM extends PomBase {
 *   private readonly assignBtn = this.command(PickCarts.Assign)
 *   async assignCart() { await this.assignBtn.click() }
 * }
 * ```
 *
 * ### Fluent shortcuts
 *
 * `.via(locator)` — wrap an arbitrary trigger element (list row, icon button,
 * dialog arrow) while keeping the intl-derived toast prefix:
 *
 * ```ts
 * await command(PickList.Picked).via(page.locator(".v-dialog").getByRole("button", { name: "<-" })).click()
 * ```
 *
 * `.thenConfirm({ title?, label? })` — when the action opens a dialog and
 * the RPC fires after the user confirms. Optional `title` asserts the
 * dialog appeared before clicking the confirm button:
 *
 * ```ts
 * await command(UserManagement.DeleteUserById).thenConfirm().click()
 * await command(Order.Cancel).via(activator).thenConfirm({ title: "Sind Sie sicher?" }).click()
 * ```
 *
 * For the case where the caller has already opened the dialog elsewhere and
 * the "Ja" button itself is the trigger, use the label override:
 *
 * ```ts
 * await command(Order.Cancel, { label: "Ja" }).click()
 * ```
 *
 * ### Outside a test/POM
 *
 * If neither the fixture nor `PomBase.command` are reachable, use the
 * exported `makeBoundCommand(page)` factory directly:
 *
 * ```ts
 * await makeBoundCommand(page)(PickCarts.Assign).click()
 * ```
 *
 * All {@link CommandClickOptions} are available on every form.
 */
// Project-local adapter: re-exports the project's intl action messages.
// See adapter.ts in the consuming project (created on first sync).
import type { Locator, Page } from "playwright"
import { handleToast, handleToastFailure, handleToastOrPostcondition, type ResponseMatch, type RpcResource, rpcResponseMatcher, waitForResponse as waitForResponseHelper } from "./act.ts"
import { type ActionIntlKey, deActionMessages } from "./adapter.js"

export { type ResponseMatch, type RpcResource, rpcResponseMatcher }

/** Options passed to the underlying Playwright {@link Locator.click}. */
export type PlaywrightClickOptions = Parameters<Locator["click"]>[0]

/** ICU interpolation variables keyed by placeholder name. */
export type IntlVars = Readonly<Record<string, string>>

/**
 * The set of resource-command ids that have an entry in {@link deActionMessages}.
 * Derived from the `action.${id}` keys, this constrains {@link command} to
 * resources whose intl message actually exists — typos and missing translations
 * surface at compile time instead of producing a `[action.X]` fallback string
 * at runtime.
 */
export type ActionId = ActionIntlKey extends `action.${infer R}` ? R : never

/** Options set at {@link command} creation time or at `.bind()` time. */
export interface CommandOptions {
  /** Override the button label derived from the intl message. */
  label?: string
  /** Override the toast prefix derived from the intl message. */
  toastPrefix?: string
  /**
   * Whether to use exact matching for the button label.
   *
   * Defaults to `true` to avoid substring matches (e.g. "Packen" matching
   * "Packen pausieren"). Set to `false` when you intentionally want a partial
   * or regex match.
   */
  exact?: boolean
  /**
   * Default ICU interpolation variables for messages with runtime placeholders
   * (e.g. `{ state: "Blocked" }` for a `{state, select, …}` ICU pattern).
   *
   * At `.bind()` time these merge with the creation-time vars.
   */
  vars?: IntlVars
  /**
   * After the action button click, click this confirmation dialog button
   * before the toast wait resolves. Sugar for
   * `afterClick: () => page.getByRole("button", { name }).click()`.
   *
   * Use when the action opens a "Möchten Sie …?" dialog and the RPC only
   * fires after the user confirms. The toast wait then sees the real
   * command response, not the dialog opener.
   *
   * If a per-click `afterClick` is also set, the confirmation runs first
   * then the user hook.
   *
   * Prefer the fluent {@link Command.thenConfirm} method:
   * `command(rsc).thenConfirm().click()`.
   */
  confirmAfterClick?: string
  /**
   * Optional dialog-title assertion run after the action click but before
   * the confirmation button is clicked. Catches "wrong dialog opened"
   * regressions and produces a clearer failure message than waiting for
   * the confirm button to time out. Accepts a string or regex (use regex
   * for dialogs with interpolated content).
   *
   * Only honoured when {@link CommandOptions.confirmAfterClick} is set.
   *
   * Prefer the fluent {@link Command.thenConfirm} method's `title` option.
   */
  confirmDialogTitle?: string | RegExp
}

/** Per-click options that can override or extend the static ones. */
export interface CommandClickOptions {
  /** Expect a failure toast instead of a success toast. Default: `false`. */
  expectFailure?: boolean
  /** Skip all toast assertions (e.g. when the action opens a dialog). Default: `false`. */
  skipToast?: boolean
  /**
   * Also wait for a matching network response before resolving.
   *
   * Accepts a Playwright response predicate or a resource command class
   * (e.g. `PackListRsc.SaveItems`) — the latter is converted into a URL/action
   * predicate via {@link rpcResponseMatcher}.
   */
  waitForResponse?: ResponseMatch
  /** Timeout for {@link waitForResponse} (ms). */
  responseTimeout?: number
  /** Scope the button locator to this parent element. */
  parent?: Locator
  /** Override the toast prefix for this click only. */
  toastPrefix?: string
  /** Override the button label (locator) for this click only. */
  label?: string
  /**
   * Override the exact-match mode for this click only.
   *
   * Inherits the value set at creation time (default `true`).
   */
  exact?: boolean
  /** Initial toast timeout in ms (default 10 000). */
  toastTimeout?: number
  /** Timeout window to use after an in-progress toast is seen. */
  progressTimeout?: number
  /** Accept "erfolgreich, mit Warnungen" toasts as success. */
  allowWarnings?: boolean
  /**
   * Click the nth matching button (0-based).
   *
   * Use when multiple buttons with the same label appear on the page at once
   * and you need to target a specific one (e.g. the first in a list).
   */
  index?: number
  /**
   * Action to run after the button click but before toast/response waits resolve.
   *
   * Use when the click opens a confirmation dialog that must be acknowledged
   * before the command actually fires (e.g. clicking "Drucken" opens a
   * "Sendung abschließen?" dialog → confirm via this hook so the toast wait
   * sees the real command's response).
   */
  afterClick?: () => Promise<void>
  /**
   * Additional ICU interpolation variables merged over any defaults set at
   * creation / bind time.  Useful when the variable value is only known at
   * the moment of the click (e.g. a dynamic cart ID).
   */
  vars?: IntlVars
  /**
   * Durable assertion for the state this command should produce.
   *
   * When set, command toasts remain useful signals: failure/error toasts fail
   * fast, success/progress toasts prove the command is moving, and progress
   * toasts extend patience. But the success toast is no longer the only way to
   * pass; if it is missed under load, the durable postcondition can still
   * settle the command.
   */
  postcondition?: () => Promise<void>
}

/**
 * A page-bound command trigger returned by {@link Command.bind}.
 *
 * The `page` is embedded — no need to pass it on every call.
 */
export interface BoundCommand {
  /** The button label used to locate the element. */
  readonly label: string
  /** The toast prefix used to identify success / failure toasts. */
  readonly toastPrefix: string
  /**
   * Return a Playwright locator for this command's trigger.
   *
   * @param parent - Optional parent element to scope the search.
   */
  locator(parent?: Locator): Locator
  /**
   * Click the trigger and (by default) wait for a success toast.
   *
   * @param options - E2e-level options (toast mode, response wait, etc.).
   * @param playwrightOptions - Options forwarded to Playwright's `click()`.
   */
  click(options?: CommandClickOptions, playwrightOptions?: PlaywrightClickOptions): Promise<void>
  /**
   * Return a new BoundCommand whose trigger uses the given locator (or
   * locator factory), keeping all other options. Fluent equivalent of
   * `{ locator }`.
   */
  via(locator: Locator): BoundCommand
  /**
   * Return a new BoundCommand whose `.click()` first clicks the action
   * button, then (optionally) asserts a dialog title is visible, then
   * clicks a confirmation button (default `"Ja"`) before the toast wait
   * resolves.
   *
   * Use when the action button opens a confirmation dialog and the RPC
   * only fires after the user confirms.
   *
   * ```ts
   * // default — clicks Ja
   * await command(rsc).via(activator).thenConfirm().click()
   * // assert dialog title before clicking Ja
   * await command(rsc).via(activator).thenConfirm({ title: "Sind Sie sicher?" }).click()
   * // dynamic title via regex
   * await command(rsc).via(activator).thenConfirm({ title: /Wagen .* blockieren\?/ }).click()
   * // non-Ja confirm button
   * await command(rsc).via(activator).thenConfirm({ label: "Bestätigen" }).click()
   * ```
   *
   * For the case where the caller has already opened the dialog elsewhere
   * and the "Ja" button itself is the RPC trigger, pass `{ label: "Ja" }`
   * to `command()` directly — the default `getByRole("button", { name: "Ja" })`
   * locator covers it.
   *
   * @param opts.title - Optional dialog title to assert before confirming. String or RegExp.
   * @param opts.label - Confirmation button label. Defaults to `"Ja"`.
   */
  thenConfirm(opts?: ThenConfirmOptions): BoundCommand
}

/** Options for {@link BoundCommand.thenConfirm} / {@link Command.thenConfirm}. */
export interface ThenConfirmOptions {
  /** Dialog title asserted visible after the action click, before the confirm click. */
  title?: string | RegExp
  /** Confirmation button label. Defaults to `"Ja"`. */
  label?: string
}

/**
 * A page-less command trigger builder returned by {@link command}.
 *
 * Holds the intl-derived label / toast prefix plus any creation-time option
 * overrides. To execute it, call {@link Command.bind} with a `Page` (or use
 * the `command` test fixture / `PomBase.command` field, which both pre-bind).
 *
 * The builder is intentionally minimal — `via` / `thenConfirm` only return
 * new builders; `.click()` and `.locator()` live on {@link BoundCommand}.
 */
export interface Command {
  /** The button label used to locate the element. */
  readonly label: string
  /** The toast prefix used to identify success / failure toasts. */
  readonly toastPrefix: string
  /**
   * Bind a page to this command, returning a {@link BoundCommand} whose
   * methods require no `page` argument.
   *
   * Optionally pass layer-2 option overrides that sit between the creation-time
   * defaults and the per-click overrides:
   *
   * ```ts
   * class MyPOM extends PomBase {
   *   private readonly assignBtn = command(PickCarts.Assign).bind(this.page)
   *   // with layer-2 vars:
   *   private readonly blockBtn = command(CartManagement.ChangeBlockedState)
   *     .bind(this.page, { vars: { state: "Blocked" } })
   * }
   * ```
   */
  bind(page: Page, options?: CommandOptions): BoundCommand
  /**
   * Return a new Command whose trigger is the given Locator instead of the
   * default `getByRole("button", { name: label })`. Use when the trigger
   * isn't a labeled button — list rows, icon buttons, dialog arrows,
   * `getByText`, `getByTestId`. The toast prefix stays intl-derived.
   *
   * When set, `label`, `exact`, `index`, and `parent` are ignored — the
   * caller scopes the Locator themselves.
   */
  via(locator: Locator): Command
  /**
   * Returns a new Command whose `.click()` chain clicks the action button,
   * (optionally) asserts a dialog title, then clicks a confirmation button
   * (default `"Ja"`). See {@link BoundCommand.thenConfirm}.
   */
  thenConfirm(opts?: ThenConfirmOptions): Command
}

/**
 * Page-bound factory shape produced by the `command` fixture and the
 * {@link PomBase.command} helper. Calling it returns a {@link BoundCommand};
 * no `page` argument is needed at the call site.
 *
 * ```ts
 * test("…", async ({ command }) => {
 *   await command(PickCarts.Assign).click()
 * })
 * ```
 */
export interface BoundCommandFactory {
  <I extends ActionId>(
    resource: { readonly id: I },
    options?: CommandOptions
  ): BoundCommand
}

/**
 * Create a page-bound `command` factory. The returned function captures
 * `page` once so call sites stop threading it through.
 */
export const makeBoundCommand = (page: Page): BoundCommandFactory => (resource, options) =>
  command(resource, options).bind(page)

// ---------------------------------------------------------------------------
// ICU select resolver
// ---------------------------------------------------------------------------

/**
 * Find the index of the closing `}` that matches the opening `{` at `start`.
 * Returns `message.length - 1` if no matching brace is found.
 */
function findClosingBrace(message: string, start: number): number {
  let depth = 0
  for (let i = start; i < message.length; i++) {
    if (message[i] === "{") depth++
    else if (message[i] === "}") {
      depth--
      if (depth === 0) return i
    }
  }
  return message.length - 1
}

/**
 * Parse a `value1 {text1} value2 {text2} other {fallback}` branch list into a
 * map of branch key → raw template string.
 *
 * Returns `null` when the input cannot be parsed as a branch list.
 */
function parseBranches(input: string): Record<string, string> | null {
  const result: Record<string, string> = {}
  let i = 0
  while (i < input.length) {
    // skip whitespace
    while (i < input.length && /\s/.test(input[i]!)) i++
    if (i >= input.length) break
    // read branch key (up to the opening `{`)
    const keyStart = i
    while (i < input.length && input[i] !== "{") i++
    const branchKey = input.slice(keyStart, i).trim()
    if (!branchKey || i >= input.length) return null
    // read the block content (handles nesting)
    const end = findClosingBrace(input, i)
    result[branchKey] = input.slice(i + 1, end)
    i = end + 1
  }
  return Object.keys(result).length > 0 ? result : null
}

/**
 * Resolve an ICU `{key, select, val {text} other {fallback}}` block (the text
 * *inside* the outer braces) using `vars`.
 *
 * Returns the resolved text, or `null` when the block is not a select pattern.
 */
function resolveSelectBlock(inner: string, vars: IntlVars): string | null {
  const commaIdx = inner.indexOf(",")
  if (commaIdx === -1) return null
  const key = inner.slice(0, commaIdx).trim()
  const rest = inner.slice(commaIdx + 1).trimStart()
  if (!rest.startsWith("select,")) return null
  const branches = parseBranches(rest.slice("select,".length).trimStart())
  if (!branches) return null
  const selected = (vars[key] !== undefined ? branches[vars[key]] : undefined) ?? branches["other"]
  if (selected === undefined) return null
  return resolveIcu(selected, vars)
}

/**
 * Resolve ICU select patterns and simple variable substitutions (`{varName}`)
 * in `message` using `vars`.  Also handles `''` → `'` ICU escaping.
 *
 * Unknown blocks (no matching var, not a select, nested ICU) are left as-is.
 */
function resolveIcu(message: string, vars: IntlVars): string {
  if (!message.includes("{")) return message.replace(/''/g, "'")
  const parts: string[] = []
  let i = 0
  while (i < message.length) {
    if (message[i] === "'" && message[i + 1] === "'") {
      parts.push("'")
      i += 2
    } else if (message[i] === "{") {
      const end = findClosingBrace(message, i)
      const inner = message.slice(i + 1, end)
      const fromSelect = resolveSelectBlock(inner, vars)
      if (fromSelect !== null) {
        parts.push(fromSelect)
      } else {
        const trimmed = inner.trim()
        if (!trimmed.includes(",") && vars[trimmed] !== undefined) {
          // simple variable substitution: {varName}
          parts.push(vars[trimmed])
        } else {
          parts.push(message.slice(i, end + 1))
        }
      }
      i = end + 1
    } else {
      parts.push(message[i]!)
      i++
    }
  }
  return parts.join("")
}

// ---------------------------------------------------------------------------
// Intl message parser
// ---------------------------------------------------------------------------

/**
 * Parse an ICU action message into a button label and a toast prefix.
 *
 * Handles the `{_isLabel, select, true {Label} other {Toast}}` pattern (with
 * arbitrary nesting inside each branch) using a brace-aware parser.  When
 * `vars` are provided the branches are resolved with {@link resolveIcu} before
 * being returned.
 *
 * Falls back to using the raw (or ICU-resolved) message string for both label
 * and toast prefix when the pattern is absent.
 */
function parseIntlMessage(message: string, vars?: IntlVars): { label: string; toastPrefix: string } {
  if (message.startsWith("{_isLabel,")) {
    const end = findClosingBrace(message, 0)
    if (end === message.length - 1) {
      const inner = message.slice(1, end) // _isLabel, select, true {...} other {...}
      const branchPart = inner.replace(/^_isLabel,\s*select,\s*/, "")
      const branches = parseBranches(branchPart)
      if (branches && branches["true"] !== undefined && branches["other"] !== undefined) {
        const label = vars ? resolveIcu(branches["true"], vars) : branches["true"]
        const toastPrefix = vars ? resolveIcu(branches["other"], vars) : branches["other"]
        return { label, toastPrefix }
      }
    }
  }
  const resolved = vars ? resolveIcu(message, vars) : message
  return { label: resolved, toastPrefix: resolved }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a reusable command trigger definition tied to a resource command class.
 *
 * The button label and toast prefix are derived automatically from the
 * {@link deActionMessages} lookup keyed by `action.${resource.id}`.
 *
 * Options resolve in three layers (each overrides the previous):
 *   1. `command(resource, options)` — creation-time defaults
 *   2. `.bind(page, options)` — bind-time overrides
 *   3. `.click(pw, options)` — per-click overrides
 *
 * `vars` are merged across all three layers.
 *
 * @param resource - A resource command class (or any object with `id`).
 * @param options - Optional static overrides for `label`, `toastPrefix`, `exact`,
 *   and/or `vars`.  By default `exact` is `true`, which prevents substring
 *   matches such as "Packen" inadvertently matching a "Packen pausieren" button.
 */
export function command<I extends ActionId>(
  resource: { readonly id: I },
  options?: CommandOptions
): Command {
  return buildCommand(resource, options, undefined)
}

function buildCommand<I extends ActionId>(
  resource: { readonly id: I },
  options: CommandOptions | undefined,
  baseLocator: Locator | undefined
): Command {
  const intlKey = `action.${resource.id}` as ActionIntlKey
  const rawMessage: string | undefined = (deActionMessages as Record<string, string>)[intlKey]
  if (rawMessage === undefined) {
    throw new Error(`No intl message found for ${intlKey} — add it to deActionMessages or override label/toastPrefix`)
  }
  const creationVars: IntlVars = options?.vars ?? {}
  const creationParsed = parseIntlMessage(rawMessage, Object.keys(creationVars).length > 0 ? creationVars : undefined)

  const baseLabel = options?.label ?? creationParsed.label
  const baseToastPrefix = options?.toastPrefix ?? creationParsed.toastPrefix
  const baseExact = options?.exact ?? true
  const baseConfirmAfterClick: string | undefined = options?.confirmAfterClick
  const baseConfirmDialogTitle: string | RegExp | undefined = options?.confirmDialogTitle

  const defaultLocator = (scope: Page | Locator, label: string, exact: boolean): Locator =>
    scope.getByRole("button", { name: label, exact })

  const executeClick = async (
    page: Page,
    playwrightOptions: PlaywrightClickOptions | undefined,
    clickOptions: CommandClickOptions | undefined,
    bindLabel: string,
    bindToastPrefix: string,
    bindExact: boolean,
    bindVars: IntlVars,
    bindLocator: Locator | undefined
  ): Promise<void> => {
    // Merge vars: bind vars are already merged with creation vars
    const effectiveVars: IntlVars = clickOptions?.vars
      ? { ...bindVars, ...clickOptions.vars }
      : bindVars
    const hasClickVars = !!clickOptions?.vars
    const resolved = hasClickVars
      ? parseIntlMessage(rawMessage, effectiveVars)
      : { label: bindLabel, toastPrefix: bindToastPrefix }

    const effectiveLabel = clickOptions?.label ?? resolved.label
    const effectiveToastPrefix = clickOptions?.toastPrefix ?? resolved.toastPrefix
    const effectiveExact = clickOptions?.exact ?? bindExact
    const effectiveLocator: Locator | undefined = bindLocator
    const scope = clickOptions?.parent ?? page

    let btn = effectiveLocator ?? defaultLocator(scope, effectiveLabel, effectiveExact)
    if (effectiveLocator === undefined && clickOptions?.index !== undefined) btn = btn.nth(clickOptions.index)

    const userAfterClick = clickOptions?.afterClick
    const afterClick = baseConfirmAfterClick
      ? async () => {
        if (baseConfirmDialogTitle !== undefined) {
          await page.getByText(baseConfirmDialogTitle).waitFor({ state: "visible" })
        }
        await page.getByRole("button", { name: baseConfirmAfterClick, exact: true }).click()
        if (userAfterClick) await userAfterClick()
      }
      : userAfterClick

    const doClick = async () => {
      if (clickOptions?.waitForResponse) {
        const responseOpts: { timeout?: number } = {}
        if (clickOptions.responseTimeout !== undefined) responseOpts.timeout = clickOptions.responseTimeout
        await waitForResponseHelper(
          page,
          async () => {
            await btn.click(playwrightOptions)
            if (afterClick) await afterClick()
          },
          clickOptions.waitForResponse,
          responseOpts
        )
      } else {
        await btn.click(playwrightOptions)
        if (afterClick) await afterClick()
      }
    }

    if (clickOptions?.skipToast) {
      await doClick()
      if (clickOptions.postcondition) await clickOptions.postcondition()
      return
    }

    if (clickOptions?.expectFailure) {
      const failureOpts: { timeout?: number; progressTimeout?: number } = {}
      if (clickOptions.toastTimeout !== undefined) failureOpts.timeout = clickOptions.toastTimeout
      if (clickOptions.progressTimeout !== undefined) failureOpts.progressTimeout = clickOptions.progressTimeout
      await handleToastFailure(page, effectiveToastPrefix, doClick, failureOpts)
    } else {
      const successOpts: { timeout?: number; allowWarnings?: boolean; progressTimeout?: number } = {}
      if (clickOptions?.toastTimeout !== undefined) successOpts.timeout = clickOptions.toastTimeout
      if (clickOptions?.progressTimeout !== undefined) successOpts.progressTimeout = clickOptions.progressTimeout
      if (clickOptions?.allowWarnings !== undefined) successOpts.allowWarnings = clickOptions.allowWarnings
      if (clickOptions?.postcondition) {
        await handleToastOrPostcondition(page, effectiveToastPrefix, doClick, clickOptions.postcondition, successOpts)
      } else {
        await handleToast(page, effectiveToastPrefix, doClick, successOpts)
      }
    }
  }

  const bind = (page: Page, bindOptions?: CommandOptions): BoundCommand => {
    const bindVars: IntlVars = bindOptions?.vars
      ? { ...creationVars, ...bindOptions.vars }
      : creationVars
    const hasBindVars = !!bindOptions?.vars
    const bindParsed = hasBindVars
      ? parseIntlMessage(rawMessage, bindVars)
      : creationParsed
    // cascade bind > create > ICU: creation-time label/toastPrefix overrides
    // (options.*) must survive .bind(), exactly as bindExact falls back to baseExact
    const bindLabel = bindOptions?.label ?? options?.label ?? bindParsed.label
    const bindToastPrefix = bindOptions?.toastPrefix ?? options?.toastPrefix ?? bindParsed.toastPrefix
    const bindExact = bindOptions?.exact ?? baseExact
    const bindLocator: Locator | undefined = baseLocator

    const bound: BoundCommand = {
      label: bindLabel,
      toastPrefix: bindToastPrefix,
      locator: (parent?: Locator) => bindLocator ?? defaultLocator(parent ?? page, bindLabel, bindExact),
      click: (clickOptions?: CommandClickOptions, playwrightOptions?: PlaywrightClickOptions) =>
        executeClick(
          page,
          playwrightOptions,
          clickOptions,
          bindLabel,
          bindToastPrefix,
          bindExact,
          bindVars,
          bindLocator
        ),
      via: (locator: Locator) => buildCommand(resource, { ...options, ...bindOptions }, locator).bind(page),
      thenConfirm: (opts?: ThenConfirmOptions) =>
        buildCommand(resource, withConfirm({ ...options, ...bindOptions }, opts), baseLocator).bind(page)
    }
    return bound
  }

  const self: Command = {
    label: baseLabel,
    toastPrefix: baseToastPrefix,
    bind,
    via: (locator: Locator) => buildCommand(resource, options, locator),
    thenConfirm: (opts?: ThenConfirmOptions) => buildCommand(resource, withConfirm(options, opts), baseLocator)
  }
  return self
}

function withConfirm(base: CommandOptions | undefined, opts: ThenConfirmOptions | undefined): CommandOptions {
  const merged: CommandOptions = { ...base, confirmAfterClick: opts?.label ?? "Ja" }
  if (opts?.title !== undefined) merged.confirmDialogTitle = opts.title
  return merged
}
