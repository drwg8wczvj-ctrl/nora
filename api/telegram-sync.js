// Reads recent Telegram messages and extracts suggestions.
// Optimised for Vercel Hobby (10s timeout):
//   - parallel getMessages across dialogs
//   - keyword pre-filter before AI extraction
//   - parallel extraction with a small cap
//
// POST /api/telegram-sync  body: { userId }

const { TelegramClient } = require("telegram");
const { StringSession }  = require("telegram/sessions");
const { createClient }   = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Only send to AI if the message looks like it might have calendar content
const CALENDAR_RE = /\b(\d{1,2}:\d{2}|today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d+\s*(am|pm)|dinner|lunch|breakfast|meeting|appointment|flight|hotel|reservation|birthday|deadline|dentist|doctor|party|wedding|call|interview|visit|arrive|depart|schedule|event|ticket)\b/i;

const MIN_LEN         = 12;
const MAX_DIALOGS     = 12;
const MSGS_PER_DIALOG = 5;
const MAX_EXTRACT     = 6;

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
      : new Date(Date.now() - 72 * 60 * 60 * 1000); // 72h on first sync

    // Fetch dialogs then messages in parallel across dialogs
    const dialogs = await client.getDialogs({ limit: MAX_DIALOGS + 10 });
    const relevant = dialogs
      .filter(d => !(d.isChannel && !d.isMegagroup)) // skip broadcast channels
      .slice(0, MAX_DIALOGS);

    const msgArrays = await Promise.all(
      relevant.map(dialog =>
        client.getMessages(dialog.entity, { limit: MSGS_PER_DIALOG })
          .then(msgs => msgs.map(msg => ({
            text:      msg.message ?? "",
            from:      dialog.title || dialog.name || "Telegram",
            messageId: String(msg.id),
            chatId:    String(dialog.id),
            date:      msg.date,
          })))
          .catch(() => [])
      )
    );

    // Persist refreshed session immediately after disconnect
    const newSession = client.session.save();
    await client.disconnect();

    await supabase.from("nora_connected_accounts").update({
      telegram_session: newSession,
      last_sync_at:     new Date().toISOString(),
    }).eq("id", account.id);

    // Filter: recent + long enough + looks like calendar content
    const candidates = msgArrays.flat().filter(m =>
      m.text.length >= MIN_LEN &&
      new Date(m.date * 1000) > since &&
      CALENDAR_RE.test(m.text)
    );

    if (candidates.length === 0) {
      return res.status(200).json({ ok: true, scanned: 0, suggestions: 0 });
    }

    // Extract in parallel (cap to MAX_EXTRACT to stay within timeout)
    const appUrl = process.env.APP_URL || `https://${process.env.VERCEL_URL}`;
    const batch  = candidates.slice(0, MAX_EXTRACT);

    const results = await Promise.all(
      batch.map(msg =>
        fetch(`${appUrl}/api/intelligence-extract`, {
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
        })
        .then(r => r.ok ? r.json() : { count: 0 })
        .catch(() => ({ count: 0 }))
      )
    );

    const totalCount = results.reduce((s, r) => s + (r.count ?? 0), 0);

    return res.status(200).json({ ok: true, scanned: batch.length, suggestions: totalCount });
  } catch (err) {
    await client.disconnect().catch(() => {});
    console.error("[telegram-sync]", err.message);
    return res.status(500).json({ error: err.message || "Sync failed" });
  }
};
