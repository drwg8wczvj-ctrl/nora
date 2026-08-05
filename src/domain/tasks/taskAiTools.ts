import { formatLocalDate, formatTaskTime, padTime } from "./taskDates";
import type { PlannerTask } from "./taskSchema";
import { removeTask, toggleTaskCompletion } from "./taskMutations";

type ToolInput = Record<string, unknown>;

export interface TaskToolResult {
  result: string;
  nextTasks: PlannerTask[];
}

interface TaskToolOptions {
  now?: Date;
  createId?: () => string;
}

export function executeTaskTool(
  name: string,
  input: ToolInput,
  currentTasks: PlannerTask[],
  options: TaskToolOptions = {},
): TaskToolResult {
  if (name === "add_task") {
    const title = String(input.title ?? "").trim();
    const date = String(input.date ?? "");
    const normalizedTitle = title.toLowerCase();
    const existing = currentTasks.find((task) =>
      task.title.toLowerCase().trim() === normalizedTitle &&
      task.date === date &&
      !task.completed
    );
    if (existing) {
      return {
        result: `Duplicate prevented: "${title}" on ${date} already exists (id: ${existing.id}). Use move_task to reschedule it or delete_task to remove it first.`,
        nextTasks: currentTasks,
      };
    }

    const startHour = typeof input.startHour === "number" ? input.startHour : null;
    const startMinute = typeof input.startMinute === "number" ? input.startMinute : null;
    const now = options.now ?? new Date();
    if (startHour != null && date === formatLocalDate(now)) {
      const inputMinutes = startHour * 60 + (startMinute ?? 0);
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      if (inputMinutes <= currentMinutes) {
        return {
          result: `Rejected: "${title}" at ${formatTaskTime(startHour, startMinute ?? 0)} is in the past (now ${padTime(now.getHours())}:${padTime(now.getMinutes())}). Choose a later time and try again.`,
          nextTasks: currentTasks,
        };
      }
    }

    const type = input.type === "deadline" || input.type === "break" ? input.type : "task";
    const task: PlannerTask = {
      id: options.createId?.() ?? crypto.randomUUID(),
      title,
      date,
      type,
      startHour,
      startMinute,
      duration: typeof input.duration === "number" ? input.duration : null,
      repeat: input.repeat === "daily" || input.repeat === "weekly" || input.repeat === "monthly"
        ? input.repeat : null,
      repeatEnd: null,
      completed: false,
      notes: typeof input.notes === "string" ? input.notes : "",
      complexity: input.complexity === "easy" || input.complexity === "medium" || input.complexity === "hard"
        ? input.complexity : null,
      groupId: typeof input.groupId === "string" || typeof input.groupId === "number" ? input.groupId : null,
      reminderOffset: typeof input.reminderOffset === "number" ? input.reminderOffset : null,
    };
    return {
      result: `Created ${task.type} "${task.title}" on ${task.date}`,
      nextTasks: [...currentTasks, task],
    };
  }

  const taskId = String(input.taskId ?? "");
  const task = currentTasks.find((item) => item.id === taskId);
  if (!task) return { result: `Task ${taskId} not found`, nextTasks: currentTasks };

  if (name === "move_task") {
    return {
      result: `Moved "${task.title}" to ${String(input.date ?? task.date)}`,
      nextTasks: currentTasks.map((item) => item.id !== taskId ? item : {
        ...item,
        date: typeof input.date === "string" ? input.date : item.date,
        startHour: Object.hasOwn(input, "startHour")
          ? (typeof input.startHour === "number" ? input.startHour : null)
          : item.startHour,
        startMinute: Object.hasOwn(input, "startMinute")
          ? (typeof input.startMinute === "number" ? input.startMinute : null)
          : item.startMinute,
      }),
    };
  }

  if (name === "complete_task") {
    const completed = input.completed !== false;
    const nextTasks = task.completed === completed
      ? currentTasks
      : toggleTaskCompletion(currentTasks, taskId);
    return {
      result: `Marked "${task.title}" ${completed ? "complete" : "incomplete"}`,
      nextTasks,
    };
  }

  if (name === "delete_task") {
    return {
      result: `Deleted "${task.title}"`,
      nextTasks: removeTask(currentTasks, taskId),
    };
  }

  return { result: `Unknown tool: ${name}`, nextTasks: currentTasks };
}
