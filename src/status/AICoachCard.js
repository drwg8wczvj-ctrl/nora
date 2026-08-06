import React from "react";
import { Info, MessageSquare } from "lucide-react";

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
  askLabel = "Ask Nora",
  persona,
  loading = false,
  onExplainModes,
}) {
  const safeSignals = Array.isArray(signals) ? signals : [];
  const hasHeader = Boolean(stateLabel) || Boolean(confidence?.label);

  return (
    <div
      className={`status-card status-coach-card${stateColor ? " has-state" : ""}`}
      data-tone={tone}
      style={stateColor ? { "--state-color": stateColor } : undefined}
      {...(persona ? { "data-persona": persona } : {})}
    >
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
          <div className="status-coach-header-actions">
            {confidence?.label && (
              <span className={`status-coach-confidence status-conf-${confidence.level || "building"}`}>
                {confidence.label}
              </span>
            )}
            {typeof onExplainModes === "function" && (
              <button
                type="button"
                className="status-mode-info"
                onClick={onExplainModes}
                aria-label="Learn how Nora modes work"
                title="How Nora modes work"
              >
                <Info size={16} />
              </button>
            )}
          </div>
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
            <MessageSquare size={13} /> {askLabel}
          </button>
        </div>
      )}
    </div>
  );
}
