// Reads recent messages from the user's Telegram chats and extracts suggestions.
// POST /api/telegram-sync  body: { userId }
//
// Reads the last 24h of messages (or 48h on first sync).
// Skips channels, system messages, and very short texts.

const { TelegramClient } = require("telegram");
const { StringSession }  = require("telegram/sessions");
const { createClient }   = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MIN_LEN = 20;

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { userId } = req.body ?? {};
  if (!userId) return res.status(400).json({ error: "userId required" });

  const { data: account } = await supabase
    .from("nora_connected_accounts")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "telegram")
    .eq("is_active", true)
    .maybeSingle();

  if (!account?.telegram_session) {
    return res.status(400).json({ error: "Telegram not connected" });
  }

  const apiId   = parseInt(process.env.TELEGRAM_API_ID, 10);
  const apiHash = process.env.TELEGRAM_API_HASH;

  const client = new TelegramClient(
    new StringSession(account.telegram_session),
    apiId,
    apiHash,
    { connectionRetries: 1, requestRetries: 1, appVersion: "1.0" }
  );

  try {
    await client.connect();

    const since = account.last_sync_at
      ? new Date(account.last_sync_at)
      : new Date(Date.now() - 48 * 60 * 60 * 1000);

    // Fetch recent dialogs — limit to personal chats and small groups
    const dialogs = await client.getDialogs({ limit: 30 });
    const messages = [];

    for (const dialog of dialogs) {
      // Skip broadcast channels (can have huge volumes; not personal context)
      if (dialog.isChannel && !dialog.isMegagroup) continue;

      const msgs = await client.getMessages(dialog.entity, { limit: 10 });
      for (const msg of msgs) {
        if (!msg.message) continue;
        if (msg.message.length < MIN_LEN) continue;
        if (new Date(msg.date * 1000) <= since) continue;

        messages.push({
          text:      msg.message,
          from:      dialog.title || dialog.name || "Telegram",
          messageId: String(msg.id),
          chatId:    String(dialog.id),
        });
      }
    }

    // Save refreshed session + update last_sync_at
    const newSession = client.session.save();
    await client.disconnect();

    await supabase
      .from("nora_connected_accounts")
      .update({
        telegram_session: newSession,
        last_sync_at:     new Date().toISOString(),
      })
      .eq("id", account.id);

    // Extract suggestions from new messages (cap at 40 to avoid timeout)
    const appUrl   = process.env.APP_URL || `https://${process.env.VERCEL_URL}`;
    const batch    = messages.slice(0, 40);
    let totalCount = 0;

    for (const msg of batch) {
      try {
        const r = await fetch(`${appUrl}/api/intelligence-extract`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            message:         msg.text,
            userId,
            sourceType:      "telegram",
            sourceId:        `${msg.chatId}_${msg.messageId}`,
            senderName:      msg.from,
            sourceAccountId: account.id,
          }),
        });
        if (r.ok) {
          const d = await r.json().catch(() => ({}));
          totalCount += d.count ?? 0;
        }
      } catch {}
    }

    return res.status(200).json({ ok: true, scanned: batch.length, suggestions: totalCount });
  } catch (err) {
    await client.disconnect().catch(() => {});
    console.error("[telegram-sync]", err.message);
    return res.status(500).json({ error: err.message || "Sync failed" });
  }
};
