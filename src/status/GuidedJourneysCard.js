import React from "react";
import { Compass, ChevronRight } from "lucide-react";

const STAGE_LABELS = {
  discover: "Discovering", understand: "Understanding", research: "Researching",
  plan: "Planning", execute: "In Progress", review: "Reviewing", adapt: "Adapting", complete: "Complete",
};

const DOMAIN_LABELS = {
  fitness: "Fitness", language: "Language", career: "Career", study: "Study", finance: "Finance",
  coding: "Coding", habit: "Habit", creative: "Creative", relationships: "Relationships",
  mental_health: "Mental Health", productivity: "Productivity", travel: "Travel", other: "Journey",
};

function JourneyRow({ journey, onAskAtlas }) {
  const nextMilestone = journey.milestones.find((m) => !m.done);
  return (
    <button
      type="button"
      className="gj-row"
      onClick={() => onAskAtlas?.(`Give me an update on my "${journey.title}" journey.`)}
    >
      <div className="gj-row-top">
        <span className="gj-row-title">{journey.title}</span>
        <span className="gj-row-stage">{STAGE_LABELS[journey.stage] ?? journey.stage}</span>
        <ChevronRight size={14} className="gj-row-chevron" />
      </div>
      <div className="gj-progress-track"><div className="gj-progress-fill" style={{ width: `${journey.progress}%` }} /></div>
      <div className="gj-row-bottom">
        <span className="gj-row-domain">{DOMAIN_LABELS[journey.domain] ?? journey.domain}</span>
        <span className="gj-row-next">{nextMilestone ? `Next: ${nextMilestone.title}` : journey.progress >= 100 ? "All milestones done" : `${journey.progress}%`}</span>
      </div>
    </button>
  );
}

// A summary of the user's active long-term goals Atlas is tracking (see
// src/lib/journeys.js) — mounted on the Mind tab, right where Atlas already
// lives. Read-only for now: tapping a journey opens Atlas with a prefilled
// "give me an update" prompt rather than a full editor — a natural next
// increment once this proves useful, not built speculatively here.
export default function GuidedJourneysCard({ journeys = [], onAskAtlas }) {
  const active = journeys.filter((j) => j.status === "active");
  if (!active.length) return null;
  return (
    <div className="status-card gj-card">
      <div className="status-card-title-row">
        <h3 className="status-section-title"><Compass size={13} /> Guided Journeys</h3>
      </div>
      <div className="gj-list">
        {active.map((journey) => <JourneyRow key={journey.id} journey={journey} onAskAtlas={onAskAtlas} />)}
      </div>
    </div>
  );
}
