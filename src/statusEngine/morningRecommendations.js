// ── Morning recommendation candidate bank ───────────────────────────────────
// Every candidate is already psychology/sleep-science-grounded and tagged
// with the real factor that triggers it — this is deliberately a closed,
// hand-written list (never AI-generated) so the AI layer (api/tips.js's
// "morning" branch) can only ever SELECT/RANK/PHRASE from real candidates,
// never invent a recommendation that isn't grounded in the day's actual data.
export const RECOMMENDATION_BANK = [
  {
    id: "delay_deep_work", factor: "sleep_debt",
    condition: (i) => (i.sleepDebtHours ?? 0) >= 1.5 || i.mentalFatigueRisk === "high",
    text: "Delay deep work by an hour — let your system properly wake up first.",
  },
  {
    id: "sunlight_30min", factor: "circadian",
    condition: (i) => (i.circadianConsistency ?? 100) < 60 || (i.sleepDebtHours ?? 0) >= 1,
    text: "Get sunlight within 30 minutes of waking — it's the fastest way to reset your body clock.",
  },
  {
    id: "avoid_caffeine_90min", factor: "rested_score",
    condition: (i) => i.restedScore != null && i.restedScore <= 4,
    text: "Avoid caffeine for the first 90 minutes — it blunts the natural cortisol wake-up curve.",
  },
  {
    id: "hardest_work_10_12", factor: "cognitive_performance",
    condition: (i) => i.cognitivePerformance != null && i.cognitivePerformance >= 60,
    text: "Schedule your hardest task between 10 and 12 — that's your likely peak window today.",
  },
  {
    id: "longer_lunch", factor: "workload",
    condition: (i) => i.todaysWorkloadLevel === "heavy",
    text: "Take a longer lunch than usual — today's load needs a real reset point.",
  },
  {
    id: "reduce_meeting_load", factor: "fatigue_risk",
    condition: (i) => i.mentalFatigueRisk === "high" || i.recoveryStateLevel === "high" || i.recoveryStateLevel === "burnout",
    text: "If you can, push a non-essential meeting — protect focus capacity today.",
  },
  {
    id: "go_outside", factor: "energy",
    condition: (i) => i.energyScore != null && i.energyScore <= 4,
    text: "A short walk outside will do more for your energy than another coffee.",
  },
  {
    id: "breathing_exercise", factor: "stress",
    condition: (i) => (i.relaxationScore != null && i.relaxationScore <= 4) || i.wellbeingSignalRecent,
    text: "Try a few minutes of slow breathing before diving in — it lowers the baseline stress you're starting from.",
  },
  {
    id: "recovery_evening", factor: "recovery_state",
    condition: (i) => i.recoveryStateLevel === "recovery" || i.recoveryStateLevel === "burnout",
    text: "Plan a genuine recovery evening — no catch-up work, just rest.",
  },
  {
    id: "single_priority", factor: "default",
    condition: () => true, // always-eligible fallback so the pool is never empty
    text: "Pick one clear priority for today and let everything else be optional.",
  },
];

export function selectCandidateRecommendations(inputs, n = 6) {
  const eligible = RECOMMENDATION_BANK.filter((r) => {
    try { return r.condition(inputs); } catch { return false; }
  });
  const pool = eligible.length ? eligible : [RECOMMENDATION_BANK[RECOMMENDATION_BANK.length - 1]];
  return pool.slice(0, n).map(({ id, text, factor }) => ({ id, text, factor }));
}
