import { addDays, fmtDate } from "./dailyWindow";
import { mineAllPatterns } from "./patterns";

// ── Adaptive Morning Check-up question bank ─────────────────────────────────
// Exactly ONE question is asked per morning — this bank picks it, always
// deterministically (no AI, no network delay on the one moment that should
// feel immediate). Ordered by priority, high → low; the first rule whose
// `condition` is true wins. `default_openness` (priority 0, always true)
// guarantees an ordinary day never has nothing to ask.
//
// "Anxiety" from the original brief is deliberately not a condition here — no
// real anxiety signal exists anywhere in this codebase, and fabricating one
// would violate the same non-diagnostic boundary Atlas's own system prompt
// already enforces. That territory is covered instead via stress_carryover /
// recovery_declining / atlas_callback, using behavioral language ("carrying,"
// "overwhelm") rather than a clinical label.
export const ADAPTIVE_QUESTION_BANK = [
  {
    id: "atlas_callback", priority: 95, kind: "free_text",
    condition: (i) => i.wellbeingSignal?.date === i.yesterday && !i.wellbeingSignal?.acknowledged,
    prompt: (i) => i.wellbeingSignal?.note
      ? `You mentioned something was weighing on you yesterday — "${i.wellbeingSignal.note}" How does it feel this morning?`
      : "Something was weighing on you yesterday. How does it feel this morning?",
  },
  {
    id: "recovery_declining", priority: 90, kind: "free_text",
    condition: (i) => i.recoveryTrendDeclining3d === true,
    prompt: () => "Your recovery has been trending down the last few days. What's one thing that would actually help right now?",
  },
  {
    id: "stress_carryover", priority: 85, kind: "free_text",
    condition: (i) => i.yesterdayStress != null && i.yesterdayStress <= 3,
    prompt: () => "How much are you still carrying yesterday with you?",
  },
  {
    id: "physical_vs_mental_tired", priority: 75, kind: "choice",
    condition: (i) => i.yesterdaySleepQuality === "poor",
    prompt: () => "Do you feel physically tired or mentally tired?",
    options: ["Physically tired", "Mentally foggy", "Both", "Neither, actually okay"],
  },
  {
    id: "avoidance_check", priority: 65, kind: "free_text",
    condition: (i) => (i.deferredCount ?? 0) >= 3,
    prompt: (i) => `You have ${i.deferredCount} tasks that have been waiting a while. Is there something you've been avoiding because it feels overwhelming?`,
  },
  {
    id: "capitalize_on_recovery", priority: 55, kind: "free_text",
    condition: (i) => i.recoveryState?.level === "stable" && (i.recoveryState?.score ?? 0) >= 85,
    prompt: () => "You're in strong shape today. What should we take advantage of?",
  },
  {
    id: "avoided_category_nudge", priority: 45, kind: "choice",
    condition: (i) => !!i.mostAvoidedCategoryText,
    prompt: (i) => `${i.mostAvoidedCategoryText} What about today?`,
    options: ["Today's the day", "Not yet — and that's okay", "I hadn't noticed"],
  },
  {
    id: "default_openness", priority: 0, kind: "free_text",
    condition: () => true,
    prompt: () => "What's one thing — big or small — that would make today feel like a good day?",
  },
];

export function selectAdaptiveQuestion(inputs) {
  const sorted = [...ADAPTIVE_QUESTION_BANK].sort((a, b) => b.priority - a.priority);
  const winner = sorted.find((rule) => {
    try { return rule.condition(inputs); } catch { return false; }
  }) ?? ADAPTIVE_QUESTION_BANK[ADAPTIVE_QUESTION_BANK.length - 1];
  return { id: winner.id, kind: winner.kind, prompt: winner.prompt(inputs), options: winner.options ?? null };
}

// Pure adapter — flattens whatever App.js/MobileApp.js already has in scope
// into the flat bag the rules above expect, so rule definitions don't need
// to know where each signal actually lives.
export function buildAdaptiveCheckupInputs({
  today, tasks = [], taskWeights = {}, dailyMetrics = {},
  recoveryState, recoveryTrendDeclining3d, deferredTasks = [], userPrefs = {},
}) {
  const yesterday = fmtDate(addDays(today, -1));
  const yesterdayMetrics = dailyMetrics?.[yesterday] ?? null;
  const mostAvoidedPattern = mineAllPatterns({ tasks, taskWeights, dailyMetrics, today })
    .find((p) => p.id === "most_avoided_category");

  return {
    today,
    yesterday,
    yesterdayStress: yesterdayMetrics?.stress ?? null,
    yesterdaySleepQuality: yesterdayMetrics?.sleepQuality ?? null,
    recoveryTrendDeclining3d: !!recoveryTrendDeclining3d,
    recoveryState,
    deferredCount: deferredTasks.length,
    wellbeingSignal: userPrefs?.wellbeing_signal ?? null,
    mostAvoidedCategoryText: mostAvoidedPattern?.text ?? null,
  };
}
