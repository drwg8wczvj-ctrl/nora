import React from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { AI_HUB_TOOLS } from "./aiToolsRegistry";

export default function AIHub({ open, onClose, onSelect }) {
  const { t } = useTranslation();

  return (
    <>
      <div
        className={`ai-hub-catcher${open ? " ai-hub-catcher-visible" : ""}`}
        onClick={onClose}
      />
      <div className={`ai-hub-panel${open ? " open" : ""}`} role="dialog" aria-modal="true" aria-label={t("aiHub.title")}>
        <div className="ai-hub-handle" />
        <div className="ai-hub-header">
          <span className="ai-hub-title">{t("aiHub.title")}</span>
          <button className="ai-hub-close" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="ai-hub-list">
          {AI_HUB_TOOLS.map((tool) => {
            const Icon = tool.icon;
            const comingSoon = tool.status === "comingSoon";
            return (
              <button
                key={tool.id}
                className={`ai-hub-card${comingSoon ? " ai-hub-card-soon" : ""}`}
                onClick={() => onSelect(tool.id)}
              >
                <div className="ai-hub-card-icon"><Icon size={20} /></div>
                <div className="ai-hub-card-body">
                  <div className="ai-hub-card-title">
                    {t(tool.titleKey)}
                    {comingSoon && <span className="ai-hub-card-badge">{t("aiHub.comingSoon")}</span>}
                  </div>
                  <div className="ai-hub-card-desc">{t(tool.descKey)}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
