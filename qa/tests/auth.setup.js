// ─── Auth Setup ──────────────────────────────────────────────
//  Runs ONCE before all tests. Logs in, saves auth state to
//  qa/.auth/user.json so each test reuses the session.
// ─────────────────────────────────────────────────────────────
const { test: setup, expect } = require("@playwright/test");
const path = require("path");
const { login } = require("../helpers/auth");

const AUTH_FILE = path.join(__dirname, "../.auth/user.json");

setup("authenticate", async ({ page }) => {
  await login(page);

  // Confirm we're in the app
  await expect(page.locator(".app, [class*='app']").first()).toBeVisible({ timeout: 15_000 });

  // Save session (cookies + localStorage)
  await page.context().storageState({ path: AUTH_FILE });
  console.log("[QA] Auth state saved →", AUTH_FILE);
});