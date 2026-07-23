// Guided Journeys — Atlas's persistent, cross-conversation project tracker.
// A Journey is not a conversation; it's a long-running goal (e.g. "Home
// Fitness", "Learn German") that spans many conversations, real planner
// tasks, and time, evolving through a fixed lifecycle:
// discover -> understand -> research -> plan -> execute -> review -> adapt -> complete.
//
// Pure functions only — App.js owns the actual `journeys` state and its
// Supabase sync (mirrors executeAiTool: task state lives in App.js, the
// state-transition logic lives in a plain, testable function).

const uid = () => Math.random().toString(36).slice(2);

export const JOURNEY_STAGES = ["discover", "understand", "research", "plan", "execute", "review", "adapt", "complete"];
export const JOURNEY_DOMAINS = [
  "fitness", "language", "career", "study", "finance", "coding",
  "habit", "creative", "relationships", "mental_health", "productivity", "travel", "other",
];
export const JOURNEY_STATUSES = ["active", "completed", "archived"];

// Milestone completion drives progress whenever milestones exist — a
// deterministic percentage, never something the model states directly, so
// "62% done" always means what it says. Only a milestone-less journey
// (nothing concrete to check off yet) accepts an AI-estimated progress.
function computeProgress(journey) {
  if (!journey.milestones.length) return journey.progress ?? 0;
  const done = journey.milestones.filter((m) => m.done).length;
  return Math.round((done / journey.milestones.length) * 100);
}

export function createJourney({ title, objective, domain = "other", estimatedDuration = null, milestones = [] }) {
  const now = Date.now();
  const journey = {
    id: uid(),
    title,
    objective,
    domain: JOURNEY_DOMAINS.includes(domain) ? domain : "other",
    stage: "plan",
    status: "active",
    estimatedDuration,
    milestones: milestones.map((m) => ({ id: uid(), title: m.title, effort: m.effort ?? null, done: false })),
    resources: [],
    observations: [],
    linkedTaskIds: [],
    progress: 0,
    createdAt: now,
    updatedAt: now,
  };
  journey.progress = computeProgress(journey);
  return journey;
}

// Handles stage/status transitions, an AI observation log entry, and/or a
// named resource — any subset at once, whichever the caller provides.
export function applyJourneyUpdate(journey, { stage, status, progress, observation, addResource } = {}) {
  const next = { ...journey, updatedAt: Date.now() };
  if (stage && JOURNEY_STAGES.includes(stage)) next.stage = stage;
  if (status && JOURNEY_STATUSES.includes(status)) next.status = status;
  if (!next.milestones.length && typeof progress === "number") {
    next.progress = Math.max(0, Math.min(100, Math.round(progress)));
  }
  if (observation) {
    next.observations = [...next.observations, { date: new Date().toISOString().slice(0, 10), text: observation }];
  }
  if (addResource?.label) {
    next.resources = [...next.resources, { label: addResource.label, note: addResource.note ?? null }];
  }
  return next;
}

// Returns { journey, found } rather than throwing — mirrors executeAiTool's
// "not found" handling so the caller can feed a clear result back to the model.
export function applyMilestoneUpdate(journey, milestoneTitle, done) {
  const idx = journey.milestones.findIndex((m) => m.title.toLowerCase() === (milestoneTitle ?? "").toLowerCase());
  if (idx === -1) return { journey, found: false };
  const milestones = journey.milestones.map((m, i) => (i === idx ? { ...m, done } : m));
  const next = { ...journey, milestones, updatedAt: Date.now() };
  next.progress = computeProgress(next);
  if (done && milestones.every((m) => m.done) && next.stage !== "complete") next.stage = "review";
  return { journey: next, found: true };
}
