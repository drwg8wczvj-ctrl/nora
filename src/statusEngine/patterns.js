// ── Shared helpers ───────────────────────────────────────────────────────────
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function weekdayOf(dateStr) {
  return new Date(dateStr + "T00:00:00").getDay();
}

// Buckets a date into a week id purely for "how many distinct calendar weeks
// has this weekday shown up in" counting — doesn't need to be ISO-precise,
// just needs to be stable and monotonic.
function weekKeyOf(dateStr) {
  const days = Math.floor(new Date(dateStr + "T00:00:00").getTime() / 86400000);
  return Math.floor(days / 7);
}

function avg(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function extractSeries(entries, key) {
  return entries.map(([, v]) => v[key] ?? null).filter((v) => v != null);
}

// Generic confidence tiering shared by every rule in minePatternsFromHistory.
// Below the EXPERIMENTAL floor there simply isn't enough data to say anything.
export function confidenceTier(sampleSize) {
  if (sampleSize >= 40) return "HIGH";
  if (sampleSize >= 15) return "MEDIUM";
  if (sampleSize >= 5) return "EXPERIMENTAL";
  return null;
}

const CONFIDENCE_RANK = { HIGH: 0, MEDIUM: 1, EXPERIMENTAL: 2 };

// Same keyword ladder as interpretations.js's getMicroStart, but returning a
// category label instead of micro-start copy — used to bucket avoided tasks.
function categorizeTitle(title = "") {
  const tl = title.toLowerCase();
  if (/read|study|learn|review/.test(tl)) return "reading/study";
  if (/write|essay|report|draft/.test(tl)) return "writing";
  if (/code|build|implement|fix|debug/.test(tl)) return "coding";
  if (/email|message|call|reply/.test(tl)) return "communication";
  if (/clean|tidy|organis|organiz/.test(tl)) return "organizing";
  return "general";
}

// ── Pattern mining ───────────────────────────────────────────────────────────
// `mineAllPatterns` is the full, untruncated rule output — callers that need a
// SPECIFIC pattern id regardless of the top-4 confidence cutoff (e.g. the
// adaptive Morning Check-up checking for "poor_sleep_prevalence" even when
// other patterns outrank it) should call this directly. `minePatternsFromHistory`
// stays the existing top-4-by-confidence export so no current caller's
// behavior changes.
export function mineAllPatterns({ tasks, taskWeights = {}, dailyMetrics = {}, today }) {
  const patterns = [];
  const nonBreak = tasks.filter((t) => t.type !== "break");

  // Rule 1 — day-of-week completion rate ------------------------------------
  const weekdayBuckets = Array.from({ length: 7 }, () => ({ totalW: 0, doneW: 0, count: 0, weeks: new Set() }));
  nonBreak.forEach((t) => {
    if (!t.date) return;
    const wd = weekdayOf(t.date);
    const w = taskWeights[t.id] ?? 3;
    const bucket = weekdayBuckets[wd];
    bucket.totalW += w;
    bucket.count += 1;
    if (t.completed) bucket.doneW += w;
    bucket.weeks.add(weekKeyOf(t.date));
  });

  const weekdayRates = weekdayBuckets
    .map((b, i) => ({ day: i, name: DAY_NAMES[i], rate: b.totalW > 0 ? b.doneW / b.totalW : null, weeksSeen: b.weeks.size, count: b.count }))
    .filter((d) => d.rate !== null && d.weeksSeen >= 3);

  if (weekdayRates.length > 0) {
    const allWeekAvg = weekdayRates.reduce((s, d) => s + d.rate, 0) / weekdayRates.length;
    const withDev = weekdayRates.map((d) => ({ ...d, dev: d.rate - allWeekAvg }));
    const best = [...withDev].sort((a, b) => b.dev - a.dev)[0];
    const worst = [...withDev].sort((a, b) => a.dev - b.dev)[0];
    const flagged = Math.abs(best.dev) >= Math.abs(worst.dev) ? best : worst;

    if (Math.abs(flagged.dev) >= 0.15) {
      const tier = confidenceTier(flagged.count);
      if (tier) {
        const pct = Math.round(flagged.rate * 100);
        const avgPct = Math.round(allWeekAvg * 100);
        const text = flagged.dev > 0
          ? `${flagged.name}s are your highest-momentum day — ${pct}% completion vs ${avgPct}% average.`
          : `${flagged.name}s tend to be your lowest-momentum day — ${pct}% completion vs ${avgPct}% average.`;
        patterns.push({ id: "day_of_week_rate", text, confidence: tier, category: "day_of_week" });
      }
    }
  }

  // Rule 2 — hard-task time-of-day rate --------------------------------------
  const hardCompleted = tasks.filter((t) => t.complexity === "hard" && t.completed && t.startHour != null);
  if (hardCompleted.length >= 5) {
    const tier = confidenceTier(hardCompleted.length);
    if (tier) {
      const before11 = hardCompleted.filter((t) => t.startHour < 11).length;
      const pct = Math.round((before11 / hardCompleted.length) * 100);
      const text = pct >= 50
        ? `You finish ${pct}% of difficult tasks before 11 AM.`
        : `Only ${pct}% of difficult tasks get done before 11 AM — hard work tends to happen later in your day.`;
      patterns.push({ id: "hard_task_timing", text, confidence: tier, category: "timing" });
    }
  }

  // Rule 3 — most-avoided category --------------------------------------------
  const deferred = tasks.filter((t) => !t.completed && t.date < today && t.type !== "break");
  if (deferred.length >= 5) {
    const tier = confidenceTier(deferred.length);
    if (tier) {
      const counts = {};
      deferred.forEach((t) => { const c = categorizeTitle(t.title); counts[c] = (counts[c] ?? 0) + 1; });
      const [topCat, topCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (topCat !== "general") {
        const label = { "reading/study": "reading and studying", writing: "writing tasks", coding: "coding work", communication: "communication tasks", organizing: "organizing tasks" }[topCat] ?? topCat;
        const pct = Math.round((topCount / deferred.length) * 100);
        patterns.push({ id: "most_avoided_category", text: `You postpone ${label} most often (${pct}% of what's overdue).`, confidence: tier, category: "avoidance" });
      }
    }
  }

  // Rule 4 — sleep/load/focus correlation (shared with Nora's observation
  // generateInsights — same thresholds, operating over the dailyMetrics store
  // instead of a pre-filtered date-range slice) --------------------------------
  const entries = Object.entries(dailyMetrics).sort((a, b) => a[0].localeCompare(b[0]));
  const historyTier = confidenceTier(entries.length);

  if (historyTier) {
    const energySeries = extractSeries(entries, "energy");
    const stressSeries = extractSeries(entries, "stress"); // stored as "calm" — see note below
    const focusSeries = extractSeries(entries, "focus");
    const sleepSeries = entries.map(([, v]) => v.sleepQuality);

    if (energySeries.length >= 7) {
      const heavyDays = entries.filter(([, v]) => v.loadLevel === "heavy");
      if (heavyDays.length >= 3) {
        patterns.push({ id: "load_energy_correlation", text: "High-load days tend to correlate with lower energy the following morning.", confidence: historyTier, category: "correlation" });
      }
    }

    const completed = tasks.filter((t) => t.completed && t.startHour != null);
    const hourCounts = {};
    completed.forEach((t) => { hourCounts[t.startHour] = (hourCounts[t.startHour] || 0) + 1; });
    const peakH = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (peakH != null) {
      const h = Number(peakH);
      const label = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
      const tier = confidenceTier(completed.length);
      if (tier) patterns.push({ id: "peak_completion_hour", text: `Your completion rate is highest in the ${label} — around ${h}:00.`, confidence: tier, category: "timing" });
    }

    if (focusSeries.length >= 5) {
      const recentFocus = avg(focusSeries.slice(-3));
      const earlyFocus = avg(focusSeries.slice(0, 3));
      if (recentFocus > earlyFocus + 0.5) {
        patterns.push({ id: "focus_trend_up", text: "Your focus is trending upward this period — a good sign of consistency.", confidence: historyTier, category: "trend" });
      } else if (recentFocus < earlyFocus - 0.5) {
        patterns.push({ id: "focus_trend_down", text: "Focus has been declining recently. Shorter sessions and earlier starts may help.", confidence: historyTier, category: "trend" });
      }
    }

    // NOTE: the "stress" field in dailyMetrics actually stores a calm/relaxation
    // score (see App.js's daily-metrics snapshot and the historical observation
    // metric def) — a *decline* in this value means real-world stress is rising.
    if (stressSeries.length >= 5 && avg(stressSeries.slice(-3)) < avg(stressSeries.slice(0, 3)) - 0.5) {
      patterns.push({ id: "stress_trend_up", text: "Stress levels have been rising. Consider protecting more of your evenings.", confidence: historyTier, category: "trend" });
    }

    const poorSleep = sleepSeries.filter((v) => v === "poor" || v === "okay").length;
    if (sleepSeries.length >= 5 && poorSleep > sleepSeries.length * 0.5) {
      patterns.push({ id: "poor_sleep_prevalence", text: "Sleep quality has been mixed. Even small improvements in bedtime can lift next-day energy.", confidence: historyTier, category: "sleep" });
    }
  }

  return patterns
    .sort((a, b) => CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence]);
}

export function minePatternsFromHistory(inputs) {
  return mineAllPatterns(inputs).slice(0, 4);
}

// ── WORK/MIND domain classification ──────────────────────────────────────────
// Colocated with the pattern-id definitions above — this is the single source
// of truth for which tab (Status page) a given pattern belongs to. Unknown ids
// default to "work" so a future rule that forgets to register here doesn't
// silently vanish from both tabs.
export const PATTERN_DOMAIN = {
  day_of_week_rate: "work",
  hard_task_timing: "work",
  most_avoided_category: "work",
  load_energy_correlation: "work",
  peak_completion_hour: "work",
  focus_trend_up: "mind",
  focus_trend_down: "mind",
  stress_trend_up: "mind",
  poor_sleep_prevalence: "mind",
};

export function splitPatternsByDomain(patterns) {
  const work = [], mind = [];
  for (const p of patterns) (PATTERN_DOMAIN[p.id] === "mind" ? mind : work).push(p);
  return { work, mind };
}

// ── Best focus window ────────────────────────────────────────────────────────
// Sliding 90-minute window scan over completed tasks' start times, to find the
// stretch of the day where completions cluster most.
export function computeBestFocusWindow(completedTasks) {
  if (!completedTasks || completedTasks.length < 8) {
    return { window: null, confidence: "insufficient_data" };
  }

  const starts = completedTasks.map((t) => t.startHour * 60 + (t.startMinute ?? 0));

  let best = { start: 0, count: 0 };
  for (let windowStart = 0; windowStart <= 1440 - 90; windowStart += 15) {
    const windowEnd = windowStart + 90;
    const count = starts.filter((s) => s >= windowStart && s < windowEnd).length;
    if (count > best.count) best = { start: windowStart, count };
  }

  const fmt = (mins) => `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  const window = `${fmt(best.start)}–${fmt(best.start + 90)}`;
  const confidence = best.count >= 8 ? "HIGH" : best.count >= 4 ? "MEDIUM" : "insufficient_data";

  return { window, confidence, sampleCount: best.count };
}

// ── Emotional drift ──────────────────────────────────────────────────────────
// Flags weekdays whose average energy/stress/focus deviates meaningfully from
// the all-days average, e.g. "Mondays run rougher than the rest of your week."
export function computeEmotionalDrift({ dailyMetrics = {} }) {
  const entries = Object.entries(dailyMetrics);
  if (entries.length === 0) return [];

  const METRICS = ["energy", "stress", "focus"];
  const METRIC_PRIORITY = { energy: 0, stress: 1, focus: 2 };

  const overallAvg = {};
  METRICS.forEach((m) => {
    const vals = entries.map(([, v]) => v[m]).filter((v) => v != null);
    overallAvg[m] = vals.length ? avg(vals) : null;
  });

  const byWeekday = Array.from({ length: 7 }, () => ({ count: 0, sums: { energy: 0, stress: 0, focus: 0 }, counts: { energy: 0, stress: 0, focus: 0 } }));
  entries.forEach(([date, v]) => {
    const wd = weekdayOf(date);
    const bucket = byWeekday[wd];
    bucket.count += 1;
    METRICS.forEach((m) => { if (v[m] != null) { bucket.sums[m] += v[m]; bucket.counts[m] += 1; } });
  });

  // "stress" is stored as a calm score (higher = calmer, see note in
  // minePatternsFromHistory) — a negative deviation means real stress is up.
  const phraseMetric = (metric, dev) => {
    if (metric === "stress") return dev < 0 ? "higher stress" : "lower stress";
    return dev < 0 ? `lower ${metric}` : `higher ${metric}`;
  };

  const flagsByWeekday = {};
  for (let wd = 0; wd < 7; wd++) {
    const bucket = byWeekday[wd];
    if (bucket.count < 3) continue;
    METRICS.forEach((m) => {
      if (overallAvg[m] == null || bucket.counts[m] === 0) return;
      const wdAvg = bucket.sums[m] / bucket.counts[m];
      const dev = wdAvg - overallAvg[m];
      if (Math.abs(dev) >= 1.0) {
        (flagsByWeekday[wd] ??= []).push({ metric: m, dev });
      }
    });
  }

  const results = Object.entries(flagsByWeekday).map(([wd, flags]) => {
    const sorted = [...flags].sort((a, b) => METRIC_PRIORITY[a.metric] - METRIC_PRIORITY[b.metric]);
    const phrases = sorted.map((f) => phraseMetric(f.metric, f.dev));
    const weekday = DAY_NAMES[Number(wd)];
    const text = phrases.length > 1
      ? `${weekday}s tend to bring ${phrases.slice(0, -1).join(", ")} and ${phrases[phrases.length - 1]} than your average day.`
      : `${weekday}s tend to bring ${phrases[0]} than your average day.`;
    const maxDev = Math.max(...sorted.map((f) => Math.abs(f.dev)));
    return { id: `emotional_drift_${weekday.toLowerCase()}`, text, metric: sorted[0].metric, weekday, hasPriorityMetric: sorted[0].metric !== "focus", maxDev };
  });

  return results
    .sort((a, b) => (b.hasPriorityMetric - a.hasPriorityMetric) || (b.maxDev - a.maxDev))
    .slice(0, 2)
    .map(({ id, text, metric, weekday }) => ({ id, text, metric, weekday }));
}
