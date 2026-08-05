const { createClient } = require("@supabase/supabase-js");
const { requireServerConfig } = require("./_env");

let authClient;
let adminClient;

function getAuthClient() {
  if (!authClient) {
    authClient = createClient(
      requireServerConfig("supabaseUrl"),
      requireServerConfig("supabaseAnonKey"),
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return authClient;
}

function getAdminClient() {
  if (!adminClient) {
    adminClient = createClient(
      requireServerConfig("supabaseUrl"),
      requireServerConfig("supabaseServiceRoleKey"),
      { auth: { persistSession: false, autoRefreshToken: false } }
    );
  }
  return adminClient;
}

function readBearerToken(req) {
  const value = req.headers.authorization || req.headers.Authorization || "";
  const match = /^Bearer\s+(.+)$/i.exec(value);
  return match?.[1] || null;
}

async function requireUser(req, res) {
  const token = readBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }

  try {
    const { data, error } = await getAuthClient().auth.getUser(token);
    if (error || !data?.user) {
      res.status(401).json({ error: "Invalid or expired session" });
      return null;
    }
    return { user: data.user, token };
  } catch {
    res.status(503).json({ error: "Authentication service unavailable" });
    return null;
  }
}

module.exports = {
  getAdminClient,
  readBearerToken,
  requireUser,
};
