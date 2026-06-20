import { supabase } from "./supabase";

// ── Helpers ───────────────────────────────────────────────────
function randomCode(len = 7) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

async function currentUser() {
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

// ── User profile / username ───────────────────────────────────

const PROFILE_FIELDS = "user_id, name, username, avatar_type, avatar_color, avatar_emoji, avatar_url, bio, location, timezone, created_at, username_changed_at";

// ── Profile localStorage cache (same-device persistence) ─────
const PROFILE_CACHE_KEY = "nora_profile_v1";

function cacheProfile(userId, data) {
  try {
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ uid: userId, d: data }));
  } catch {}
}

function loadCachedProfile(userId) {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.uid === userId ? parsed.d : null;
  } catch { return null; }
}

// ── user_preferences JSONB store — cross-device profile backup ───
async function saveProfileToPrefs(userId, updates) {
  try {
    const { data: row } = await supabase
      .from("user_preferences")
      .select("preferences")
      .eq("user_id", userId)
      .maybeSingle();
    const existing = row?.preferences ?? {};
    const merged   = { ...existing, _profile: { ...(existing._profile ?? {}), ...updates } };
    await supabase
      .from("user_preferences")
      .upsert({ user_id: userId, preferences: merged }, { onConflict: "user_id" });
  } catch {}
}

async function loadProfileFromPrefs(userId) {
  try {
    const { data } = await supabase
      .from("user_preferences")
      .select("preferences")
      .eq("user_id", userId)
      .maybeSingle();
    const p = data?.preferences?._profile;
    return p ? { user_id: userId, ...p } : null;
  } catch { return null; }
}

// ── getMyProfile ──────────────────────────────────────────────
// Three cross-device sources (highest → lowest priority):
//   A. user_profile DB columns (requires extended migration)
//   B. auth.user_metadata.nora_profile — syncs via Supabase Auth (no migration needed)
//   C. user_preferences JSONB (belt-and-suspenders, no migration needed)
//   D. localStorage (same-device only, last resort)

export async function getMyProfile() {
  const user = await currentUser(); // supabase.auth.getUser() — always fresh from server
  if (!user) return null;

  const userId = user.id;

  // Source B: auth.user_metadata is already fresh (getUser() validates against server)
  const metaRaw = user.user_metadata?.nora_profile;
  const metaProfile = metaRaw ? { user_id: userId, ...metaRaw } : null;

  // Source C: fire user_preferences load in parallel with DB query
  const prefsPromise = loadProfileFromPrefs(userId);

  // Source A: try full DB query (all profile columns — requires extended migration)
  const { data, error } = await supabase
    .from("user_profile")
    .select(PROFILE_FIELDS)
    .eq("user_id", userId)
    .maybeSingle();

  if (!error && data) {
    const prefs = await prefsPromise;
    // Merge: metaProfile and prefs fill gaps where DB columns are null
    const merged = {
      ...(metaProfile ?? {}),
      ...(prefs ?? {}),
      // DB wins for every non-null field
      ...Object.fromEntries(Object.entries(data).filter(([, v]) => v != null)),
    };
    cacheProfile(userId, merged);
    return merged;
  }

  // Source A fallback: basic columns only (extended migration not run)
  const { data: basic } = await supabase
    .from("user_profile")
    .select("user_id, name, birthday, created_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (basic) {
    const prefs = await prefsPromise;
    const cached = loadCachedProfile(userId);
    // metaProfile and prefs supply avatar/username/bio; basic DB fields override name/dates
    const merged = { ...(cached ?? {}), ...(metaProfile ?? {}), ...(prefs ?? {}), ...basic };
    cacheProfile(userId, merged);
    return merged;
  }

  // No DB row yet — use cross-device sources
  const prefs = await prefsPromise;
  const result = { ...(metaProfile ?? {}), ...(prefs ?? {}) };
  if (result.user_id) {
    cacheProfile(userId, result);
    return result;
  }

  // Last resort: same-device localStorage
  return loadCachedProfile(userId);
}

