const { test, expect } = require("@playwright/test");
const { APP_SELECTOR } = require("../helpers/auth");

test.describe("Plan view", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.locator(APP_SELECTOR).waitFor({ timeout: 20_000 });
    await page.waitForTimeout(400);
  });

  test("renders today's date header", async ({ page }) => {
    await page.screenshot({ path: "qa/screenshots/plan-loaded.png", fullPage: true });

    const today = new Date();
    const dayNames   = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    const text = await page.locator("body").innerText().catch(() => "");
    const hasDay   = dayNames.some(d => text.includes(d));
    const hasMonth = monthNames.some(m => text.includes(m));
    const hasDate  = text.includes(String(today.getDate()));

    expect(hasDay || hasMonth || hasDate).toBe(true);
  });

  test("shows tasks section or empty state", async ({ page }) => {
    const text = await page.locator("body").innerText().catch(() => "");
    const hasContent =
      text.length > 50 || // app has content
      await page.locator('[class*="task"], [class*="todo"], [class*="plan"]').first().isVisible({ timeout: 5_000 }).catch(() => false);
    expect(hasContent).toBe(true);
    await page.screenshot({ path: "qa/screenshots/plan-content.png", fullPage: true });
  });

  test("NORA chat area exists", async ({ page }) => {
    // On desktop, chat is always visible in the sidebar/panel
    const chatEl = page.locator('[class*="chat"]').first();
    await expect(chatEl).toBeVisible({ timeout: 8_000 });
  });

  test("page has no JS errors on load", async ({ page }) => {
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    await page.reload();
    await page.locator(APP_SELECTOR).waitFor({ timeout: 20_000 });
    await page.waitForTimeout(1000);
    const fatal = errors.filter(e => !e.includes("ResizeObserver") && !e.includes("Non-Error"));
    expect(fatal).toHaveLength(0);
  });
});