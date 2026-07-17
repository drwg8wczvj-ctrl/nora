import { supabase } from "./supabase";

// ── Push notification helpers ─────────────────────────────────
const EDGE = process.env.REACT_APP_SUPABASE_URL;

async function edgeCall(action, payload = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session || !EDGE) return null;
  try {
    const res = await fetch(`${EDGE}/functions/v1/nora-push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ action, ...payload }),
    });
    return res.json().catch(() => null);
  } catch {
    return null;
  }
}

export const savePushSubscription  = (subscription) => edgeCall("save_subscription", { subscription });
export const scheduleServerAlarm   = (alarm)        => edgeCall("schedule_alarm",    { alarm });
export const cancelServerAlarm     = (id)           => edgeCall("cancel_alarm",      { id });
export const testServerPush        = ()             => edgeCall("test_server_push");
export const saveApnsToken         = (token)        => edgeCall("save_apns_token",   { token });

// ── Auth ─────────────────────────────────────────────────────

export const signIn  = (email, password) =>
  supabase.auth.signInWithPassword({ email, password });

export const signUp  = (email, password) =>
  supabase.auth.signUp({ email, password });

export const signOut = () => supabase.auth.signOut();

export const getSession = () => supabase.auth.getSession();

// ── Tasks ─────────────────────────────────────────────────────

export async function createTask({ title, description, priority = "medium", scheduled_time = null }) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("tasks")
    .insert({ user_id: user.id, title, description, priority, scheduled_time })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTask(id, updates) {
  const { data, error } = await supabase
    .from("tasks")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function rescheduleTask(id, scheduled_time) {
  return updateTask(id, { scheduled_time, status: "rescheduled" });
}

export async function markTaskCompleted(id) {
  return updateTask(id, { status: "completed" });
}

export async function getUserTasks({ status = null } = {}) {
  let query = supabase
    .from("tasks")
    .select("*")
    .order("scheduled_time", { ascending: true, nullsFirst: false });
  if (status) query = query.eq("status", status);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ── User Profile ──────────────────────────────────────────────

export async function getUserProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("user_profile")
    .select("*")
    .eq("user_id", user.id)
    .single();
  if (error) throw error;
  return data;
}

export async function updateUserProfile(updates) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("user_profile")
    .update(updates)
    .eq("user_id", user.id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Cross-device app data sync ────────────────────────────────

export async function loadUserData() {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("user_app_data")
    .select("*")
    .eq("user_id", user.id)
    .single();
  if (error && error.code !== "PGRST116") throw error; // PGRST116 = no rows yet
  return data ?? null;
}

export async function saveUserData({ tasks, groups, notes, preferences, boards }) {
  const { data: { user } } = await supabase.auth.getUser();
  // boards is stored inside preferences JSON to avoid requiring a schema change
  const prefsWithBoards = boards !== undefined ? { ...preferences, boards } : preferences;
  const { error } = await supabase
    .from("user_app_data")
    .upsert({ user_id: user.id, tasks, groups, notes, preferences: prefsWithBoards });
  if (error) throw error;
}

// ── AI context bundle ─────────────────────────────────────────
// Call before every NORA AI request to inject full user context

export async function getAIContext() {
  const [profile, tasks] = await Promise.all([
    getUserProfile(),
    getUserTasks(),
  ]);
  return {
    profile,
    active_tasks:    tasks.filter(t => t.status === "active"),
    deferred_tasks:  tasks.filter(t => t.status === "deferred" || t.status === "rescheduled"),
    completed_tasks: tasks.filter(t => t.status === "completed").slice(-20),
  };
}

// ── Chat history (24-hour rolling window) ─────────────────────

const CHAT_TTL_MS = 24 * 60 * 60 * 1000;

export async function saveChatMessage(role, message) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from("chat_messages")
    .insert({ user_id: user.id, role, message });
  if (error) console.warn("saveChatMessage:", error.message);
}

export async function loadRecentChatMessages() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const cutoff = new Date(Date.now() - CHAT_TTL_MS).toISOString();
  const { data, error } = await supabase
    .from("chat_messages")
    .select("role, message")
    .eq("user_id", user.id)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: true });
  if (error) { console.warn("loadRecentChatMessages:", error.message); return []; }
  return (data ?? []).map(r => ({ role: r.role, content: r.message }));
}

export async function deleteOldChatMessages() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const cutoff = new Date(Date.now() - CHAT_TTL_MS).toISOString();
  await supabase
    .from("chat_messages")
    .delete()
    .eq("user_id", user.id)
    .lt("created_at", cutoff);
}

// ── Atlas chat history — separate table, same shape/TTL as Planner's
// chat_messages, kept deliberately independent so persona histories never
// interleave (see supabase_migrations.sql for the atlas_chat_messages table).
export async function saveAtlasChatMessage(role, message) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from("atlas_chat_messages")
    .insert({ user_id: user.id, role, message });
  if (error) console.warn("saveAtlasChatMessage:", error.message);
}

export async function loadRecentAtlasChatMessages() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const cutoff = new Date(Date.now() - CHAT_TTL_MS).toISOString();
  const { data, error } = await supabase
    .from("atlas_chat_messages")
    .select("role, message")
    .eq("user_id", user.id)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: true });
  if (error) { console.warn("loadRecentAtlasChatMessages:", error.message); return []; }
  return (data ?? []).map(r => ({ role: r.role, content: r.message }));
}

export async function deleteOldAtlasChatMessages() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const cutoff = new Date(Date.now() - CHAT_TTL_MS).toISOString();
  await supabase
    .from("atlas_chat_messages")
    .delete()
    .eq("user_id", user.id)
    .lt("created_at", cutoff);
}

// ── Morning Check-Up ──────────────────────────────────────────

export async function saveMorningCheckup(checkup) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from("morning_checkups")
    .upsert({ user_id: user.id, ...checkup }, { onConflict: "user_id,date" });
  if (error) console.warn("saveMorningCheckup:", error.message);
}

export async function loadTodayCheckup(date) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("morning_checkups")
    .select("*")
    .eq("user_id", user.id)
    .eq("date", date)
    .maybeSingle();
  if (error) { console.warn("loadTodayCheckup:", error.message); return null; }
  return data;
}

// ── Persistent user preferences ───────────────────────────────

export async function getUserPreferences() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return {};
  const { data, error } = await supabase
    .from("user_preferences")
    .select("preferences")
    .eq("user_id", user.id)
    .single();
  if (error && error.code !== "PGRST116") console.warn("getUserPreferences:", error.message);
  return data?.preferences ?? {};
}

export async function saveUserPreferences(prefs) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { error } = await supabase
    .from("user_preferences")
    .upsert({ user_id: user.id, preferences: prefs, updated_at: new Date().toISOString() });
  if (error) console.warn("saveUserPreferences:", error.message);
}
