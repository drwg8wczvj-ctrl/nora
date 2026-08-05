import type { PlannerTask } from "./taskSchema";

export function upsertTask(tasks: PlannerTask[], task: PlannerTask): PlannerTask[] {
  return tasks.some((item) => item.id === task.id)
    ? tasks.map((item) => item.id === task.id ? { ...task } : item)
    : [...tasks, task];
}

export function removeTask(tasks: PlannerTask[], id: PlannerTask["id"]): PlannerTask[] {
  return tasks.filter((task) => task.id !== id);
}

export function toggleTaskCompletion(tasks: PlannerTask[], id: PlannerTask["id"]): PlannerTask[] {
  return tasks.map((task) =>
    task.id === id ? { ...task, completed: !task.completed } : task
  );
}

export function rescheduleTask(
  tasks: PlannerTask[],
  id: PlannerTask["id"],
  date: string,
  startHour: number | null = null,
  startMinute: number | null = null,
): PlannerTask[] {
  return tasks.map((task) =>
    task.id === id ? { ...task, date, startHour, startMinute } : task
  );
}

export function moveTaskToSlot(
  tasks: PlannerTask[],
  id: PlannerTask["id"],
  startHour: number,
  startMinute: number,
): PlannerTask[] {
  return tasks.map((task) =>
    task.id === id ? { ...task, startHour, startMinute } : task
  );
}
