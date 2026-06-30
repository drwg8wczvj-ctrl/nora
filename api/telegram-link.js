// Links a Telegram chat_id to a NORA user_id via a one-time code.
// POST /api/telegram-link   body: { userId, linkCode }

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { userId, linkCode } = req.body ?? {};
  if (!userId || !linkCode) return res.status(400).json({ error: "userId and linkCode required" });

  // Find the pending account row by link code
  const { data: row, error } = await supabase
    .from("nora_connected_accounts")
    .select("*")
    .eq("link_code", linkCode.trim())
    .eq("provider", "telegram")
    .eq("is_active", false)
    .maybeSingle();

  if (error || !row) {
    return res.status(404).json({ error: "Invalid or expired link code" });
  }

  // Activate and assign to this user
  const { error: updateErr } = await supabase
    .from("nora_connected_accounts")
    .update({
      user_id:    userId,
      is_active:  true,
      link_code:  null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  if (updateErr) return res.status(500).json({ error: "Failed to link account" });

  return res.status(200).json({
    ok: true,
    chatId: row.telegram_chat_id,
    displayName: row.display_name,
  });
};
