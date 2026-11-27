import { defineConfig } from "@playwright/test";

export default defineConfig({
  timeout: 90_000, // long end-to-end journeys (sign-up → build → publish → storefront)
  expect: { timeout: 15_000 },
  testDir: "tests/e2e",
  use: {
    baseURL: "http://localhost:3000",
    launchOptions: {
      executablePath: process.env.PW_CHROMIUM_PATH || undefined,
    },
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
  },
});
