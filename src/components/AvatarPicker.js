import React, { useState, useRef } from "react";
import AvatarDisplay from "./AvatarDisplay";
import "./AvatarPicker.css";

export const AVATAR_COLORS = [
  "#8b5cf6", "#6366f1", "#3b82f6", "#06b6d4",
  "#10b981", "#22c55e", "#f59e0b", "#f97316",
  "#ef4444", "#ec4899", "#64748b", "#0f172a",
];

export const AVATAR_EMOJIS = {
  Animals:  ["🦉","🐺","🦊","🐻","🐼","🐨","🦁","🐯","🐸","🦋","🦅","🦜","🐬","🦒","🦘"],
  Space:    ["🚀","🌙","⭐","🌟","☄️","🛸","🔭","🌌","🪐","🌠","🌃","🛰️"],
  Nature:   ["🌍","🌊","🌿","🌺","🍀","🌸","🌻","🍃","🌴","🌵","⚡","🌈"],
  Objects:  ["📚","💡","🎯","🏆","🎨","🔬","💻","🎵","🎸","📷","🔑","✏️"],
  Abstract: ["✨","💫","🔥","❄️","💎","🌀","⚡","🎭","🌐","🎲","🧩","🔮"],
};

export default function AvatarPicker({ value, onChange }) {
  // value = { type, color, emoji, url, name }
  const [tab, setTab] = useState(value?.type === "emoji" ? "emoji" : value?.type === "upload" ? "upload" : "color");
  const [emojiCat, setEmojiCat] = useState("Animals");
  const fileRef = useRef(null);

  const color = value?.color ?? "#8b5cf6";
  const emoji = value?.emoji ?? "🦉";
  const name  = value?.name  ?? "";

  const previewAvatar = {
    ...value,
    type:  tab,
    color,
    emoji: tab === "emoji" ? emoji : null,
    name,
  };

  function pickColor(c) {
    onChange({ ...value, type: tab, color: c });
  }
  function pickEmoji(e) {
    onChange({ ...value, type: "emoji", emoji: e, color });
    setTab("emoji");
  }
  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange({ ...value, type: "upload", url: reader.result });
    reader.readAsDataURL(file);
  }

  return (
    <div className="ap-wrap">
      {/* Preview */}
      <div className="ap-preview">
        <AvatarDisplay avatar={previewAvatar} size={72} />
      </div>

      {/* Tab bar */}
      <div className="ap-tabs">
        {["color","emoji","upload"].map(t => (
          <button key={t} className={`ap-tab${tab === t ? " active" : ""}`} onClick={() => setTab(t)}>
            {t === "color" ? "Color" : t === "emoji" ? "Emoji" : "Photo"}
          </button>
        ))}
      </div>

      {/* Color tab */}
      {tab === "color" && (
        <div className="ap-section">
          <div className="ap-color-grid">
            {AVATAR_COLORS.map(c => (
              <button key={c} className={`ap-color-swatch${color === c ? " sel" : ""}`}
                style={{ background: c }}
                onClick={() => pickColor(c)} />
            ))}
            <label className="ap-color-custom" title="Custom color">
              <input type="color" value={color}
                onChange={e => pickColor(e.target.value)}
                style={{ opacity: 0, position: "absolute", width: 0, height: 0 }} />
              <span style={{ fontSize: 18 }}>＋</span>
            </label>
          </div>
          <p className="ap-hint">Your initials will appear on this color.</p>
        </div>
      )}

      {/* Emoji tab */}
      {tab === "emoji" && (
        <div className="ap-section">
          <div className="ap-emoji-cats">
            {Object.keys(AVATAR_EMOJIS).map(cat => (
              <button key={cat} className={`ap-emoji-cat${emojiCat === cat ? " active" : ""}`}
                onClick={() => setEmojiCat(cat)}>
                {cat}
              </button>
            ))}
          </div>
          <div className="ap-emoji-grid">
            {AVATAR_EMOJIS[emojiCat].map(e => (
              <button key={e} className={`ap-emoji-btn${emoji === e ? " sel" : ""}`}
                onClick={() => pickEmoji(e)}>
                {e}
              </button>
            ))}
          </div>
          <div className="ap-color-grid" style={{ marginTop: 10 }}>
            <span className="ap-hint" style={{ marginRight: 8, whiteSpace: "nowrap" }}>Background:</span>
            {AVATAR_COLORS.slice(0, 8).map(c => (
              <button key={c} className={`ap-color-swatch sm${color === c ? " sel" : ""}`}
                style={{ background: c }}
                onClick={() => onChange({ ...value, type: "emoji", emoji, color: c })} />
            ))}
          </div>
        </div>
      )}

      {/* Upload tab */}
      {tab === "upload" && (
        <div className="ap-section ap-upload-section">
          <div className="ap-upload-area" onClick={() => fileRef.current?.click()}>
            {value?.type === "upload" && value?.url
              ? <img src={value.url} className="ap-upload-preview" alt="avatar" />
              : <span className="ap-upload-placeholder">Click to upload photo</span>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
            onChange={handleFile} />
          <p className="ap-hint">Square images work best. Max 2MB.</p>
        </div>
      )}
    </div>
  );
}