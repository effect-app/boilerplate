import { type Page, type TestInfo } from "e2e/fixtures/default.js"
import { PositiveInt } from "effect-app/Schema/numbers"
import { type Company } from "./companyPorts.ts"
import { makeRuntimes, makeRuntimesNoSetup } from "./runtime.ts"

export const workers = (testInfo: TestInfo) => PositiveInt(testInfo.config.workers)

export const setupPortFixture = async (port: number | undefined, page: Page, company?: Company) => {
  if (port) {
    await page.addInitScript((port) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(window as any)["test_port"] = port
    }, [port])
    return {
      makeRuntimes: (namespace: string, page: Page) => makeRuntimes(namespace, page, port, company),
      makeRuntimesNoSetup: (namespace: string) => makeRuntimesNoSetup(namespace, port, company)
    }
  }
  return {
    makeRuntimes: (namespace: string, page: Page) => makeRuntimes(namespace, page, undefined, company),
    makeRuntimesNoSetup: (namespace: string) => makeRuntimesNoSetup(namespace, undefined, company)
  }
}
