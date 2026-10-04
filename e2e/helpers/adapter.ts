/**
 * Project-local adapter for synced e2e helpers.
 *
 * Synced helpers (e.g. `command.ts`) import from this file. NOT synced —
 * each project owns its own copy and tailors the re-exports to its API.
 *
 * Replace the stubs below with re-exports from the project's actual intl
 * action message source once the api package exposes one. The shape:
 *
 * ```ts
 * export { type ActionIntlKey, deActionMessages, lookupActionCopy } from "@<project>/api/resources/action-intl"
 * ```
 *
 * `ActionIntlKey` must be a string-literal union shaped `\`action.${string}\``.
 * `deActionMessages` is the German (or default-locale) message dictionary
 * keyed by those `action.*` keys.
 */

export type ActionIntlKey = `action.${string}`

export const deActionMessages: Record<ActionIntlKey, string> = {}

export const actionCopyKey = <K extends string>(intlKey: K): `${K}.action` => `${intlKey}.action`

/**
 * Resolve the button label and (optional) toast prefix for an action message.
 * The optional sibling `action.<id>.action` key is the toast prefix when it
 * differs from the button label.
 */
export function lookupActionCopy(
  messages: Record<string, string>,
  intlKey: string
): { readonly label: string; readonly action: string } {
  const label = messages[intlKey]
  if (label === undefined) {
    throw new Error(`No intl message found for ${intlKey} — add it to deActionMessages or override label/toastPrefix`)
  }
  return { label, action: messages[actionCopyKey(intlKey)] ?? label }
}
