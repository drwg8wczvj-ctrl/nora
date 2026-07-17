import React from "react";
import { ExternalLink } from "lucide-react";

// One-tap primary/warning action chips, plus secondary "ghost" teaser
// mini-cards (e.g. "Review Morning Check-Up results", "Open Long-Term
// Insights") that the integrator wires up with real onClick handlers.
export default function ActionCenter({ actions = [], title = "Action Center" }) {
  const safeActions = Array.isArray(actions) ? actions : [];
  if (safeActions.length === 0) return null;

  const primary = safeActions.filter((a) => a.tone !== "ghost");
  const ghost = safeActions.filter((a) => a.tone === "ghost");

  return (
    <div className="status-card status-actions-card">
      <div className="status-card-title-row">
        <h3 className="status-section-title">{title}</h3>
      </div>

      {primary.length > 0 && (
        <div className="status-actions-row">
          {primary.map((action) => (
            <button
              key={action.id}
              type="button"
              className={`status-action-chip status-action-${action.tone || "primary"}`}
              onClick={action.onClick}
              disabled={action.disabled}
            >
              {action.icon && <span className="status-action-chip-icon">{action.icon}</span>}
              <span className="status-action-chip-label">{action.label}</span>
              {action.meta && <span className="status-action-chip-meta">{action.meta}</span>}
            </button>
          ))}
        </div>
      )}

      {ghost.length > 0 && (
        <div className="status-actions-secondary">
          {ghost.map((action) => (
            <button
              key={action.id}
              type="button"
              className="status-action-ghost-card"
              onClick={action.onClick}
              disabled={action.disabled}
            >
              <div className="status-action-ghost-top">
                {action.icon && <span className="status-action-ghost-icon">{action.icon}</span>}
                <span className="status-action-ghost-label">{action.label}</span>
                <ExternalLink size={13} className="status-action-ghost-arrow" aria-hidden="true" />
              </div>
              {action.preview && <p className="status-action-ghost-preview">&ldquo;{action.preview}&rdquo;</p>}
              {action.meta && <span className="status-action-ghost-meta">{action.meta}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
