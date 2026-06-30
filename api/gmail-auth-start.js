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
  const appUrl = process.env.APP_URL || "https://nora-ten-brown.vercel.app";

  if (!user_id) return res.redirect(302, `${appUrl}?intel_status=gmail_error`);

  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const redirectUri  = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return res.redirect(302, `${appUrl}?intel_status=gmail_not_configured`);
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

  return res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
};