export async function saveFullProfile(updates) {
  const user = await currentUser();
  if (!user) throw new Error("Not authenticated");

  // Validate username format if being changed
  if (updates.username !== undefined) {
    const clean = updates.username.toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (clean.length < 3) throw new Error("Username must be at least 3 characters");
    if (clean.length > 20) throw new Error("Username max 20 characters");
    updates.username = clean;
  }

  // Check if username already taken (gracefully skip if column doesn't exist)
  if (updates.username) {
    try {
      const { data: existing } = await supabase
        .from("user_profile")
        .select("user_id")
        .eq("username", updates.username)
        .neq("user_id", user.id)
        .maybeSingle();
      if (existing) throw new Error("This username is already taken");
    } catch (e) {
      if (e.message === "This username is already taken") throw e;
      // Column doesn't exist yet — uniqueness can't be checked, continue
    }
  }

  // ① localStorage — same-device, immediate
  const prevCache = loadCachedProfile(user.id);
  cacheProfile(user.id, { ...(prevCache ?? {}), user_id: user.id, ...updates });

  // ② auth.user_metadata — reliable cross-device sync via Supabase Auth (no migration needed)
  // getUser() already returned the current metadata; merge updates into nora_profile
  const existingMeta = user.user_metadata?.nora_profile ?? {};
  const nora_profile = Object.fromEntries(
    Object.entries({ ...existingMeta, ...updates }).filter(([, v]) => v !== undefined)
  );
  supabase.auth.updateUser({ data: { nora_profile } }).catch(() => {});

  // ③ user_preferences JSONB — belt-and-suspenders cross-device backup
  saveProfileToPrefs(user.id, updates).catch(() => {});

  // ④ user_profile extended columns — best case, requires extended migration
  const { error } = await supabase
    .from("user_profile")
    .upsert({ user_id: user.id, ...updates }, { onConflict: "user_id" });

  if (error) {
    if (error.message?.includes("schema cache") || error.message?.includes("column")) {
      // Extended columns don't exist — steps ① and ② already covered persistence
      return;
    }
    // Other DB error — revert localStorage cache and surface the error
    if (prevCache !== null) {
      cacheProfile(user.id, prevCache);
    } else {
      try { localStorage.removeItem(PROFILE_CACHE_KEY); } catch {}
    }
    throw error;
  }
}

export async function setUsername(username) {
  await saveFullProfile({ username, username_changed_at: new Date().toISOString() });
  return username.toLowerCase().replace(/[^a-z0-9_]/g, "");
}

export async function getProfileByUserId(userId) {
  const { data } = await supabase
    .from("user_profile")
    .select(PROFILE_FIELDS)
    .eq("user_id", userId)
    .maybeSingle();
  return data;
}

export async function searchUserByUsername(query) {
  if (!query || query.trim().length < 2) return [];
  const user = await currentUser();
  const { data, error } = await supabase
    .from("user_profile")
    .select("user_id, name, username, avatar_type, avatar_color, avatar_emoji, avatar_url")
    .ilike("username", `%${query.trim()}%`)
    .neq("user_id", user.id)
    .limit(5);
  if (error) return [];
  return data ?? [];
}

// ── Shared objects ────────────────────────────────────────────

export async function createSharedObject(type, localData) {
  const user = await currentUser();
  if (!user) throw new Error("Not authenticated");

  const { data: obj, error: createErr } = await supabase
    .from("shared_objects")
    .insert({ owner_id: user.id, type, data: localData })
    .select("id")
    .single();
  if (createErr) throw createErr;

  // Add owner as collaborator
  await supabase.from("object_collaborators").insert({
    object_id: obj.id,
    user_id:   user.id,
    role:      "owner",
    invited_by: user.id,
  });

  // Log activity
  await supabase.from("object_activity_log").insert({
    object_id: obj.id,
    actor_id:  user.id,
    action:    "created",
    details:   { title: localData.title ?? localData.name ?? "Untitled" },
  });

  return obj.id;
}

export async function updateSharedObject(sharedObjectId, newData, action = "updated", details = {}) {
  const user = await currentUser();
  if (!user) return;

  await supabase
    .from("shared_objects")
    .update({ data: newData })
    .eq("id", sharedObjectId);

  await supabase.from("object_activity_log").insert({
    object_id: sharedObjectId,
    actor_id:  user.id,
    action,
    details,
  });
}

