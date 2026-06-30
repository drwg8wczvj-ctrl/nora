import React from "react";
import { Sparkles } from "lucide-react";

const TYPE_ICONS = {
  event:       "📅",
  task:        "✅",
  travel:      "✈️",
  reservation: "🍽️",
  deadline:    "⏰",
  delivery:    "📦",
  reminder:    "🔔",
};

function greeting() {
  const h = new Date().getHours();
  if (h < 5)  return "Still up?";
  if (h < 12) return "Good morning.";
  if (h < 17) return "Good afternoon.";
  if (h < 21) return "Good evening.";
  return "Good night.";
}

export default function ProactiveOverlay({ suggestions, onReview, onDismiss }) {
  if (!suggestions?.length) return null;
  const count   = suggestions.length;
  const preview = suggestions.slice(0, 3);

  return (
    <>
      <div className="intel-overlay-mask" onClick={onDismiss} />
      <div className="proactive-sheet" role="dialog" aria-modal="true" aria-label="NORA suggestions">

        <div className="proactive-sparkle">
          <Sparkles size={20} />
        </div>

        <div className="proactive-greeting">{greeting()}</div>
        <div className="proactive-sub">
          I found&nbsp;<b>{count}&nbsp;{count === 1 ? "thing" : "things"}</b>&nbsp;that
          {count === 1 ? " may need" : " may need"} your attention.
        </div>

        <div className="proactive-preview">
          {preview.map((s) => (
            <div key={s.id} className="proactive-preview-chip">
              <span className="proactive-preview-chip-icon">
                {TYPE_ICONS[s.suggestion_type] ?? "📌"}
              </span>
              <span>{s.ai_summary ?? s.title}</span>
            </div>
          ))}
          {count > 3 && (
            <div className="proactive-preview-more">
              + {count - 3} more suggestion{count - 3 !== 1 ? "s" : ""}
            </div>
          )}
        </div>

        <div className="proactive-actions">
          <button className="proactive-cta" onClick={onReview}>
            Review Suggestions
          </button>
          <button className="proactive-dismiss" onClick={onDismiss}>
            Later
          </button>
        </div>

      </div>
    </>
  );
}
