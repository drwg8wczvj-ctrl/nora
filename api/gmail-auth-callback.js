// Gmail OAuth callback — exchanges auth code for tokens and stores them.
// Google redirects here with ?code=xxx&state=<signed short-lived payload>
//
// Required environment variables:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
//   REACT_APP_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//   APP_URL  (e.g. https://yourdomain.com)

const { createClient } = require("@supabase/supabase-js");
const crypto = require("crypto");

function getSupabaseClient() {
  const url = process.env.REACT_APP_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function verifyState(state) {
  const [payload, signature] = String(state || "").split(".");
  const secret = process.env.OAUTH_STATE_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  if (!payload || !signature || !secret) return null;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest();
  let received;
  try { received = Buffer.from(signature, "base64url"); } catch { return null; }
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!parsed.userId || !parsed.issuedAt || Date.now() / 1000 - parsed.issuedAt > 600) return null;
    return parsed.userId;
  } catch {
    return null;
  }
}

module.exports = async function handler(req, res) {
  const { code, state, error } = req.query;
  const userId = verifyState(state);

  const appUrl = process.env.APP_URL || "https://nora.dongar.tech";

  if (error) {
    return res.redirect(302, `${appUrl}?intel_status=gmail_denied`);
  }
  if (!code || !userId) {
    return res.redirect(302, `${appUrl}?intel_status=gmail_error`);
  }

  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return res.redirect(302, `${appUrl}?intel_status=gmail_not_configured`);
    }
    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri:  process.env.GOOGLE_REDIRECT_URI,
        grant_type:    "authorization_code",
      }),
    });
    const tokens = await tokenRes.json();
    if (tokens.error) throw new Error(tokens.error_description || tokens.error);

    // Fetch user's Gmail profile
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json();

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000).toISOString()
      : null;

    // Upsert into nora_connected_accounts
    await supabase.from("nora_connected_accounts").upsert(
      {
        user_id:         userId,
        provider:        "gmail",
        display_name:    profile.name || profile.email,
        account_email:   profile.email,
        access_token:    tokens.access_token,
        refresh_token:   tokens.refresh_token ?? null,
        token_expires_at: expiresAt,
        is_active:       true,
        updated_at:      new Date().toISOString(),
      },
      { onConflict: "user_id,provider,account_email" }
    );

    return res.redirect(302, `${appUrl}?intel_status=gmail_connected`);
  } catch (err) {
    console.error("[gmail-auth-callback]", err);
    return res.redirect(302, `${appUrl}?intel_status=gmail_error`);
  }
};
