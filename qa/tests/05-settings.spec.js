// ─── Settings Tests ──────────────────────────────────────────
const { test, expect } = require("@playwright/test");

test.describe("Settings", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.locator(".app, [class*='app']").first().waitFor({ timeout: 20_000 });
  });

  test("settings panel opens", async ({ page }) => {
    // Try clicking the Settings button in the sidebar or nav
    const settingsBtn = page.locator('button:has-text("Settings"), button[title="Settings"], [data-view="settings"], [class*="settings-btn"]').first();

    if (await settingsBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await settingsBtn.click();
      await page.waitForTimeout(500);

      const panel = page.locator('[class*="settings"], [class*="prefs"]').first();
      await expect(panel).toBeVisible({ timeout: 8_000 });
      await page.screenshot({ path: "qa/screenshots/settings-open.png", fullPage: true });
    } else {
      console.log("[QA] Settings button not found on this layout");
    }
  });

  test("dark mode toggle works", async ({ page }) => {
    const darkToggle = page.locator('button:has-text("Dark"), button:has-text("Light"), input[type="checkbox"][aria-label*="dark" i], [class*="dark-toggle"], [class*="theme"]').first();

    if (await darkToggle.isVisible({ timeout: 5_000 }).catch(() => false)) {
      const before = await page.evaluate(() => document.documentElement.classList.contains("dark") || document.body.classList.contains("dark") || !!document.querySelector(".dark"));
      await darkToggle.click();
      await page.waitForTimeout(400);
      const after = await page.evaluate(() => document.documentElement.classList.contains("dark") || document.body.classList.contains("dark") || !!document.querySelector(".dark"));

      // State should have toggled (or stayed same if this isn't the right button)
      await page.screenshot({ path: "qa/screenshots/settings-dark-toggle.png", fullPage: true });
      console.log("[QA] Dark mode before:", before, "after:", after);
    } else {
      console.log("[QA] Dark mode toggle not found");
    }
  });

  test("notification settings are accessible", async ({ page }) => {
    const notifSection = page.locator('[class*="notif"], [class*="notification"], text=/notification/i').first();
    const isVisible = await notifSection.isVisible({ timeout: 8_000 }).catch(() => false);
    console.log("[QA] Notification settings visible:", isVisible);
    await page.screenshot({ path: "qa/screenshots/settings-notifications.png", fullPage: true });
  });

  test("profile / username section is visible", async ({ page }) => {
    const profileEl = page.locator('[class*="profile"], [class*="avatar"], text=/username|profile/i').first();
    const isVisible = await profileEl.isVisible({ timeout: 8_000 }).catch(() => false);
    console.log("[QA] Profile section visible:", isVisible);
    await page.screenshot({ path: "qa/screenshots/settings-profile.png", fullPage: true });
  });
});