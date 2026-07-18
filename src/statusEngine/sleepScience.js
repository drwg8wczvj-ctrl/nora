// ── Sleep-science estimates (NaN-safe, pure, synchronous) ───────────────────
// Every estimate here is derived from self-reported check-up answers plus
// recent history — there is no wearable connected today. Each function
// returns an envelope { value, unit, source, confidence, ...extra } rather
// than a bare number, because (unlike e.g. travel-time estimates elsewhere in
// this app) the UI must visibly label these as estimates, not measurements.
//
// Future wearable integration point (not built yet): a `fetchSleepAnalysis()`
// in a new src/health/ domain folder would call Apple Health/Garmin/Oura/Whoop,
// tag results `source: "measured:<provider>"`, and fall back to
// `computeSleepAnalysis()` below on any failure/no-integration — mirroring
// src/location/RouteEstimationService.js's estimateTravelMinutes/
// fetchTravelMinutes fallback pair exactly. Every downstream consumer only
// ever reads `.value`, so that swap requires no UI/consumer changes.

export const CONFIDENCE = { LOW: "LOW", MEDIUM: "MEDIUM", HIGH: "HIGH" };

function makeEstimate(value, unit, confidence, extra = {}) {
  return { value, unit, source: "estimate:self_report", confidence, ...extra };
}

function timeToMinutes(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function stdDevOf(values) {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length);
}

// ── Sleep duration ───────────────────────────────────────────────────────────
export function estimateSleepDuration(bedtime, wakeTime) {
  if (!bedtime || !wakeTime) return null;
  const bMin = timeToMinutes(bedtime);
  const wMin = timeToMinutes(wakeTime);
  if (bMin == null || wMin == null) return null;
  let mins = wMin - bMin;
  if (mins < 0) mins += 24 * 60;
  const hours = Math.round((mins / 60) * 10) / 10;
  return makeEstimate(hours, "hours", CONFIDENCE.HIGH); // direct arithmetic on self-reported times, not modeled
}

// ── Sleep cycles (~90 min) ───────────────────────────────────────────────────
export function estimateSleepCycles(durationHours) {
  if (durationHours == null) return null;
  const minutes = durationHours * 60;
  const wholeCycles = Math.floor(minutes / 90);
  const value = Math.round((minutes / 90) * 10) / 10;
  // Capped LOW forever — the 90-min assumption (real cycles run ~70-120min
  // and vary through the night) is a structural limitation more data can't fix.
  return makeEstimate(value, "cycles", CONFIDENCE.LOW, { wholeCycles, cycleRangeMinutes: [70, 120] });
}

// ── Sleep efficiency (quality proxy — never a measured %) ───────────────────
export function estimateSleepEfficiency({ sleepQuality, restedScore }) {
  if (!sleepQuality && restedScore == null) return null;
  const base = { poor: 78, okay: 87, good: 93, great: 96 }[sleepQuality] ?? 85;
  const nudge = restedScore != null ? (restedScore - 5) * 0.6 : 0;
  const value = Math.round(Math.max(60, Math.min(98, base + nudge)));
  // Capped LOW forever — a real efficiency % needs wake-after-sleep-onset
  // data (a wearable), which this proxy structurally cannot provide.
  return makeEstimate(value, "%", CONFIDENCE.LOW);
}

// ── Sleep debt ───────────────────────────────────────────────────────────────
export function estimateSleepDebt(recentDurationsHours = [], idealHours = 8) {
  const valid = recentDurationsHours.filter((h) => h != null);
  if (!valid.length) return null;
  const debt = valid.reduce((sum, h) => sum + Math.max(0, idealHours - h), 0);
  const confidence = valid.length >= 7 ? CONFIDENCE.MEDIUM : CONFIDENCE.LOW; // self-reported times, never HIGH
  return makeEstimate(Math.round(debt * 10) / 10, "hours", confidence, { nightsCounted: valid.length, idealHours });
}

