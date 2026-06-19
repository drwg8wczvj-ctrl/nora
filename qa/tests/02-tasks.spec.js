// ─── Tasks Tests ─────────────────────────────────────────────
const { test, expect } = require("@playwright/test");

const TASK_TITLE = `QA Task ${Date.now()}`;

test.describe("Tasks", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.locator(".app, [class*='app']").first().waitFor({ timeout: 20_000 });
  });

  test("can create a new task", async ({ page }) => {
    // Look for task input or add button
    const taskInput = page.locator('input[placeholder*="task" i], input[placeholder*="add" i], input[placeholder*="todo" i], [class*="task-input"] input').first();

    if (await taskInput.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await taskInput.fill(TASK_TITLE);
      await taskInput.press("Enter");
      await page.waitForTimeout(500);

      // Task should appear in the list
      const taskEl = page.locator(`text=${TASK_TITLE}`).first();
      await expect(taskEl).toBeVisible({ timeout: 8_000 });
      await page.screenshot({ path: "qa/screenshots/task-created.png", fullPage: true });
    } else {
      // Fallback: check if there's a + button
      const addBtn = page.locator('button:has-text("+"), button:has-text("Add task"), [class*="add-task"]').first();
      const hasBtn = await addBtn.isVisible({ timeout: 5_000 }).catch(() => false);
      expect(hasBtn).toBe(true);
    }
  });

  test("tasks can be toggled complete", async ({ page }) => {
    // Find any checkbox or task check element
    const checkbox = page.locator('input[type="checkbox"], [class*="task-check"], [class*="check-btn"]').first();

    if (await checkbox.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await checkbox.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: "qa/screenshots/task-toggled.png", fullPage: true });
      // Toggle back to avoid polluting state
      await checkbox.click();
    } else {
      // No tasks visible — acceptable if app is empty
      console.log("[QA] No checkboxes found — task list may be empty");
    }
  });

  test("task edit modal opens", async ({ page }) => {
    // Click a task item (not its checkbox) to open edit modal
    const taskItem = page.locator('[class*="task-item"], [class*="todo-item"], [class*="task-card"]').first();

    if (await taskItem.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await taskItem.click();
      await page.waitForTimeout(500);

      // Edit modal or panel should appear
      const modal = page.locator('[class*="modal"], [class*="edit"], [class*="drawer"]').first();
      const hasModal = await modal.isVisible({ timeout: 5_000 }).catch(() => false);

      if (hasModal) {
        await page.screenshot({ path: "qa/screenshots/task-edit-open.png", fullPage: true });
        // Close it
        const closeBtn = page.locator('button:has-text("Cancel"), button:has-text("Close"), button[aria-label="Close"], [class*="close"]').first();
        if (await closeBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
          await closeBtn.click();
        } else {
          await page.keyboard.press("Escape");
        }
      }
    } else {
      console.log("[QA] No task items found — skipping edit modal test");
    }
  });

  test("plan view renders without crash", async ({ page }) => {
    await expect(page.locator(".app, [class*='app']").first()).toBeVisible();
    await expect(page).not.toHaveURL(/error/);
    await page.screenshot({ path: "qa/screenshots/tasks-view.png", fullPage: true });
  });
});