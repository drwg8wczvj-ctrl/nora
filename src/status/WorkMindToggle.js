import React from "react";

// Segmented control switching the Status page between Work (Nora/Planner —
// task execution) and Mind (Atlas — stress/recovery/emotional patterns).
export default function WorkMindToggle({ active, onChange }) {
  const idx = active === "mind" ? 1 : 0;
  return (
    <div className="status-worktab-toggle" role="tablist" aria-label="Status view">
      <div className={`status-worktab-pill status-worktab-pill-${idx}`} aria-hidden="true" />
      <button type="button" role="tab" aria-selected={idx === 0}
        className={`status-worktab-btn${idx === 0 ? " active" : ""}`}
        onClick={() => onChange("work")}>
        Work
      </button>
      <button type="button" role="tab" aria-selected={idx === 1}
        className={`status-worktab-btn${idx === 1 ? " active" : ""}`}
        onClick={() => onChange("mind")}>
        Mind
      </button>
    </div>
  );
}
