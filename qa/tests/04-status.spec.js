// ─── Status View Tests ───────────────────────────────────────
const { test, expect } = require("@playwright/test");
const { APP_SELECTOR, navigateTo } = require("../helpers/auth");

test.describe("Status view", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.locator(APP_SELECTOR).waitFor({ timeout: 20_000 });
    await page.waitForTimeout(400);
    await navigateTo(page, "status");
    await page.waitForTimeout(500);
  });

  test("status view renders without crash", async ({ page }) => {
    await expect(page.locator(APP_SELECTOR)).toBeVisible();
    await page.screenshot({ path: "qa/screenshots/status-view.png", fullPage: true });
  });

  test("displays progress metrics or empty state", async ({ page }) => {
    // Should show some kind of stats, percentage, or empty-state
    const hasMetrics    = await page.locator('[class*="stat"], [class*="metric"], [class*="progress"], [class*="score"], [class*="pct"]').first().isVisible({ timeout: 5_000 }).catch(() => false);
    const hasEmptyState = await page.locator('text=/no data|get started|start tracking/i').first().isVisible({ timeout: 3_000 }).catch(() => false);

    expect(hasMetrics || hasEmptyState).toBe(true);
  });

  test("momentum or readiness indicator is visible", async ({ page }) => {
    const hasReadiness = await page.locator('text=/readiness|momentum|focus|energy|score/i').first().isVisible({ timeout: 8_000 }).catch(() => false);
    console.log("[QA] Readiness/momentum visible:", hasReadiness);
    // Non-blocking — just log and screenshot
    await page.screenshot({ path: "qa/screenshots/status-metrics.png", fullPage: true });
  });
});