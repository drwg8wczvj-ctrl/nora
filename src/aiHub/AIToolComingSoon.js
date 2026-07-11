import React from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";

export function DesktopToolComingSoon({ open, onClose, tool, dark }) {
  const { t } = useTranslation();
  const Icon = tool.icon;
  return (
    <div className={`chat-panel${open ? " open" : ""}`}>
      <div className="chat-header">
        <div className="chat-header-info">
          <img src={dark ? "/logo-dark.png" : "/logo-light.png"} className="chat-avatar-logo" alt="Nora" />
          <div>
            <div className="chat-title">{t(tool.titleKey)}</div>
            <div className="chat-subtitle">{t("aiHub.comingSoon")}</div>
          </div>
        </div>
        <button className="chat-close" onClick={onClose}><X size={16} /></button>
      </div>
      <div className="ai-tool-coming-soon-body">
        <div className="ai-tool-coming-soon-icon"><Icon size={26} /></div>
        <div className="ai-tool-coming-soon-title">{t(tool.titleKey)}</div>
        <div className="ai-tool-coming-soon-sub">{t(tool.descKey)}</div>
      </div>
    </div>
  );
}

export function MobileToolComingSoon({ open, onClose, tool, dark }) {
  const { t } = useTranslation();
  const Icon = tool.icon;
  return (
    <div className={`mob-chat${open ? " mob-chat-open" : ""}`}>
      <div className="mob-chat-header">
        <div className="mob-chat-brand">
          <img src={dark ? "/logo-dark.png" : "/logo-light.png"} className="mob-chat-avatar-logo" alt="Nora" />
          <div>
            <div className="mob-chat-title-text">{t(tool.titleKey)}</div>
            <div className="mob-chat-sub">{t("aiHub.comingSoon")}</div>
          </div>
        </div>
        <button className="mob-chat-close" onClick={onClose}><X size={20} /></button>
      </div>
      <div className="ai-tool-coming-soon-body">
        <div className="ai-tool-coming-soon-icon"><Icon size={26} /></div>
        <div className="ai-tool-coming-soon-title">{t(tool.titleKey)}</div>
        <div className="ai-tool-coming-soon-sub">{t(tool.descKey)}</div>
      </div>
    </div>
  );
}
