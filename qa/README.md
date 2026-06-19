# Nora QA System

**Developer-only.** Not part of the app. Never deployed to Vercel. Never visible to users.

---

## Setup

```bash
# 1. Copy the env template
cp qa/.env.example qa/.env

# 2. Fill in qa/.env with your test credentials
#    QA_BASE_URL=http://localhost:3000
#    QA_EMAIL=your-test-account@example.com
#    QA_PASSWORD=your-test-password

# 3. Make sure Playwright browsers are installed
npx playwright install chromium
```

> Use a **dedicated test account** in Supabase — not your personal account.
> The test suite reads and writes data.

---

## Running tests

| Command | What it does |
|---|---|
| `npm run qa` | Run all tests (desktop + mobile) |
| `npm run qa:desktop` | Desktop Chrome tests only |
| `npm run qa:mobile` | iPhone 14 Pro simulation only |
| `npm run qa:report` | Open the HTML report in your browser |
| `npm run qa:setup` | Run auth setup only (debug login issues) |

**Requires:** the app must be running locally on the URL set in `QA_BASE_URL`.
Start it with `npm start` in a separate terminal.

---

## What gets tested

| Area | File |
|---|---|
| Auth login | `tests/auth.setup.js` |
| Plan view | `tests/01-plan.spec.js` |
| Tasks | `tests/02-tasks.spec.js` |
| Notes | `tests/03-notes.spec.js` |
| Status | `tests/04-status.spec.js` |
| Settings | `tests/05-settings.spec.js` |
| AI Chat | `tests/06-chat.spec.js` |
| Morning Check-Up | `tests/07-morning-checkup.spec.js` |
| Notifications | `tests/08-notifications.spec.js` |
| Mobile layout | `tests/09-mobile.spec.js` |
| Desktop layout | `tests/10-desktop.spec.js` |

---

## Output

After a run:

| Path | Contents |
|---|---|
| `qa/screenshots/` | One screenshot per test step |
| `qa/playwright-report/` | Full HTML report (open with `npm run qa:report`) |
| `qa/reports/results.json` | Machine-readable results |
| `qa/test-results/` | Videos and traces for failed tests |

All of these are gitignored.

---

## Adding new tests

Create a new `.spec.js` file in `qa/tests/`. It will be auto-discovered.

```js
const { test, expect } = require("@playwright/test");

test.describe("My feature", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.locator(".app").first().waitFor({ timeout: 20_000 });
  });

  test("does something", async ({ page }) => {
    // ...
    await page.screenshot({ path: "qa/screenshots/my-feature.png" });
  });
});
```

---

## Auth state

Auth runs once (`auth.setup.js`) and saves cookies + localStorage to `qa/.auth/user.json`.
All other tests reuse that file. If login breaks, delete `qa/.auth/user.json` and re-run.

---

## Gitignore

The following are excluded from git:
```
qa/screenshots/
qa/reports/
qa/playwright-report/
qa/test-results/
qa/.auth/
qa/.env
```