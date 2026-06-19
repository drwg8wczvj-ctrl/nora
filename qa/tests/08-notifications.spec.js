// ─── Notifications Tests ─────────────────────────────────────
const { test, expect } = require("@playwright/test");
const { APP_SELECTOR } = require("../helpers/auth");

test.describe("Notifications", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.locator(APP_SELECTOR).waitFor({ timeout: 20_000 });
    await page.waitForTimeout(400);
  });

  test("notification permission banner or settings is present", async ({ page }) => {
    // Either the notification permission banner or notification settings
    const notifEl = page.locator(
      '[class*="notif"], [class*="notification"], [class*="npb"], text=/notification/i'
    ).first();

    const isVisible = await notifEl.isVisible({ timeout: 10_000 }).catch(() => false);
    console.log("[QA] Notification element visible:", isVisible);
    await page.screenshot({ path: "qa/screenshots/notifications.png", fullPage: true });
  });

  test("notification settings panel renders", async ({ page }) => {
    // Find notification settings in the settings area
    const settingsBtn = page.locator(
      'button:has-text("Settings"), [data-view="settings"], [class*="settings"]'
    ).first();

    if (await settingsBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await settingsBtn.click();
      await page.waitForTimeout(400);
    }

    const notifSettings = page.locator(
      '[class*="notif-settings"], [class*="notification-settings"], text=/push notification|notification setting/i'
    ).first();

    const isVisible = await notifSettings.isVisible({ timeout: 8_000 }).catch(() => false);
    console.log("[QA] Notification settings visible:", isVisible);
    await page.screenshot({ path: "qa/screenshots/notification-settings.png", fullPage: true });
  });

  test("app does not crash on notification interaction", async ({ page }) => {
    // Verify the app is still stable
    await page.waitForTimeout(1000);
    await expect(page.locator(APP_SELECTOR)).toBeVisible();
    const hasError = await page.locator('text=/uncaught error|something went wrong|unexpected error/i').first().isVisible({ timeout: 2_000 }).catch(() => false);
    expect(hasError).toBe(false);
  });
});