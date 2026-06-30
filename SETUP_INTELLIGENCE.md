# NORA Intelligence Layer — Setup Guide

## What's implemented

| Layer | Status |
|---|---|
| Frontend (Suggestion Center, Proactive Overlay, Onboarding) | ✅ Done |
| AI extraction pipeline (`/api/intelligence-extract`) | ✅ Done |
| Manual text paste → suggestions | ✅ Works immediately |
| Gmail OAuth connect flow | ✅ Code ready — needs credentials |
| Gmail email sync | ✅ Code ready — needs credentials |
| Telegram bot webhook | ✅ Code ready — needs bot token |
| Supabase tables | ✅ Migration ready |

---

## Step 1 — Run the database migration

In Supabase Dashboard → SQL Editor, paste and run:

```
supabase/migrations/20260630_intelligence.sql
```

Or via CLI:
```bash
npx supabase db push
```

---

## Step 2 — Add environment variables on Vercel

In Vercel → Project → Settings → Environment Variables, add:

```
SUPABASE_SERVICE_ROLE_KEY   # from Supabase → Settings → API → service_role key
APP_URL                      # e.g. https://nora.dongar.tech
```

These are already in the project and work without Gmail/Telegram:
- `OPENAI_API_KEY` — already set (used for extraction)

---

## Step 3 — Gmail integration (optional)

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a project → Enable **Gmail API**
3. Create OAuth 2.0 credentials (Web application type)
4. Add authorized redirect URI: `https://nora.dongar.tech/api/gmail-auth-callback`
5. Add to Vercel env vars:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=https://nora.dongar.tech/api/gmail-auth-callback
   ```

---

## Step 4 — Telegram bot (optional)

1. Message [@BotFather](https://t.me/BotFather) on Telegram → `/newbot`
2. Choose a name and username (e.g. `NoraAssistantBot`)
3. Copy the bot token
4. Set webhook (run in terminal):
   ```bash
   curl "https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook?url=https://nora.dongar.tech/api/telegram-webhook"
   ```
5. Update `IntelligenceOnboarding.js` line 8 with your bot's username:
   ```js
   const TELEGRAM_BOT = "https://t.me/YourBotUsername";
   ```
6. Add to Vercel:
   ```
   TELEGRAM_BOT_TOKEN=...
   ```

---

## What works right now (without any setup)

The **manual text paste** feature works immediately after deploying:

1. Open NORA → click the ✦ (sparkles) button in the header
2. Paste any email, message, or text
3. NORA extracts appointments, reservations, deadlines
4. Review and accept with one tap

This alone is already a useful intelligence feature. Gmail and Telegram are additive.
