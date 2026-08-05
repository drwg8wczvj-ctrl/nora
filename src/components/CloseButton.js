import React from "react";
import { X } from "lucide-react";
import { hapticLight } from "../lib/haptics";
import "./CloseButton.css";

// Nora's one close (X) affordance, used everywhere a sheet/modal/panel
// dismisses. Standardizes on Apple's own documented sheet-dismiss pattern —
// a circular tertiary-fill glyph button (Safari Reader, Maps location
// cards, Podcasts Now Playing, and every first-party share sheet use this
// exact shape) — with a real 44x44pt tap target (the visible circle is
// smaller, centered inside it, exactly how iOS's own small affordances
// work), a spring release timed to match UIKit's default, and a real
// Taptic Engine tap via @capacitor/haptics (silently a no-op on web/Android).
export default function CloseButton({ onClick, label = "Close", size = 30, className = "" }) {
  const handleClick = (e) => {
    hapticLight();
    onClick?.(e);
  };
  return (
    <button type="button" className={`nora-close-btn ${className}`} onClick={handleClick} aria-label={label}>
      <span className="nora-close-btn-circle" style={{ width: size, height: size }}>
        <X size={Math.round(size * 0.55)} strokeWidth={2.5} />
      </span>
    </button>
  );
}
