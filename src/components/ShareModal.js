import React, { useState, useEffect, useRef } from "react";
import {
  X, Link2, Check, UserPlus, Copy, Trash2, Crown,
  Edit3, Eye, Clock, MessageSquare,
} from "lucide-react";
import AvatarDisplay from "./AvatarDisplay";
import CloseButton from "./CloseButton";
import {
  createSharedObject, getCollaborators, addCollaboratorByUserId,
  removeCollaborator, updateCollaboratorRole, createInviteCode,
  getInviteCodes, searchUserByUsername, getMyProfile, setUsername,
  getActivityLog, getComments, addComment, deleteComment,
} from "../lib/sharingApi";
import "./ShareModal.css";

function Avatar({ name, color, size = 28, type, emoji, url }) {
  return (
    <AvatarDisplay
      avatar={{ type: type ?? "color", color: color ?? "#8b5cf6", emoji, url, name }}
      size={size}
    />
  );
}

function relativeTime(ts) {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60)    return "just now";
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function activityLabel(action, details) {
  switch (action) {
    case "created":         return `created this ${details?.title ? `"${details.title}"` : ""}`;
    case "updated":         return "updated the content";
    case "updated_title":   return `renamed to "${details?.new_title ?? "…"}"`;
    case "moved":           return `moved to ${details?.new_date ?? "new date"}`;
    case "completed":       return "marked as completed";
    case "uncompleted":     return "marked as incomplete";
    case "invited":         return "invited a collaborator";
    case "removed_collaborator": return "removed a collaborator";
    case "joined":          return "joined via invite";
    case "comment_added":   return "left a comment";
    default:                return action.replace(/_/g, " ");
  }
}

const ROLE_ICON = { owner: Crown, editor: Edit3, viewer: Eye };
const ROLE_LABELS = { editor: "Can edit", viewer: "View only" };

