const { test: setup } = require("@playwright/test");
const path = require("path");
const { login } = require("../helpers/auth");

const AUTH_FILE = path.join(__dirname, "../.auth/user.json");

setup("authenticate", async ({ page }) => {
  await login(page);
  await page.context().storageState({ path: AUTH_FILE });
  console.log("[QA] Auth state saved →", AUTH_FILE);
});