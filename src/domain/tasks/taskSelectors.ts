import type { PlannerTask } from "./taskSchema";
import { addCalendarDays, formatLocalDate, formatTaskTime } from "./taskDates";
import { isRepeatMatch, isTaskOccurrence } from "./taskRecurrence";

export function getTasksForDate(tasks: PlannerTask[], date: string): PlannerTask[] {
  const direct = tasks.filter((task) => task.date === date);
  const directIds = new Set(direct.map((task) => task.id));
  return [
    ...direct,
    ...tasks.filter((task) => !directIds.has(task.id) && isRepeatMatch(task, date)),
  ];
}

export function getActiveTasksForDate(tasks: PlannerTask[], date: string): PlannerTask[] {
  return getTasksForDate(tasks, date).filter((task) => !task.completed);
}

export function buildOccupiedBlocksContext(
  tasks: PlannerTask[],
  startDate: string,
  days = 7,
): string {
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return Array.from({ length: days }, (_, index) => {
    const date = addCalendarDays(startDate, index);
    const dateString = formatLocalDate(date);
    const dayTasks = tasks.filter((task) => !task.completed && isTaskOccurrence(task, dateString));
    const scheduled = dayTasks
      .filter((task) => task.startHour != null)
      .sort((left, right) =>
        (left.startHour! * 60 + (left.startMinute ?? 0)) -
        (right.startHour! * 60 + (right.startMinute ?? 0))
      );
    const blocks = scheduled.length
      ? scheduled.map((task) => {
          const start = task.startHour! * 60 + (task.startMinute ?? 0);
          const duration = task.duration ?? (task.type === "deadline" ? 0 : 30);
          const end = start + duration;
          const label = task.type === "break"
            ? "Break"
            : task.type === "deadline" ? `[DEADLINE] ${task.title}` : task.title;
          return `${formatTaskTime(Math.floor(start / 60), start % 60)}–${formatTaskTime(Math.floor(end / 60), end % 60)} "${label}"`;
        }).join(" | ")
      : "(free)";
    const unscheduled = dayTasks.length - scheduled.length;
    return `${dayNames[date.getDay()]} ${dateString}${index === 0 ? " (today)" : ""}: ${blocks}${unscheduled > 0 ? ` +${unscheduled} unscheduled` : ""}`;
  }).join("\n");
}
