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
  const changedAt = new Date().toISOString();
  return tasks.map((task) => {
    if (task.id !== id) return task;
    const completed = !task.completed;
    return {
      ...task,
      completed,
      status: completed ? "completed" : (task.startHour == null ? "inbox" : "planned"),
      completedAt: completed ? changedAt : null,
      history: [
        ...(task.history ?? []),
        { type: completed ? "completed" : "reopened", at: changedAt },
      ].slice(-1000),
    };
  });
}

export function rescheduleTask(
  tasks: PlannerTask[],
  id: PlannerTask["id"],
  date: string,
  startHour: number | null = null,
  startMinute: number | null = null,
): PlannerTask[] {
  return tasks.map((task) =>
    task.id === id ? {
      ...task,
      date,
      startHour,
      startMinute,
      status: "deferred",
      history: [...(task.history ?? []), {
        type: "rescheduled",
        at: new Date().toISOString(),
        from: task.date,
        to: date,
      }].slice(-1000),
    } : task
  );
}

export function moveTaskToSlot(
  tasks: PlannerTask[],
  id: PlannerTask["id"],
  startHour: number,
  startMinute: number,
): PlannerTask[] {
  return tasks.map((task) =>
    task.id === id ? { ...task, startHour, startMinute, status: "planned" } : task
  );
}
