import React from "react";
import { Calendar, Clock, MapPin, CheckCircle, X } from "lucide-react";

const TYPE_ICONS = {
  event:       "📅",
  task:        "✅",
  travel:      "✈️",
  reservation: "🍽️",
  deadline:    "⏰",
  delivery:    "📦",
  reminder:    "🔔",
};

const TYPE_LABELS = {
  event:       "Event",
  task:        "Task",
  travel:      "Travel",
  reservation: "Reservation",
  deadline:    "Deadline",
  delivery:    "Delivery",
  reminder:    "Reminder",
};

const URGENCY_COLORS = {
  low:    "rgba(100,100,120,0.5)",
  normal: "var(--accent)",
  high:   "#f59e0b",
  urgent: "#ef4444",
};

function formatDate(dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  } catch { return dateStr; }
}

function formatTime(timeStr) {
  if (!timeStr) return null;
  try {
    const [h, m] = timeStr.split(":").map(Number);
    const ampm = h < 12 ? "AM" : "PM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
  } catch { return timeStr; }
}

export default function SuggestionCard({ suggestion, onAccept, onReject }) {
  const {
    suggestion_type, title, ai_summary, date, time, location,
    confidence, source_type, urgency,
  } = suggestion;

  const icon      = TYPE_ICONS[suggestion_type]  ?? "📌";
  const typeLabel = TYPE_LABELS[suggestion_type] ?? suggestion_type;

  return (
    <div className="suggestion-card">
      {/* Head */}
      <div className="sc-head">
        <div className="sc-type-icon" title={typeLabel}>{icon}</div>
        <div className="sc-content">
          <div className="sc-title">{title}</div>
          {ai_summary && <div className="sc-summary">{ai_summary}</div>}
        </div>
        <div className="sc-badges">
          <span className={`sc-source-badge ${source_type}`}>
            {source_type === "gmail"    && "✉ Gmail"}
            {source_type === "telegram" && "✈ Telegram"}
            {source_type === "manual"   && "✦ Pasted"}
            {source_type === "outlook"  && "✉ Outlook"}
          </span>
          {confidence != null && (
            <span className="sc-confidence">
              <span className="sc-confidence-bar">
                <span
                  className="sc-confidence-fill"
                  style={{ width: `${Math.round(confidence * 100)}%` }}
                />
              </span>
              {Math.round(confidence * 100)}%
            </span>
          )}
        </div>
      </div>

      {/* Detail chips */}
      {(date || time || location) && (
        <div className="sc-details">
          {date && (
            <span className="sc-detail-chip">
              <Calendar size={12} />
              {formatDate(date)}
            </span>
          )}
          {time && (
            <span className="sc-detail-chip">
              <Clock size={12} />
              {formatTime(time)}
            </span>
          )}
          {location && (
            <span className="sc-detail-chip">
              <MapPin size={12} />
              {location}
            </span>
          )}
          {urgency && urgency !== "normal" && (
            <span className="sc-detail-chip" style={{ color: URGENCY_COLORS[urgency] }}>
              {urgency === "urgent" ? "🚨" : urgency === "high" ? "⚠️" : ""}
              {urgency}
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="sc-actions">
        <button className="sc-accept-btn" onClick={() => onAccept(suggestion)}>
          <CheckCircle size={15} />
          Add to Planner
        </button>
        <button className="sc-reject-btn" title="Dismiss" onClick={() => onReject(suggestion.id)}>
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
