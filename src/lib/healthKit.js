// ── Apple Health (HealthKit) data layer ─────────────────────────────────────
//
// Thin typed wrappers around the native HealthKit plugin (src/plugins/
// HealthKit.js), plus the normalization/aggregation logic that turns raw
// samples into the shapes the rest of the app actually wants: a night's
// sleep session, a week of activity, a heart-metrics trend, etc.
//
// Everything here is read-only and runs entirely on-device — no health
// sample is ever sent to Supabase or any server; only the small, already-
// aggregated numbers this module computes (e.g. "sleepScore: 82") are ever
// allowed to leave this file into app state, per the privacy requirement
// that raw health data stays local.
//
// Adding a new HealthKit metric: add its key to HealthKitTypes.swift's
// registry, then either call queryQuantityStatistics/queryQuantitySamples
// directly with that key (no new native code) or add a small compute
// function here if it needs its own aggregation logic.

import { HealthKit } from "../plugins/HealthKit";

export const HEALTH_CATEGORIES = ["sleep", "activity", "heart", "mindfulness", "vo2max", "respiratory"];

export const HEALTH_CATEGORY_META = {
  sleep:       { label: "Sleep",       description: "Bedtime, wake time, and time asleep — powers Morning Check-Up prefill and sleep insights." },
  activity:    { label: "Activity",    description: "Steps, walking distance, active energy, exercise minutes, and workouts." },
  heart:       { label: "Heart",       description: "Resting heart rate, walking heart rate, and heart rate variability (recovery signals)." },
  mindfulness: { label: "Mindfulness", description: "Meditation and mindful-minute sessions." },
  vo2max:      { label: "Cardio Fitness (VO₂ Max)", description: "Your cardio fitness level, when your device records it." },
  respiratory: { label: "Respiratory Rate", description: "Breaths per minute recorded during sleep." },
};

const iso = (d) => d.toISOString();
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const clampNonNegative = (n) => Math.max(0, n);

export async function isHealthAvailable() {
  const { available } = await HealthKit.isAvailable();
  return available;
}

export async function requestHealthAuthorization(categories) {
  const { granted } = await HealthKit.requestAuthorization({ categories });
  return granted;
}

// See HealthKitManager.swift's note on requestedStatus — this reports
// "has the OS permission sheet been shown for every type in this category",
// not "did the user say yes". It's the best on-device signal available;
// combined with whether a query has ever actually returned data (tracked by
// the caller), it's what the Settings UI shows as "Connected".
export async function getHealthRequestedStatus(categories) {
  const { status } = await HealthKit.getRequestedStatus({ categories });
  return status;
}

// ── Sleep ────────────────────────────────────────────────────────────────
// HKCategoryValueSleepAnalysis raw values: 0=inBed, 1=asleep(unspecified),
// 2=awake, 3=asleepCore, 4=asleepDeep, 5=asleepREM.
const SLEEP_VALUE = { IN_BED: 0, ASLEEP_UNSPECIFIED: 1, AWAKE: 2, ASLEEP_CORE: 3, ASLEEP_DEEP: 4, ASLEEP_REM: 5 };
const ASLEEP_VALUES = new Set([SLEEP_VALUE.ASLEEP_UNSPECIFIED, SLEEP_VALUE.ASLEEP_CORE, SLEEP_VALUE.ASLEEP_DEEP, SLEEP_VALUE.ASLEEP_REM]);

function overlapMinutes(sampleStart, sampleEnd) {
  return (new Date(sampleEnd) - new Date(sampleStart)) / 60000;
}

// Groups raw sleepAnalysis samples into one entry per night, keyed by the
// wake-up date (a sample ending before 2pm belongs to the night before that
// date; this is the standard "sleep day = the day you woke up" convention).
function groupSamplesByNight(samples) {
  const nights = new Map();
  for (const s of samples) {
    const end = new Date(s.end);
    const nightKey = fmtDate(end.getHours() < 14 ? end : addDays(end, 1));
    if (!nights.has(nightKey)) nights.set(nightKey, []);
    nights.get(nightKey).push(s);
  }
  return nights;
}

