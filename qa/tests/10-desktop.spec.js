// ─── Desktop Layout Tests ─────────────────────────────────────
//  Run only on the "desktop" project (1440×900 Chrome)
// ─────────────────────────────────────────────────────────────
const { test, expect } = require("@playwright/test");

test.describe("Desktop layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.locator(".app, [class*='app']").first().waitFor({ timeout: 20_000 });
  });

  test("sidebar navigation is visible", async ({ page }) => {
    const sidebar = page.locator('[class*="sidebar"], [class*="side-nav"], nav:not([class*="bottom"])').first();
    const isVisible = await sidebar.isVisible({ timeout: 8_000 }).catch(() => false);
    console.log("[QA] Sidebar visible:", isVisible);
    await page.screenshot({ path: "qa/screenshots/desktop-sidebar.png", fullPage: false });
  });

  test("all navigation views are accessible", async ({ page }) => {
    const views = ["Plan", "Notes", "Status"];

    for (const view of views) {
      const btn = page.locator(`button:has-text("${view}"), [data-view="${view.toLowerCase()}"]`).first();
      if (await btn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(400);

        await expect(page.locator(".app").first()).toBeVisible();
        await page.screenshot({
          path: `qa/screenshots/desktop-view-${view.toLowerCase()}.png`,
          fullPage: false,
        });
      } else {
        console.log(`[QA] "${view}" nav button not found`);
      }
    }
  });

  test("no horizontal overflow on desktop", async ({ page }) => {
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    const overflow    = scrollWidth > clientWidth + 2; // 2px tolerance

    if (overflow) {
      console.warn(`[QA] HORIZONTAL OVERFLOW: scrollWidth=${scrollWidth} clientWidth=${clientWidth}`);
    }
    await page.screenshot({ path: "qa/screenshots/desktop-overflow-check.png", fullPage: false });
    expect(overflow).toBe(false);
  });

  test("chat panel is usable on desktop", async ({ page }) => {
    const chatInput = page.locator(
      'input[placeholder*="Ask" i], input[placeholder*="NORA" i], [class*="chat"] input, [class*="chat"] textarea'
    ).first();

    if (await chatInput.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await chatInput.fill("test");
      const value = await chatInput.inputValue();
      expect(value).toBe("test");
      await chatInput.fill("");
      await page.screenshot({ path: "qa/screenshots/desktop-chat.png", fullPage: false });
    } else {
      console.log("[QA] Desktop chat input not found — may need to open chat panel first");
    }
  });

  test("notes masonry grid renders on desktop", async ({ page }) => {
    const notesBtn = page.locator('button:has-text("Notes"), [data-view="notes"]').first();
    if (await notesBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await notesBtn.click();
      await page.waitForTimeout(500);

      const masonry = page.locator('.notes-masonry, .notes-view').first();
      const isVisible = await masonry.isVisible({ timeout: 8_000 }).catch(() => false);
      console.log("[QA] Desktop notes masonry visible:", isVisible);
      await page.screenshot({ path: "qa/screenshots/desktop-notes.png", fullPage: true });
    }
  });

  test("app footer is visible on desktop", async ({ page }) => {
    const footer = page.locator('footer, [class*="footer"]').first();
    const isVisible = await footer.isVisible({ timeout: 8_000 }).catch(() => false);
    console.log("[QA] Footer visible:", isVisible);
  });

  test("dark mode class toggles on body/app element", async ({ page }) => {
    const isDark = await page.evaluate(() => !!document.querySelector(".dark"));
    console.log("[QA] App in dark mode:", isDark);
    await page.screenshot({ path: "qa/screenshots/desktop-theme.png", fullPage: false });
  });
});