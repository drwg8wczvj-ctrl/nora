import { clamp } from "./metrics";

// ── 6-part Morning Readiness Score ──────────────────────────────────────────
// Each sub-score is { value: 0-100, primaryFactor, facts }. `facts` is
// structured data only (no sentences) — copy/explanation generation is a
// separate, AI-assisted concern (see api/tips.js's "morning" branch), kept
// out of this pure calculator so it stays trivially testable.
export function computeReadinessSubScores({
  restedScore, energyScore, clarityScore, relaxationScore,
  recoveryState, attentionStability, focusTrend,
  stressTrendUp, emotionalDriftToday, wellbeingSignal, today,
  sleepAnalysis = {}, todaysWorkloadLevel,
}) {
  const wellbeingSignalRecent = wellbeingSignal?.date === today;
  const sleepDebtHours = sleepAnalysis.debt?.value ?? null;
  const cognitivePerformance = sleepAnalysis.cognitivePerformance?.value ?? null;
  const sleepCycles = sleepAnalysis.cycles?.value ?? null;

  // Recovery — behaviorally-derived score (dominant), nudged by self-report
  const recoveryValue = clamp(0, 100, Math.round(
    (recoveryState?.score ?? 50) * 0.75 + (restedScore != null ? restedScore * 10 : 50) * 0.25
  ));

  // Focus — attentionStability when it's trustworthy (≥3 focus sessions),
  // else falls back to self-reported clarity as a same-construct-ish proxy.
  const focusBase = (attentionStability && !attentionStability.gated && attentionStability.value != null)
    ? attentionStability.value
    : (clarityScore != null ? clarityScore * 10 : 50);
  const focusTrendAdj = focusTrend === "up" ? 5 : focusTrend === "down" ? -5 : 0;
  const focusValue = clamp(0, 100, Math.round(focusBase + focusTrendAdj));

  // Stress (higher = calmer) — today's relaxation dial, penalized by trend/
  // signal/burnout. Never labeled "anxiety" — see adaptiveCheckup.js's note.
  let stressValue = relaxationScore != null ? relaxationScore * 10 : 50;
  if (stressTrendUp) stressValue -= 10;
  if (wellbeingSignalRecent && (wellbeingSignal.level === "high" || wellbeingSignal.level === "severe")) stressValue -= 15;
  if (recoveryState?.level === "burnout") stressValue -= 10;
  stressValue = clamp(0, 100, Math.round(stressValue));

  // Energy — self-report, adjusted by sleep debt and today's expected load
  let energyValue = energyScore != null ? energyScore * 10 : 50;
  if (sleepDebtHours != null) energyValue -= Math.min(20, sleepDebtHours * 3);
  if (todaysWorkloadLevel === "heavy") energyValue -= 5;
  energyValue = clamp(0, 100, Math.round(energyValue));

  // Emotional Stability — recovery level as baseline, pulled down by a
  // recently-flagged wellbeing signal, a rising-stress trend, or a
  // known-rough weekday pattern.
  let emotionalValue = ({ stable: 85, mild: 65, high: 45, recovery: 30, burnout: 15 })[recoveryState?.level] ?? 60;
  if (wellbeingSignalRecent) emotionalValue -= ({ mild: 5, moderate: 12, high: 20, severe: 30 })[wellbeingSignal.level] ?? 10;
  if (stressTrendUp) emotionalValue -= 8;
  if (emotionalDriftToday) emotionalValue -= 5;
  emotionalValue = clamp(0, 100, Math.round(emotionalValue));

  // Mental Clarity — self-report leads (inverse weighting vs. Focus above,
  // which leans on behavioral attentionStability instead), sleep-science secondary.
  let clarityValue = clarityScore != null ? clarityScore * 10 : 50;
  if (cognitivePerformance != null) clarityValue = clarityValue * 0.7 + cognitivePerformance * 0.3;
  if (sleepCycles != null) clarityValue += clamp(-5, 5, (sleepCycles - 5) * 2);
  clarityValue = clamp(0, 100, Math.round(clarityValue));

  return {
    recovery: {
      value: recoveryValue, primaryFactor: "recovery_state",
      facts: { recoveryStateLevel: recoveryState?.level ?? null, recoveryStateScore: recoveryState?.score ?? null, sleepDebtHours, restedScore },
    },
    focus: {
      value: focusValue, primaryFactor: (attentionStability && !attentionStability.gated) ? "attention_stability" : "clarity_self_report",
      facts: { attentionStabilityGated: attentionStability?.gated ?? true, clarityScore, focusTrend: focusTrend ?? null },
    },
    stress: {
      value: stressValue, primaryFactor: "relaxation_dial",
      facts: { relaxationDialValue: relaxationScore ?? null, stressTrendUp: !!stressTrendUp, wellbeingSignalLevel: wellbeingSignal?.level ?? null, wellbeingSignalRecent, recoveryBurnout: recoveryState?.level === "burnout" },
    },
    energy: {
      value: energyValue, primaryFactor: "energy_self_report",
      facts: { energyScore: energyScore ?? null, sleepDurationHours: sleepAnalysis.duration?.value ?? null, sleepDebtHours, todayWorkloadLevel: todaysWorkloadLevel ?? null },
    },
    emotionalStability: {
      value: emotionalValue, primaryFactor: wellbeingSignalRecent ? "wellbeing_signal" : "recovery_state",
      facts: { recoveryStateLevel: recoveryState?.level ?? null, wellbeingSignalDate: wellbeingSignal?.date ?? null, stressTrendUp: !!stressTrendUp, emotionalDriftToday: !!emotionalDriftToday },
    },
    mentalClarity: {
      value: clarityValue, primaryFactor: "clarity_self_report",
      facts: { clarityScore: clarityScore ?? null, cognitivePerformance, sleepCycles },
    },
  };
}