function fmtDate(d) {
  const x = startOfDay(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

function computeSleepSession(samples) {
  if (!samples.length) return null;
  let inBedMin = 0, asleepMin = 0;
  let bedtime = null, wakeTime = null;
  for (const s of samples) {
    const start = new Date(s.start), end = new Date(s.end);
    if (!bedtime || start < bedtime) bedtime = start;
    if (!wakeTime || end > wakeTime) wakeTime = end;
    if (s.value === SLEEP_VALUE.IN_BED) inBedMin += overlapMinutes(s.start, s.end);
    else if (ASLEEP_VALUES.has(s.value)) asleepMin += overlapMinutes(s.start, s.end);
  }
  // Some sources (notably Apple Watch) only log asleep/awake stages, never
  // an explicit inBed sample — fall back to the full bedtime→wake span.
  if (inBedMin === 0 && wakeTime && bedtime) inBedMin = overlapMinutes(bedtime, wakeTime);
  if (asleepMin === 0 && inBedMin > 0) asleepMin = inBedMin; // no stage data at all, e.g. a manual/basic source
  return {
    bedtime, wakeTime,
    inBedMinutes: Math.round(inBedMin),
    asleepMinutes: Math.round(asleepMin),
  };
}

// One session per night for the last `days` nights, most recent first.
// Nights with no data are simply absent (not zero-filled) so averages don't
// get dragged down by days the user didn't wear a watch.
export async function getSleepHistory(days = 30) {
  const end = new Date();
  const start = addDays(startOfDay(end), -days - 1);
  const { samples } = await HealthKit.queryCategorySamples({ type: "sleepAnalysis", startDate: iso(start), endDate: iso(end) });
  const nights = groupSamplesByNight(samples);
  const sessions = [...nights.entries()]
    .map(([date, s]) => ({ date, ...computeSleepSession(s) }))
    .filter((s) => s.asleepMinutes > 0)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  return sessions;
}

function average(nums) { return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null; }
function stdDev(nums) {
  if (nums.length < 2) return null;
  const m = average(nums);
  return Math.sqrt(average(nums.map((n) => (n - m) ** 2)));
}
// Bedtime/wake time as "minutes since 6pm" so a bedtime of 11pm and 1am
// compare sensibly (without this, 23:00 and 01:00 look ~22h apart instead
// of ~2h apart) — used only for consistency's standard-deviation math.
function minutesSince6pm(date) {
  const h = date.getHours() + date.getMinutes() / 60;
  return ((h - 18 + 24) % 24) * 60;
}

const SLEEP_TARGET_MINUTES = 8 * 60;

// The single sleep summary object consumed by Morning Check-Up, the Status
// Page's Sleep card, Nora Insights, and the AI context — computed once here
// so every consumer agrees on the same numbers.
export function computeSleepStats(sessions) {
  if (!sessions.length) {
    return { hasData: false };
  }
  const last = sessions[0];
  const last7 = sessions.slice(0, 7);
  const prior7 = sessions.slice(7, 14);
  const last30 = sessions.slice(0, 30);

  const weeklyAvgMinutes = average(last7.map((s) => s.asleepMinutes));
  const monthlyAvgMinutes = last30.length >= 5 ? average(last30.map((s) => s.asleepMinutes)) : null;
  const priorWeeklyAvgMinutes = prior7.length ? average(prior7.map((s) => s.asleepMinutes)) : null;

  const bedtimeConsistencyStdMin = stdDev(last7.map((s) => minutesSince6pm(s.bedtime)));
  // Under 30 min stdev = "excellent", under 60 = "good", else "irregular" —
  // thresholds chosen to match how sleep-tracking apps typically bucket this.
  const consistencyLabel =
    bedtimeConsistencyStdMin == null ? null
    : bedtimeConsistencyStdMin <= 30 ? "excellent"
    : bedtimeConsistencyStdMin <= 60 ? "good"
    : "irregular";

  const debtMinutes = clampNonNegative(last7.reduce((sum, s) => sum + Math.max(0, SLEEP_TARGET_MINUTES - s.asleepMinutes), 0));

  const trend =
    priorWeeklyAvgMinutes == null || weeklyAvgMinutes == null ? null
    : weeklyAvgMinutes - priorWeeklyAvgMinutes > 15 ? "improving"
    : priorWeeklyAvgMinutes - weeklyAvgMinutes > 15 ? "declining"
    : "stable";

  return {
    hasData: true,
    last: { date: last.date, bedtime: last.bedtime, wakeTime: last.wakeTime, asleepMinutes: last.asleepMinutes, inBedMinutes: last.inBedMinutes },
    weeklyAvgMinutes, monthlyAvgMinutes, priorWeeklyAvgMinutes,
    bedtimeConsistencyStdMin, consistencyLabel,
    debtMinutes,
    trend,
    nightsTracked7d: last7.length,
  };
}

export async function getSleepContext(days = 30) {
  const sessions = await getSleepHistory(days);
  return { sessions, stats: computeSleepStats(sessions) };
}

export function formatHoursMinutes(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  return `${h}h ${m}m`;
}

// The exact short, comparative sentences Morning Check-Up (and the Status
// Page) show under a night's sleep — e.g. "You slept 7h 42m.", "You woke up
// 28 minutes earlier than your average." Centralized here so every surface
// that talks about last night's sleep says the same thing the same way.
export function buildSleepCheckupInsights(sessions, stats) {
  if (!stats?.hasData) return [];
  const lines = [`You slept ${formatHoursMinutes(stats.last.asleepMinutes)}.`];

  const yesterday = sessions[1];
  if (yesterday) {
    const diff = stats.last.asleepMinutes - yesterday.asleepMinutes;
    if (diff > 20) lines.push("You slept more than yesterday.");
    else if (diff < -20) lines.push("You slept less than yesterday.");
  }

  if (stats.last.wakeTime && sessions.length > 1) {
    const avgWakeMinsSince6pm = average(sessions.slice(0, 7).map((s) => minutesSince6pm(s.wakeTime)));
    const lastWakeMinsSince6pm = minutesSince6pm(stats.last.wakeTime);
    const diffMin = Math.round(avgWakeMinsSince6pm - lastWakeMinsSince6pm); // positive = woke up earlier than average
    if (Math.abs(diffMin) >= 10) {
      lines.push(diffMin > 0
        ? `You woke up ${diffMin} minutes earlier than your average.`
        : `You woke up ${Math.abs(diffMin)} minutes later than your average.`);
    }
  }

  if (stats.consistencyLabel) {
    lines.push(
      stats.consistencyLabel === "excellent" ? "Your sleep consistency is excellent."
      : stats.consistencyLabel === "good" ? "Your sleep consistency is good."
      : "Your bedtime has been irregular lately."
    );
  }

  return lines;
}

// ── Activity ─────────────────────────────────────────────────────────────

async function statSum(type, start, end) {
  const { value } = await HealthKit.queryQuantityStatistics({ type, startDate: iso(start), endDate: iso(end), aggregation: "sum" });
  return value ?? 0;
}

export async function getActivityForDay(date) {
  const start = startOfDay(date);
  const end = addDays(start, 1);
  const [steps, distanceMeters, activeEnergyKcal, exerciseMinutes, flights] = await Promise.all([
    statSum("stepCount", start, end),
    statSum("distanceWalkingRunning", start, end),
    statSum("activeEnergyBurned", start, end),
    statSum("appleExerciseTime", start, end),
    statSum("flightsClimbed", start, end),
  ]);
  return { date: fmtDate(start), steps, distanceMeters, activeEnergyKcal, exerciseMinutes, flights };
}

export async function getActivityHistory(days = 14) {
  const today = startOfDay(new Date());
  const dates = Array.from({ length: days }, (_, i) => addDays(today, -i));
  return Promise.all(dates.map(getActivityForDay));
}

export async function getWorkouts(days = 14) {
  const end = new Date();
  const start = addDays(startOfDay(end), -days);
  const { workouts } = await HealthKit.queryWorkouts({ startDate: iso(start), endDate: iso(end) });
  return workouts;
}

export function computeActivityStats(history) {
  if (!history.length) return { hasData: false };
  const today = history[0];
  const last7 = history.slice(0, 7);
  const prior7 = history.slice(7, 14);
  const weeklyAvgSteps = average(last7.map((d) => d.steps));
  const priorWeeklyAvgSteps = prior7.length ? average(prior7.map((d) => d.steps)) : null;
  const trend =
    priorWeeklyAvgSteps == null || weeklyAvgSteps == null ? null
    : weeklyAvgSteps - priorWeeklyAvgSteps > priorWeeklyAvgSteps * 0.1 ? "up"
    : priorWeeklyAvgSteps - weeklyAvgSteps > priorWeeklyAvgSteps * 0.1 ? "down"
    : "flat";
  return {
    hasData: true,
    today,
    weeklyAvgSteps, priorWeeklyAvgSteps,
    weeklyTotalActiveEnergyKcal: last7.reduce((sum, d) => sum + d.activeEnergyKcal, 0),
    weeklyTotalExerciseMinutes: last7.reduce((sum, d) => sum + d.exerciseMinutes, 0),
    trend,
  };
}

export async function getActivityContext(days = 14) {
  const [history, workouts] = await Promise.all([getActivityHistory(days), getWorkouts(days)]);
  return { history, workouts, stats: computeActivityStats(history) };
}

// ── Heart ────────────────────────────────────────────────────────────────

async function statAverage(type, start, end) {
  const { value } = await HealthKit.queryQuantityStatistics({ type, startDate: iso(start), endDate: iso(end), aggregation: "average" });
  return value ?? null;
}

export async function getHeartContext(days = 14) {
  const end = new Date();
  const recentStart = addDays(startOfDay(end), -3); // last 3 days = "recent" for a responsive recovery read
  const priorStart = addDays(startOfDay(end), -days);

  const [restingRecent, restingPrior, hrvRecent, hrvPrior, walkingRecent] = await Promise.all([
    statAverage("restingHeartRate", recentStart, end),
    statAverage("restingHeartRate", priorStart, recentStart),
    statAverage("heartRateVariabilitySDNN", recentStart, end),
    statAverage("heartRateVariabilitySDNN", priorStart, recentStart),
    statAverage("walkingHeartRateAverage", recentStart, end),
  ]);

  const hasData = [restingRecent, hrvRecent, walkingRecent].some((v) => v != null);
  if (!hasData) return { hasData: false };

  // Lower resting HR and higher HRV both generally indicate better recovery.
  const restingTrend = restingRecent == null || restingPrior == null ? null
    : restingRecent - restingPrior < -1.5 ? "improving"
    : restingRecent - restingPrior > 1.5 ? "declining"
    : "stable";
  const hrvTrend = hrvRecent == null || hrvPrior == null ? null
    : hrvRecent - hrvPrior > hrvPrior * 0.08 ? "improving"
    : hrvPrior - hrvRecent > hrvPrior * 0.08 ? "declining"
    : "stable";

  return {
    hasData: true,
    restingHeartRate: restingRecent, restingHeartRateTrend: restingTrend,
    heartRateVariability: hrvRecent, heartRateVariabilityTrend: hrvTrend,
    walkingHeartRate: walkingRecent,
  };
}

// ── Mindfulness ──────────────────────────────────────────────────────────

export async function getMindfulnessContext(days = 7) {
  const end = new Date();
  const start = addDays(startOfDay(end), -days);
  const { samples } = await HealthKit.queryCategorySamples({ type: "mindfulSession", startDate: iso(start), endDate: iso(end) });
  if (!samples.length) return { hasData: false, sessions: 0, totalMinutes: 0 };
  const totalMinutes = Math.round(samples.reduce((sum, s) => sum + overlapMinutes(s.start, s.end), 0));
  return { hasData: true, sessions: samples.length, totalMinutes };
}

// ── VO2 Max / Respiratory (optional metrics) ──────────────────────────────

export async function getVo2MaxContext() {
  const end = new Date();
  const start = addDays(startOfDay(end), -90); // VO2max updates infrequently — look back further
  const { samples } = await HealthKit.queryQuantitySamples({ type: "vo2Max", startDate: iso(start), endDate: iso(end) });
  if (!samples.length) return { hasData: false };
  const latest = samples[samples.length - 1];
  return { hasData: true, value: latest.value, date: latest.end };
}

export async function getRespiratoryContext(days = 7) {
  const end = new Date();
  const start = addDays(startOfDay(end), -days);
  const value = await statAverage("respiratoryRate", start, end);
  return value == null ? { hasData: false } : { hasData: true, averageBreathsPerMinute: value };
}

// ── Consolidated context — the single call the rest of the app makes ─────
//
// Only fetches categories the user has enabled (see healthPrefs.js), and
// degrades gracefully (hasData: false) for anything HealthKit has no
// samples for yet — callers should always check hasData before using a
// section, never assume it's populated.
export async function fetchHealthContext(enabledCategories) {
  const enabled = new Set(enabledCategories);
  const [sleep, activity, heart, mindfulness, vo2max, respiratory] = await Promise.all([
    enabled.has("sleep") ? getSleepContext(30) : Promise.resolve({ sessions: [], stats: { hasData: false } }),
    enabled.has("activity") ? getActivityContext(14) : Promise.resolve({ history: [], workouts: [], stats: { hasData: false } }),
    enabled.has("heart") ? getHeartContext(14) : Promise.resolve({ hasData: false }),
    enabled.has("mindfulness") ? getMindfulnessContext(7) : Promise.resolve({ hasData: false }),
    enabled.has("vo2max") ? getVo2MaxContext() : Promise.resolve({ hasData: false }),
    enabled.has("respiratory") ? getRespiratoryContext(7) : Promise.resolve({ hasData: false }),
  ]);
  return { sleep, activity, heart, mindfulness, vo2max, respiratory, fetchedAt: new Date().toISOString() };
}
