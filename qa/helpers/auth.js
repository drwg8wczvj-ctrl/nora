// ─── Auth helper ─────────────────────────────────────────────
const EMAIL    = process.env.QA_EMAIL    || "";
const PASSWORD = process.env.QA_PASSWORD || "";

if (!EMAIL || !PASSWORD) {
  console.warn("[QA] QA_EMAIL or QA_PASSWORD not set — copy qa/.env.example → qa/.env");
}

// The main app has class "app" but NOT "auth-wrap".
// The login page has class "app auth-wrap".
// Use this selector everywhere to mean "logged-in app".
const APP_SELECTOR   = ".app:not(.auth-wrap)";
const LOGIN_SELECTOR = 'input[type="email"]';

/**
 * Navigate to "/" and log in if the login form is visible.
 * Waits for the real app (not the auth page) before returning.
 */
async function login(page) {
  await page.goto("/");

  // Wait for the page to settle — either the login form or the main app
  await page.waitForLoadState("domcontentloaded");

  // Short pause for React to mount
  await page.waitForTimeout(800);

  const emailInput = page.locator(LOGIN_SELECTOR).first();
  const onLoginPage = await emailInput.isVisible().catch(() => false);

  if (!onLoginPage) {
    // Session was restored from storageState — already inside the app
    console.log("[QA] Session restored — already logged in");
    await page.locator(APP_SELECTOR).waitFor({ timeout: 15_000 });
    return;
  }

  // Perform login
  console.log("[QA] Login page detected — signing in as", EMAIL);
  await emailInput.fill(EMAIL);
  await page.locator('input[type="password"]').first().fill(PASSWORD);

  const submitBtn = page.locator(
    'button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")'
  ).first();
  await submitBtn.click();

  // Wait for the authenticated app (auth-wrap disappears)
  await page.locator(APP_SELECTOR).waitFor({ timeout: 25_000 });
  console.log("[QA] Login successful");
}

/**
 * Navigate to a named view by clicking a sidebar/nav button.
 */
async function navigateTo(page, view) {
  const label = view.charAt(0).toUpperCase() + view.slice(1);
  const btn = page
    .locator(`button[data-view="${view}"], nav button:has-text("${label}")`)
    .first();
  if (await btn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(400);
  }
}

module.exports = { login, navigateTo, APP_SELECTOR, EMAIL, PASSWORD };