export default function ShareModal({ objectType, objectData, sharedObjectId, session, onClose, onSharedObjectId, onCollaboratorsChange }) {
  // sharedObjectId — null if not yet shared; string if already shared
  const [tab, setTab] = useState("invite"); // 'invite' | 'activity' | 'comments'
  const [collaborators, setCollaborators] = useState([]);
  const [collaboratorsLoading, setCollaboratorsLoading] = useState(Boolean(sharedObjectId));
  const [inviteCode, setInviteCode] = useState(null);
  const [inviteRole, setInviteRole] = useState("editor");
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [addingUserId, setAddingUserId] = useState(null);
  const [activity, setActivity] = useState([]);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [myProfile, setMyProfile] = useState(null);
  const [settingUsername, setSettingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameErr, setUsernameErr] = useState("");
  const [copying, setCopying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [shareError, setShareError] = useState("");
  const [shareSuccess, setShareSuccess] = useState("");
  const [currentSharedId, setCurrentSharedId] = useState(sharedObjectId);
  const searchTimer = useRef(null);
  const commentInputRef = useRef(null);

  const userId = session?.user?.id;

  // On mount: load profile, collaborators, invite code, activity, comments
  useEffect(() => {
    (async () => {
      const profile = await getMyProfile();
      setMyProfile(profile);
      if (!profile?.username) setSettingUsername(true);
    })();
  }, []);

  useEffect(() => {
    if (!currentSharedId) return;
    loadCollaborators().catch(error => {
      setShareError(error?.message ?? "Could not load people with access.");
    });
    loadActivity();
    loadComments();
    loadInviteCode();
  }, [currentSharedId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadCollaborators(sharedId = currentSharedId) {
    if (!sharedId) return;
    setCollaboratorsLoading(true);
    try {
      const c = await getCollaborators(sharedId);
      setCollaborators(c);
      onCollaboratorsChange?.(sharedId, c);
    } finally {
      setCollaboratorsLoading(false);
    }
  }

  async function loadActivity() {
    const a = await getActivityLog(currentSharedId, 30);
    setActivity(a);
  }

  async function loadComments() {
    const c = await getComments(currentSharedId);
    setComments(c);
  }

  async function loadInviteCode() {
    const codes = await getInviteCodes(currentSharedId);
    if (codes.length > 0) setInviteCode(codes[0].code);
  }

  async function ensureShared() {
    if (currentSharedId) return currentSharedId;
    setShareError("");
    const id = await createSharedObject(objectType, objectData);
    setCurrentSharedId(id);
    onSharedObjectId?.(id);
    return id;
  }

  async function handleSaveUsername() {
    setUsernameErr("");
    try {
      const saved = await setUsername(usernameInput);
      setMyProfile(p => ({ ...p, username: saved }));
      setSettingUsername(false);
    } catch (e) {
      setUsernameErr(e.message);
    }
  }

  async function handleSearch(q) {
    setSearch(q);
    setShareError("");
    setShareSuccess("");
    clearTimeout(searchTimer.current);
    if (q.length < 2) { setSearchResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await searchUserByUsername(q);
        setSearchResults(res);
      } catch (error) {
        setShareError(error?.message ?? "Could not search for people.");
      } finally {
        setSearchLoading(false);
      }
    }, 300);
  }

  async function handleAddUser(userProfile) {
    setAddingUserId(userProfile.user_id);
    setLoading(true);
    setShareError("");
    setShareSuccess("");
    try {
      const sid = await ensureShared();
      await addCollaboratorByUserId(sid, userProfile.user_id, inviteRole);
      setSearch(""); setSearchResults([]);
      // State updates from ensureShared are asynchronous, so use the id it returned
      // instead of the current render's (possibly still null) currentSharedId.
      await loadCollaborators(sid);
      setShareSuccess(`Shared with @${userProfile.username}.`);
    } catch (error) {
      setShareError(error?.message ?? "Could not share with this person. Please try again.");
    } finally {
      setAddingUserId(null);
      setLoading(false);
    }
  }

  async function handleGenerateCode() {
    setLoading(true);
    setShareError("");
    setShareSuccess("");
    try {
      const sid = await ensureShared();
      const code = await createInviteCode(sid, inviteRole);
      setInviteCode(code);
      return code;
    } catch (error) {
      setShareError(error?.message ?? "Could not generate an invite code. Please try again.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function handleCopyCode() {
    const code = inviteCode || await handleGenerateCode();
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopying(true);
      setTimeout(() => setCopying(false), 1500);
    } catch {
      // fallback — show code for manual copy
    }
  }

  async function handleRemove(collaboratorUserId) {
    if (collaboratorUserId === userId) return; // can't remove self (owner)
    await removeCollaborator(currentSharedId, collaboratorUserId);
    loadCollaborators();
  }

  async function handleRoleChange(collaboratorUserId, newRole) {
    await updateCollaboratorRole(currentSharedId, collaboratorUserId, newRole);
    loadCollaborators();
  }

  async function handleSendComment() {
    if (!newComment.trim() || !currentSharedId) return;
    const sid = await ensureShared();
    await addComment(sid, newComment);
    setNewComment("");
    loadComments();
  }

  async function handleDeleteComment(commentId) {
    await deleteComment(commentId);
    loadComments();
  }

  // Username setup screen
  if (settingUsername && !myProfile?.username) {
    return (
      <div className="sm-overlay" onClick={onClose}>
        <div className="sm-modal" onClick={e => e.stopPropagation()}>
          <div className="sm-header">
            <span className="sm-title">Choose a username</span>
            <CloseButton onClick={onClose} size={26} />
          </div>
          <div className="sm-body">
            <p className="sm-username-intro">
              To share with teammates, set a username so others can find you.
            </p>
            <div className="sm-username-row">
              <span className="sm-username-at">@</span>
              <input
                className="sm-username-input"
                value={usernameInput}
                onChange={e => setUsernameInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSaveUsername()}
                placeholder="yourname"
                autoFocus
              />
            </div>
            {usernameErr && <p className="sm-err">{usernameErr}</p>}
            <div className="sm-username-hint">
              Lowercase letters, numbers, underscores. Min 3 chars.
            </div>
          </div>
          <div className="sm-footer">
            <button className="sm-btn-secondary" onClick={onClose}>Later</button>
            <button className="sm-btn-primary" onClick={handleSaveUsername}
              disabled={usernameInput.trim().length < 3}>
              Set username
            </button>
          </div>
        </div>
      </div>
    );
  }

  const myRole = collaborators.find(c => c.user_id === userId)?.role ?? "owner";
  const isOwner = myRole === "owner" || !currentSharedId;

  return (
    <div className="sm-overlay" onClick={onClose}>
      <div className="sm-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="sm-header">
          <div className="sm-header-info">
            <UserPlus size={15} />
            <span className="sm-title">Share &ldquo;{objectData?.title ?? objectData?.name ?? "this item"}&rdquo;</span>
          </div>
          <CloseButton onClick={onClose} size={26} />
        </div>

        {/* Tab bar */}
        <div className="sm-tabs">
          {[
            ["invite", <UserPlus size={13} />, "People"],
            ["activity", <Clock size={13} />, "Activity"],
            ["comments", <MessageSquare size={13} />, `Comments${comments.length ? ` (${comments.length})` : ""}`],
          ].map(([id, icon, label]) => (
            <button key={id} className={`sm-tab${tab === id ? " active" : ""}`} onClick={() => setTab(id)}>
              {icon} {label}
            </button>
          ))}
        </div>

        <div className="sm-body">

          {/* ── INVITE TAB ─────────────────────────────────── */}
          {tab === "invite" && (
            <>
              {isOwner && (
                <>
                  {/* Role picker */}
                  <div className="sm-role-row">
                    <span className="sm-role-label">Invite as</span>
                    <div className="sm-role-pills">
                      {["editor","viewer"].map(r => (
                        <button key={r}
                          className={`sm-role-pill${inviteRole === r ? " active" : ""}`}
                          onClick={() => setInviteRole(r)}>
                          {r === "editor" ? <Edit3 size={11} /> : <Eye size={11} />}
                          {ROLE_LABELS[r]}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Username search */}
                  <div className="sm-search-wrap">
                    <input
                      className="sm-search"
                      value={search}
                      onChange={e => handleSearch(e.target.value)}
                      placeholder="Search by @username…"
                    />
                    {searchLoading && <div className="sm-search-spinner" />}
                  </div>

                  {searchResults.length > 0 && (
                    <div className="sm-search-results">
                      {searchResults.map(u => (
                        <button key={u.user_id} className="sm-search-result"
                          onClick={() => handleAddUser(u)}
                          disabled={addingUserId !== null || loading}>
                          <Avatar name={u.name} type={u.avatar_type} color={u.avatar_color} emoji={u.avatar_emoji} url={u.avatar_url} size={28} />
                          <div className="sm-search-info">
                            <span className="sm-search-name">{u.name}</span>
                            <span className="sm-search-username">@{u.username}</span>
                          </div>
                          {addingUserId === u.user_id
                            ? <div className="sm-adding-spinner" />
                            : <UserPlus size={14} className="sm-add-icon" />}
                        </button>
                      ))}
                    </div>
                  )}
                  {shareError && <p className="sm-share-error" role="alert">{shareError}</p>}
                  {shareSuccess && <p className="sm-share-success" role="status">{shareSuccess}</p>}

                  {/* Invite code */}
                  <div className="sm-invite-code-section">
                    <span className="sm-section-label"><Link2 size={12} /> Invite link</span>
                    <div className="sm-code-row">
                      <div className="sm-code-display">
                        {inviteCode
                          ? <span className="sm-code">{inviteCode}</span>
                          : <span className="sm-code-placeholder">Generate a code</span>}
                      </div>
                      <button className="sm-copy-btn" onClick={handleCopyCode} disabled={loading}>
                        {copying ? <Check size={13} /> : <Copy size={13} />}
                        {copying ? "Copied" : inviteCode ? "Copy" : "Generate"}
                      </button>
                    </div>
                    <p className="sm-code-hint">Anyone with this code can join as {ROLE_LABELS[inviteRole].toLowerCase()}.</p>
                  </div>
                </>
              )}

              {/* Collaborator list */}
              {currentSharedId && collaboratorsLoading && (
                <p className="sm-loading-people" role="status">Loading people with access…</p>
              )}
              {collaborators.length > 0 && (
                <div className="sm-collaborators">
                  <span className="sm-section-label">People with access ({collaborators.length})</span>
                  {collaborators.map(c => {
                    const RIcon = ROLE_ICON[c.role];
                    const isMe = c.user_id === userId;
                    const isThisOwner = c.role === "owner";
                    return (
                      <div key={c.id} className="sm-collab-row">
                        <Avatar name={c.name} type={c.avatar_type} color={c.avatar_color} emoji={c.avatar_emoji} url={c.avatar_url} size={30} />
                        <div className="sm-collab-info">
                          <span className="sm-collab-name">
                            {c.name} {isMe && <span className="sm-you-badge">You</span>}
                          </span>
                          {c.username && <span className="sm-collab-username">@{c.username}</span>}
                        </div>
                        <div className="sm-collab-actions">
                          {isThisOwner ? (
                            <span className="sm-role-badge owner"><Crown size={10} /> Owner</span>
                          ) : isOwner && !isMe ? (
                            <select
                              className="sm-role-select"
                              value={c.role}
                              onChange={e => handleRoleChange(c.user_id, e.target.value)}>
                              <option value="editor">Can edit</option>
                              <option value="viewer">View only</option>
                            </select>
                          ) : (
                            <span className="sm-role-badge">
                              {RIcon && <RIcon size={10} />} {c.role}
                            </span>
                          )}
                          {isOwner && !isThisOwner && (
                            <button className="sm-remove-btn" title="Remove"
                              onClick={() => handleRemove(c.user_id)}>
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {!currentSharedId && collaborators.length === 0 && (
                <p className="sm-not-shared-hint">
                  Not shared yet. Search for someone or generate an invite code.
                </p>
              )}
            </>
          )}

          {/* ── ACTIVITY TAB ───────────────────────────────── */}
          {tab === "activity" && (
            <div className="sm-activity">
              {!currentSharedId ? (
                <p className="sm-empty">No activity yet — share this item first.</p>
              ) : activity.length === 0 ? (
                <p className="sm-empty">No activity recorded yet.</p>
              ) : (
                activity.map(ev => (
                  <div key={ev.id} className="sm-activity-row">
                    <Avatar name={ev.actorName} type={ev.actorType} color={ev.actorColor} emoji={ev.actorEmoji} url={ev.actorUrl} size={26} />
                    <div className="sm-activity-info">
                      <span className="sm-activity-actor">{ev.actorName}</span>
                      <span className="sm-activity-action"> {activityLabel(ev.action, ev.details)}</span>
                      <span className="sm-activity-time">{relativeTime(ev.created_at)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── COMMENTS TAB ───────────────────────────────── */}
          {tab === "comments" && (
            <div className="sm-comments">
              <div className="sm-comment-list">
                {!currentSharedId ? (
                  <p className="sm-empty">Share this item to enable comments.</p>
                ) : comments.length === 0 ? (
                  <p className="sm-empty">No comments yet.</p>
                ) : (
                  comments.map(c => (
                    <div key={c.id} className="sm-comment-row">
                      <Avatar name={c.authorName} type={c.authorType} color={c.authorColor} emoji={c.authorEmoji} url={c.authorUrl} size={26} />
                      <div className="sm-comment-body">
                        <div className="sm-comment-meta">
                          <span className="sm-comment-author">{c.authorName}</span>
                          <span className="sm-comment-time">{relativeTime(c.created_at)}</span>
                          {c.author_id === userId && (
                            <button className="sm-del-comment" onClick={() => handleDeleteComment(c.id)}>
                              <Trash2 size={10} />
                            </button>
                          )}
                        </div>
                        <div className="sm-comment-content">{c.content}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {currentSharedId && (
                <div className="sm-comment-input-row">
                  <textarea
                    ref={commentInputRef}
                    className="sm-comment-input"
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendComment(); } }}
                    placeholder="Add a comment… (Enter to send)"
                    rows={2}
                  />
                  <button className="sm-send-btn" onClick={handleSendComment}
                    disabled={!newComment.trim()}>
                    Send
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sm-footer">
          <span className="sm-my-username">
            {myProfile?.username ? `Signed in as @${myProfile.username}` : ""}
          </span>
          <button className="sm-btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