export async function deleteSharedObject(sharedObjectId) {
  await supabase.from("shared_objects").delete().eq("id", sharedObjectId);
}

export async function getSharedObject(sharedObjectId) {
  const { data, error } = await supabase
    .from("shared_objects")
    .select("*")
    .eq("id", sharedObjectId)
    .single();
  if (error) return null;
  return data;
}

// Fetch all shared objects (of a given type) where user is a collaborator
export async function getMySharedObjects(type = null) {
  let query = supabase
    .from("shared_objects")
    .select("*");
  if (type) query = query.eq("type", type);
  const { data, error } = await query;
  if (error) return [];
  return data ?? [];
}

// ── Collaborators ─────────────────────────────────────────────

export async function getCollaborators(sharedObjectId) {
  const { data, error } = await supabase
    .from("object_collaborators")
    .select(`
      id, role, joined_at,
      user_id,
      user_profile:user_profile!object_collaborators_user_id_fkey(name, username, avatar_type, avatar_color, avatar_emoji, avatar_url)
    `)
    .eq("object_id", sharedObjectId)
    .order("joined_at", { ascending: true });
  if (error) return [];
  return (data ?? []).map(c => ({
    ...c,
    name:         c.user_profile?.name ?? c.user_id.slice(0, 8),
    username:     c.user_profile?.username ?? null,
    avatar_type:  c.user_profile?.avatar_type ?? "color",
    avatar_color: c.user_profile?.avatar_color ?? "#8b5cf6",
    avatar_emoji: c.user_profile?.avatar_emoji ?? null,
    avatar_url:   c.user_profile?.avatar_url ?? null,
  }));
}

export async function addCollaboratorByUserId(sharedObjectId, userId, role = "editor") {
  const user = await currentUser();
  const { error } = await supabase
    .from("object_collaborators")
    .insert({ object_id: sharedObjectId, user_id: userId, role, invited_by: user.id });
  if (error && !error.message.includes("duplicate")) throw error;

  await supabase.from("object_activity_log").insert({
    object_id: sharedObjectId,
    actor_id:  user.id,
    action:    "invited",
    details:   { user_id: userId, role },
  });
}

export async function removeCollaborator(sharedObjectId, userId) {
  const user = await currentUser();
  await supabase
    .from("object_collaborators")
    .delete()
    .eq("object_id", sharedObjectId)
    .eq("user_id", userId);

  await supabase.from("object_activity_log").insert({
    object_id: sharedObjectId,
    actor_id:  user.id,
    action:    "removed_collaborator",
    details:   { user_id: userId },
  });
}

export async function updateCollaboratorRole(sharedObjectId, userId, role) {
  await supabase
    .from("object_collaborators")
    .update({ role })
    .eq("object_id", sharedObjectId)
    .eq("user_id", userId);
}

// ── Invite codes ──────────────────────────────────────────────

export async function createInviteCode(sharedObjectId, role = "editor") {
  const user = await currentUser();
  const code = randomCode();
  const { data, error } = await supabase
    .from("object_invites")
    .insert({ object_id: sharedObjectId, created_by: user.id, code, role })
    .select("code")
    .single();
  if (error) throw error;
  return data.code;
}

export async function getInviteCodes(sharedObjectId) {
  const { data } = await supabase
    .from("object_invites")
    .select("*")
    .eq("object_id", sharedObjectId)
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function joinByCode(code) {
  const user = await currentUser();
  if (!user) throw new Error("Not authenticated");

  // Look up the invite
  const { data: invite, error: iErr } = await supabase
    .from("object_invites")
    .select("*")
    .eq("code", code.trim().toUpperCase())
    .maybeSingle();

  if (iErr || !invite) throw new Error("Invalid invite code");
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) throw new Error("Invite code expired");
  if (invite.max_uses && invite.uses >= invite.max_uses) throw new Error("Invite code has reached max uses");

  // Add collaborator (ignore duplicate)
  const { error: collabErr } = await supabase
    .from("object_collaborators")
    .insert({
      object_id:  invite.object_id,
      user_id:    user.id,
      role:       invite.role,
      invited_by: invite.created_by,
    });
  if (collabErr && !collabErr.message.includes("duplicate")) throw collabErr;

  // Increment use count
  await supabase
    .from("object_invites")
    .update({ uses: invite.uses + 1 })
    .eq("id", invite.id);

  await supabase.from("object_activity_log").insert({
    object_id: invite.object_id,
    actor_id:  user.id,
    action:    "joined",
    details:   { via: "invite_code" },
  });

  // Return the shared object so caller can add it to local state
  const { data: obj } = await supabase
    .from("shared_objects")
    .select("*")
    .eq("id", invite.object_id)
    .single();
  return obj ?? null;
}