// ── Overall backward-compatible 0-100 pct ───────────────────────────────────
// Same bucket thresholds/labels as the pre-redesign computeReadiness, so
// nothing downstream (computeMentalBattery, widget sync, Action Center meta,
// historical observation engine) perceives a meaning shift.
export function computeReadinessV2(subScores) {
  const pct = Math.round(
    subScores.recovery.value * 0.25 +
    subScores.energy.value * 0.20 +
    subScores.mentalClarity.value * 0.20 +
    subScores.focus.value * 0.15 +
    subScores.stress.value * 0.10 +
    subScores.emotionalStability.value * 0.10
  );
  if (pct >= 72) return { label: "High", color: "#22c55e", pct };
  if (pct >= 45) return { label: "Moderate", color: "#f59e0b", pct };
  if (pct >= 25) return { label: "Low", color: "#ef4444", pct };
  return { label: "Recovery", color: "#8b5cf6", pct };
}

// ── Backward-compatible computeReadiness — accepts EITHER shape ────────────
// New checkups carry `subScores` (built via computeReadinessSubScores).
// Legacy checkups (already sitting in localStorage/Supabase from before this
// redesign) only have the old flat fields — this recomputes with the exact
// original formula so old check-ins keep rendering identically in review mode.
// `MorningCheckup.js` re-exports this so its 3 external callers
// (App.js, MobileApp.js) never need to change their import.
export function computeReadiness({ subScores, sleepQuality, restedScore, energyScore, clarityScore, sleepDuration } = {}) {
  if (subScores) return computeReadinessV2(subScores);

  // Legacy path — verbatim port of the original formula (do not "improve" this;
  // it must keep matching what was already computed/stored for old check-ins).
  if (!sleepQuality && restedScore == null && energyScore == null && clarityScore == null) return null;
  let score = 0;
  score += ({ poor: 0, okay: 1, good: 2.5, great: 4 }[sleepQuality] ?? 1.5);
  score += (((restedScore ?? 5) - 1) / 9) * 3;
  score += (((energyScore ?? 5) - 1) / 9) * 3;
  score += (((clarityScore ?? 5) - 1) / 9) * 3;
  if (sleepDuration != null) {
    if (sleepDuration >= 8) score += 1;
    else if (sleepDuration >= 7) score += 0.6;
    else if (sleepDuration >= 6) score += 0.2;
  }
  const pct = Math.min(1, score / 14);
  const pctInt = Math.round(pct * 100);
  if (!isFinite(pctInt)) return { label: "Moderate", color: "#f59e0b", pct: 50 };
  if (pct >= 0.72) return { label: "High", color: "#22c55e", pct: pctInt };
  if (pct >= 0.45) return { label: "Moderate", color: "#f59e0b", pct: pctInt };
  if (pct >= 0.25) return { label: "Low", color: "#ef4444", pct: pctInt };
  return { label: "Recovery", color: "#8b5cf6", pct: pctInt };
}
