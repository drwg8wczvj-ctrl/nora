// ─── Plan View Tests ─────────────────────────────────────────
const { test, expect } = require("@playwright/test");

test.describe("Plan view", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.locator(".app, [class*='app']").first().waitFor({ timeout: 20_000 });
    // Navigate to Plan if not already there
    const planBtn = page.locator('button:has-text("Plan"), [data-view="plan"]').first();
    if (await planBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await planBtn.click();
      await page.waitForTimeout(300);
    }
  });

  test("renders today's date header", async ({ page }) => {
    await page.screenshot({ path: "qa/screenshots/plan-loaded.png", fullPage: true });

    // Should show a date somewhere on the plan view
    const today = new Date();
    const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    // At least one of these date markers should appear
    const hasDay   = await page.locator(`text=${dayNames[today.getDay()]}`).first().isVisible({ timeout: 5_000 }).catch(() => false);
    const hasMonth = await page.locator(`text=${monthNames[today.getMonth()]}`).first().isVisible({ timeout: 3_000 }).catch(() => false);
    const hasDate  = await page.locator(`text=${today.getDate()}`).first().isVisible({ timeout: 3_000 }).catch(() => false);

    expect(hasDay || hasMonth || hasDate).toBe(true);
  });

  test("shows tasks or empty state", async ({ page }) => {
    // Either task items or an empty-state message should be visible
    const hasTasks      = await page.locator('[class*="task"], [class*="todo"]').first().isVisible({ timeout: 5_000 }).catch(() => false);
    const hasEmptyState = await page.locator('text=/no tasks|nothing|empty|all done/i').first().isVisible({ timeout: 3_000 }).catch(() => false);
    const hasAddBtn     = await page.locator('button:has-text("Add"), button:has-text("New task"), button:has-text("+")').first().isVisible({ timeout: 3_000 }).catch(() => false);

    expect(hasTasks || hasEmptyState || hasAddBtn).toBe(true);
    await page.screenshot({ path: "qa/screenshots/plan-content.png", fullPage: true });
  });

  test("NORA AI chat button is accessible", async ({ page }) => {
    const chatBtn = page.locator('[class*="chat"], button:has-text("NORA"), button:has-text("Ask"), [class*="nora"]').first();
    const visible = await chatBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    expect(visible).toBe(true);
  });
});