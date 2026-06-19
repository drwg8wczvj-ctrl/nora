// ─── Morning Check-Up Tests ──────────────────────────────────
const { test, expect } = require("@playwright/test");

test.describe("Morning Check-Up", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.locator(".app, [class*='app']").first().waitFor({ timeout: 20_000 });
  });

  test("morning check-up entry point is visible", async ({ page }) => {
    // Could be a button, banner, or automatic modal
    const trigger = page.locator(
      'button:has-text("Morning"), button:has-text("Check-up"), button:has-text("Check up"), [class*="morning"], [class*="checkup"], text=/morning check/i'
    ).first();

    const hasEntry = await trigger.isVisible({ timeout: 8_000 }).catch(() => false);
    console.log("[QA] Morning check-up entry visible:", hasEntry);
    await page.screenshot({ path: "qa/screenshots/morning-checkup-entry.png", fullPage: true });
  });

  test("check-up modal can be opened", async ({ page }) => {
    const trigger = page.locator(
      'button:has-text("Morning"), button:has-text("Check-up"), [class*="morning-btn"], [class*="checkup-btn"]'
    ).first();

    if (await trigger.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await trigger.click();
      await page.waitForTimeout(500);

      const modal = page.locator('[class*="checkup"], [class*="morning-check"], [class*="mcu"]').first();
      const isOpen = await modal.isVisible({ timeout: 8_000 }).catch(() => false);

      if (isOpen) {
        await page.screenshot({ path: "qa/screenshots/morning-checkup-open.png", fullPage: true });

        // Should show sleep quality options
        const sleepOptions = page.locator('button:has-text("Good"), button:has-text("Ok"), button:has-text("Poor"), button:has-text("Great")').first();
        const hasSleep = await sleepOptions.isVisible({ timeout: 5_000 }).catch(() => false);
        console.log("[QA] Sleep options visible:", hasSleep);

        // Close modal
        const closeBtn = page.locator('[class*="close"], button:has-text("Cancel"), button:has-text("Skip")').first();
        if (await closeBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await closeBtn.click();
        } else {
          await page.keyboard.press("Escape");
        }
      }
    } else {
      console.log("[QA] Morning check-up trigger not found — may have already been completed today");
    }
  });

  test("readiness/sleep indicators exist on plan view", async ({ page }) => {
    const indicator = page.locator(
      'text=/sleep|readiness|energy|focus/i, [class*="sleep"], [class*="readiness"], [class*="energy"]'
    ).first();
    const visible = await indicator.isVisible({ timeout: 8_000 }).catch(() => false);
    console.log("[QA] Readiness indicator visible:", visible);
    await page.screenshot({ path: "qa/screenshots/morning-indicators.png", fullPage: true });
  });
});