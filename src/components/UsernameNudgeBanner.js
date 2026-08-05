import React, { useState, useEffect } from "react";
import { AtSign } from "lucide-react";
import CloseButton from "./CloseButton";
import "./UsernameNudgeBanner.css";

export default function UsernameNudgeBanner({ onSetUp, onLater }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 2000);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <div className="unb-wrap" role="dialog" aria-label="Set up your username">
      <div className="unb-icon-wrap">
        <AtSign size={20} className="unb-icon" />
      </div>
      <div className="unb-content">
        <div className="unb-title">Set your @username</div>
        <div className="unb-body">
          Choose a unique username so teammates can find you and share tasks with you.
        </div>
        <div className="unb-actions">
          <button className="unb-setup" onClick={onSetUp}>Set up now</button>
          <button className="unb-later" onClick={onLater}>Later</button>
        </div>
      </div>
      <CloseButton onClick={onLater} size={26} />
    </div>
  );
}