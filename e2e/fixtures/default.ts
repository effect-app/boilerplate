import { type BoundCommandFactory, makeBoundCommand } from "e2e/helpers/command.js"
import { test as base } from "playwright/test"
import { disableToastAnimation } from "./shared.ts"

export const test = base.extend<{
  command: BoundCommandFactory
}>({
  baseURL: async ({ baseURL }, use) => {
    await use(process.env["BASE_URL"] ?? baseURL)
  },
  page: async ({ page }, use, testInfo) => {
    // Capture FE errors so CI/local failures surface the actual Vue/plugin error
    // instead of just the Playwright timeout. Attached only on failure to keep
    // green runs clean; also logged so CI step logs show them inline.
    // Gated by E2E_CAPTURE_BROWSER_ERRORS — set to "false" to disable (default: on).
    const captureBrowserErrors = process.env["E2E_CAPTURE_BROWSER_ERRORS"] !== "false"
    const pageErrors: string[] = []
    const consoleErrors: string[] = []
    if (captureBrowserErrors) {
      page.on("pageerror", (err) => {
        pageErrors.push(`${err.name}: ${err.message}\n${err.stack ?? ""}`)
      })
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          const loc = msg.location()
          consoleErrors.push(`${msg.text()}\n  at ${loc.url}:${loc.lineNumber}:${loc.columnNumber}`)
        }
      })
    }

    await disableToastAnimation(page)
    await use(page)

    if (captureBrowserErrors && testInfo.status !== testInfo.expectedStatus) {
      if (pageErrors.length > 0) {
        const body = pageErrors.join("\n\n---\n\n")
        await testInfo.attach("page-errors.txt", { body, contentType: "text/plain" })
        console.error(`\n[${testInfo.title}] page errors:\n${body}\n`)
      }
      if (consoleErrors.length > 0) {
        const body = consoleErrors.join("\n\n---\n\n")
        await testInfo.attach("console-errors.txt", { body, contentType: "text/plain" })
        console.error(`\n[${testInfo.title}] console errors:\n${body}\n`)
      }
    }
  },
  command: async ({ page }, use) => {
    await use(makeBoundCommand(page))
  }
})

export * from "playwright/test"
