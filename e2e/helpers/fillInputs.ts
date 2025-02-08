import { expect, type Locator, type Page } from "@playwright/test"

export function fillInputs(values: Record<string, string | boolean>) {
  return async (page: Page) => {
    for (const [key, value] of Object.entries(values)) {
      const locator = page.locator(inputSelector(key))
      if (typeof value === "boolean") {
        await locator.setChecked(value)
      } else {
        await locator.fill(value)
      }
    }
  }
}

export function validateInputs(values: Record<string, string | boolean>) {
  return async (page: Page) => {
    for (const [key, value] of Object.entries(values)) {
      const locator = page.locator(inputSelector(key))
      if (typeof value === "boolean") {
        await (value
          ? expect(locator).toBeChecked()
          : expect(locator).not.toBeChecked())
      } else {
        // On initial render, the form may have empty values, so we first wait  for those to disappear
        // TODO: This seems only a workaround. Why doesn't the form have the right values from the start?
        // Or is this to be expected, and should we build in some other signal to wait for?
        if (value !== "") {
          await expect(locator).not.toHaveValue("")
        }
        await expect(locator).toHaveValue(value)
      }
    }
  }
}

function inputSelector(key: string) {
  return `input[name='${key}'], textarea[name='${key}']`
}

export async function submit(button: Locator, waitForStates = false) {
  if (!waitForStates) {
    await button.click()
  } else {
    await Promise.all([expect(button).toBeDisabled(), button.click()])
    await expect(button).toBeEnabled()
  }
}
