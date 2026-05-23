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
 * export { type ActionIntlKey, deActionMessages } from "@<project>/api/resources/action-intl"
 * ```
 *
 * `ActionIntlKey` must be a string-literal union shaped `\`action.${string}\``.
 * `deActionMessages` is the German (or default-locale) message dictionary
 * keyed by those `action.*` keys.
 */

export type ActionIntlKey = `action.${string}`

export const deActionMessages: Record<ActionIntlKey, string> = {} as Record<ActionIntlKey, string>
