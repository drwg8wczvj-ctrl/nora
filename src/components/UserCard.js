import React, { useEffect, useRef } from "react";
import AvatarDisplay from "./AvatarDisplay";
import "./UserCard.css";

export default function UserCard({ profile, anchorRect, onClose, onViewProfile }) {
  // profile = { name, username, avatar_type, avatar_color, avatar_emoji, avatar_url, created_at }
  const ref = useRef(null);

  useEffect(() => {
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose?.();
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onClose]);

  // Position: below anchor
  const style = anchorRect
    ? { position: "fixed", top: anchorRect.bottom + 6, left: anchorRect.left }
    : {};

  const avatar = {
    type:  profile?.avatar_type  ?? "color",
    color: profile?.avatar_color ?? "#8b5cf6",
    emoji: profile?.avatar_emoji ?? null,
    url:   profile?.avatar_url   ?? null,
    name:  profile?.name ?? profile?.username ?? "",
  };

  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : null;

  return (
    <div ref={ref} className="uc-card" style={style}>
      <div className="uc-top">
        <AvatarDisplay avatar={avatar} size={48} />
        <div className="uc-info">
          <span className="uc-name">{profile?.name ?? profile?.username ?? "User"}</span>
          {profile?.username && <span className="uc-username">@{profile.username}</span>}
        </div>
      </div>
      {profile?.bio && <p className="uc-bio">{profile.bio}</p>}
      {memberSince && <p className="uc-since">Member since {memberSince}</p>}
      {onViewProfile && (
        <button className="uc-view-btn" onClick={onViewProfile}>View Profile</button>
      )}
    </div>
  );
}