// This config file will be imported into each test
import type { PlaywrightTestConfig } from "@playwright/test"
import path from "path"
import { fileURLToPath } from "url"

/**
 * Defined __dirname to be relative to the e2e directory.
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Define a helper function to get the absolute path to a storage state file.
 */
export const resolveStorageState = (fileName: string) => path.resolve(__dirname, fileName)

const basicAuthCredentials = process.env["BASIC_AUTH_CREDENTIALS"]

const config: PlaywrightTestConfig = {
  // globalSetup: "./global-setup",
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  // workers: process.env["CI"] ? 4 : 2,
  use: {
    baseURL: process.env["BASE_URL"] ?? "http://localhost:4000",
    extraHTTPHeaders: basicAuthCredentials
      ? {
        "authorization": `Basic ${Buffer.from(basicAuthCredentials).toString("base64")}`
      }
      : {},
    // Tell all tests to load signed-in state from 'storageState.json'.
    storageState: "storageState.user.json",
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    video: process.env["VIDEO"] ? process.env["VIDEO"] as any : "on-first-retry",
    screenshot: "only-on-failure"
    // video: process.env["CI"] ? "on-first-retry" : "retain-on-failure",
  }
}

export default config
