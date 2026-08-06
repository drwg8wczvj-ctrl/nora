import React from "react";
import BrandStar from "../components/BrandStar";
import {
  NativeButton,
  NativeDialog,
} from "../components/ui/NativeUI";

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
    <NativeDialog
      onClose={onDismiss}
      title={greeting()}
      subtitle={`I found ${count} ${count === 1 ? "thing" : "things"} that may need your attention.`}
      className="proactive-dialog"
      footer={(
        <>
          <NativeButton variant="tertiary" onClick={onDismiss}>Later</NativeButton>
          <NativeButton leading={<BrandStar size={15} tone="white" />} onClick={onReview}>
            Review suggestions
          </NativeButton>
        </>
      )}
    >
        <div className="proactive-mark" aria-hidden="true">
          <BrandStar size={28} tone="purple" />
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

    </NativeDialog>
  );
}
