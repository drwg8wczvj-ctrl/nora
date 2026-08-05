// Pure, deterministic "Morning Briefing" content — the greeting, personalized
// facts, and sleep goal-vs-actual shown BEFORE any question is asked. Every
// fact here is derived from real data (HealthKit + personal baseline +
// planner history); nothing is invented, and a fact is simply omitted when
// the underlying data doesn't exist. AI enhancement (natural-language polish
// of the greeting/analysis) happens separately via /api/tips's "morning"
// branch — this module is what keeps the experience fully working and
// instant even when that call is slow or unavailable.

import { computeUsualSleepTimes } from "../lib/healthKit";

function fmtClock(date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ── Sleep Goal vs Actual ─────────────────────────────────────────────────
// Apple doesn't expose the Health app's configured Sleep Schedule goal via
// any public HealthKit API (confirmed — see lib/healthKit.js's own note) —
// "Goal" here is honestly the user's own real recent-history average, never
// Apple's configured target. "Actual" is last night's real recorded times.
export function buildSleepGoalVsActual({ health }) {
  const ctx = health?.context;
  const stats = ctx?.sleep?.stats;
  const sessions = ctx?.sleep?.sessions ?? [];
  if (!stats?.hasData) return null;

  const usual = computeUsualSleepTimes(sessions);
  const last = stats.last;

  return {
    goal: usual ? { bedtime: usual.usualBedtime, wake: usual.usualWakeTime, nightsUsed: usual.nightsUsed } : null,
    actual: last?.bedtime && last?.wakeTime ? { bedtime: fmtClock(last.bedtime), wake: fmtClock(last.wakeTime) } : null,
  };
}

// ── Dynamic Atlas greeting ───────────────────────────────────────────────
// A handful of real, distinct branches keyed off actual signals — never one
// fixed string. The AI layer (api/tips.js) can further vary the phrasing;
// this heuristic version is what renders instantly, with zero network wait.
export function buildMorningGreeting({ healthSummary, recoveryTrendDeclining3d, recoveryState } = {}) {
  if (recoveryTrendDeclining3d) {
    return ["Good morning.", "I noticed your recovery has been declining for a few days — let's take it a little easier today."];
  }
  if (healthSummary?.recoveryScore != null && healthSummary.recoveryScore >= 75) {
    return ["Good morning.", "I noticed something interesting about your recovery today."];
  }
  if (healthSummary?.sleepTrend === "improving") {
    return ["Good morning.", "Your sleep has been trending in the right direction — I've already prepared today's briefing."];
  }
  if (recoveryState?.level === "burnout" || recoveryState?.level === "recovery") {
    return ["Good morning.", "Today looks like a good day to protect your energy — here's what I'm seeing."];
  }
  return ["Good morning.", "I've already prepared today's briefing."];
}

// ── Personalized facts ───────────────────────────────────────────────────
// Real, universally-recognizable distance comparisons — never a hardcoded
// local landmark, since the user's actual city can't be verified here.
const DISTANCE_COMPARISONS = [
  { km: 42.2, label: "a full marathon" },
  { km: 21.1, label: "a half marathon" },
  { km: 10, label: "a 10k race" },
  { km: 5, label: "a 5k run" },
  { km: 1.6, label: "a mile" },
];
function distanceComparison(km) {
  const match = DISTANCE_COMPARISONS.find((c) => km >= c.km * 0.85);
  if (!match) return null;
  const ratio = km / match.km;
  return ratio >= 0.85 && ratio <= 1.25 ? `roughly ${match.label}` : `about ${Math.round(ratio * 10) / 10}x ${match.label}`;
}

// Consecutive real nights (most recent first) with a bedtime at/before the
// given hour — a real streak from actual recorded sessions, not a guess.
function consecutiveNightsBefore(sessions = [], hour) {
  let streak = 0;
  for (const s of sessions) {
    if (!s.bedtime) break;
    const h = s.bedtime.getHours() + s.bedtime.getMinutes() / 60;
    if (h <= hour) streak++;
    else break;
  }
  return streak;
}

export function buildMorningFacts({ health, healthSummary, tasks = [], today, dailyMetrics = {} } = {}) {
  const facts = [];
  const ctx = health?.context;
  const sleepStats = ctx?.sleep?.stats;
  const sessions = ctx?.sleep?.sessions ?? [];
  const activity = ctx?.activity;

  if (activity?.stats?.hasData) {
    const steps = Math.round(activity.stats.today.steps ?? 0);
    const km = (activity.stats.today.distanceMeters ?? 0) / 1000;
    if (steps > 0) {
      const cmp = distanceComparison(km);
      facts.push(
        cmp
          ? `You walked ${steps.toLocaleString()} steps yesterday — ${cmp} (${km.toFixed(1)} km).`
          : `You walked ${steps.toLocaleString()} steps yesterday (${km.toFixed(1)} km).`
      );
    }
    if (activity.stats.today.flights >= 3) {
      facts.push(`You've already climbed the equivalent of a ${Math.round(activity.stats.today.flights)}-floor building.`);
    }
  }

  if (sessions.length >= 3) {
    const streak = consecutiveNightsBefore(sessions, 23);
    if (streak >= 3) facts.push(`You've gone to bed before 23:00 for ${streak} night${streak === 1 ? "" : "s"} in a row.`);
  }

  if (sleepStats?.consistencyLabel === "excellent" && sleepStats?.nightsTracked7d >= 5) {
    facts.push("This is one of your steadiest sleep weeks recently.");
  }

  if (healthSummary?.recoveryScore != null && today) {
    const weekday = new Date(today + "T00:00:00").getDay();
    const sameWeekdayScores = Object.entries(dailyMetrics)
      .filter(([date]) => date < today && new Date(date + "T00:00:00").getDay() === weekday)
      .map(([, m]) => m.recoveryScore)
      .filter((v) => v != null);
    if (sameWeekdayScores.length >= 2) {
      const avg = sameWeekdayScores.reduce((s, v) => s + v, 0) / sameWeekdayScores.length;
      const diffPct = Math.round(((healthSummary.recoveryScore - avg) / Math.max(1, avg)) * 100);
      if (Math.abs(diffPct) >= 10) {
        facts.push(`You recovered ${Math.abs(diffPct)}% ${diffPct > 0 ? "better" : "less well"} than your usual ${WEEKDAY_NAMES[weekday]}.`);
      }
    }
  }

  if (healthSummary?.deepWorkBaselinePerDay != null && today) {
    // Local-only date arithmetic — round-tripping through toISOString() (UTC)
    // can shift the calendar date backward whenever the local zone is ahead
    // of UTC (local midnight in UTC+2 is already 22:00 the previous day in
    // UTC). setDate()/getFullYear() etc. operate in local time consistently.
    const yd = new Date(today + "T00:00:00");
    yd.setDate(yd.getDate() - 1);
    const yesterday = `${yd.getFullYear()}-${String(yd.getMonth() + 1).padStart(2, "0")}-${String(yd.getDate()).padStart(2, "0")}`;
    const yesterdayDeepWork = tasks.filter((t) => t.date === yesterday && t.completed && t.complexity === "hard").length;
    if (yesterdayDeepWork > healthSummary.deepWorkBaselinePerDay) {
      facts.push(`You completed ${yesterdayDeepWork} Deep Work block${yesterdayDeepWork === 1 ? "" : "s"} yesterday — above your usual ${healthSummary.deepWorkBaselinePerDay}/day.`);
    }
  }

  if (sleepStats?.hasData && sessions.length >= 2) {
    const lastMin = sessions[0]?.asleepMinutes;
    const priorMin = sessions[1]?.asleepMinutes;
    if (lastMin != null && priorMin != null) {
      const diff = lastMin - priorMin;
      if (Math.abs(diff) >= 45) {
        const cycles = Math.round((Math.abs(diff) / 90) * 10) / 10;
        facts.push(
          diff > 0
            ? `You slept about ${cycles} more 90-minute sleep cycle${cycles === 1 ? "" : "s"} than the night before.`
            : `You slept about ${cycles} fewer 90-minute sleep cycle${cycles === 1 ? "" : "s"} than the night before.`
        );
      }
    }
  }

  return facts.slice(0, 4);
}
