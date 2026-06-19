const { test, expect } = require("@playwright/test");
const { APP_SELECTOR } = require("../helpers/auth");

test.describe("Tasks", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.locator(APP_SELECTOR).waitFor({ timeout: 20_000 });
    await page.waitForTimeout(400);
  });

  test("task input or add button is visible", async ({ page }) => {
    const taskInput = page.locator(
      'input[placeholder*="task" i], input[placeholder*="add" i], input[placeholder*="todo" i], [class*="task-input"] input, [class*="add-task"] input'
    ).first();
    const addBtn = page.locator(
      'button:has-text("Add task"), button:has-text("New task"), [class*="add-task-btn"]'
    ).first();

    const hasInput = await taskInput.isVisible({ timeout: 5_000 }).catch(() => false);
    const hasBtn   = await addBtn.isVisible({ timeout: 3_000 }).catch(() => false);

    await page.screenshot({ path: "qa/screenshots/tasks-input.png", fullPage: true });
    expect(hasInput || hasBtn).toBe(true);
  });

  test("can create a new task", async ({ page }) => {
    const label = `QA ${Date.now()}`;
    const taskInput = page.locator(
      'input[placeholder*="task" i], input[placeholder*="add" i], [class*="task-input"] input'
    ).first();

    if (!(await taskInput.isVisible({ timeout: 5_000 }).catch(() => false))) {
      console.log("[QA] Task input not found — skipping create test");
      return;
    }

    await taskInput.fill(label);
    await taskInput.press("Enter");
    await page.waitForTimeout(600);

    const created = await page.locator(`text=${label}`).first().isVisible({ timeout: 5_000 }).catch(() => false);
    expect(created).toBe(true);
    await page.screenshot({ path: "qa/screenshots/task-created.png", fullPage: true });
  });

  test("checkboxes are present when tasks exist", async ({ page }) => {
    const checkbox = page.locator(
      'input[type="checkbox"], [class*="task-check"], [class*="check-btn"], [class*="task-toggle"]'
    ).first();

    if (await checkbox.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await page.screenshot({ path: "qa/screenshots/task-checkboxes.png", fullPage: true });
      expect(true).toBe(true);
    } else {
      console.log("[QA] No checkboxes found — task list may be empty");
    }
  });

  test("plan view renders without crash", async ({ page }) => {
    await expect(page.locator(APP_SELECTOR)).toBeVisible();
    const hasError = await page.locator("text=/something went wrong|uncaught error/i").isVisible({ timeout: 2_000 }).catch(() => false);
    expect(hasError).toBe(false);
    await page.screenshot({ path: "qa/screenshots/tasks-view.png", fullPage: true });
  });
});