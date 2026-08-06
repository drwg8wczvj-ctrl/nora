import { useEffect, useMemo, useRef, useState } from "react";
import { buildDeskObservation } from "./deskModeModel";

const MIN_INTERVAL = 20 * 60 * 1000;
const MAX_INTERVAL = 40 * 60 * 1000;

export function chooseAmbientInterval(random = Math.random) {
  return Math.round(MIN_INTERVAL + random() * (MAX_INTERVAL - MIN_INTERVAL));
}

export function buildAmbientCandidates({ ctx, timeline, now, focusStats }) {
  const items = [];
  const base = buildDeskObservation({
    done: ctx.doneToday,
    total: ctx.totalToday,
    momentum: ctx.momentum,
    energy: ctx.energy,
    recovery: ctx.healthSummary?.recoveryScore,
    nextTask: timeline.next,
    timeline,
    now,
    mostAvoided: ctx.mostAvoided,
  });
  if (base) items.push(base);
  if (timeline.freeMinutes >= 120) items.push(`You have ${Math.round(timeline.freeMinutes / 60)} hours of unscheduled time left today.`);
  if (ctx.doneToday > 0 && ctx.aiFocus?.priorityTask?.completed) items.push("You've already completed today's highest-priority task.");
  if (focusStats.currentStreak >= 3) items.push(`Your focus streak has reached ${focusStats.currentStreak} days.`);
  if (ctx.deferredTasks?.length >= 3) items.push(`${ctx.deferredTasks.length} tasks are waiting beyond their planned day.`);
  if (ctx.healthSummary?.activityStepsToday != null
      && ctx.healthSummary.activityStepsToday < 1000
      && now.getHours() >= 14) {
    items.push("Movement has been low today. A short walk would fit the current rhythm.");
  }
  return [...new Set(items.filter(Boolean))];
}

export function useAmbientIntelligence({ ctx, timeline, now, focusStats }) {
  const candidates = useMemo(
    () => buildAmbientCandidates({ ctx, timeline, now, focusStats }),
    [ctx, focusStats, now, timeline],
  );
  const [index, setIndex] = useState(0);
  const timerRef = useRef(null);
  useEffect(() => {
    window.clearTimeout(timerRef.current);
    if (candidates.length < 2) return undefined;
    timerRef.current = window.setTimeout(() => {
      setIndex((current) => (current + 1) % candidates.length);
    }, chooseAmbientInterval());
    return () => window.clearTimeout(timerRef.current);
  }, [candidates, index]);
  return candidates[index % Math.max(1, candidates.length)] ?? null;
}
