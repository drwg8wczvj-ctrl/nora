// Pure computation over the HealthKit context (src/lib/healthKit.js) for the
// Status Page's Health section — kept separate from the existing manual
// check-in-driven statusEngine (patterns.js/interpretations.js/readiness.js)
// so real health data is additive, not a risky rewrite of already-tuned
// logic. Everything here degrades to `hasData: false` when a category isn't
// connected, and the caller is expected to hide that card rather than show
// a broken one.

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function sleepComponent(sleepStats) {
  if (!sleepStats?.hasData) return null;
  const pct = clamp((sleepStats.last.asleepMinutes / 480) * 100, 0, 100);
  return { score: pct, reason: `Sleep: ${Math.floor(sleepStats.last.asleepMinutes / 60)}h ${Math.round(sleepStats.last.asleepMinutes % 60)}m last night${pct < 80 ? " (below your 8h target)" : ""}` };
}

// Exported standalone (not just used internally by the Energy Score) so the
// Status Page's Recovery card can show the same number/label the Energy
// Score's explanation refers to.
export function computeRecoveryScore(heart) {
  if (!heart?.hasData) return { hasData: false };
  let score = 50;
  const reasons = [];
  if (heart.heartRateVariabilityTrend === "improving") { score += 25; reasons.push("HRV trending up"); }
  else if (heart.heartRateVariabilityTrend === "declining") { score -= 25; reasons.push("HRV trending down"); }
  if (heart.restingHeartRateTrend === "improving") { score += 15; reasons.push("resting heart rate improving"); }
  else if (heart.restingHeartRateTrend === "declining") { score -= 15; reasons.push("resting heart rate elevated"); }
  score = clamp(score, 0, 100);
  const label = score >= 75 ? "Strong" : score >= 50 ? "Steady" : score >= 30 ? "Reduced" : "Low";
  return { hasData: true, score, label, reasons };
}

function recoveryComponent(heart) {
  const r = computeRecoveryScore(heart);
  if (!r.hasData) return null;
  return { score: r.score, reason: r.reasons.length ? `Recovery: ${r.reasons.join(", ")}` : "Recovery: steady" };
}

function activityComponent(activity, recoveryScore) {
  if (!activity?.hasData) return null;
  const { today, weeklyAvgSteps } = activity.stats;
  const highOutputDay = weeklyAvgSteps > 0 && today.steps > weeklyAvgSteps * 1.3;
  const undertrained = recoveryScore != null && recoveryScore < 50;
  if (highOutputDay && undertrained) {
    return { score: 60, reason: "Activity: yesterday was a high-output day on top of lower recovery" };
  }
  return { score: 100, reason: null };
}

// The single Energy Score consumed by the Status Page's Energy card and by
// Nora Insights / the AI context — weighted sleep > recovery > activity,
// renormalized over whichever components actually have data so a missing
// category never silently drags the score toward zero.
export function computeEnergyScore({ sleepStats, heart, activity }) {
  const sleep = sleepComponent(sleepStats);
  const recovery = recoveryComponent(heart);
  const activityPart = activityComponent(activity, recovery?.score ?? null);

  const parts = [
    sleep && { ...sleep, weight: 0.5 },
    recovery && { ...recovery, weight: 0.3 },
    activityPart && { ...activityPart, weight: 0.2 },
  ].filter(Boolean);

  if (!parts.length) return { hasData: false };

  const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
  const score = Math.round(parts.reduce((sum, p) => sum + p.score * p.weight, 0) / totalWeight);
  const reasons = parts.map((p) => p.reason).filter(Boolean);

  const label = score >= 75 ? "High" : score >= 50 ? "Moderate" : score >= 30 ? "Low" : "Very low";

  return { hasData: true, score, label, reasons };
}

// Plain-English personalized observations for the Nora Insights card — rule-
// based (not an LLM call) so they're instant and free; the AI-facing system
// prompts (buildPlannerSystem/buildAtlasSystem) get the raw numbers and can
// phrase their own observations on top of these when relevant.
export function buildHealthNarrativeInsights({ sleepStats, activity, heart, taskCompletionByDate }) {
  const insights = [];

  if (sleepStats?.hasData) {
    if (sleepStats.trend === "declining") insights.push("You've slept below your weekly average for the last few nights.");
    if (sleepStats.trend === "improving") insights.push("Your sleep has been improving over the last week.");
    if (sleepStats.consistencyLabel === "excellent") insights.push("Your sleep consistency is excellent.");
    else if (sleepStats.consistencyLabel === "irregular") insights.push("Your bedtime has been irregular this week — a steadier schedule usually helps recovery.");
    if (sleepStats.debtMinutes > 120) insights.push(`You're carrying about ${Math.round(sleepStats.debtMinutes / 60)}h of sleep debt from this week.`);
  }

  if (heart?.hasData) {
    if (heart.heartRateVariabilityTrend === "declining") insights.push("Recovery is lower than usual — your HRV has been trending down.");
    if (heart.heartRateVariabilityTrend === "improving") insights.push("Recovery is trending up — HRV has been improving.");
  }

  if (activity?.hasData && activity.stats.trend === "up") {
    insights.push("You've been more active than usual this week.");
  }

  // Sleep-duration vs. task-completion correlation — the one cross-domain
  // pattern cheap enough to compute inline rather than in the full pattern-
  // discovery pass (statusEngine/patterns.js handles the rest).
  if (sleepStats?.hasData && taskCompletionByDate && Object.keys(taskCompletionByDate).length >= 5) {
    const paired = Object.entries(taskCompletionByDate)
      .map(([date, rate]) => {
        const night = sleepStats.last?.date === date ? sleepStats.last : null;
        return night ? { hours: night.asleepMinutes / 60, rate } : null;
      })
      .filter(Boolean);
    if (paired.length >= 5) {
      const wellRested = paired.filter((p) => p.hours >= 7.5);
      const shortSlept = paired.filter((p) => p.hours < 7.5);
      if (wellRested.length >= 2 && shortSlept.length >= 2) {
        const avgWell = wellRested.reduce((s, p) => s + p.rate, 0) / wellRested.length;
        const avgShort = shortSlept.reduce((s, p) => s + p.rate, 0) / shortSlept.length;
        if (avgWell - avgShort > 0.15) insights.push("You tend to complete more tasks after sleeping more than 7.5 hours.");
      }
    }
  }

  return insights;
}
