// Step 2 of Telegram MTProto auth — verifies the OTP and saves the session.
// POST /api/telegram-auth-code  body: { code, userId, password? }
//
// Returns: { ok: true, displayName } or { needs2fa: true } if 2FA is enabled.

const { TelegramClient } = require("telegram");
const { StringSession }  = require("telegram/sessions");
const { Api }            = require("telegram");
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

  const parsedBody = parseBody(res, schemas.telegramCode, req.body ?? {});
  if (!parsedBody.ok) return;
  const { code, password } = parsedBody.data;
  const userId = auth.user.id;
  const supabase = getAdminClient();

  const apiId   = parseInt(process.env.TELEGRAM_API_ID, 10);
  const apiHash = process.env.TELEGRAM_API_HASH;

  const { data: account } = await supabase
    .from("nora_connected_accounts")
    .select("id, telegram_auth_session, telegram_phone, telegram_phone_code_hash")
    .eq("user_id", userId)
    .eq("provider", "telegram")
    .maybeSingle();

  if (!account?.telegram_auth_session || !account?.telegram_phone) {
    return res.status(400).json({ error: "No pending auth session — start again." });
  }

  const client = new TelegramClient(
    new StringSession(account.telegram_auth_session),
    apiId,
    apiHash,
    { connectionRetries: 1, requestRetries: 1 }
  );

  try {
    await client.connect();

    if (password) {
      // 2FA path — user already passed OTP, now submitting their cloud password
      const { computeCheck } = require("telegram/Password");
      const pwdInfo = await client.invoke(new Api.account.GetPassword());
      const check   = await computeCheck(pwdInfo, password);
      await client.invoke(new Api.auth.CheckPassword({ password: check }));
    } else {
      // Normal OTP path
      await client.invoke(new Api.auth.SignIn({
        phoneNumber:   account.telegram_phone,
        phoneCodeHash: account.telegram_phone_code_hash,
        phoneCode:     code.trim(),
      }));
    }

    const me = await client.getMe();
    const sessionStr = client.session.save();
    await client.disconnect();

    await supabase.from("nora_connected_accounts").update({
      is_active:                true,
      display_name:             [me.firstName, me.lastName].filter(Boolean).join(" ") || "Telegram",
      telegram_session:         sessionStr,
      telegram_auth_session:    null,
      telegram_phone_code_hash: null,
      updated_at:               new Date().toISOString(),
    }).eq("id", account.id);

    return res.status(200).json({ ok: true, displayName: me.firstName ?? "Telegram" });
  } catch (err) {
    await client.disconnect().catch(() => {});
    console.error("[telegram-auth-code]", err.message);

    if (err.errorMessage === "SESSION_PASSWORD_NEEDED") {
      return res.status(200).json({ needs2fa: true });
    }
    const isWrongCode = /PHONE_CODE_INVALID|PHONE_CODE_EXPIRED/.test(err.errorMessage ?? "");
    if (isWrongCode) {
      return res.status(400).json({
        error: "Incorrect or expired code. Check your Telegram app and try again.",
      });
    }
    return internalError(res, err, "telegram-auth-code");
  }
};
