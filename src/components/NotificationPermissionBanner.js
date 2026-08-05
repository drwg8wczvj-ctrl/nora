import React, { useState, useEffect } from "react";
import { Bell } from "lucide-react";
import CloseButton from "./CloseButton";
import "./NotificationPermissionBanner.css";

export default function NotificationPermissionBanner({ onAllow, onLater, onNever }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 3500);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div className="npb-wrap" role="dialog" aria-label="Enable notifications">
      <div className="npb-icon-wrap">
        <Bell size={20} className="npb-icon" />
      </div>
      <div className="npb-content">
        <div className="npb-title">Stay on top of your day</div>
        <div className="npb-body">
          Get nudged about tasks and morning check-ins.
        </div>
        <div className="npb-actions">
          <button className="npb-allow" onClick={onAllow}>Allow notifications</button>
          <button className="npb-later" onClick={onLater}>Maybe later</button>
        </div>
      </div>
      <CloseButton onClick={onNever} label="Dismiss permanently" size={26} />
    </div>
  );
}
