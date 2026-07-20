// Turns the HealthKit context into the plain-text block both
// buildPlannerSystem and buildAtlasSystem (src/App.js) inject into their
// system prompts — one function so Planner and Atlas always agree on what
// today's health data means and what to do about it. Returns "" when no
// health category is connected or nothing has real data yet, so callers can
// just string-interpolate it with no extra branching.

import { formatHoursMinutes } from "./healthKit";
import { computeEnergyScore, computeRecoveryScore } from "../statusEngine/healthInsights";

export function buildHealthPromptContext(health) {
  const ctx = health?.context;
  if (!health?.available || !ctx) return "";

  const sleep = ctx.sleep?.stats;
  const heart = ctx.heart;
  const activity = ctx.activity;
  const recovery = computeRecoveryScore(heart);
  const energy = computeEnergyScore({ sleepStats: sleep, heart, activity });

  if (!sleep?.hasData && !recovery.hasData && !activity?.stats?.hasData) return "";

  const lines = [];
  if (sleep?.hasData) {
    lines.push(
      `Sleep: ${formatHoursMinutes(sleep.last.asleepMinutes)} last night` +
      ` (7-day avg ${sleep.weeklyAvgMinutes ? formatHoursMinutes(sleep.weeklyAvgMinutes) : "unknown"}),` +
      ` trend ${sleep.trend ?? "unknown"}, bedtime consistency ${sleep.consistencyLabel ?? "unknown"}` +
      `${sleep.debtMinutes > 60 ? `, ~${formatHoursMinutes(sleep.debtMinutes)} sleep debt this week` : ""}.`
    );
  }
  if (recovery.hasData) {
    lines.push(`Recovery: ${recovery.label} (score ${recovery.score}/100)${recovery.reasons.length ? ` — ${recovery.reasons.join(", ")}` : ""}.`);
  }
  if (activity?.stats?.hasData) {
    const { today, trend } = activity.stats;
    lines.push(
      `Activity: ${Math.round(today.steps)} steps today, ${Math.round(today.activeEnergyKcal)} kcal active energy,` +
      ` trend ${trend ?? "unknown"} vs last week.` +
      `${activity.workouts.length ? ` ${activity.workouts.length} workout(s) logged this week.` : ""}`
    );
  }
  if (energy.hasData) {
    lines.push(`Energy Score: ${energy.score}/100 (${energy.label}).`);
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
    "━━━ HEALTH CONTEXT (Apple Health) ━━━━━━━━━━━━━━━━━━━",
    ...lines,
    guidance.length ? "How this should change your plan:" : null,
    ...guidance,
  ].filter(Boolean).join("\n");
}
