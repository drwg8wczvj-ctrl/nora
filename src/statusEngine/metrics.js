// ── Shared helper ──────────────────────────────────────────────────────────
export function clamp(min, max, v) {
  return Math.max(min, Math.min(max, v));
}

// ── Mental Battery ───────────────────────────────────────────────────────────
// A same-day energy readout: how much cognitive/emotional fuel is left right now.
// `computeReadinessFn` is accepted for future callers but intentionally unused —
// morningCheckup.readinessScore is already the normalized 0-100 score computed
// elsewhere (App.js's normalizeCheckup), so we just read it instead of recomputing.
export function computeMentalBattery({ energy, morningCheckup, computeReadinessFn, taskWeights, userLoadBaseline, todayTasks, recoveryState }) {
  const baseline = morningCheckup?.readinessScore != null
    ? Math.round(morningCheckup.readinessScore * 0.6 + energy * 10 * 0.4)
    : energy * 10;

  const todayWeightedDone = todayTasks
    .filter((t) => t.completed && t.type !== "break")
    .reduce((s, t) => s + (taskWeights[t.id] ?? 3), 0);

  const drainRatio = todayWeightedDone / Math.max(1, userLoadBaseline.avgDailyWeight);
  const drainPenalty = Math.min(35, Math.round(drainRatio * 25));

  const RECOVERY_PENALTY = { burnout: 15, recovery: 10, high: 5, mild: 0, stable: 0 };
  const recoveryPenalty = RECOVERY_PENALTY[recoveryState.level] ?? 0;

  const value = clamp(0, 100, baseline - drainPenalty - recoveryPenalty);
  const bucket = value >= 70 ? "charged" : value >= 45 ? "adequate" : value >= 25 ? "low" : "depleted";

  let topFactor;
  if (recoveryPenalty > 0 && recoveryPenalty >= drainPenalty) topFactor = "recovery_state";
  else if (drainPenalty > 0) topFactor = "heavy_today";
  else if (morningCheckup?.readinessScore == null) topFactor = "baseline_only";
  else topFactor = "low_readiness";

  return { value, bucket, topFactor };
}

// ── Recovery Index ───────────────────────────────────────────────────────────
// Re-exposes recoveryState under the new metric shape — no new math, just a
// consistent { value, bucket, ... } envelope so the UI can treat every metric
// uniformly.
export function computeRecoveryIndex({ recoveryState }) {
  return {
    value: recoveryState.score,
    bucket: recoveryState.level,
    label: recoveryState.label,
    desc: recoveryState.desc,
    advice: recoveryState.advice,
  };
}

// ── Momentum (metric-shaped) ─────────────────────────────────────────────────
export function computeMomentumMetric({ momentum, weekData }) {
  const rated = weekData.filter((d) => d.rate !== null);
  const last2 = rated.slice(-2);
  const yesterday = last2.length === 2 ? Math.round(last2[0].rate * 100) : null;
  const todayPct = last2.length >= 1 ? Math.round(last2[last2.length - 1].rate * 100) : null;

  return {
    value: momentum.score != null ? Math.round(momentum.score * 100) : null,
    trend: momentum.trend,
    bucket: momentum.state,
    yesterdayToday: { yesterday, today: todayPct },
  };
}

// ── Consistency ───────────────────────────────────────────────────────────────
// Standard deviation of the daily completion rate over the trailing window —
// low variance reads as "steady", high variance as "erratic". Distinct from
// momentum (which tracks direction/level), this tracks predictability.
export function computeConsistency({ days14 }) {
  const rates = days14.map((d) => d.rate);
  if (rates.length < 5) return { value: null, bucket: "building", sampleSize: rates.length };

  const mean = rates.reduce((s, r) => s + r, 0) / rates.length;
  const variance = rates.reduce((s, r) => s + (r - mean) ** 2, 0) / rates.length;
  const stdDev = Math.sqrt(variance);

  const value = clamp(0, 100, Math.round(100 - stdDev * 140));
  const bucket = value >= 75 ? "steady" : value >= 50 ? "variable" : "erratic";

  return { value, bucket, sampleSize: rates.length };
}

// ── Deep Work Capacity ───────────────────────────────────────────────────────
// Predicts how much focused, high-quality attention is realistically available
// right now, blending energy/load/recovery with real focus-session history
// once there's enough of it to trust.
export function computeDeepWorkCapacity({ energy, workloadForecast, recoveryState, focusStats }) {
  let score = energy * 10;

  const LOAD_PENALTY = { heavy: 20, moderate: 8, light: 0, free: 0 };
  score -= LOAD_PENALTY[workloadForecast[0]?.level ?? "free"] ?? 0;

  const RECOVERY_PENALTY = { burnout: 25, recovery: 15, high: 8, mild: 0, stable: 0 };
  score -= RECOVERY_PENALTY[recoveryState.level] ?? 0;

  let confident = false;
  if (focusStats?.sessions_completed >= 3) {
    confident = true;
    const completionRate = focusStats.sessions_completed / Math.max(1, focusStats.sessions_started);
    score += Math.round((completionRate - 0.7) * 30);
    score -= Math.min(15, (focusStats.avg_distractions_per_session ?? 0) * 6);
  }

  const value = clamp(0, 100, score);
  const bucket = value >= 70 ? "high" : value >= 45 ? "moderate" : "low";

  return { value, confident, bucket };
}

// ── Recovery trend (3-day decline) ───────────────────────────────────────────
// Reads recoveryScore straight from the daily-metrics history App.js already
// persists — a monotonic 3-day decline OR a ≥15-point cumulative drop over
// the last 4 recorded days. Extracted from useStatusEngine.js so the adaptive
// Morning Check-up can reuse the exact same detector, not a re-derived copy.
export function computeRecoveryTrendDeclining3d(dailyMetrics) {
  const dates = Object.keys(dailyMetrics ?? {}).sort().slice(-4); // last 4 days incl. today
  const scores = dates.map((d) => dailyMetrics[d]?.recoveryScore).filter((s) => s != null);
  if (scores.length < 3) return false;
  const last3 = scores.slice(-3);
  const monotonicDecline = last3[0] > last3[1] && last3[1] > last3[2];
  const cumulativeDrop = scores[0] - scores[scores.length - 1] >= 15;
  return monotonicDecline || cumulativeDrop;
}

// ── Attention Stability ───────────────────────────────────────────────────────
// Purely session-log-derived (no energy/load blending) — needs a minimum of
// real focus-session history before it's trustworthy, otherwise it's gated.
export function computeAttentionStability({ focusStats }) {
  if (!focusStats || focusStats.sessions_completed < 3) {
    return { value: null, gated: true, sessionsNeeded: 3 - (focusStats?.sessions_completed ?? 0), bucket: "gated" };
  }

  const completionRate = focusStats.sessions_completed / Math.max(1, focusStats.sessions_started);
  const distractionPenalty = Math.min(50, (focusStats.avg_distractions_per_session ?? 0) * 15);
  const value = clamp(0, 100, Math.round(completionRate * 100 - distractionPenalty));
  const bucket = value >= 70 ? "high" : value >= 40 ? "moderate" : "low";

  return { value, gated: false, bucket };
}
