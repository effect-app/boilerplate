import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    projects: [
      "api",
      "frontend"
    ]
  }
})