// ── Sleep consistency (duration variability) ────────────────────────────────
export function estimateSleepConsistency(recentDurationsHours = []) {
  const valid = recentDurationsHours.filter((h) => h != null);
  if (valid.length < 3) return null;
  const stdDev = stdDevOf(valid);
  const value = Math.round(Math.max(0, Math.min(100, 100 - stdDev * 40)));
  const confidence = valid.length >= 7 ? CONFIDENCE.MEDIUM : CONFIDENCE.LOW;
  return makeEstimate(value, "score", confidence, { nightsCounted: valid.length, stdDevHours: Math.round(stdDev * 10) / 10 });
}

// ── Sleep regularity (bedtime + wake-time timing variability) ──────────────
export function estimateSleepRegularity(recentNights = []) {
  const bedtimes = recentNights.map((n) => timeToMinutes(n.bedtime)).filter((v) => v != null);
  const wakeTimes = recentNights.map((n) => timeToMinutes(n.wakeTime)).filter((v) => v != null);
  if (bedtimes.length < 3 || wakeTimes.length < 3) return null;
  const avgStdDevMin = (stdDevOf(bedtimes) + stdDevOf(wakeTimes)) / 2;
  const value = Math.round(Math.max(0, Math.min(100, 100 - avgStdDevMin / 2)));
  return makeEstimate(value, "score", CONFIDENCE.MEDIUM, { nightsCounted: Math.min(bedtimes.length, wakeTimes.length) });
}

// ── Circadian consistency (wake-time regularity specifically — the dominant
// circadian anchor in chronobiology, distinct from full-schedule regularity) ─
export function estimateCircadianConsistency(recentNights = []) {
  const wakeTimes = recentNights.map((n) => timeToMinutes(n.wakeTime)).filter((v) => v != null);
  if (wakeTimes.length < 3) return null;
  const value = Math.round(Math.max(0, Math.min(100, 100 - stdDevOf(wakeTimes) / 1.5)));
  return makeEstimate(value, "score", CONFIDENCE.MEDIUM, { nightsCounted: wakeTimes.length, scope: "wake_time_only" });
}

// ── Recommended bedtime tonight ──────────────────────────────────────────────
export function recommendBedtimeTonight({ wakeAnchorMinutes, idealHours = 8, sleepDebtHours = 0 }) {
  if (wakeAnchorMinutes == null) return null;
  const cappedDebtRepayment = Math.min(sleepDebtHours, 1.5);
  const targetSleepHours = idealHours + cappedDebtRepayment;
  let bedMinutes = wakeAnchorMinutes - targetSleepHours * 60;
  bedMinutes = ((bedMinutes % 1440) + 1440) % 1440;
  const label = `${String(Math.floor(bedMinutes / 60)).padStart(2, "0")}:${String(Math.round(bedMinutes % 60)).padStart(2, "0")}`;
  return makeEstimate(label, "HH:MM", CONFIDENCE.MEDIUM, { targetSleepHours: Math.round(targetSleepHours * 10) / 10 });
}

// ── Cognitive performance prediction ────────────────────────────────────────
export function predictCognitivePerformance({ sleepDurationHours, sleepDebtHours, clarityScore, energyScore, recoveryScore }) {
  let score = 50;
  if (sleepDurationHours != null) score += (sleepDurationHours - 7) * 8;
  if (sleepDebtHours != null) score -= Math.min(30, sleepDebtHours * 4);
  if (clarityScore != null) score += (clarityScore - 5) * 4;
  if (energyScore != null) score += (energyScore - 5) * 3;
  if (recoveryScore != null) score += (recoveryScore - 50) * 0.2;
  const value = Math.round(Math.max(0, Math.min(100, score)));
  const bucket = value >= 70 ? "high" : value >= 45 ? "moderate" : "low";
  return makeEstimate(value, "score", CONFIDENCE.MEDIUM, { bucket });
}

// ── Mental fatigue risk ──────────────────────────────────────────────────────
export function predictMentalFatigueRisk({ sleepDebtHours, recoveryStateLevel, todaysWorkloadLevel, restedScore }) {
  let risk = 20;
  if (sleepDebtHours != null) risk += Math.min(35, sleepDebtHours * 6);
  risk += ({ burnout: 35, recovery: 22, high: 10, mild: 3, stable: 0 })[recoveryStateLevel] ?? 0;
  risk += ({ heavy: 15, moderate: 6, light: 0, free: 0 })[todaysWorkloadLevel] ?? 0;
  if (restedScore != null) risk += Math.max(0, (5 - restedScore) * 4);
  const value = Math.round(Math.max(0, Math.min(100, risk)));
  const bucket = value >= 65 ? "high" : value >= 35 ? "moderate" : "low";
  return makeEstimate(value, "score", CONFIDENCE.MEDIUM, { bucket });
}

