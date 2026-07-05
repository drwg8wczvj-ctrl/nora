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

// Only send to AI if the message looks like it might have calendar content.
// Covers English, German, and Russian — extend as needed.
// Note: \b word-boundary doesn't work with Cyrillic (treated as \W in JS),
// so Russian/Ukrainian words are matched as plain substrings.
const CALENDAR_RE = new RegExp(
  // ── Time patterns (language-agnostic) ──
  '\\d{1,2}:\\d{2}' +
  '|\\d{1,2}\\s*(?:am|pm)' +

  // ── English ──
  '|\\b(?:today|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday' +
  '|dinner|lunch|breakfast|meeting|appointment|flight|hotel|reservation|birthday|deadline' +
  '|dentist|doctor|party|wedding|call|interview|visit|arrive|depart|schedule|event|ticket)\\b' +

  // ── German ──
  '|\\b(?:heute|morgen|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag' +
  '|termin|treffen|abendessen|mittagessen|fr(?:ü|ue)hst(?:ü|ue)ck|arzt|zahnarzt' +
  '|geburtstag|frist|flug|urlaub|reise|veranstaltung|konferenz|besprechung|besuch)\\b' +

  // ── Russian / Ukrainian (Cyrillic — no \b, substring match) ──
  '|сегодня|завтра|послезавтра|встреча|совещание|митинг' +
  '|ужин|обед|завтрак|перекус' +
  '|врач|стоматолог|доктор|больниц' +
  '|понедельник|вторник|среда|среду|четверг|пятниц|суббот|воскресень' +
  '|день рождения|дедлайн|срок сдачи|вечеринка|праздник' +
  '|рейс|самолёт|самолет|аэропорт|отель|бронирован|билет' +
  '|сьогодні|завтра|зустріч|понеділок|вівторок|середа|четвер|п\'ятниця|субота|неділя',
  'i'
);

const MIN_LEN         = 8;
const MAX_DIALOGS     = 20;
const MSGS_PER_DIALOG = 12; // fetch more so context window is wider
const MAX_EXTRACT     = 8;

// Format a list of msgs (sorted chronologically) as a readable conversation thread.
// isOutgoing=true → "Me", isOutgoing=false → contact's name.
function buildConversationContext(msgs, targetMessageId, contactName) {
  return msgs.map(m => {
    const d  = new Date(m.date * 1000);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const speaker = m.isOutgoing ? "Me" : (contactName || "Them");
    const arrow   = m.messageId === targetMessageId ? " ◄" : "";
    return `[${hh}:${mm}] ${speaker}: ${m.text}${arrow}`;
  }).join("\n");
}

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

    // Always look back 72 h — dedup in intelligence-extract prevents double-saving.
    // Using last_sync_at as the cutoff was causing messages to be missed when a
    // prior sync succeeded at connecting but failed to save suggestions (the
    // timestamp advanced past the messages).
    const since = new Date(Date.now() - 72 * 60 * 60 * 1000);

    // Fetch dialogs then messages in parallel across dialogs
    const dialogs = await client.getDialogs({ limit: MAX_DIALOGS + 10 });
    const relevant = dialogs
      .filter(d => !(d.isChannel && !d.isMegagroup)) // skip broadcast channels
      .slice(0, MAX_DIALOGS);

    const msgArrays = await Promise.all(
      relevant.map(dialog =>
        client.getMessages(dialog.entity, { limit: MSGS_PER_DIALOG })
          .then(msgs => msgs.map(msg => ({
            text:       msg.message ?? "",
            from:       dialog.title || dialog.name || "Telegram",
            messageId:  String(msg.id),
            chatId:     String(dialog.id),
            date:       msg.date,
            isOutgoing: msg.out ?? false,
          })))
          .catch(() => [])
      )
    );

    // Save refreshed session string
    const newSession = client.session.save();
    await client.disconnect();

    // Group all messages by chatId and sort chronologically so we can
    // attach conversation context to each candidate message.
    const byChat = {};
    msgArrays.flat().forEach(m => {
      if (!byChat[m.chatId]) byChat[m.chatId] = [];
      byChat[m.chatId].push(m);
    });
    Object.values(byChat).forEach(arr => arr.sort((a, b) => a.date - b.date));

    // Filter: recent + long enough + looks like calendar content
    const candidates = msgArrays.flat().filter(m =>
      m.text.length >= MIN_LEN &&
      new Date(m.date * 1000) > since &&
      CALENDAR_RE.test(m.text)
    );

    if (candidates.length === 0) {
      // Still update session and timestamp even when nothing to process
      await supabase.from("nora_connected_accounts").update({
        telegram_session: newSession,
        last_sync_at:     new Date().toISOString(),
      }).eq("id", account.id);
      return res.status(200).json({ ok: true, scanned: 0, suggestions: 0 });
    }

    // Extract in parallel (cap to MAX_EXTRACT to stay within timeout)
    const appUrl = process.env.APP_URL || `https://${process.env.VERCEL_URL}`;
    const batch  = candidates.slice(0, MAX_EXTRACT);

    const results = await Promise.all(
      batch.map(async msg => {
        // Build conversation context: up to 8 messages around this one
        const chatMsgs = byChat[msg.chatId] ?? [];
        const idx      = chatMsgs.findIndex(m => m.messageId === msg.messageId);
        const start    = Math.max(0, idx - 6);
        const end      = Math.min(chatMsgs.length, idx + 3);
        const ctxMsgs  = chatMsgs.slice(start, end);
        const context  = ctxMsgs.length > 1
          ? buildConversationContext(ctxMsgs, msg.messageId, msg.from)
          : null;

        const r = await fetch(`${appUrl}/api/intelligence-extract`, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            message:         msg.text,
            context,
            userId,
            sourceType:      "telegram",
            sourceId:        `${msg.chatId}_${msg.messageId}`,
            senderName:      msg.from,
            sourceAccountId: account.id,
          }),
        }).catch(e => { console.error("[telegram-sync] fetch error:", e.message); return null; });

        if (!r || !r.ok) {
          if (r) {
            const body = await r.json().catch(() => ({}));
            console.error("[telegram-sync] extract error:", body.error ?? body.detail ?? r.status);
          }
          return { count: 0 };
        }
        return r.json().catch(() => ({ count: 0 }));
      })
    );

    const totalCount = results.reduce((s, r) => s + (r.count ?? 0), 0);

    // Update session + timestamp only after successful extraction
    await supabase.from("nora_connected_accounts").update({
      telegram_session: newSession,
      last_sync_at:     new Date().toISOString(),
    }).eq("id", account.id);

    return res.status(200).json({ ok: true, scanned: batch.length, suggestions: totalCount });
  } catch (err) {
    await client.disconnect().catch(() => {});
    console.error("[telegram-sync]", err.message);
    return res.status(500).json({ error: err.message || "Sync failed" });
  }
};
