import React from "react";
import "./AvatarDisplay.css";

function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? (parts[0][0] + parts[1][0]).toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

// avatar = { type, color, emoji, url, name }
export default function AvatarDisplay({ avatar = {}, size = 32, onClick, className = "" }) {
  const { type = "color", color = "#8b5cf6", emoji, url, name = "" } = avatar;
  const fontSize = type === "emoji" ? size * 0.52 : size * 0.38;

  const base = {
    width: size, height: size,
    borderRadius: "50%",
    cursor: onClick ? "pointer" : "default",
    flexShrink: 0,
  };

  if (type === "upload" && url) {
    return (
      <img
        src={url}
        alt={name}
        onClick={onClick}
        className={`nora-avatar nora-avatar-photo ${className}`}
        style={{ ...base, objectFit: "cover" }}
        title={name}
      />
    );
  }

  return (
    <div
      className={`nora-avatar ${className}`}
      style={{ ...base, background: color, fontSize }}
      onClick={onClick}
      title={name}
    >
      {type === "emoji" && emoji ? emoji : initials(name)}
    </div>
  );
}

// Build an avatar object from user_profile row
export function profileToAvatar(profile) {
  return {
    type:  profile?.avatar_type  ?? "color",
    color: profile?.avatar_color ?? "#8b5cf6",
    emoji: profile?.avatar_emoji ?? null,
    url:   profile?.avatar_url   ?? null,
    name:  profile?.name         ?? profile?.username ?? "",
  };
}