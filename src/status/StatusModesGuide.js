import React from "react";
import { ArrowLeft, Gauge, Info } from "lucide-react";

export const NORA_MODES = [
  {
    key: "peak_focus",
    label: "Peak Focus",
    color: "#22c55e",
    summary: "Your energy and calm are both high, and today’s workload is manageable.",
    guidance: "Use this window for your hardest, most important, or most creative task.",
  },
  {
    key: "building_momentum",
    label: "Building Momentum",
    color: "#3b82f6",
    summary: "You are completing work more consistently and your rhythm is improving.",
    guidance: "Keep the pace steady. Repeating what works is more useful than adding extra work.",
  },
  {
    key: "steady_flow",
    label: "Steady Flow",
    color: "#8b5cf6",
    summary: "Your recent pace is reliable, balanced, and sustainable.",
    guidance: "Protect your routine and continue with the next clear priority.",
  },
  {
    key: "focus_mode",
    label: "Focus Mode",
    color: "#a78bfa",
    summary: "There is no strong overload or recovery signal right now.",
    guidance: "Choose one useful task, remove distractions, and give it your attention.",
  },
  {
    key: "high_load",
    label: "High Load",
    color: "#f97316",
    summary: "Your active or overdue workload is becoming difficult to carry.",
    guidance: "Reduce pressure first: defer, shorten, or remove at least one task.",
  },
  {
    key: "recovery_day",
    label: "Recovery Day",
    color: "#ef4444",
    summary: "Your recent workload and recovery signals suggest that pushing harder may backfire.",
    guidance: "Keep only what is essential and make room for rest and recovery.",
  },
];

export default function StatusModesGuide({ activeMode, onBack }) {
  return (
    <section className="status-modes-guide" aria-labelledby="status-modes-title">
      <header className="status-modes-guide-header">
        <button type="button" className="status-modes-back" onClick={onBack}>
          <ArrowLeft size={17} aria-hidden="true" />
          Back to status
        </button>
        <span className="status-modes-guide-icon" aria-hidden="true"><Info size={18} /></span>
        <h1 id="status-modes-title">How Nora modes work</h1>
        <p>
          Nora reads your energy, recovery, workload, overdue tasks, and recent momentum.
          She then selects the mode that best describes what your day needs right now.
          Modes update automatically as those signals change.
        </p>
      </header>

      <div className="status-modes-grid">
        {NORA_MODES.map((mode) => {
          const isActive = activeMode === mode.label;
          return (
            <article
              key={mode.key}
              className={`status-mode-explainer${isActive ? " is-active" : ""}`}
              style={{ "--mode-color": mode.color }}
            >
              <div className="status-mode-explainer-top">
                <span className="status-mode-mark"><Gauge size={17} aria-hidden="true" /></span>
                <h2>{mode.label}</h2>
                {isActive && <span className="status-mode-current">Your mode now</span>}
              </div>
              <p>{mode.summary}</p>
              <strong>Best response</strong>
              <p>{mode.guidance}</p>
            </article>
          );
        })}
      </div>

      <p className="status-modes-note">
        A mode is guidance, not a score or diagnosis. You can still choose what works best for you.
      </p>
    </section>
  );
}
