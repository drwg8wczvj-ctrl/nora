import React, { useState, useEffect } from "react";
import { Bell, X } from "lucide-react";
import { NativeButton, NativeIconButton } from "./ui/NativeUI";
import "./NotificationPermissionBanner.css";

export default function NotificationPermissionBanner({ onAllow, onLater, onNever }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 3500);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div className="npb-wrap native-ui" role="dialog" aria-label="Enable notifications">
      <div className="npb-icon-wrap">
        <Bell size={20} className="npb-icon" />
      </div>
      <div className="npb-content">
        <div className="npb-title">Stay on top of your day</div>
        <div className="npb-body">
          Get nudged about tasks and morning check-ins.
        </div>
        <div className="npb-actions">
          <NativeButton size="compact" onClick={onAllow}>Allow notifications</NativeButton>
          <NativeButton size="compact" variant="tertiary" onClick={onLater}>Maybe later</NativeButton>
        </div>
      </div>
      <NativeIconButton label="Dismiss permanently" size="compact" variant="plain" onClick={onNever}>
        <X size={16} />
      </NativeIconButton>
    </div>
  );
}
