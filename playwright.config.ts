import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 90000,
  use: {
    ...devices["iPhone 13"],
    browserName:
      process.env.PLAYWRIGHT_BROWSER === "webkit" ? "webkit" : "chromium",
    locale: "ja-JP",
    actionTimeout: 10000,
    trace: "retain-on-failure",
    baseURL: "http://127.0.0.1:3100",
    viewport: { width: 390, height: 844 },
    timezoneId: "America/Los_Angeles",
    launchOptions:
      process.env.PLAYWRIGHT_BROWSER !== "webkit" &&
      process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
        : {},
  },
  webServer: {
    command: "node tests/e2e/server.mjs",
    url: "http://127.0.0.1:3100/login",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
