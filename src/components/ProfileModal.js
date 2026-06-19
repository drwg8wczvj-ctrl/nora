import React, { useState, useEffect } from "react";
import { X, Check, AlertCircle, Camera } from "lucide-react";
import AvatarDisplay from "./AvatarDisplay";
import AvatarPicker from "./AvatarPicker";
import { saveFullProfile, getMyProfile } from "../lib/sharingApi";
import "./ProfileModal.css";

const TIMEZONES = [
  "UTC","Europe/London","Europe/Paris","Europe/Berlin","Europe/Warsaw",
  "Europe/Kyiv","Europe/Moscow","Asia/Dubai","Asia/Kolkata","Asia/Shanghai",
  "Asia/Tokyo","Australia/Sydney","Pacific/Auckland","America/New_York",
  "America/Chicago","America/Denver","America/Los_Angeles","America/Sao_Paulo",
];

function daysSince(dateStr) {
  if (!dateStr) return null;
  const ms = Date.now() - new Date(dateStr).getTime();
  return Math.floor(ms / 86400000);
}

export default function ProfileModal({ session, onClose, onSaved }) {
  const [profile, setProfile] = useState(null);
  const [avatar, setAvatar] = useState({ type: "color", color: "#8b5cf6", name: "" });
  const [showPicker, setShowPicker] = useState(false);

  const [name,     setName]     = useState("");
  const [username, setUsername] = useState("");
  const [bio,      setBio]      = useState("");
  const [location, setLocation] = useState("");
  const [timezone, setTimezone] = useState("UTC");

  const [usernameErr,  setUsernameErr]  = useState("");
  const [saving,       setSaving]       = useState(false);
  const [saved,        setSaved]        = useState(false);
  const [loadErr,      setLoadErr]      = useState("");

  useEffect(() => {
    getMyProfile().then(p => {
      if (!p) return;
      setProfile(p);
      setName(p.name ?? "");
      setUsername(p.username ?? "");
      setBio(p.bio ?? "");
      setLocation(p.location ?? "");
      setTimezone(p.timezone ?? "UTC");
      setAvatar({
        type:  p.avatar_type  ?? "color",
        color: p.avatar_color ?? "#8b5cf6",
        emoji: p.avatar_emoji ?? null,
        url:   p.avatar_url   ?? null,
        name:  p.name ?? "",
      });
    }).catch(() => setLoadErr("Couldn't load profile."));
  }, []);

  useEffect(() => {
    const clean = username.toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (username !== clean) { setUsername(clean); return; }
    if (!username) { setUsernameErr(""); return; }
    if (username.length < 3) { setUsernameErr("At least 3 characters"); return; }
    if (username.length > 20) { setUsernameErr("Max 20 characters"); return; }
    setUsernameErr("");
  }, [username]);

  // Check if username can be changed (30-day rate limit)
  const daysSinceChange = profile ? daysSince(profile.username_changed_at) : null;
  const canChangeUsername = !profile?.username_changed_at || daysSinceChange >= 30;
  const daysUntilChange = canChangeUsername ? 0 : 30 - daysSinceChange;

  const usernameChanged = username !== (profile?.username ?? "");

  async function handleSave() {
    if (usernameErr) return;
    if (usernameChanged && !canChangeUsername) return;
    setSaving(true); setSaved(false);
    try {
      const updates = {
        name:         name.trim(),
        bio:          bio.trim(),
        location:     location.trim(),
        timezone,
        avatar_type:  avatar.type,
        avatar_color: avatar.color,
        avatar_emoji: avatar.emoji ?? null,
        avatar_url:   avatar.type === "upload" ? avatar.url : null,
      };
      if (usernameChanged && canChangeUsername) {
        updates.username             = username;
        updates.username_changed_at  = new Date().toISOString();
      }
      await saveFullProfile(updates);
      setProfile(p => ({ ...p, ...updates }));
      onSaved?.(updates);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setUsernameErr(e.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : null;

  return (
    <div className="pm-overlay" onClick={onClose}>
      <div className="pm-modal" onClick={e => e.stopPropagation()}>
        <div className="pm-header">
          <span className="pm-title">Profile</span>
          <button className="pm-close" onClick={onClose}><X size={16} /></button>
        </div>

        {loadErr ? (
          <div className="pm-body pm-err-msg"><AlertCircle size={16} /> {loadErr}</div>
        ) : (
          <div className="pm-body">
            {/* Avatar section */}
            <div className="pm-avatar-section">
              <div className="pm-avatar-wrap">
                <AvatarDisplay avatar={{ ...avatar, name }} size={72} />
                <button className="pm-change-avatar" onClick={() => setShowPicker(v => !v)}>
                  <Camera size={13} /> Change
                </button>
              </div>
              {memberSince && (
                <div className="pm-member-since">Member since {memberSince}</div>
              )}
            </div>

            {/* Inline avatar picker */}
            {showPicker && (
              <div className="pm-picker-wrap">
                <AvatarPicker
                  value={{ ...avatar, name }}
                  onChange={a => setAvatar({ ...a, name })}
                />
              </div>
            )}

            {/* Display name */}
            <div className="pm-field">
              <label className="pm-label">Display name</label>
              <input className="pm-input" value={name}
                onChange={e => setName(e.target.value)} placeholder="Your name" />
            </div>

            {/* Username */}
            <div className="pm-field">
              <label className="pm-label">
                Username
                {!canChangeUsername && (
                  <span className="pm-rate-limit">
                    · Can change in {daysUntilChange} day{daysUntilChange !== 1 ? "s" : ""}
                  </span>
                )}
              </label>
              <div className="pm-username-row">
                <span className="pm-at">@</span>
                <input
                  className={`pm-input pm-username-input${usernameErr ? " err" : ""}`}
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  disabled={!canChangeUsername}
                  placeholder="yourname"
                />
              </div>
              {usernameErr && <p className="pm-err">{usernameErr}</p>}
              {!canChangeUsername && (
                <p className="pm-hint">Usernames can be changed once every 30 days.</p>
              )}
            </div>

            {/* Bio */}
            <div className="pm-field">
              <label className="pm-label">Bio <span className="pm-opt">(optional)</span></label>
              <textarea className="pm-input pm-textarea" rows={2} value={bio}
                onChange={e => setBio(e.target.value)}
                placeholder="One short sentence about you…"
                maxLength={120} />
              <span className="pm-char-count">{bio.length}/120</span>
            </div>

            {/* Location */}
            <div className="pm-field">
              <label className="pm-label">Location <span className="pm-opt">(optional)</span></label>
              <input className="pm-input" value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="City, Country" maxLength={60} />
            </div>

            {/* Timezone */}
            <div className="pm-field">
              <label className="pm-label">Timezone</label>
              <select className="pm-select" value={timezone}
                onChange={e => setTimezone(e.target.value)}>
                {TIMEZONES.map(tz => (
                  <option key={tz} value={tz}>{tz.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>

            {/* Email (read only) */}
            <div className="pm-field">
              <label className="pm-label">Email</label>
              <div className="pm-readonly">{session?.user?.email}</div>
            </div>
          </div>
        )}

        <div className="pm-footer">
          <button className="pm-btn-secondary" onClick={onClose}>Cancel</button>
          <button className="pm-btn-primary" onClick={handleSave}
            disabled={saving || !!usernameErr || (usernameChanged && !canChangeUsername)}>
            {saving ? "Saving…" : saved ? <><Check size={13} /> Saved</> : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}