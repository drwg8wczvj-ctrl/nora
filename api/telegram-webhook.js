// Telegram Bot webhook — receives messages forwarded to NORA's bot.
// POST /api/telegram-webhook
//
// Setup:
//   1. Create a bot via @BotFather, get TELEGRAM_BOT_TOKEN
//   2. Set webhook: https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://yourdomain.com/api/telegram-webhook
//
// User flow:
//   1. User sends /start to the bot → bot replies with a link code
//   2. User pastes the link code into NORA's onboarding
//   3. Future messages from that chat_id are extracted into suggestions

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function sendMessage(chatId, text) {
  if (!BOT_TOKEN) return;
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  }).catch(() => {});
}

function generateLinkCode(chatId) {
  return `NORA-${chatId}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const update = req.body;
  const message = update?.message ?? update?.channel_post;
  if (!message) return res.status(200).json({ ok: true });

  const chatId   = message.chat?.id;
  const text     = message.text ?? message.caption ?? "";
  const from     = message.from?.first_name ?? message.chat?.title ?? "User";

  if (!chatId || !text.trim()) return res.status(200).json({ ok: true });

  // /start command — issue a link code
  if (text.startsWith("/start")) {
    const code = generateLinkCode(chatId);
    await supabase.from("nora_connected_accounts").upsert(
      {
        user_id: "00000000-0000-0000-0000-000000000000", // placeholder until linked
        provider: "telegram",
        telegram_chat_id: String(chatId),
        link_code: code,
        is_active: false,
        display_name: from,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider,account_email" }
    ).catch(() => {});

    await sendMessage(
      chatId,
      `👋 Hello! I'm <b>NORA</b> — your intelligent planner assistant.\n\nTo link this Telegram account:\n1. Open NORA\n2. Go to <b>Intelligence → Connect Telegram</b>\n3. Enter this code:\n\n<code>${code}</code>\n\nOnce linked, I'll automatically extract appointments, deadlines, and reservations from messages you send here.`
    );
    return res.status(200).json({ ok: true });
  }

  // Find linked user account
  const { data: account } = await supabase
    .from("nora_connected_accounts")
    .select("*")
    .eq("provider", "telegram")
    .eq("telegram_chat_id", String(chatId))
    .eq("is_active", true)
    .maybeSingle();

  if (!account) {
    await sendMessage(chatId, "This Telegram account isn't linked to a NORA account yet. Send /start to get a link code.");
    return res.status(200).json({ ok: true });
  }

  // Run AI extraction
  const appUrl = process.env.APP_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000";
  const extractRes = await fetch(`${appUrl}/api/intelligence-extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: text,
      userId: account.user_id,
      sourceType: "telegram",
      sourceId: String(message.message_id),
      senderName: from,
      sourceAccountId: account.id,
    }),
  }).catch(() => null);

  if (extractRes?.ok) {
    const result = await extractRes.json().catch(() => ({}));
    if (result.count > 0) {
      await sendMessage(
        chatId,
        `✨ Got it! I extracted ${result.count} item${result.count !== 1 ? "s" : ""} and added ${result.count !== 1 ? "them" : "it"} to your NORA suggestions. Open NORA to review.`
      );
    }
  }

  return res.status(200).json({ ok: true });
};
