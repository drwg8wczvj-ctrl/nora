// ─────────────────────────────────────────────────────────────
//  Nora QA — Playwright config
//  DEVELOPER-ONLY. Never imported by the app. Never deployed.
// ─────────────────────────────────────────────────────────────
const { defineConfig, devices } = require("@playwright/test");

// Load QA-only env vars from qa/.env (never exposed to the frontend)
require("dotenv").config({ path: require("path").join(__dirname, ".env") });

const BASE_URL = process.env.QA_BASE_URL || "http://localhost:3000";

module.exports = defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  fullyParallel: false,   // Run sequentially — auth state is shared
  retries: process.env.CI ? 2 : 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },

  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "./playwright-report" }],
    ["json", { outputFile: "./reports/results.json" }],
  ],

  use: {
    baseURL: BASE_URL,
    screenshot: "on",           // Always capture screenshots
    video: "retain-on-failure",
    trace: "retain-on-failure",
    locale: "en-US",
    timezoneId: "Europe/Warsaw",
  },

  projects: [
    // Auth setup — runs once before all tests
    {
      name: "setup",
      testMatch: /auth\.setup\.js/,
    },

    // Desktop Chrome tests
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: ".auth/user.json",
      },
      dependencies: ["setup"],
      testIgnore: /mobile\.spec\.js/,
    },

    // Mobile Safari (iPhone 14 Pro)
    {
      name: "mobile",
      use: {
        ...devices["iPhone 14 Pro"],
        storageState: ".auth/user.json",
      },
      dependencies: ["setup"],
      testIgnore: /desktop\.spec\.js/,
    },
  ],
});