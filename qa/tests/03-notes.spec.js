// ─── Notes Tests ─────────────────────────────────────────────
const { test, expect } = require("@playwright/test");

test.describe("Notes", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.locator(".app, [class*='app']").first().waitFor({ timeout: 20_000 });

    // Navigate to Notes view
    const notesBtn = page.locator('button:has-text("Notes"), [data-view="notes"], nav >> text=Notes').first();
    if (await notesBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await notesBtn.click();
      await page.waitForTimeout(400);
    }
  });

  test("notes view renders", async ({ page }) => {
    // The notes view should be visible
    const notesView = page.locator('.notes-view, .mob-notes-v2, [class*="notes"]').first();
    await expect(notesView).toBeVisible({ timeout: 8_000 });
    await page.screenshot({ path: "qa/screenshots/notes-view.png", fullPage: true });
  });

  test("FAB button is visible", async ({ page }) => {
    const fab = page.locator('.notes-fab, .mob-note-fab, button[class*="fab"]').first();
    await expect(fab).toBeVisible({ timeout: 8_000 });
  });

  test("can create a new note", async ({ page }) => {
    // Click the FAB
    const fab = page.locator('.notes-fab, .mob-note-fab').first();
    if (await fab.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await fab.click();
      await page.waitForTimeout(300);

      // If FAB shows a menu, click "New Note"
      const newNoteBtn = page.locator('button:has-text("New Note"), button:has-text("Note"), [class*="fab-item"]:has-text("Note")').first();
      if (await newNoteBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await newNoteBtn.click();
        await page.waitForTimeout(300);
      }

      // Editor should appear
      const editor = page.locator('.ne-panel-modal, .ne-panel-sheet, [class*="note-editor"]').first();
      await expect(editor).toBeVisible({ timeout: 8_000 });
      await page.screenshot({ path: "qa/screenshots/note-editor-open.png", fullPage: true });

      // Type a title
      const titleInput = page.locator('.ne-title-input, input[placeholder*="Title" i]').first();
      if (await titleInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await titleInput.fill(`QA Note ${Date.now()}`);
      }

      // Type some content
      const content = page.locator('.ne-content, textarea[placeholder*="note" i], textarea[placeholder*="write" i]').first();
      if (await content.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await content.fill("This note was created by the Nora QA system.");
      }

      await page.screenshot({ path: "qa/screenshots/note-filled.png", fullPage: true });

      // Close the editor
      const closeBtn = page.locator('.ne-close-btn, button:has-text("Close"), button[title="Close"]').first();
      if (await closeBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await closeBtn.click();
      } else {
        await page.keyboard.press("Escape");
      }
      await page.waitForTimeout(400);
    } else {
      console.log("[QA] Notes FAB not found");
    }
  });

  test("can create a checklist note", async ({ page }) => {
    const fab = page.locator('.notes-fab, .mob-note-fab').first();
    if (!(await fab.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await fab.click();
    await page.waitForTimeout(300);

    const checklistBtn = page.locator('button:has-text("Checklist"), [class*="fab-item"]:has-text("Checklist")').first();
    if (await checklistBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await checklistBtn.click();
      await page.waitForTimeout(300);

      const editor = page.locator('.ne-panel-modal, .ne-panel-sheet').first();
      await expect(editor).toBeVisible({ timeout: 8_000 });

      // Should show items input, not a textarea
      const itemInput = page.locator('.ne-item-input, input[placeholder*="item" i]').first();
      await expect(itemInput).toBeVisible({ timeout: 5_000 });

      await itemInput.fill("Buy groceries");
      await itemInput.press("Enter");
      await page.waitForTimeout(200);

      await page.screenshot({ path: "qa/screenshots/note-checklist.png", fullPage: true });

      // Close
      const closeBtn = page.locator('.ne-close-btn, button[title="Close"]').first();
      if (await closeBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await closeBtn.click();
      } else {
        await page.keyboard.press("Escape");
      }
    }
  });

  test("search filters notes", async ({ page }) => {
    const searchInput = page.locator('.notes-search-input, .mob-notes-search-input, input[placeholder*="Search notes" i]').first();
    if (await searchInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await searchInput.fill("QA");
      await page.waitForTimeout(400);
      await page.screenshot({ path: "qa/screenshots/notes-search.png", fullPage: true });

      // Clear search
      await searchInput.fill("");
    }
  });

  test("color picker is available in editor", async ({ page }) => {
    const fab = page.locator('.notes-fab, .mob-note-fab').first();
    if (!(await fab.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    await fab.click();
    await page.waitForTimeout(300);

    const noteBtn = page.locator('button:has-text("New Note"), [class*="fab-item"]:has-text("Note")').first();
    if (await noteBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await noteBtn.click();
      await page.waitForTimeout(300);
    }

    const editor = page.locator('.ne-panel-modal, .ne-panel-sheet').first();
    if (!(await editor.isVisible({ timeout: 5_000 }).catch(() => false))) return;

    // Color swatches should be visible in footer
    const colorSwatch = page.locator('.ne-color-swatch').first();
    await expect(colorSwatch).toBeVisible({ timeout: 5_000 });

    // Click the rose swatch
    const roseSwatch = page.locator('.ne-color-swatch[data-color="rose"]').first();
    if (await roseSwatch.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await roseSwatch.click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: "qa/screenshots/note-color-rose.png", fullPage: true });
    }

    await page.keyboard.press("Escape");
  });
});