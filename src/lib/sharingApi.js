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

export async function getMyProfile() {
  const user = await currentUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("user_profile")
    .select(PROFILE_FIELDS)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    // Columns don't exist yet — migration hasn't been run. Fall back to basics.
    const { data: basic } = await supabase
      .from("user_profile")
      .select("user_id, name, birthday, created_at")
      .eq("user_id", user.id)
      .maybeSingle();
    return basic ?? null;
  }
  return data;
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

  // Check if username already taken
  if (updates.username) {
    const { data: existing } = await supabase
      .from("user_profile")
      .select("user_id")
      .eq("username", updates.username)
      .neq("user_id", user.id)
      .maybeSingle();
    if (existing) throw new Error("This username is already taken");
  }

  const { error } = await supabase
    .from("user_profile")
    .upsert({ user_id: user.id, ...updates }, { onConflict: "user_id" });
  if (error) {
    // Migration not run yet — columns don't exist. Tell the user clearly.
    if (error.message?.includes("schema cache") || error.message?.includes("column")) {
      throw new Error("Database not set up yet. Please run supabase_full_migration.sql in your Supabase SQL Editor.");
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