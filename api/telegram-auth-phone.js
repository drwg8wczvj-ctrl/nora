// Step 1 of Telegram MTProto auth — sends OTP to the user's phone.
// POST /api/telegram-auth-phone  body: { phone, userId }
//
// Required env vars: TELEGRAM_API_ID, TELEGRAM_API_HASH
// (get from https://my.telegram.org → API Development Tools)

const { TelegramClient } = require("telegram");
const { StringSession }  = require("telegram/sessions");
const { createClient }   = require("@supabase/supabase-js");
const { applyCors }      = require("./_cors");

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).end();

  const { phone, userId } = req.body ?? {};
  if (!phone || !userId) return res.status(400).json({ error: "phone and userId required" });

  const apiId   = parseInt(process.env.TELEGRAM_API_ID, 10);
  const apiHash = process.env.TELEGRAM_API_HASH;

  if (!apiId || !apiHash) {
    return res.status(503).json({
      error: "Telegram not configured. Add TELEGRAM_API_ID and TELEGRAM_API_HASH to Vercel environment variables. Get them at https://my.telegram.org",
    });
  }

  const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
    connectionRetries: 1,
    requestRetries:    1,
    appVersion:        "1.0",
    deviceModel:       "NORA",
    systemVersion:     "Server",
    langCode:          "en",
  });

  try {
    await client.connect();
    const result = await client.sendCode({ apiId, apiHash }, phone);
    const sessionStr = client.session.save();
    await client.disconnect();

    // Upsert the pending auth row (no email, so check by user+provider)
    const { data: existing } = await supabase
      .from("nora_connected_accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "telegram")
      .maybeSingle();

    const row = {
      user_id:                   userId,
      provider:                  "telegram",
      is_active:                 false,
      display_name:              "Telegram (connecting…)",
      telegram_phone:            phone,
      telegram_auth_session:     sessionStr,
      telegram_phone_code_hash:  result.phoneCodeHash,
      updated_at:                new Date().toISOString(),
    };

    if (existing) {
      await supabase.from("nora_connected_accounts").update(row).eq("id", existing.id);
    } else {
      await supabase.from("nora_connected_accounts").insert({ ...row, created_at: new Date().toISOString() });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("[telegram-auth-phone]", err.message);
    return res.status(500).json({ error: err.message || "Failed to send code" });
  }
};
