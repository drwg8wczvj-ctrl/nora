import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

// Picks the level whose value is closest to the current numeric value —
// matches the "5-level picker" interaction already used elsewhere in the app.
function closestLevel(levels, value) {
  if (!Array.isArray(levels) || levels.length === 0 || value == null) return null;
  return levels.reduce((prev, cur) => (
    Math.abs(cur.value - value) < Math.abs(prev.value - value) ? cur : prev
  ));
}

const SLEEP_LEVELS = [
  ["poor", "Poor"],
  ["okay", "Okay"],
  ["good", "Good"],
];

export default function QuickCheckIn({ items, sleep, collapsedByDefault = true }) {
  const [expanded, setExpanded] = useState(!collapsedByDefault);

  const safeItems = Array.isArray(items) ? items : [];
  const hasSleep = Boolean(sleep && typeof sleep === "object");

  // Nothing to check in on at all — don't render a dead card.
  if (safeItems.length === 0 && !hasSleep) return null;

  return (
    <div className="status-card status-checkin-card" data-expanded={expanded}>
      <button
        type="button"
        className="status-checkin-summary"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="status-checkin-summary-text">
          <span className="status-checkin-summary-title">How are you feeling today?</span>
          {!expanded && safeItems.length > 0 && (
            <span className="status-checkin-summary-preview">
              {safeItems.map((item) => {
                const active = closestLevel(item.levels, item.value);
                return (
                  <span key={item.id} className="status-checkin-preview-chip" style={{ color: item.color }}>
                    {item.icon}
                    {active ? active.label : "—"}
                  </span>
                );
              })}
            </span>
          )}
        </div>
        <ChevronDown size={16} className="status-checkin-chevron" aria-hidden="true" />
      </button>

      <div className="status-detail-wrap">
        <div>
          <div className="status-checkin-body">
            {safeItems.map((item) => {
              const active = closestLevel(item.levels, item.value);
              const levels = Array.isArray(item.levels) ? item.levels : [];
              return (
                <div key={item.id} className="status-checkin-row">
                  <div className="status-checkin-meta">
                    <span className="status-checkin-icon" style={{ color: item.color }}>{item.icon}</span>
                    <span className="status-checkin-label">{item.label}</span>
                    {active && (
                      <span className="status-checkin-current" style={{ color: item.color }}>{active.label}</span>
                    )}
                  </div>
                  <div className="status-checkin-levels">
                    {levels.map((lvl) => {
                      const isActive = active && lvl.value === active.value;
                      return (
                        <button
                          key={lvl.value}
                          type="button"
                          className={`status-level-btn${isActive ? " active" : ""}`}
                          style={isActive ? { background: `${item.color}18`, borderColor: `${item.color}55`, color: item.color } : undefined}
                          onClick={() => item.onChange?.(lvl.value)}
                        >
                          {lvl.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {hasSleep && (
              <div className="status-checkin-row status-checkin-sleep-row">
                <div className="status-checkin-meta">
                  <span className="status-checkin-label">Sleep quality</span>
                  {sleep.meta && <span className="status-checkin-meta-chip">✓ {sleep.meta}</span>}
                </div>
                <div className="status-checkin-sleep-levels">
                  {SLEEP_LEVELS.map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      className={`status-sleep-btn status-sleep-${val}${sleep.value === val ? " active" : ""}`}
                      onClick={() => sleep.onChange?.(val)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
