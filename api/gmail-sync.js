// Fetches recent Gmail messages and runs AI extraction on each.
// POST /api/gmail-sync   body: { userId }
//
// Required env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SUPABASE_SERVICE_ROLE_KEY

const { getAdminClient, requireUser } = require("./_auth");
const { enforceRateLimit } = require("./_rateLimit");

async function refreshTokenIfNeeded(supabase, account) {
  if (!account.token_expires_at) return account.access_token;
  const expiresAt = new Date(account.token_expires_at).getTime();
  if (Date.now() < expiresAt - 60_000) return account.access_token; // still valid

  if (!account.refresh_token) return account.access_token;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: account.refresh_token,
      grant_type:    "refresh_token",
    }),
  });
  const tokens = await res.json();
  if (tokens.access_token) {
    const newExpiry = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();
    await supabase
      .from("nora_connected_accounts")
      .update({ access_token: tokens.access_token, token_expires_at: newExpiry })
      .eq("id", account.id);
    return tokens.access_token;
  }
  return account.access_token;
}

function decodeBase64(str) {
  try {
    return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch { return ""; }
}

function extractBody(payload) {
  if (payload?.body?.data) return decodeBase64(payload.body.data);
  if (payload?.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) return decodeBase64(part.body.data);
    }
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }
  return "";
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!await enforceRateLimit(req, res, auth.user.id, "integration_sync")) return;

  const userId = auth.user.id;
  const supabase = getAdminClient();

  // Load Gmail account
  const { data: accounts, error: accErr } = await supabase
    .from("nora_connected_accounts")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", "gmail")
    .eq("is_active", true);

  if (accErr || !accounts?.length) {
    return res.status(200).json({ synced: 0, message: "No Gmail account connected" });
  }

  let totalExtracted = 0;

  for (const account of accounts) {
    try {
      const token = await refreshTokenIfNeeded(supabase, account);

      // Fetch up to 20 recent messages from the last 3 days
      const sinceDate = Math.floor((Date.now() - 3 * 24 * 60 * 60 * 1000) / 1000);
      const listRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=after:${sinceDate}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const list = await listRes.json();
      const messages = list.messages ?? [];

      for (const msg of messages.slice(0, 15)) {
        // Skip already processed
        const { data: existing } = await supabase
          .from("nora_suggestions")
          .select("id")
          .eq("user_id", userId)
          .eq("source_type", "gmail")
          .eq("source_id", msg.id)
          .maybeSingle();
        if (existing) continue;

        // Fetch full message
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const full = await msgRes.json();

        const subject = full.payload?.headers?.find((h) => h.name === "Subject")?.value ?? "";
        const from    = full.payload?.headers?.find((h) => h.name === "From")?.value ?? "";
        const body    = extractBody(full.payload).slice(0, 4000);

        if (!body && !subject) continue;

        const messageText = `From: ${from}\nSubject: ${subject}\n\n${body}`;

        // Call extraction endpoint
        const appUrl = process.env.APP_URL || `https://${process.env.VERCEL_URL}`;
        const extractRes = await fetch(`${appUrl}/api/intelligence-extract`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${auth.token}`,
          },
          body: JSON.stringify({
            message: messageText,
            userId,
            sourceType: "gmail",
            sourceId: msg.id,
            senderName: from.split("<")[0].trim(),
            sourceAccountId: account.id,
          }),
        }).catch(() => null);

        if (extractRes?.ok) {
          const result = await extractRes.json().catch(() => ({}));
          totalExtracted += result.count ?? 0;
        }
      }

      // Update last sync time
      await supabase
        .from("nora_connected_accounts")
        .update({ last_sync_at: new Date().toISOString() })
        .eq("id", account.id);

    } catch (err) {
      console.error("[gmail-sync] account error:", err.message);
    }
  }

  return res.status(200).json({ synced: totalExtracted });
};
