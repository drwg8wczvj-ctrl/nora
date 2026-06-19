import React from "react";
import AvatarDisplay from "./AvatarDisplay";
import "./CollaboratorAvatars.css";

export default function CollaboratorAvatars({ collaborators = [], max = 3, size = 18, onClick }) {
  if (!collaborators.length) return null;
  const visible = collaborators.slice(0, max);
  const extra = collaborators.length - visible.length;

  return (
    <div
      className="ca-stack"
      style={{ "--ca-size": `${size}px` }}
      onClick={onClick}
      title={collaborators.map(c => c.name ?? c.username ?? "…").join(", ")}
    >
      {visible.map((c, i) => (
        <AvatarDisplay
          key={c.user_id ?? c.id ?? i}
          avatar={{
            type:  c.avatar_type  ?? "color",
            color: c.avatar_color ?? "#8b5cf6",
            emoji: c.avatar_emoji ?? null,
            url:   c.avatar_url   ?? null,
            name:  c.name ?? c.username ?? "?",
          }}
          size={size}
          className="ca-avatar"
        />
      ))}
      {extra > 0 && (
        <div className="ca-avatar ca-avatar-extra"
          style={{ width: size, height: size, fontSize: size * 0.36 }}>
          +{extra}
        </div>
      )}
    </div>
  );
}