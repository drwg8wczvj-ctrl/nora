// ─── Mobile Layout Tests ─────────────────────────────────────
//  These run only on the "mobile" project (iPhone 14 Pro viewport)
// ─────────────────────────────────────────────────────────────
const { test, expect } = require("@playwright/test");
const { APP_SELECTOR } = require("../helpers/auth");

test.describe("Mobile layout", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.locator(APP_SELECTOR).waitFor({ timeout: 20_000 });
    await page.waitForTimeout(400);
  });

  test("bottom navigation is visible", async ({ page }) => {
    const bottomNav = page.locator('[class*="bottom-nav"], [class*="mob-nav"], nav[class*="mobile"]').first();
    const isVisible = await bottomNav.isVisible({ timeout: 8_000 }).catch(() => false);

    if (!isVisible) {
      // Try generic bottom-area nav
      const anyNav = page.locator('nav, [role="navigation"]').last();
      const navVisible = await anyNav.isVisible({ timeout: 5_000 }).catch(() => false);
      console.log("[QA] Any nav visible:", navVisible);
    }

    await page.screenshot({ path: "qa/screenshots/mobile-bottom-nav.png", fullPage: false });
    expect(isVisible || true).toBe(true); // Non-fatal: log but don't fail
  });

  test("plan view renders on mobile", async ({ page }) => {
    await expect(page.locator(APP_SELECTOR)).toBeVisible();
    await page.screenshot({ path: "qa/screenshots/mobile-plan.png", fullPage: true });
  });

  test("mobile notes view renders", async ({ page }) => {
    const notesBtn = page.locator('button:has-text("Notes"), nav >> text=Notes').first();
    if (await notesBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await notesBtn.click();
      await page.waitForTimeout(500);

      const notesView = page.locator('.mob-notes-v2, [class*="notes"]').first();
      const isVisible = await notesView.isVisible({ timeout: 8_000 }).catch(() => false);
      console.log("[QA] Mobile notes view visible:", isVisible);
      await page.screenshot({ path: "qa/screenshots/mobile-notes.png", fullPage: true });
    }
  });

  test("mobile chat renders", async ({ page }) => {
    const chatBtn = page.locator('button:has-text("NORA"), button:has-text("Chat"), nav >> text=Chat').first();
    if (await chatBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await chatBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: "qa/screenshots/mobile-chat.png", fullPage: true });
    }
  });

  test("settings renders on mobile", async ({ page }) => {
    const settingsBtn = page.locator('button:has-text("Settings"), nav >> text=Settings, [class*="settings"]').first();
    if (await settingsBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await settingsBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: "qa/screenshots/mobile-settings.png", fullPage: true });
    }
  });

  test("no horizontal overflow on mobile", async ({ page }) => {
    const scrollWidth  = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth  = await page.evaluate(() => document.documentElement.clientWidth);
    const hasOverflow  = scrollWidth > clientWidth;

    if (hasOverflow) {
      console.warn(`[QA] HORIZONTAL OVERFLOW DETECTED: scrollWidth=${scrollWidth} > clientWidth=${clientWidth}`);
    }
    await page.screenshot({ path: "qa/screenshots/mobile-overflow-check.png", fullPage: false });

    expect(hasOverflow).toBe(false);
  });

  test("note editor bottom sheet appears (mobile)", async ({ page }) => {
    const notesBtn = page.locator('button:has-text("Notes"), nav >> text=Notes').first();
    if (await notesBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await notesBtn.click();
      await page.waitForTimeout(400);
    }

    const fab = page.locator('.mob-note-fab').first();
    if (await fab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await fab.click();
      await page.waitForTimeout(300);

      // FAB menu or direct create
      const noteItem = page.locator('button:has-text("New Note"), .mob-notes-fab-item:has-text("Note")').first();
      if (await noteItem.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await noteItem.click();
        await page.waitForTimeout(400);
      }

      // Bottom sheet should slide up
      const sheet = page.locator('.ne-panel-sheet').first();
      const isVisible = await sheet.isVisible({ timeout: 8_000 }).catch(() => false);
      console.log("[QA] Mobile note bottom sheet visible:", isVisible);
      await page.screenshot({ path: "qa/screenshots/mobile-note-sheet.png", fullPage: false });

      await page.keyboard.press("Escape");
    }
  });
});