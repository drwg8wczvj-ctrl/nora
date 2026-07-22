// Turns the HealthKit context (plus the user's own personal baselines) into
// the plain-text block both buildPlannerSystem and buildAtlasSystem (src/
// App.js) inject into their system prompts — one function so Planner and
// Atlas always agree on what today's health data means, how it compares to
// this specific person's normal, and what to do about it. Returns "" when
// no health category is connected or nothing has real data yet, so callers
// can just string-interpolate it with no extra branching.

import { formatHoursMinutes } from "./healthKit";
import { computeEnergyScore, computeRecoveryScore } from "../statusEngine/healthInsights";
import { buildPersonalBaseline } from "../statusEngine/personalBaseline";

export function buildHealthPromptContext(health, { tasks = [], dailyMetrics = {} } = {}) {
  const ctx = health?.context;
  if (!health?.available || !ctx) return "";

  const sleep = ctx.sleep?.stats;
  const heart = ctx.heart;
  const activity = ctx.activity;
  const recovery = computeRecoveryScore(heart);
  const energy = computeEnergyScore({ sleepStats: sleep, heart, activity });

  if (!sleep?.hasData && !recovery.hasData && !activity?.stats?.hasData) return "";

  const baseline = buildPersonalBaseline({
    sleepSessions: ctx.sleep?.sessions ?? [],
    activityHistory: activity?.history ?? [],
    tasks,
    dailyMetrics,
  });

  const lines = [];
  if (sleep?.hasData) {
    const baselineNote = baseline.sleep.hasData
      ? ` — your normal is ${formatHoursMinutes(baseline.sleep.avgMinutes)}, so this is ${
          sleep.last.asleepMinutes < baseline.sleep.avgMinutes - 45 ? "noticeably below your baseline"
          : sleep.last.asleepMinutes > baseline.sleep.avgMinutes + 45 ? "above your baseline"
          : "close to your baseline"
        }`
      : "";
    lines.push(
      `Sleep: ${formatHoursMinutes(sleep.last.asleepMinutes)} last night` +
      ` (7-day avg ${sleep.weeklyAvgMinutes ? formatHoursMinutes(sleep.weeklyAvgMinutes) : "unknown"}),` +
      ` trend ${sleep.trend ?? "unknown"}, bedtime consistency ${sleep.consistencyLabel ?? "unknown"}` +
      `${sleep.debtMinutes > 60 ? `, ~${formatHoursMinutes(sleep.debtMinutes)} sleep debt this week` : ""}` +
      `${baselineNote}.`
    );
  }
  if (recovery.hasData) {
    lines.push(`Recovery: ${recovery.label} (score ${recovery.score}/100)${recovery.reasons.length ? ` — ${recovery.reasons.join(", ")}` : ""}.`);
  }
  if (activity?.stats?.hasData) {
    const { today, trend } = activity.stats;
    const stepsBaselineNote = baseline.steps.hasData
      ? ` (your normal is ${baseline.steps.avgSteps.toLocaleString()})`
      : "";
    lines.push(
      `Activity: ${Math.round(today.steps)} steps today${stepsBaselineNote}, ${Math.round(today.activeEnergyKcal)} kcal active energy,` +
      ` trend ${trend ?? "unknown"} vs last week.` +
      `${activity.workouts.length ? ` ${activity.workouts.length} workout(s) logged this week.` : ""}`
    );
  }
  if (energy.hasData) {
    lines.push(`Energy Score: ${energy.score}/100 (${energy.label}).`);
  }
  if (baseline.deepWork.hasData) {
    lines.push(`Normally completes ${baseline.deepWork.avgPerDay} Deep Work block${baseline.deepWork.avgPerDay === 1 ? "" : "s"} a day.`);
  }
  if (baseline.bestFeeling.hasData) {
    lines.push(`This person's own history shows they tend to feel best after ${baseline.bestFeeling.bestRangeLabel} of sleep — use THIS, not a generic "8 hours" rule, when talking about sleep targets.`);
  }

  // Threshold-based guidance — this is what makes the data change what
  // Nora/Atlas actually DO (shorten a session, delay hard work), not just
  // something they mention in passing.
  const guidance = [];
  const poorSleep = sleep?.hasData && sleep.last.asleepMinutes < 360; // < 6h
  const severalPoorNights = sleep?.hasData && sleep.trend === "declining" && sleep.weeklyAvgMinutes != null && sleep.weeklyAvgMinutes < 390;
  const excellentRecovery = recovery.hasData && recovery.score >= 75;
  const veryActiveDay = activity?.stats?.hasData && activity.stats.today.activeEnergyKcal > 600;

  if (severalPoorNights) {
    guidance.push("Several nights of below-average sleep in a row — reduce today's workload and recommend a lighter plan rather than adding more.");
  } else if (poorSleep) {
    guidance.push("Poor sleep last night — suggest shorter focus sessions, delay the hardest work if possible, build in real breaks, and consider recommending an earlier bedtime tonight.");
  }
  if (excellentRecovery && !poorSleep) {
    guidance.push("Recovery is excellent — a good day to recommend Deep Work, longer focus blocks, or the most difficult item on the list.");
  }
  if (veryActiveDay) {
    guidance.push("Today has been a high-output activity day — don't recommend another intense workout; suggest recovery instead.");
  }

  return [
    "━━━ HEALTH CONTEXT (Apple Health + this person's own history) ━━━━━━━━━━━━━━━━━━━",
    ...lines,
    guidance.length ? "How this should change your plan:" : null,
    ...guidance,
    "",
    "REASONING STYLE: when more than one of these signals points the same",
    "direction (e.g. a high-activity day + shorter-than-usual sleep + several",
    "intense Deep Work sessions), weave them into ONE causal explanation —",
    "\"you walked over 20,000 steps yesterday; combined with a shorter night",
    "and four Deep Work sessions, today's fatigue makes sense\" — not a list of",
    "disconnected facts. Always explain WHY before WHAT. Compare against THIS",
    "person's own baseline above, never a generic population average.",
  ].filter((l) => l !== null).join("\n");
}
