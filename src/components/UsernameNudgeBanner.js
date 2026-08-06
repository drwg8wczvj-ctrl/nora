import React, { useState, useEffect } from "react";
import { AtSign, X } from "lucide-react";
import { NativeButton, NativeIconButton } from "./ui/NativeUI";
import "./UsernameNudgeBanner.css";

export default function UsernameNudgeBanner({ onSetUp, onLater }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 2000);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div className="unb-wrap native-ui" role="dialog" aria-label="Set up your username">
      <div className="unb-icon-wrap">
        <AtSign size={20} className="unb-icon" />
      </div>
      <div className="unb-content">
        <div className="unb-title">Set your @username</div>
        <div className="unb-body">
          Choose a unique username so teammates can find you and share tasks with you.
        </div>
        <div className="unb-actions">
          <NativeButton size="compact" onClick={onSetUp}>Set up now</NativeButton>
          <NativeButton size="compact" variant="tertiary" onClick={onLater}>Later</NativeButton>
        </div>
      </div>
      <NativeIconButton label="Dismiss" size="compact" variant="plain" onClick={onLater}>
        <X size={16} />
      </NativeIconButton>
    </div>
  );
}
