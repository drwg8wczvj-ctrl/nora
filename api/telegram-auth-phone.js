// Step 1 of Telegram MTProto auth — sends OTP to the user's phone.
// POST /api/telegram-auth-phone  body: { phone, userId }
//
// Required env vars: TELEGRAM_API_ID, TELEGRAM_API_HASH
// (get from https://my.telegram.org → API Development Tools)

const { TelegramClient } = require("telegram");
const { StringSession }  = require("telegram/sessions");
const { applyCors }      = require("./_cors");
const { getAdminClient, requireUser } = require("./_auth");
const { enforceRateLimit } = require("./_rateLimit");
const { internalError } = require("./_errors");
const { parseBody, schemas } = require("./_validation");

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).end();
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!await enforceRateLimit(req, res, auth.user.id, "integration_auth")) return;

  const parsedBody = parseBody(res, schemas.telegramPhone, req.body ?? {});
  if (!parsedBody.ok) return;
  const { phone } = parsedBody.data;
  const userId = auth.user.id;
  const supabase = getAdminClient();

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
    return internalError(res, err, "telegram-auth-phone");
  }
};