// ── Comments ──────────────────────────────────────────────────

export async function getComments(sharedObjectId) {
  const { data, error } = await supabase
    .from("object_comments")
    .select(`
      id, content, created_at, author_id,
      author:user_profile!object_comments_author_id_fkey(name, username, avatar_type, avatar_color, avatar_emoji, avatar_url)
    `)
    .eq("object_id", sharedObjectId)
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []).map(c => ({
    ...c,
    authorName:  c.author?.name ?? "Unknown",
    authorType:  c.author?.avatar_type ?? "color",
    authorColor: c.author?.avatar_color ?? "#8b5cf6",
    authorEmoji: c.author?.avatar_emoji ?? null,
    authorUrl:   c.author?.avatar_url ?? null,
  }));
}

export async function addComment(sharedObjectId, content) {
  const user = await currentUser();
  if (!user) throw new Error("Not authenticated");
  const { data, error } = await supabase
    .from("object_comments")
    .insert({ object_id: sharedObjectId, author_id: user.id, content: content.trim() })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteComment(commentId) {
  await supabase.from("object_comments").delete().eq("id", commentId);
}

// ── Activity log ──────────────────────────────────────────────

export async function getActivityLog(sharedObjectId, limit = 50) {
  const { data, error } = await supabase
    .from("object_activity_log")
    .select(`
      id, action, details, created_at,
      actor:user_profile!object_activity_log_actor_id_fkey(name, username, avatar_type, avatar_color, avatar_emoji, avatar_url)
    `)
    .eq("object_id", sharedObjectId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []).map(e => ({
    ...e,
    actorName:  e.actor?.name ?? "Someone",
    actorType:  e.actor?.avatar_type ?? "color",
    actorColor: e.actor?.avatar_color ?? "#8b5cf6",
    actorEmoji: e.actor?.avatar_emoji ?? null,
    actorUrl:   e.actor?.avatar_url ?? null,
  }));
}

// ── Realtime subscriptions ────────────────────────────────────

export function subscribeToSharedObject(sharedObjectId, onUpdate) {
  const channel = supabase
    .channel(`shared_obj:${sharedObjectId}`)
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "shared_objects", filter: `id=eq.${sharedObjectId}` },
      (payload) => onUpdate({ type: "object_updated", data: payload.new })
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "object_comments", filter: `object_id=eq.${sharedObjectId}` },
      (payload) => onUpdate({ type: "comment_added", data: payload.new })
    )
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "object_collaborators", filter: `object_id=eq.${sharedObjectId}` },
      (payload) => onUpdate({ type: "collaborator_added", data: payload.new })
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// Subscribe to all new shared objects where this user is added as collaborator
export function subscribeToCollaboratorInvites(onInvite) {
  const channel = supabase
    .channel("my_collab_invites")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "object_collaborators" },
      async (payload) => {
        const user = await currentUser();
        if (payload.new.user_id !== user?.id) return;
        const obj = await getSharedObject(payload.new.object_id);
        if (obj) onInvite(obj, payload.new.role);
      }
    )
    .subscribe();
  return () => supabase.removeChannel(channel);
}

// ── Nora context helpers ──────────────────────────────────────

export async function getSharedContextSummary() {
  const objs = await getMySharedObjects();
  if (!objs.length) return "";
  const lines = objs.map(o => {
    const d = o.data;
    const title = d.title ?? d.name ?? "Untitled";
    return `- Shared ${o.type}: "${title}" (id: ${o.id.slice(0, 8)})`;
  });
  return `Shared objects:\n${lines.join("\n")}`;
}