// ─── Auth helper ─────────────────────────────────────────────
//  Shared login logic used by auth.setup.js and any test that
//  needs to verify the auth flow itself.
// ─────────────────────────────────────────────────────────────

const EMAIL    = process.env.QA_EMAIL    || "";
const PASSWORD = process.env.QA_PASSWORD || "";

if (!EMAIL || !PASSWORD) {
  console.warn(
    "[QA] QA_EMAIL or QA_PASSWORD not set. Copy qa/.env.example → qa/.env and fill in credentials."
  );
}

/**
 * Log in to Nora and wait for the main app to be visible.
 * Call this from auth.setup.js once per run.
 */
async function login(page) {
  await page.goto("/");

  // Wait for either the auth screen or the already-logged-in app
  const authOrApp = page.locator('input[type="email"], .app, [class*="app"]').first();
  await authOrApp.waitFor({ timeout: 20_000 });

  // If already logged in, skip
  const emailInput = page.locator('input[type="email"]').first();
  if (!(await emailInput.isVisible({ timeout: 2_000 }).catch(() => false))) {
    console.log("[QA] Already logged in — skipping login step");
    return;
  }

  // Fill email
  await emailInput.fill(EMAIL);

  // Fill password
  const passwordInput = page.locator('input[type="password"]').first();
  await passwordInput.fill(PASSWORD);

  // Click the sign-in / login button
  const signInBtn = page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in"), button:has-text("Continue")').first();
  await signInBtn.click();

  // Wait for the main app to render (app div with dark or default class)
  await page.locator('.app, [class*="nora-app"], main').first().waitFor({ timeout: 20_000 });
  console.log("[QA] Login successful");
}

/**
 * Navigate to a specific view by clicking the sidebar/nav item.
 * Works on both desktop (sidebar) and mobile (bottom nav).
 */
async function navigateTo(page, view) {
  // Try sidebar button first (desktop), then bottom nav (mobile)
  const navBtn = page
    .locator(`button[data-view="${view}"], button:has-text("${capitalize(view)}"), nav button:has-text("${capitalize(view)}")`)
    .first();

  if (await navBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await navBtn.click();
  } else {
    // Fallback: click any element whose text matches the view name
    await page.locator(`text=${capitalize(view)}`).first().click();
  }

  await page.waitForTimeout(400); // allow page animation
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

module.exports = { login, navigateTo, EMAIL, PASSWORD };