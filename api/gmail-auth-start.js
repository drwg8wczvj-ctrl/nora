// Initiates Gmail OAuth2 flow.
// Usage: GET /api/gmail-auth-start?user_id=<supabase_user_id>
//
// Required environment variables:
//   GOOGLE_CLIENT_ID
//   GOOGLE_REDIRECT_URI  (e.g. https://yourdomain.com/api/gmail-auth-callback)
const crypto = require("crypto");
const { requireUser } = require("./_auth");
const { enforceRateLimit } = require("./_rateLimit");
const { applyCors } = require("./_cors");

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ");

// res.redirect() causes FUNCTION_INVOCATION_FAILED in Vercel synchronous handlers.
// Use a plain HTML page with JS + meta-refresh instead — no 302, no crash.
function htmlRedirect(url) {
  const safe = url.replace(/"/g, "&quot;");
  return `<!DOCTYPE html><html><head><meta charset="utf-8">` +
    `<meta http-equiv="refresh" content="0;url=${safe}">` +
    `<script>window.location.replace(${JSON.stringify(url)})</script>` +
    `</head><body></body></html>`;
}

function signState(userId) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    userId,
    issuedAt,
    nonce: crypto.randomBytes(16).toString("hex"),
  })).toString("base64url");
  const secret = process.env.OAUTH_STATE_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  if (!secret) throw new Error("OAUTH_STATE_SECRET or GOOGLE_CLIENT_SECRET is required");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

module.exports = async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const appUrl = process.env.APP_URL || "https://nora.dongar.tech";

  // Detect direct browser navigation (Accept: text/html) vs fetch from the app.
  // Browser navigations get an HTML redirect page so the user is never stranded
  // on a raw JSON API URL.
  const isBrowser = (req.headers["accept"] || "").includes("text/html");

  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!await enforceRateLimit(req, res, auth.user.id, "integration_auth")) return;

  const clientId    = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    if (isBrowser) {
      return res.status(200)
        .setHeader("Content-Type", "text/html")
        .end(htmlRedirect(`${appUrl}?intel_status=gmail_not_configured`));
    }
    return res.status(503).json({ error: "Gmail integration not configured. Add GOOGLE_CLIENT_ID and GOOGLE_REDIRECT_URI to Vercel environment variables." });
  }

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: "code",
    scope:         SCOPES,
    access_type:   "offline",
    prompt:        "consent",
    state:         signState(auth.user.id),
  });

  const redirectUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  if (isBrowser) {
    return res.status(200)
      .setHeader("Content-Type", "text/html")
      .end(htmlRedirect(redirectUrl));
  }
  return res.status(200).json({ redirectUrl });
};
