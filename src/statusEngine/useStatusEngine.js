import { useMemo, useState, useEffect, useRef } from "react";
import { calculateTaskWeight } from "../utils/taskUtils";
import { buildDailyWeightedWindow, fmtDate, addDays } from "./dailyWindow";
import {
  computeMentalBattery,
  computeRecoveryIndex,
  computeMomentumMetric,
  computeConsistency,
  computeDeepWorkCapacity,
  computeAttentionStability,
} from "./metrics";
import { minePatternsFromHistory, computeBestFocusWindow, computeEmotionalDrift } from "./patterns";
import { getMicroStart, generateInterpretation, generateCoachHeadline } from "./interpretations";
import { buildImplementationIntention } from "./intentions";
import { apiUrl } from "../lib/apiBase";

// Mirrors the shape of src/intelligence/useIntelligence.js: a plain hook that
// wires pure calculator functions to React state and returns one flat object.
// No class, no context — the whole Status page's data layer lives here.
//
// `session` is accepted (and reserved) for future persistence needs — e.g.
// once daily snapshots of recoveryState.score / attentionStability get written
// somewhere durable, the 3-day trend detectors below can read real history
// instead of the `false`/`null` placeholders. Not used in this pass.
//
// `todaySleepQuality` mirrors App.js's `sleepCheckIn.date === today ? sleepCheckIn.quality : null`
// (a separate nightly check-in, distinct from the morning checkup) — pass it
// through when wiring this hook up so sleepState matches production exactly.
export function useStatusEngine({
  tasks, today, session,
  energy, relaxation, focus, motivation,
  morningCheckup, dailyMetrics, userPrefs,
  todaySleepQuality = null,
}) {
  // ── Week-level completion pattern ──────────────────────────────────────────
  const weekData = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = fmtDate(addDays(today, i - 6));
    const dayTasks = tasks.filter((t) => t.date === d);
    const done = dayTasks.filter((t) => t.completed).length;
    const total = dayTasks.length;
    return { date: d, done, total, rate: total > 0 ? done / total : null };
  }), [tasks, today]);

  const weekTrend = useMemo(() => {
    const rated = weekData.filter((d) => d.rate !== null);
    if (rated.length < 4) return "new";
    const recent = rated.slice(-3);
    const prior = rated.slice(0, rated.length - 3);
    const avg = (arr) => arr.reduce((s, d) => s + d.rate, 0) / arr.length;
    const diff = avg(recent) - avg(prior);
    return diff > 0.1 ? "improving" : diff < -0.1 ? "declining" : "steady";
  }, [weekData]);

  // ── Per-task cognitive load weights ────────────────────────────────────────
  const taskWeights = useMemo(() => {
    const map = {};
    tasks.forEach((t) => { map[t.id] = calculateTaskWeight(t, today); });
    return map;
  }, [tasks, today]);

  // ── User's rolling load baseline ───────────────────────────────────────────
  const userLoadBaseline = useMemo(() => {
    const saved = userPrefs?.load_baseline ?? null;
    const days14 = buildDailyWeightedWindow(tasks, taskWeights, today, 14).filter((d) => d.rate !== null);
    if (days14.length < 3) {
      return saved ?? { avgDailyWeight: 12, avgCompletionWeight: 9, maxSustainableWeight: 15, overloadThreshold: 19, heavyDayThreshold: 15 };
    }
    const avgDailyWeight = days14.reduce((s, d) => s + d.totalW, 0) / days14.length;
    const avgCompletionWeight = days14.reduce((s, d) => s + d.doneW, 0) / days14.length;
    return {
      avgDailyWeight: Math.round(avgDailyWeight),
      avgCompletionWeight: Math.round(avgCompletionWeight),
      maxSustainableWeight: Math.round(avgDailyWeight * 1.25),
      overloadThreshold: Math.round(avgDailyWeight * 1.6),
      heavyDayThreshold: Math.round(avgDailyWeight * 1.25),
    };
  }, [tasks, today, taskWeights, userPrefs?.load_baseline]);

  // ── Momentum ────────────────────────────────────────────────────────────────
  const momentum = useMemo(() => {
    const days = buildDailyWeightedWindow(tasks, taskWeights, today, 14);
    const rated = days.filter((d) => d.rate !== null);
    if (rated.length < 2) return { state: "new", label: "Just Starting", desc: "Build a few days of history and Nora will start recognising patterns.", color: "var(--accent)", score: null, trend: null };
    const recent = rated.slice(-Math.min(3, rated.length));
    const prior = rated.slice(0, rated.length - recent.length);
    const avg = (arr) => arr.length > 0 ? arr.reduce((s, d) => s + d.rate, 0) / arr.length : null;
    const rAvg = avg(recent);
    const pAvg = avg(prior) ?? rAvg;
    const trend = rAvg - pAvg;
    const avgWeightedLoad = recent.reduce((s, d) => s + d.totalW, 0) / recent.length;
    const overloadThresh = userLoadBaseline.overloadThreshold;
    // NOTE (required change 1 vs App.js today): every branch below now returns
    // `trend` — the live code computes it but drops it before returning, even
    // though "yesterday vs today" style copy (see metrics.js's
    // computeMomentumMetric / interpretations.js) needs it.
    if (rAvg < 0.40 && avgWeightedLoad > overloadThresh) return { state: "overloaded", label: "Overloaded", desc: "Cognitive load exceeds your current capacity. Remove or defer tasks — consistency beats volume.", color: "#ef4444", score: rAvg, trend };
    if (rAvg >= 0.65 && trend > 0.08) return { state: "rising", label: "Rising", desc: "Momentum is building. Protect this energy and keep sessions predictable.", color: "#22c55e", score: rAvg, trend };
    if (rAvg >= 0.55 && Math.abs(trend) <= 0.12) return { state: "stable", label: "Stable", desc: "Consistent and reliable. Steady momentum is more sustainable than burst performance.", color: "#3b82f6", score: rAvg, trend };
    if (trend < -0.20 && pAvg > 0.55) return { state: "recovery", label: "Recovery Phase", desc: "You slipped after a strong stretch — that's natural. A lighter day resets the system.", color: "#f59e0b", score: rAvg, trend };
    if (trend > 0.12) return { state: "rising", label: "Recovering", desc: "Turning around. Each completed task rebuilds the pattern.", color: "#22c55e", score: rAvg, trend };
    return { state: "unstable", label: "Unstable", desc: "Inconsistent pattern. Fewer, smaller, well-timed tasks work better than an ambitious list.", color: "#f59e0b", score: rAvg, trend };
  }, [tasks, today, taskWeights, userLoadBaseline]);

  // ── 7-day workload forecast ──────────────────────────────────────────────────
  const workloadForecast = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const date = fmtDate(addDays(today, i));
    const dayT = tasks.filter((t) => t.date === date && t.type !== "break");
    const mins = dayT.filter((t) => t.duration).reduce((s, t) => s + t.duration, 0);
    const load = dayT.length;
    const weightedLoad = dayT.reduce((s, t) => s + (taskWeights[t.id] ?? 3), 0);
    const d = new Date(date + "T00:00:00");
    const heavyT = userLoadBaseline.overloadThreshold;
    const modT = userLoadBaseline.heavyDayThreshold;
    const level = weightedLoad >= heavyT ? "heavy" : weightedLoad >= modT ? "moderate" : weightedLoad > 0 ? "light" : "free";
    return { date, load, mins, weightedLoad, level, label: i === 0 ? "Today" : i === 1 ? "Tmr" : ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"][d.getDay()], isToday: i === 0 };
  }), [tasks, today, taskWeights, userLoadBaseline]);

  // ── Time-of-day focus pattern ───────────────────────────────────────────────
  const focusPatterns = useMemo(() => {
    const doneT = tasks.filter((t) => t.completed && t.startHour != null && t.type !== "break");
    if (doneT.length < 4) return null;
    const bands = [
      { key: "morning", label: "Morning", range: "6–11 AM", hours: [6, 7, 8, 9, 10, 11], count: 0 },
      { key: "afternoon", label: "Afternoon", range: "12–5 PM", hours: [12, 13, 14, 15, 16, 17], count: 0 },
      { key: "evening", label: "Evening", range: "6–10 PM", hours: [18, 19, 20, 21, 22], count: 0 },
    ];
    doneT.forEach((t) => { const b = bands.find((b) => b.hours.includes(t.startHour)); if (b) b.count++; });
    const total = bands.reduce((s, b) => s + b.count, 0);
    if (total === 0) return null;
    const peak = [...bands].sort((a, b) => b.count - a.count)[0];
    return { bands, peak, peakPct: Math.round((peak.count / total) * 100), total };
  }, [tasks]);

  // ── Most avoided (oldest overdue) task ──────────────────────────────────────
  const mostAvoided = useMemo(() => {
    const overdue = tasks.filter((t) => !t.completed && t.date < today && t.type === "task");
    if (!overdue.length) return null;
    const task = [...overdue].sort((a, b) => a.date.localeCompare(b.date))[0];
    const daysOverdue = Math.floor((new Date(today + "T00:00:00") - new Date(task.date + "T00:00:00")) / 86400000);
    return { task, daysOverdue, microStarts: getMicroStart(task.title), count: overdue.length };
  }, [tasks, today]);

  // ── Recovery / burnout state ─────────────────────────────────────────────────
  const recoveryState = useMemo(() => {
    const last7 = buildDailyWeightedWindow(tasks, taskWeights, today, 7);
    const overdueTasks = tasks.filter((t) => !t.completed && t.date < today && t.type !== "break");
    const overdueWeight = overdueTasks.reduce((s, t) => s + (taskWeights[t.id] ?? 3), 0);
    const recentRated = last7.filter((d) => d.rate !== null);
    const recentAvg = recentRated.length > 0 ? recentRated.reduce((s, d) => s + d.rate, 0) / recentRated.length : 1;
    const avgWeightedLoad = last7.reduce((s, d) => s + d.totalW, 0) / 7;
    const lateNight = tasks.filter((t) => t.completed && t.startHour != null && t.startHour >= 21).length;
    const avoidWeightRatio = overdueWeight / Math.max(tasks.reduce((s, t) => s + (taskWeights[t.id] ?? 3), 0), 1);
    const overloadT = userLoadBaseline.overloadThreshold;
    let score = 100;
    if (recentRated.length > 0) score -= (1 - recentAvg) * 40;
    score -= Math.min(28, (overdueWeight / 3) * 2.5);
    score -= Math.min(18, avoidWeightRatio * 36);
    if (lateNight >= 3) score -= 10;
    if (avgWeightedLoad > overloadT) score -= 10;
    const clampedScore = Math.round(Math.max(0, Math.min(100, score)));
    // NOTE (required change 2 vs App.js today): every branch below now returns
    // `score: clampedScore` — the live code computes it but never returns it.
    if (score >= 78) return { level: "stable", label: "Stable", color: "#22c55e", desc: "Output and recovery are balanced. You're in a sustainable rhythm.", advice: null, score: clampedScore };
    if (score >= 58) return { level: "mild", label: "Mild Overload", color: "#f59e0b", desc: "A few signals suggest the pace is slightly unsustainable.", advice: "Trim 1–2 tasks this week and protect at least one longer break.", score: clampedScore };
    if (score >= 38) return { level: "high", label: "High Cognitive Load", color: "#f97316", desc: "Your schedule has consistently exceeded comfortable capacity.", advice: "Reduce daily cognitive load by ~30%. Focus only on what genuinely moves things forward.", score: clampedScore };
    if (score >= 18) return { level: "recovery", label: "Recovery Needed", color: "#ef4444", desc: "Sustained pressure is reducing effectiveness. Recovery actively improves long-term output.", advice: "Protect the next day as near-rest. One essential task only.", score: clampedScore };
    return { level: "burnout", label: "Burnout Risk", color: "#dc2626", desc: "Patterns suggest significant cumulative exhaustion. Rest is more productive than pushing through.", advice: "Pause non-essential tasks entirely. Rest today. Rebuild from a lighter baseline tomorrow.", score: clampedScore };
  }, [tasks, today, taskWeights, userLoadBaseline]);

  // ── Adaptive plan signals (best hours/day, hard-task rate, etc.) ─────────────
  const adaptivePlanData = useMemo(() => {
    const doneT = tasks.filter((t) => t.completed && t.startHour != null && t.type !== "break");
    if (doneT.length < 5) return null;
    const hourBuckets = {};
    doneT.forEach((t) => { hourBuckets[t.startHour] = (hourBuckets[t.startHour] || 0) + 1; });
    const topHours = Object.entries(hourBuckets).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([h]) => parseInt(h));
    const withDur = doneT.filter((t) => t.duration);
    const avgDur = withDur.length > 0 ? Math.round(withDur.reduce((s, t) => s + t.duration, 0) / withDur.length) : null;
    const byDay = {};
    doneT.forEach((t) => { const day = new Date(t.date + "T00:00:00").getDay(); byDay[day] = (byDay[day] || 0) + 1; });
    const bestDayEntry = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0];
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const bestDayName = bestDayEntry ? dayNames[parseInt(bestDayEntry[0])] : null;
    const hardTotal = tasks.filter((t) => t.complexity === "hard" && t.type !== "break").length;
    const hardDone = tasks.filter((t) => t.complexity === "hard" && t.completed).length;
    const hardRate = hardTotal >= 3 ? Math.round((hardDone / hardTotal) * 100) : null;
    const longFail = tasks.filter((t) => !t.completed && t.duration && t.duration > 90 && t.type !== "break").length;
    const longAll = tasks.filter((t) => t.duration && t.duration > 90 && t.type !== "break").length;
    const longTasksFail = longAll >= 4 && (longFail / longAll) > 0.5;
    return { topHours, avgDur, bestDayName, hardRate, longTasksFail, sampleSize: doneT.length };
  }, [tasks]);

  // ── Deferred/overdue tasks ───────────────────────────────────────────────────
  const deferredTasks = useMemo(() => {
    const past = tasks.filter((t) => !t.completed && t.date < today && (t.type ?? "task") !== "break");
    return past.map((t) => {
      const daysDeferred = Math.round((new Date(today + "T00:00:00") - new Date(t.date + "T00:00:00")) / 86400000);
      const urgency = daysDeferred >= 7 ? "high" : daysDeferred >= 3 ? "medium" : "low";
      return { ...t, daysDeferred, urgency };
    }).sort((a, b) => b.daysDeferred - a.daysDeferred);
  }, [tasks, today]);

  // ── Tonight's sleep-protection state ─────────────────────────────────────────
  const sleepState = useMemo(() => {
    const tonightTasks = tasks.filter((t) => t.date === today && t.startHour != null && t.startHour >= 20 && !t.completed);
    const tonightLoad = tonightTasks.reduce((s, t) => s + (t.duration ?? 60), 0);
    const hasLateTasks = tonightTasks.length > 0;
    const hasVeryLate = tonightTasks.some((t) => t.startHour >= 22);
    const lateNights = Array.from({ length: 7 }, (_, i) => {
      const d = fmtDate(addDays(today, -(i + 1)));
      return tasks.some((t) => t.date === d && (t.startHour ?? 0) >= 20);
    }).filter(Boolean).length;
    const hasLatePattern = lateNights >= 3;
    let score = 0;
    if (energy <= 3) score += 3; else if (energy <= 5) score += 1;
    if (relaxation <= 3) score += 2; else if (relaxation <= 5) score += 1;
    if (recoveryState.level === "burnout") score += 3;
    else if (recoveryState.level === "recovery") score += 2;
    else if (recoveryState.level === "high") score += 1;
    if (todaySleepQuality === "poor") score += 2; else if (todaySleepQuality === "okay") score += 1;
    const pressure = score >= 5 ? "High" : score >= 3 ? "Moderate" : "Low";
    const pressureColor = pressure === "High" ? "#ef4444" : pressure === "Moderate" ? "#f59e0b" : "#22c55e";
    let tonightRisk = "Calm";
    let riskLevel = "calm";
    if (hasVeryLate || (hasLateTasks && tonightLoad > 90)) { tonightRisk = "Late Work Risk"; riskLevel = "high"; }
    else if (hasLateTasks || workloadForecast[0]?.level === "heavy") { tonightRisk = "Loaded"; riskLevel = "moderate"; }
    const riskColor = riskLevel === "high" ? "#ef4444" : riskLevel === "moderate" ? "#f59e0b" : "#22c55e";
    let suggestion = null;
    if (pressure === "High" && hasVeryLate) suggestion = "Tonight needs protecting. Move the late tasks to tomorrow — your recovery matters more right now.";
    else if (pressure === "High" && hasLateTasks) suggestion = "Keep only the essential tonight and defer the rest. Recovery first.";
    else if (hasVeryLate) suggestion = "Move tasks after 22:00 to tomorrow morning — late cognitive work cuts into recovery.";
    else if (hasLatePattern) suggestion = "Late work is becoming a pattern. One early evening this week would help a lot.";
    else if (hasLateTasks && pressure === "Moderate") suggestion = "Tonight has some late work. Keep it to essentials if possible.";
    else if (pressure === "Moderate") suggestion = "Decent balance. Aim to wind down by 22:00 if you can.";
    else if (riskLevel === "calm" && !hasLatePattern) suggestion = "Recovery looks protected tonight. Good position.";
    return { pressure, pressureColor, tonightRisk, riskLevel, riskColor, suggestion, hasLateTasks, hasVeryLate, hasLatePattern, tonightTasks, lateNights };
  }, [tasks, today, energy, relaxation, recoveryState, todaySleepQuality, workloadForecast]);

  // ── User confidence ───────────────────────────────────────────────────────────
  const userConfidence = useMemo(() => {
    let score = 0.50;
    if (momentum.score != null) score += (momentum.score - 0.5) * 0.30;
    if (momentum.state === "rising") score += 0.08;
    if (weekTrend === "improving") score += 0.10;
    else if (weekTrend === "declining") score -= 0.10;
    const avoidRatio = deferredTasks.length / Math.max(1, tasks.filter((t) => !t.completed).length);
    score -= avoidRatio * 0.15;
    score = Math.min(1, Math.max(0, score));
    if (score >= 0.62) return { label: "High Confidence", color: "#22c55e", level: "high" };
    if (score >= 0.38) return { label: "Building Confidence", color: "#f59e0b", level: "building" };
    return { label: "Confidence Strained", color: "#ef4444", level: "strained" };
  }, [momentum, weekTrend, deferredTasks, tasks]);

  // ── Plain-language assessment summary ────────────────────────────────────────
  const assessmentSummary = useMemo(() => {
    if (recoveryState.level === "burnout") return "You've been pushing hard for a sustained period. The priority right now is recovery, not more tasks.";
    if (recoveryState.level === "recovery") return "Your system is signalling a need to slow down. A lighter approach today will pay off more than pushing through.";
    if (momentum.state === "overloaded") return "Your workload has exceeded your baseline for several days. Some redistribution would relieve the pressure.";
    if (momentum.state === "rising" && weekTrend === "improving") return "Momentum is building and the week is trending up — you're in a solid rhythm. Keep the pace without overloading.";
    if (momentum.state === "rising") return "Things are clicking. Completion is improving and consistency is building.";
    if (weekTrend === "declining" && deferredTasks.length > 2) return `${deferredTasks.length} tasks have slipped and the week is trending down. Rebalancing would help.`;
    if (weekTrend === "declining") return "The week has been rough, but there's still time to recover. Small consistent actions outperform big catch-up sessions.";
    if (weekTrend === "improving") return "You're recovering well from any recent pressure. Steady, balanced progress looks good ahead.";
    if (momentum.state === "stable") return "You're in a consistent rhythm. A reliable week ahead with no major red flags.";
    return "Nora is still building your profile. Keep logging completions — patterns emerge quickly.";
  }, [recoveryState, momentum, weekTrend, deferredTasks]);

  // ── Key signals (top 3 headline facts) ───────────────────────────────────────
  const keySignals = useMemo(() => {
    const s = [];
    if (energy >= 7) s.push("Energy is high");
    else if (energy <= 3) s.push("Energy is low — protect your rest");
    else s.push("Energy is moderate");
    if (recoveryState.level === "stable") s.push("No burnout risk detected");
    else if (recoveryState.level === "burnout" || recoveryState.level === "recovery") s.push("Recovery needed — workload has been unsustainably high");
    else s.push("Mild overload signs — watch the next few days");
    const peak = workloadForecast.reduce((a, b) => (a.load > b.load ? a : b), workloadForecast[0]);
    if (peak && peak.level !== "free" && peak.level !== "light") s.push(`${peak.label} currently has the highest workload`);
    else if (deferredTasks.length > 0) s.push(`${deferredTasks.length} deferred task${deferredTasks.length > 1 ? "s" : ""} still waiting`);
    else s.push("Schedule is well-balanced this week");
    return s.slice(0, 3);
  }, [energy, recoveryState, workloadForecast, deferredTasks]);

  // ── Nora's current headline state ────────────────────────────────────────────
  const noraState = useMemo(() => {
    const todayForecast = workloadForecast[0];
    const heavyForecast = workloadForecast.some((d) => d.level === "heavy");
    const overdueWeight = tasks.filter((t) => !t.completed && t.date < today && t.type !== "break").reduce((s, t) => s + (taskWeights[t.id] ?? 3), 0);
    const highOverdueCogLoad = overdueWeight >= userLoadBaseline.heavyDayThreshold;
    if (recoveryState.level === "burnout" || recoveryState.level === "recovery") return { key: "recovery_day", label: "Recovery Day", color: "#ef4444", confidence: "HIGH" };
    if (momentum.state === "overloaded" || highOverdueCogLoad) return { key: "high_load", label: "High Load", color: "#f97316", confidence: (heavyForecast || highOverdueCogLoad) ? "HIGH" : "MEDIUM" };
    if (energy >= 7 && relaxation >= 7 && todayForecast?.level !== "heavy") return { key: "peak_focus", label: "Peak Focus", color: "#22c55e", confidence: "HIGH" };
    if (momentum.state === "rising") return { key: "building_momentum", label: "Building Momentum", color: "#3b82f6", confidence: "MEDIUM" };
    if (momentum.state === "stable") return { key: "steady_flow", label: "Steady Flow", color: "#8b5cf6", confidence: "HIGH" };
    return { key: "focus_mode", label: "Focus Mode", color: "var(--accent)", confidence: "MEDIUM" };
  }, [recoveryState, momentum, energy, relaxation, workloadForecast, tasks, today, taskWeights, userLoadBaseline]);

  // ── Behavior profile ─────────────────────────────────────────────────────────
  const behaviorProfile = useMemo(() => {
    const allTasks = tasks.filter((t) => t.type !== "break");
    const sampleSize = allTasks.length;
    const schedulingRate = sampleSize > 0 ? allTasks.filter((t) => t.startHour != null).length / sampleSize : 0;
    const work_style = schedulingRate > 0.65 ? "structured" : schedulingRate > 0.3 ? "mixed" : "flexible";
    // NOTE (required change 3 vs App.js today): `completion_consistency` is
    // dropped entirely — it used to be Math.round(momentum.score*100), a
    // literal duplicate of momentum, now replaced by the standalone
    // `consistency` metric in metrics.js (computeConsistency).
    const overload_response = momentum.state === "overloaded" && recoveryState.level === "burnout" ? "continues despite overload" : momentum.state === "overloaded" ? "reduces load under pressure" : "stable";
    const restart_speed = momentum.state === "recovering" ? "fast" : recoveryState.level === "recovery" ? "slow" : "n/a";
    const confidence = sampleSize >= 40 ? "HIGH" : sampleSize >= 15 ? "MEDIUM" : "EXPERIMENTAL";
    const overloadT = userLoadBaseline.overloadThreshold;
    const days14 = buildDailyWeightedWindow(tasks, taskWeights, today, 14).filter((d) => d.rate !== null);
    const overloadDays = days14.filter((d) => d.totalW > overloadT);
    let stress_response_pattern = "stable";
    if (overloadDays.length >= 2) {
      const avgRate = overloadDays.reduce((s, d) => s + d.rate, 0) / overloadDays.length;
      stress_response_pattern = avgRate >= 0.6 ? "resilient" : "overload_sensitive";
    }
    // `days14` exposed too — metrics.js's computeConsistency needs this exact
    // same 14-day rate array, no need to rebuild it a third time.
    return { work_style, overload_response, restart_speed, confidence, sampleSize, stress_response_pattern, days14 };
  }, [tasks, momentum, recoveryState, taskWeights, userLoadBaseline, today]);

  // ── Today's tasks / top priority task ────────────────────────────────────────
  const todayTasks = useMemo(() => tasks.filter((t) => t.date === today), [tasks, today]);

  const aiFocus = useMemo(() => {
    const incomplete = todayTasks.filter((t) => !t.completed && t.type !== "break");
    const priorityTask = [...incomplete].sort((a, b) => {
      if (a.startHour != null && b.startHour != null) return a.startHour * 60 + (a.startMinute ?? 0) - (b.startHour * 60 + (b.startMinute ?? 0));
      if (a.startHour != null) return -1;
      if (b.startHour != null) return 1;
      return 0;
    })[0] ?? null;
    return { priorityTask };
  }, [todayTasks]);

  // ── Predictive signals ───────────────────────────────────────────────────────
  const predictiveSignals = useMemo(() => {
    const insights = [];
    const heavyUpcoming = workloadForecast.slice(1, 4).find((d) => d.level === "heavy");
    if (heavyUpcoming && ["unstable", "overloaded", "recovery"].includes(momentum.state)) {
      insights.push({ type: "warning", confidence: momentum.state === "overloaded" ? "HIGH" : "MEDIUM", message: `${heavyUpcoming.label} looks heavy and your recent rhythm is inconsistent — moving 1–2 tasks earlier prevents the crunch.`, ruleId: "overload_prevention" });
    }
    if (mostAvoided && mostAvoided.daysOverdue >= 3) {
      insights.push({ type: "micro-start", confidence: mostAvoided.daysOverdue >= 7 ? "HIGH" : "MEDIUM", message: `"${mostAvoided.task.title}" has been waiting ${mostAvoided.daysOverdue} days — a 5-minute start now breaks the pattern.`, ruleId: "procrastination_detected" });
    }
    if (focusPatterns && focusPatterns.peak.key !== "afternoon") {
      const afternoonHard = tasks.filter((t) => t.date === today && !t.completed && t.complexity === "hard" && t.startHour != null && t.startHour >= 12 && t.startHour < 17);
      if (afternoonHard.length > 0) {
        insights.push({ type: "optimization", confidence: focusPatterns.peakPct >= 50 ? "HIGH" : "MEDIUM", message: `"${afternoonHard[0].title}" is scheduled for the afternoon, but your focus peaks in the ${focusPatterns.peak.label.toLowerCase()} — consider moving it.`, ruleId: "energy_mismatch" });
      }
    }
    if (["mild", "high", "recovery", "burnout"].includes(recoveryState.level) && (weekTrend === "declining" || ["overloaded", "unstable"].includes(momentum.state))) {
      const tomorrow = workloadForecast[1];
      if (tomorrow && (tomorrow.level === "heavy" || tomorrow.level === "moderate")) {
        insights.push({ type: "warning", confidence: ["burnout", "recovery"].includes(recoveryState.level) ? "HIGH" : "MEDIUM", message: `You're showing signs of overextension — a lighter ${tomorrow.label} helps more than pushing through.`, ruleId: "recovery_predicted" });
      }
    }
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return insights.sort((a, b) => order[a.confidence] - order[b.confidence]).slice(0, 2);
  }, [workloadForecast, momentum, mostAvoided, focusPatterns, tasks, today, recoveryState, weekTrend]);

  // ── Weekly reflection ────────────────────────────────────────────────────────
  const weeklyReflection = useMemo(() => {
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const date = fmtDate(addDays(today, i - 6));
      const d = new Date(date + "T00:00:00");
      const dayT = tasks.filter((t) => t.date === date && t.type !== "break");
      const done = dayT.filter((t) => t.completed).length;
      return { date, name: ["Sun", "Mo", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()], done, total: dayT.length, rate: dayT.length > 0 ? done / dayT.length : null };
    });
    const rated = last7.filter((d) => d.rate !== null);
    if (rated.length < 3) return null;
    const avgRate = rated.reduce((s, d) => s + d.rate, 0) / rated.length;
    const best = [...rated].sort((a, b) => b.rate - a.rate)[0];
    const worst = [...rated].sort((a, b) => a.rate - b.rate)[0];
    const heavy = rated.filter((d) => d.total > 5 && d.rate < 0.5);
    const insights = [];
    if (avgRate >= 0.7) insights.push(`Strong week — ${Math.round(avgRate * 100)}% of planned work completed.`);
    else if (avgRate >= 0.45) insights.push(`Decent week at ${Math.round(avgRate * 100)}% completion. A solid foundation to build from.`);
    else insights.push(`Completion was ${Math.round(avgRate * 100)}% this week — worth reflecting on what created friction.`);
    if (best && best.rate >= 0.75 && best.total > 1) insights.push(`${best.name} was your strongest day (${best.done}/${best.total}) — notice what conditions made it flow.`);
    if (heavy.length > 0) insights.push(`Heavy-schedule days (${heavy.map((d) => d.name).join(", ")}) had lower output. Dense lists reduce completion, not improve it.`);
    if (worst && worst.rate < 0.3 && worst.total > 1) {
      const recovered = rated.find((d) => d.date > worst.date && d.rate > 0.5);
      insights.push(recovered ? `You bounced back after ${worst.name}'s difficult session — that resilience counts.` : `${worst.name} was a rough day. Identifying the trigger helps design next week better.`);
    }
    return { insights: insights.slice(0, 4), avgRate };
  }, [tasks, today]);

  // ── Adaptive recommendations ─────────────────────────────────────────────────
  const adaptiveRecs = useMemo(() => {
    const recs = [];
    if (momentum.state === "overloaded") recs.push("Cut your task list by ~30% this week — volume is the problem, not effort.");
    if (focusPatterns?.peakPct >= 35) recs.push(`${focusPatterns.peakPct}% of completions happen in the ${focusPatterns.peak.label.toLowerCase()} (${focusPatterns.peak.range}). Guard that window.`);
    const heavyDays = workloadForecast.filter((d) => d.level === "heavy");
    if (heavyDays.length > 0) recs.push(`${heavyDays.map((d) => d.label).join(", ")} ${heavyDays.length === 1 ? "looks" : "look"} overloaded — move some tasks to lighter days.`);
    if (mostAvoided?.daysOverdue >= 3) recs.push(`"${mostAvoided.task.title}" has been waiting ${mostAvoided.daysOverdue} days. A 5-minute start breaks the avoidance loop.`);
    if (momentum.state === "stable") recs.push("Consistent rhythm detected. Don't add tasks on already-full days — protect what's working.");
    if (energy <= 3) recs.push("Low energy: 25-min focused blocks beat long exhausted sessions every single time.");
    if (relaxation <= 3) recs.push("Stress is elevated. One completed task restores more calm than five half-started ones.");
    return recs.slice(0, 3);
  }, [momentum, focusPatterns, workloadForecast, mostAvoided, energy, relaxation]);

  // ── New engine layer: the 6 status metrics ───────────────────────────────────
  const focusStats = userPrefs?.focus_stats ?? null;

  const metrics = useMemo(() => ({
    mentalBattery: computeMentalBattery({ energy, morningCheckup, taskWeights, userLoadBaseline, todayTasks, recoveryState }),
    recoveryIndex: computeRecoveryIndex({ recoveryState }),
    momentum: computeMomentumMetric({ momentum, weekData }),
    consistency: computeConsistency({ days14: behaviorProfile.days14 }),
    deepWorkCapacity: computeDeepWorkCapacity({ energy, workloadForecast, recoveryState, focusStats }),
    attentionStability: computeAttentionStability({ focusStats }),
  }), [energy, morningCheckup, taskWeights, userLoadBaseline, todayTasks, recoveryState, momentum, weekData, behaviorProfile, workloadForecast, focusStats]);

  // Per-metric topFactor derivation for interpretation copy. Only Mental
  // Battery needs one today — the other 5 banks key off bucket alone.
  const mentalBatteryTopFactor = recoveryState.level !== "stable" ? "recovery_state"
    : workloadForecast[0]?.level === "heavy" ? "heavy_today"
    : morningCheckup?.readinessScore == null ? "baseline_only"
    : "low_readiness";

  const heuristicInterpretations = useMemo(() => ({
    mentalBattery: generateInterpretation("mental_battery", { value: metrics.mentalBattery.value, bucket: metrics.mentalBattery.bucket, topFactor: mentalBatteryTopFactor }),
    recoveryIndex: generateInterpretation("recovery_index", { value: metrics.recoveryIndex.value, bucket: metrics.recoveryIndex.bucket }),
    momentum: generateInterpretation("momentum", { value: metrics.momentum.value, bucket: metrics.momentum.bucket, trend: metrics.momentum.trend }),
    consistency: generateInterpretation("consistency", { value: metrics.consistency.value, bucket: metrics.consistency.bucket }),
    deepWorkCapacity: generateInterpretation("deep_work_capacity", { value: metrics.deepWorkCapacity.value, bucket: metrics.deepWorkCapacity.bucket }),
    attentionStability: generateInterpretation("attention_stability", { value: metrics.attentionStability.value, bucket: metrics.attentionStability.bucket }),
  }), [metrics, mentalBatteryTopFactor]);

  // ── AI upgrade path for interpretation copy ───────────────────────────────────
  // Mirrors MorningCheckup.js's aiTips ?? finalSummary.tips convention exactly:
  // the heuristic banks above always render immediately; this only ever
  // *replaces* sentence/action/improvement text per metric once a `status_coach`
  // call to api/tips.js succeeds. Numbers/buckets never come from the network.
  const prevRecoveryScore = useMemo(() => {
    const yesterday = addDays(today, -1);
    return dailyMetrics?.[yesterday]?.recoveryScore ?? null;
  }, [dailyMetrics, today]);

  const coachItems = useMemo(() => {
    const list = [
      { localKey: "mentalBattery", key: "mental_battery", value: metrics.mentalBattery.value, prevValue: null, bucket: metrics.mentalBattery.bucket, topFactor: mentalBatteryTopFactor },
      { localKey: "recoveryIndex", key: "recovery_index", value: metrics.recoveryIndex.value, prevValue: prevRecoveryScore, bucket: metrics.recoveryIndex.bucket, topFactor: null },
      { localKey: "momentum", key: "momentum", value: metrics.momentum.value, prevValue: metrics.momentum.yesterdayToday?.yesterday ?? null, bucket: metrics.momentum.bucket, topFactor: null },
      { localKey: "consistency", key: "consistency", value: metrics.consistency.value, prevValue: null, bucket: metrics.consistency.bucket, topFactor: null },
      { localKey: "deepWorkCapacity", key: "deep_work_capacity", value: metrics.deepWorkCapacity.value, prevValue: null, bucket: metrics.deepWorkCapacity.bucket, topFactor: null },
    ];
    if (!metrics.attentionStability.gated) {
      list.push({ localKey: "attentionStability", key: "attention_stability", value: metrics.attentionStability.value, prevValue: null, bucket: metrics.attentionStability.bucket, topFactor: null });
    }
    return list;
  }, [metrics, mentalBatteryTopFactor, prevRecoveryScore]);

  // Cheap content hash (not a real hash — just the bucket/topFactor fingerprint)
  // so a fetch only fires when what would actually change the copy has changed,
  // not on every render.
  const coachSignature = useMemo(
    () => coachItems.map((it) => `${it.key}:${it.bucket}:${it.topFactor ?? ""}`).join("|"),
    [coachItems]
  );

  const [aiInterpretations, setAiInterpretations] = useState(null);
  const coachRequestedSignatureRef = useRef(null);

  useEffect(() => {
    if (!coachItems.length) return;
    if (coachRequestedSignatureRef.current === coachSignature) return;
    coachRequestedSignatureRef.current = coachSignature;

    let cached = null;
    try {
      const raw = localStorage.getItem("nora_status_coach_cache");
      if (raw) cached = JSON.parse(raw);
    } catch {}

    if (cached && cached.date === today && cached.signature === coachSignature) {
      setAiInterpretations(cached.items);
      return;
    }

    setAiInterpretations(null); // clear stale AI text from a prior signature while this fetches
    fetch(apiUrl("/api/tips"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "status_coach",
        context: {
          items: coachItems.map(({ key, value, prevValue, bucket, topFactor }) => ({ key, value, prevValue, bucket, topFactor })),
          noraStateKey: noraState?.key,
          workloadToday: workloadForecast[0]?.level,
          deferredCount: deferredTasks.length,
          focusPeak: focusPatterns?.peak?.label,
          sleepQuality: todaySleepQuality,
          dayOfWeek: new Date(today + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" }),
        },
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!Array.isArray(d.items) || !d.items.length) return;
        const byKey = {};
        for (const it of d.items) {
          if (it && typeof it.key === "string") byKey[it.key] = it;
        }
        const merged = {};
        for (const item of coachItems) {
          const ai = byKey[item.key];
          if (ai?.sentence && ai?.action && ai?.improvement) {
            merged[item.localKey] = { sentence: ai.sentence, action: ai.action, improvement: ai.improvement };
          }
        }
        if (Object.keys(merged).length) {
          setAiInterpretations(merged);
          try {
            localStorage.setItem("nora_status_coach_cache", JSON.stringify({ date: today, signature: coachSignature, items: merged }));
          } catch {}
        }
      })
      .catch(() => {/* heuristic interpretations already stand */});
  }, [coachItems, coachSignature, today, noraState, workloadForecast, deferredTasks, focusPatterns, todaySleepQuality]);

  const interpretations = useMemo(() => {
    if (!aiInterpretations) return heuristicInterpretations;
    const out = {};
    for (const k of Object.keys(heuristicInterpretations)) {
      out[k] = aiInterpretations[k] ?? heuristicInterpretations[k];
    }
    return out;
  }, [heuristicInterpretations, aiInterpretations]);

  // ── Mined behavioral patterns (top 3-4, by confidence) ───────────────────────
  const patterns = useMemo(() => (
    minePatternsFromHistory({ tasks, taskWeights, dailyMetrics, today }).map((p) => p.text)
  ), [tasks, taskWeights, dailyMetrics, today]);

  // Emotional-drift call-outs (e.g. "Mondays run rougher") — not part of the
  // explicit useStatusEngine return list in the spec, but computeEmotionalDrift
  // is a fully-built patterns.js export, so it's surfaced here too under its
  // own key for whoever wires the Status page up next.
  const emotionalDrift = useMemo(() => computeEmotionalDrift({ dailyMetrics }), [dailyMetrics]);

  // ── Best focus window (90-min sliding scan over completion history) ─────────
  const flowPrediction = useMemo(() => (
    computeBestFocusWindow(tasks.filter((t) => t.completed && t.startHour != null && t.type !== "break"))
  ), [tasks]);

  // ── Recovery Index 3-day decline check ───────────────────────────────────────
  // App.js's daily-metrics snapshot effect now persists recoveryState.score
  // each day as `recoveryScore`, so this reads real history instead of a stub.
  const recoveryTrendDeclining3d = useMemo(() => {
    const dates = Object.keys(dailyMetrics ?? {}).sort().slice(-4); // last 4 days incl. today
    const scores = dates.map((d) => dailyMetrics[d]?.recoveryScore).filter((s) => s != null);
    if (scores.length < 3) return false;
    const last3 = scores.slice(-3);
    const monotonicDecline = last3[0] > last3[1] && last3[1] > last3[2];
    const cumulativeDrop = scores[0] - scores[scores.length - 1] >= 15;
    return monotonicDecline || cumulativeDrop;
  }, [dailyMetrics]);

  // Attention fragmentation is tracked at the focus-session level (nora_focus_log),
  // not in the daily snapshot, so there's no per-day history to detect "since
  // Tuesday" style onset from yet — stays dormant until that tracking exists.
  const attentionFragmentedSinceDay = null;

  // ── AI Coach hero headline ────────────────────────────────────────────────────
  const aiCoach = useMemo(() => ({
    headline: generateCoachHeadline({
      noraState,
      recoveryTrendDeclining3d,
      attentionFragmentedSinceDay,
      metrics,
    }),
  }), [noraState, recoveryTrendDeclining3d, attentionFragmentedSinceDay, metrics]);

  // ── Action Center (top up to 4 concrete next actions) ────────────────────────
  const actionCenter = useMemo(() => {
    const items = [];
    if (momentum.state === "overloaded" || ["high", "recovery", "burnout"].includes(recoveryState.level)) {
      items.push({ actionKey: "reduce_cognitive_load", label: "Reduce Cognitive Load", rationale: assessmentSummary, priority: 1 });
    }
    if (mostAvoided?.daysOverdue >= 3) {
      items.push({ actionKey: "begin_micro_start", label: "Begin Micro Start", rationale: `"${mostAvoided.task.title}" has waited ${mostAvoided.daysOverdue} days`, priority: 2 });
    }
    if (workloadForecast.slice(1, 4).some((d) => d.level === "heavy")) {
      items.push({ actionKey: "move_difficult_task_earlier", label: "Move Difficult Task Earlier", rationale: predictiveSignals[0]?.message ?? "A heavy day is coming up", priority: 3 });
    }
    if (focusPatterns?.peakPct >= 35) {
      items.push({ actionKey: "protect_morning_focus", label: "Protect Morning Focus", rationale: `${focusPatterns.peakPct}% of completions happen in the ${focusPatterns.peak.label.toLowerCase()}`, priority: 4 });
    }
    if (sleepState.pressure === "High") {
      items.push({ actionKey: "schedule_recovery_break", label: "Schedule Recovery Break", rationale: sleepState.suggestion, priority: 2 });
    }
    // Reserved for a future Relaxation Toolkit feature — not built in this
    // pass: intentionally never emitting 'recovery_walk' / 'breathing_session'.
    return items.sort((a, b) => a.priority - b.priority).slice(0, 4);
  }, [momentum, recoveryState, mostAvoided, workloadForecast, predictiveSignals, focusPatterns, sleepState, assessmentSummary]);

  // ── Implementation intention for today's top-priority task ───────────────────
  const implementationIntention = useMemo(() => (
    buildImplementationIntention(todayTasks, aiFocus.priorityTask)
  ), [todayTasks, aiFocus]);

  return {
    taskWeights,
    userLoadBaseline,
    momentum,
    recoveryState,
    workloadForecast,
    focusPatterns,
    mostAvoided,
    adaptiveRecs,
    deferredTasks,
    weeklyReflection,
    sleepState,
    userConfidence,
    assessmentSummary,
    keySignals,
    noraState,
    behaviorProfile,
    predictiveSignals,
    adaptivePlanData,
    weekData,
    weekTrend,
    metrics,
    interpretations,
    patterns,
    emotionalDrift,
    flowPrediction,
    aiCoach,
    actionCenter,
    implementationIntention,
  };
}
