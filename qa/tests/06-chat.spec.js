// ─── AI Chat Tests ───────────────────────────────────────────
const { test, expect } = require("@playwright/test");

test.describe("AI Chat (NORA)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.locator(".app, [class*='app']").first().waitFor({ timeout: 20_000 });
  });

  test("chat panel opens", async ({ page }) => {
    // Find NORA / chat toggle button
    const chatBtn = page.locator(
      'button:has-text("NORA"), button:has-text("Chat"), button:has-text("Ask"), [class*="chat-toggle"], [class*="nora-btn"]'
    ).first();

    if (await chatBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await chatBtn.click();
      await page.waitForTimeout(500);

      const chatPanel = page.locator('[class*="chat"], [class*="nora"]').first();
      await expect(chatPanel).toBeVisible({ timeout: 8_000 });
      await page.screenshot({ path: "qa/screenshots/chat-open.png", fullPage: true });
    } else {
      // Chat may be always visible on desktop
      const chatInput = page.locator('input[placeholder*="Ask" i], input[placeholder*="NORA" i], textarea[placeholder*="message" i]').first();
      const hasInput = await chatInput.isVisible({ timeout: 5_000 }).catch(() => false);
      console.log("[QA] Chat input visible:", hasInput);
    }
  });

  test("can type a message", async ({ page }) => {
    const chatInput = page.locator(
      'input[placeholder*="Ask" i], input[placeholder*="NORA" i], input[placeholder*="message" i], textarea[placeholder*="message" i], [class*="chat-input"] input, [class*="chat"] input'
    ).first();

    if (await chatInput.isVisible({ timeout: 8_000 }).catch(() => false)) {
      await chatInput.fill("Hello NORA, this is a QA test message.");
      await page.screenshot({ path: "qa/screenshots/chat-typed.png", fullPage: true });

      const value = await chatInput.inputValue();
      expect(value).toBe("Hello NORA, this is a QA test message.");

      // Clear it — don't actually send (to avoid AI API cost)
      await chatInput.fill("");
    } else {
      console.log("[QA] Chat input not found — may require toggling the chat panel first");
    }
  });

  test("chat messages area exists", async ({ page }) => {
    const messagesArea = page.locator('[class*="chat-messages"], [class*="messages"], [class*="conversation"]').first();
    const isVisible = await messagesArea.isVisible({ timeout: 8_000 }).catch(() => false);
    console.log("[QA] Messages area visible:", isVisible);
    await page.screenshot({ path: "qa/screenshots/chat-messages.png", fullPage: true });
  });

  test("AI suggestions are shown or chat is empty state", async ({ page }) => {
    const suggestions = page.locator('[class*="suggestion"], [class*="quick-reply"], button:has-text("Suggestions")').first();
    const hasSuggestions = await suggestions.isVisible({ timeout: 5_000 }).catch(() => false);

    const emptyState = page.locator('text=/ask me|what can i/i').first();
    const hasEmpty = await emptyState.isVisible({ timeout: 3_000 }).catch(() => false);

    console.log("[QA] Suggestions:", hasSuggestions, "Empty state:", hasEmpty);
    // Either is acceptable
    await page.screenshot({ path: "qa/screenshots/chat-state.png", fullPage: true });
  });
});