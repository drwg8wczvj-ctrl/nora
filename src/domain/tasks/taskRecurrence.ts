import type { PlannerTask } from "./taskSchema";
import { daysBetween } from "./taskDates";

export function isTaskOccurrence(task: PlannerTask, date: string): boolean {
  if (task.date === date) return true;
  return isRepeatMatch(task, date);
}

// Repeated occurrences are projections of the original record. Completion is
// still record-wide in the legacy model; per-occurrence completion belongs to
// the normalized task-occurrences model planned for Phase 3.
export function isRepeatMatch(task: PlannerTask, date: string): boolean {
  if (!task.repeat || !task.date || task.date === date || task.date > date) return false;
  if (task.repeatEnd && task.repeatEnd < date) return false;

  const difference = daysBetween(task.date, date);
  if (difference <= 0) return false;
  if (task.repeat === "daily") return true;
  if (task.repeat === "weekly") return difference % 7 === 0;

  const base = new Date(`${task.date}T00:00:00`);
  const target = new Date(`${date}T00:00:00`);
  return task.repeat === "monthly" && target.getDate() === base.getDate();
}