// ── Mood-prediction confidence ───────────────────────────────────────────────
// This IS the confidence — the brief explicitly wants confidence ABOUT
// predicting mood, not a synthesized mood value (no direct mood signal
// exists anywhere in this codebase to ground one).
export function estimateMoodPredictionConfidence({
  dailyMetricsSampleSize = 0, hasRecentWellbeingSignal = false,
  emotionalDriftFlaggedToday = false, signalsAgree = false,
}) {
  let level = "EXPERIMENTAL";
  if (dailyMetricsSampleSize >= 40) level = "HIGH";
  else if (dailyMetricsSampleSize >= 15) level = "MEDIUM";

  const reasons = [];
  if (dailyMetricsSampleSize < 15) reasons.push("Still building your history — this gets sharper with more days logged.");
  if (hasRecentWellbeingSignal) reasons.push("A recent reflective conversation is factored in.");
  if (emotionalDriftFlaggedToday) reasons.push("Today's weekday has shown a consistent pattern before.");
  if (signalsAgree) reasons.push("Multiple signals point the same direction today.");

  return { level, reasons };
}

// ── Recent-nights adapter ────────────────────────────────────────────────────
// Shared by MorningCheckup.js (building today's analysis at completion time)
// and useStatusEngine.js (building it live for the Status page) — both need
// the same trailing history shape from the same dailyMetrics store.
export function buildRecentNights(dailyMetrics = {}, today, count = 14) {
  return Object.entries(dailyMetrics)
    .filter(([date]) => date < today)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-count)
    .map(([, m]) => ({ bedtime: m.bedtime ?? null, wakeTime: m.wakeTime ?? null, sleepDurationHours: m.sleepDurationHours ?? null }));
}

// ── Orchestrator — everything above, composed into one bundle ──────────────
// Called once, at check-up completion, when all self-report answers are
// available. `recentNights` is trailing history from dailyMetrics:
// [{ bedtime, wakeTime, sleepDurationHours }], oldest first, NOT including today.
export function computeSleepAnalysis({
  bedtime, wakeTime, sleepQuality, restedScore, energyScore, clarityScore,
  recentNights = [], idealHours = 8,
  recoveryScore = null, recoveryStateLevel = null, todaysWorkloadLevel = null,
}) {
  const duration = estimateSleepDuration(bedtime, wakeTime);
  const durationHours = duration?.value ?? null;

  const recentDurations = recentNights.map((n) => n.sleepDurationHours).filter((v) => v != null);
  const allDurations = durationHours != null ? [...recentDurations, durationHours] : recentDurations;

  const debt = estimateSleepDebt(allDurations, idealHours);
  const wakeAnchorMinutes = timeToMinutes(wakeTime)
    ?? recentNights.map((n) => timeToMinutes(n.wakeTime)).filter((v) => v != null).slice(-1)[0]
    ?? 7 * 60;

  return {
    duration,
    cycles: estimateSleepCycles(durationHours),
    efficiency: estimateSleepEfficiency({ sleepQuality, restedScore }),
    debt,
    consistency: estimateSleepConsistency(allDurations),
    regularity: estimateSleepRegularity(recentNights),
    circadian: estimateCircadianConsistency(recentNights),
    recommendedBedtime: recommendBedtimeTonight({ wakeAnchorMinutes, idealHours, sleepDebtHours: debt?.value ?? 0 }),
    cognitivePerformance: predictCognitivePerformance({ sleepDurationHours: durationHours, sleepDebtHours: debt?.value ?? null, clarityScore, energyScore, recoveryScore }),
    mentalFatigueRisk: predictMentalFatigueRisk({ sleepDebtHours: debt?.value ?? null, recoveryStateLevel, todaysWorkloadLevel, restedScore }),
  };
}
