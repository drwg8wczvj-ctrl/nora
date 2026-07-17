import React from "react";
import { MessageSquare } from "lucide-react";

// Hero card at the top of the Status page — Nora's single most important
// line of the day, plus (optionally) the state she thinks you're in, how
// confident she is about that read, and the signals that led her there.
export default function AICoachCard({
  message,
  tone = "calm",
  stateLabel,
  stateColor,
  confidence,
  signals = [],
  onAskNora,
  loading = false,
}) {
  const safeSignals = Array.isArray(signals) ? signals : [];
  const hasHeader = Boolean(stateLabel) || Boolean(confidence?.label);

  return (
    <div className="status-card status-coach-card" data-tone={tone}>
      {hasHeader && (
        <div className="status-coach-header">
          {stateLabel && (
            <div className="status-coach-state">
              {stateColor && (
                <span className="status-coach-dot" style={{ background: stateColor }} aria-hidden="true" />
              )}
              <span className="status-coach-state-label" style={stateColor ? { color: stateColor } : undefined}>
                {stateLabel}
              </span>
            </div>
          )}
          {confidence?.label && (
            <span className={`status-coach-confidence status-conf-${confidence.level || "building"}`}>
              {confidence.label}
            </span>
          )}
        </div>
      )}

      {loading ? (
        <div className="status-coach-body">
          <div className="status-skeleton status-skeleton-message" />
          <div className="status-skeleton status-skeleton-line" />
        </div>
      ) : (
        <div className="status-coach-body">
          <p className="status-coach-message">{message}</p>
          {safeSignals.length > 0 && (
            <ul className="status-coach-signals">
              {safeSignals.map((s, i) => (
                <li key={i} className="status-coach-signal">
                  <span className="status-coach-signal-dot" aria-hidden="true" />
                  {s}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {!loading && typeof onAskNora === "function" && (
        <div className="status-coach-footer">
          <button type="button" className="status-ghost-btn" onClick={onAskNora}>
            <MessageSquare size={13} /> Ask Nora
          </button>
        </div>
      )}
    </div>
  );
}
