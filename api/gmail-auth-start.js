// Initiates Gmail OAuth2 flow.
// Usage: GET /api/gmail-auth-start?user_id=<supabase_user_id>
//
// Required environment variables:
//   GOOGLE_CLIENT_ID
//   GOOGLE_REDIRECT_URI  (e.g. https://yourdomain.com/api/gmail-auth-callback)

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
].join(" ");

module.exports = function handler(req, res) {
  const { user_id } = req.query;
  const appUrl = process.env.APP_URL || "https://nora.dongar.tech";

  // Detect direct browser navigation (Accept: text/html) vs fetch from the app (Accept: */*)
  // Browser navigations get server-side redirects so they're never stranded on a raw JSON URL.
  const isBrowser = (req.headers["accept"] || "").includes("text/html");

  if (!user_id) {
    if (isBrowser) return res.redirect(302, `${appUrl}?intel_status=gmail_error`);
    return res.status(400).json({ error: "user_id required" });
  }

  const clientId    = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    if (isBrowser) return res.redirect(302, `${appUrl}?intel_status=gmail_not_configured`);
    return res.status(503).json({ error: "Gmail integration not configured. Add GOOGLE_CLIENT_ID and GOOGLE_REDIRECT_URI to Vercel environment variables." });
  }

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: "code",
    scope:         SCOPES,
    access_type:   "offline",
    prompt:        "consent",
    state:         user_id,
  });

  const redirectUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  if (isBrowser) return res.redirect(302, redirectUrl);
  return res.status(200).json({ redirectUrl });
};
