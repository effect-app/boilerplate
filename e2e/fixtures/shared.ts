import type { Page, TestInfo } from "playwright/test"

export const disableToastAnimation = async (page: Page) => {
  await page.addInitScript(() => {
    const inject = () => {
      const style = document.createElement("style")
      style.textContent =
        `.Vue-Toastification__bounce-leave-active { transition-duration: 0s !important; animation-duration: 0s !important; }`
      document.head.appendChild(style)
    }
    if (document.head) inject()
    else document.addEventListener("DOMContentLoaded", inject, { once: true })
  })
}

export const deriveNamespace = (testInfo: TestInfo) => {
  const name = testInfo.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()
  return `test-${name}-r${testInfo.retry}-${new Date().getTime()}`
}
