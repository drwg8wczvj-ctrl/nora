import React, { useState, useEffect } from "react";
import { Check, ArrowRight } from "lucide-react";
import AvatarDisplay from "./AvatarDisplay";
import AvatarPicker, { AVATAR_COLORS } from "./AvatarPicker";
import { saveFullProfile } from "../lib/sharingApi";
import "./UsernameOnboarding.css";

function slugify(name) {
  return (name ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 20);
}

function suggestUsername(name) {
  const base = slugify(name);
  if (base.length >= 3) return base;
  return base + "user";
}

const QUICK_EMOJIS = ["🦉","🚀","🌙","⚡","📚","🌍","🎯","✨","🦊","🐼"];

export default function UsernameOnboarding({ displayName = "", onComplete, onSkip }) {
  const [step,        setStep]        = useState("identity"); // 'identity' | 'avatar'
  const [name,        setName]        = useState(displayName);
  const [username,    setUsername]    = useState(() => suggestUsername(displayName));
  const [usernameErr, setUsernameErr] = useState("");
  const [avatar,      setAvatar]      = useState({
    type: "emoji",
    color: AVATAR_COLORS[Math.floor(Math.random() * 6)],
    emoji: QUICK_EMOJIS[Math.floor(Math.random() * QUICK_EMOJIS.length)],
    name: displayName,
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setAvatar(a => ({ ...a, name }));
  }, [name]);

  useEffect(() => {
    if (username.length > 0 && username.length < 3) {
      setUsernameErr("At least 3 characters");
    } else if (!/^[a-z0-9_]{0,20}$/.test(username)) {
      setUsernameErr("Letters, numbers, underscore only");
    } else {
      setUsernameErr("");
    }
  }, [username]);

  function handleUsernameInput(val) {
    setUsername(val.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20));
  }

  async function handleFinish() {
    if (usernameErr || username.length < 3) return;
    setSaving(true);
    try {
      await saveFullProfile({
        name:         name.trim() || username,
        username,
        avatar_type:  avatar.type,
        avatar_color: avatar.color,
        avatar_emoji: avatar.emoji ?? null,
        avatar_url:   avatar.url   ?? null,
      });
      onComplete({ name: name.trim() || username, username, avatar });
    } catch (e) {
      setUsernameErr(e.message ?? "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="uob-overlay">
      <div className="uob-modal">

        {/* Brand */}
        <div className="uob-brand">
          <div className="uob-logo-wrap">
            <AvatarDisplay avatar={avatar} size={64} />
          </div>
          <h2 className="uob-headline">How should people know you?</h2>
          <p className="uob-sub">Set up your identity for collaboration.</p>
        </div>

        {step === "identity" && (
          <>
            {/* Display name */}
            <div className="uob-field">
              <label className="uob-label">Display name</label>
              <input
                className="uob-input"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Your name"
                autoFocus
              />
            </div>

            {/* Username */}
            <div className="uob-field">
              <label className="uob-label">Username</label>
              <div className="uob-username-row">
                <span className="uob-at">@</span>
                <input
                  className={`uob-input uob-username-input${usernameErr ? " err" : ""}`}
                  value={username}
                  onChange={e => handleUsernameInput(e.target.value)}
                  placeholder="yourname"
                />
                {!usernameErr && username.length >= 3 && (
                  <Check size={14} className="uob-valid-icon" />
                )}
              </div>
              {usernameErr && <p className="uob-err">{usernameErr}</p>}
              <p className="uob-hint">
                Unique · lowercase · letters, numbers, underscore · 3–20 chars
              </p>
            </div>

            {/* Quick emoji pick */}
            <div className="uob-field">
              <label className="uob-label">Quick avatar</label>
              <div className="uob-quick-emojis">
                {QUICK_EMOJIS.map(e => (
                  <button key={e}
                    className={`uob-emoji-btn${avatar.emoji === e && avatar.type === "emoji" ? " sel" : ""}`}
                    onClick={() => setAvatar(a => ({ ...a, type: "emoji", emoji: e }))}>
                    {e}
                  </button>
                ))}
                <button className="uob-emoji-btn uob-more-btn"
                  onClick={() => setStep("avatar")}>
                  ＋
                </button>
              </div>
            </div>

            <button
              className="uob-btn-primary"
              onClick={() => username.length >= 3 && !usernameErr && handleFinish()}
              disabled={username.length < 3 || !!usernameErr || saving}>
              {saving ? "Saving…" : <>Get started <ArrowRight size={14} /></>}
            </button>
            {onSkip && (
              <button className="uob-btn-skip" onClick={onSkip}>Skip for now</button>
            )}
          </>
        )}

        {step === "avatar" && (
          <>
            <AvatarPicker
              value={avatar}
              onChange={setAvatar}
            />
            <div className="uob-avatar-actions">
              <button className="uob-btn-secondary" onClick={() => setStep("identity")}>
                Back
              </button>
              <button className="uob-btn-primary" onClick={() => setStep("identity")}>
                Done <Check size={14} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}