// Learns the user's OWN normal ranges from their real history, instead of
// comparing them to a generic population average. Every function here is
// pure and degrades to `null`/`hasData:false` on thin data rather than
// guessing — a baseline built from 2 nights is worse than no baseline.
//
// Consumed by: the Status Page metric explanations (buildStatusProps.js /
// the AI-narrative layer) and Atlas's/Planner's system prompts, so "you
// normally sleep 7h18m" phrasing is consistent everywhere it appears.

const MIN_NIGHTS_FOR_BASELINE = 5;
const MIN_DAYS_FOR_STEPS_BASELINE = 5;
const MIN_DAYS_FOR_DEEP_WORK_BASELINE = 7;

function average(nums) { return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null; }

export function computeSleepBaseline(sleepSessions = []) {
  const nights = sleepSessions.filter((s) => s.asleepMinutes > 0);
  if (nights.length < MIN_NIGHTS_FOR_BASELINE) return { hasData: false };
  const avgMinutes = average(nights.map((s) => s.asleepMinutes));
  return {
    hasData: true,
    avgMinutes: Math.round(avgMinutes),
    nightsUsed: nights.length,
  };
}

export function computeStepsBaseline(activityHistory = []) {
  const days = activityHistory.filter((d) => d.steps > 0);
  if (days.length < MIN_DAYS_FOR_STEPS_BASELINE) return { hasData: false };
  return {
    hasData: true,
    avgSteps: Math.round(average(days.map((d) => d.steps))),
    daysUsed: days.length,
  };
}

// "Deep Work block" = a completed task the user themselves marked as
// high-complexity — the closest existing first-class concept to "deep work"
// in this app's data model (there's no separate deep-work-session entity).
export function computeDeepWorkBaseline(tasks = [], days = 30) {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - days); cutoff.setHours(0, 0, 0, 0);
  const completedHard = tasks.filter((t) =>
    t.completed && t.complexity === "hard" && t.date && new Date(t.date) >= cutoff
  );
  const byDate = new Map();
  for (const t of completedHard) byDate.set(t.date, (byDate.get(t.date) ?? 0) + 1);
  const activeDayCount = new Set(tasks.filter((t) => t.date && new Date(t.date) >= cutoff).map((t) => t.date)).size;
  if (activeDayCount < MIN_DAYS_FOR_DEEP_WORK_BASELINE) return { hasData: false };
  const totalBlocks = completedHard.length;
  return {
    hasData: true,
    avgPerDay: Math.round((totalBlocks / activeDayCount) * 10) / 10,
    daysUsed: activeDayCount,
  };
}

// Correlates real sleep duration against how rested the user reported
// feeling that same morning (dailyMetrics[date].restedScore, a 1-10 self-
// report already collected by every Morning Check-Up) — the closest real,
// already-collected "how good did today feel" signal available, bucketed
// by duration to find which range the user's own history says works best
// for them specifically, not a textbook 8-hour rule.
const DURATION_BUCKETS = [
  { label: "under 6h", min: 0, max: 360 },
  { label: "6-7h", min: 360, max: 420 },
  { label: "7-7.5h", min: 420, max: 450 },
  { label: "7.5-8h", min: 450, max: 480 },
  { label: "8h+", min: 480, max: Infinity },
];

export function computeBestSleepDurationForFeeling(sleepSessions = [], dailyMetrics = {}) {
  const paired = sleepSessions
    .map((s) => {
      const restedScore = dailyMetrics[s.date]?.restedScore;
      return restedScore != null ? { minutes: s.asleepMinutes, restedScore } : null;
    })
    .filter(Boolean);
  if (paired.length < MIN_NIGHTS_FOR_BASELINE) return { hasData: false };

  const bucketed = DURATION_BUCKETS.map((b) => {
    const inBucket = paired.filter((p) => p.minutes >= b.min && p.minutes < b.max);
    return inBucket.length >= 2 ? { ...b, avgRested: average(inBucket.map((p) => p.restedScore)), count: inBucket.length } : null;
  }).filter(Boolean);
  if (!bucketed.length) return { hasData: false };

  const best = bucketed.reduce((a, b) => (b.avgRested > a.avgRested ? b : a));
  return { hasData: true, bestRangeLabel: best.label, avgRestedInRange: Math.round(best.avgRested * 10) / 10, sampleSize: best.count };
}

function formatHoursMinutes(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  return `${h}h ${m}m`;
}

// One consolidated object + ready-to-display sentences, so callers (the AI
// prompt builders, the Status Page) don't each re-derive the same phrasing.
export function buildPersonalBaseline({ sleepSessions = [], activityHistory = [], tasks = [], dailyMetrics = {} }) {
  const sleep = computeSleepBaseline(sleepSessions);
  const steps = computeStepsBaseline(activityHistory);
  const deepWork = computeDeepWorkBaseline(tasks);
  const bestFeeling = computeBestSleepDurationForFeeling(sleepSessions, dailyMetrics);

  const sentences = [];
  if (sleep.hasData) sentences.push(`Normally sleeps ${formatHoursMinutes(sleep.avgMinutes)}.`);
  if (deepWork.hasData) sentences.push(`Normally completes ${deepWork.avgPerDay} Deep Work block${deepWork.avgPerDay === 1 ? "" : "s"} a day.`);
  if (steps.hasData) sentences.push(`Normally walks ${steps.avgSteps.toLocaleString()} steps a day.`);
  if (bestFeeling.hasData) sentences.push(`Tends to feel best after ${bestFeeling.bestRangeLabel} of sleep.`);

  return { sleep, steps, deepWork, bestFeeling, sentences };
}
