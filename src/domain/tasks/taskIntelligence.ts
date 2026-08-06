import type { PlannerTask } from "./taskSchema";
import { addCalendarDays, formatLocalDate } from "./taskDates";

export type DeadlineHealth = "healthy" | "attention" | "risk" | "critical";
export type FocusSessionRecord = {
  id: string;
  taskId: string;
  startTime: string;
  endTime: string | null;
  duration: number;
  goal: string;
  expectedOutcome: string;
  interruptions: number;
  completion: number;
  energyBefore: number | null;
  energyAfter: number | null;
};

const MINUTES_PER_DAY = 24 * 60;
const DAY_MS = 86_400_000;
const word = (value: unknown) => String(value ?? "").toLowerCase();
const isoAtMidnight = (value: string) => new Date(`${value}T00:00:00`);
const taskDuration = (task: PlannerTask) =>
  Math.max(5, Number(task.estimatedDuration ?? task.duration ?? 30));

export function inferTaskIntelligence(title: string, duration?: number | null) {
  const text = word(title);
  const inferredDuration = duration ?? (
    /email|reply|message|call|book|pay|send/.test(text) ? 15
      : /proposal|presentation|essay|research|study|chapter|design|build|implement/.test(text) ? 90
        : 45
  );
  const cognitiveLoad = inferredDuration >= 90 || /research|strategy|essay|proposal|exam|code|design/.test(text)
    ? "deep"
    : inferredDuration <= 15 || /email|reply|message|call|book|pay/.test(text)
      ? "simple"
      : "focused";
  const energyLevel = cognitiveLoad === "deep" ? "high" : cognitiveLoad === "simple" ? "low" : "medium";
  const preferredEnvironment = /call|phone|message/.test(text)
    ? "phone"
    : /walk|run|gym|outside/.test(text)
      ? "outside"
      : /meeting|interview/.test(text)
        ? "meeting"
        : /write|design|brainstorm|creative/.test(text)
          ? "creative"
          : "computer";
  const category = /email|reply|admin|invoice|finance|pay/.test(text)
    ? "Admin"
    : /study|exam|chapter|research|learn/.test(text)
      ? "Learning"
      : /gym|walk|run|health/.test(text)
        ? "Health"
        : "Work";
  const priority = /urgent|today|deadline|exam|final/.test(text) ? "high" : "medium";

  return {
    estimatedDuration: inferredDuration,
    duration: duration ?? inferredDuration,
    cognitiveLoad,
    energyLevel,
    preferredEnvironment,
    category,
    priority,
  } as const;
}

export function normalizeIntelligentTask(task: PlannerTask): PlannerTask {
  const inferred = inferTaskIntelligence(task.title, task.estimatedDuration ?? task.duration);
  const deadline = task.deadline ?? (task.type === "deadline" ? task.date : null);
  const status = task.completed
    ? "completed"
    : task.status ?? (task.date && task.date < formatLocalDate(new Date())
      ? "overdue"
      : task.startHour == null ? "inbox" : "planned");
  return {
    ...inferred,
    ...task,
    status,
    deadline,
    estimatedDuration: task.estimatedDuration ?? task.duration ?? inferred.estimatedDuration,
    duration: task.duration ?? task.estimatedDuration ?? inferred.duration,
    energyLevel: task.energyLevel ?? inferred.energyLevel,
    cognitiveLoad: task.cognitiveLoad ?? (
      task.complexity === "hard" ? "deep" : task.complexity === "easy" ? "simple" : inferred.cognitiveLoad
    ),
    priority: task.priority ?? inferred.priority,
    category: task.category ?? inferred.category,
    preferredEnvironment: task.preferredEnvironment ?? inferred.preferredEnvironment,
    tags: task.tags ?? [],
    scheduledBlocks: task.scheduledBlocks ?? [],
    focusSessions: task.focusSessions ?? [],
    history: task.history ?? [],
    createdAt: task.createdAt ?? task.updatedAt ?? "1970-01-01T00:00:00.000Z",
    completedAt: task.completedAt ?? null,
  };
}

export function migrateTaskList(tasks: PlannerTask[]) {
  return tasks.map(normalizeIntelligentTask);
}

export function calculateAvailableMinutes(
  tasks: PlannerTask[],
  from: Date,
  deadline: string,
  workday = { start: 8 * 60, end: 18 * 60 },
) {
  const end = isoAtMidnight(deadline);
  let total = 0;
  for (let cursor = new Date(from); cursor <= end; cursor = new Date(cursor.getTime() + DAY_MS)) {
    const date = formatLocalDate(cursor);
    const dayStart = date === formatLocalDate(from)
      ? Math.max(workday.start, from.getHours() * 60 + from.getMinutes())
      : workday.start;
    const occupied = tasks
      .filter((task) => task.date === date && !task.completed && task.startHour != null)
      .reduce((sum, task) => sum + taskDuration(task), 0);
    total += Math.max(0, workday.end - dayStart - occupied);
  }
  return Math.max(0, total);
}

export function calculateDeadlineHealth(
  task: PlannerTask,
  tasks: PlannerTask[],
  now = new Date(),
): { level: DeadlineHealth; requiredMinutes: number; availableMinutes: number; message: string } {
  const deadline = task.deadline ?? (task.type === "deadline" ? task.date : null);
  const requiredMinutes = Math.max(0, taskDuration(task) - Number(task.actualDuration ?? 0));
  if (!deadline || task.completed) {
    return { level: "healthy", requiredMinutes, availableMinutes: Infinity, message: "There is enough room around this task." };
  }
  const days = Math.floor((isoAtMidnight(deadline).getTime() - new Date(now).setHours(0, 0, 0, 0)) / DAY_MS);
  const availableMinutes = calculateAvailableMinutes(tasks.filter((item) => item.id !== task.id), now, deadline);
  const ratio = requiredMinutes / Math.max(1, availableMinutes);
  const level: DeadlineHealth = days < 0 || (days <= 0 && ratio > 0.6)
    ? "critical"
    : ratio > 1 ? "risk"
      : ratio > 0.55 || days <= 1 ? "attention"
        : "healthy";
  const message = level === "critical"
    ? "This needs a decision now. Nora can protect time or reduce the scope."
    : level === "risk"
      ? `This needs about ${requiredMinutes} minutes, but only ${availableMinutes} appear open.`
      : level === "attention"
        ? "This is still achievable, but it needs protected time soon."
        : "There is enough workable time before the deadline.";
  return { level, requiredMinutes, availableMinutes, message };
}

export function suggestTaskSchedule(
  task: PlannerTask,
  tasks: PlannerTask[],
  now = new Date(),
  preferredHours: number[] = [9, 10, 14, 15],
) {
  const today = formatLocalDate(now);
  const deadline = task.deadline ?? task.date ?? formatLocalDate(addCalendarDays(today, 7));
  const duration = taskDuration(task);
  const blockSize = task.cognitiveLoad === "deep" ? 90 : Math.min(60, duration);
  const blocksNeeded = Math.max(1, Math.ceil(duration / blockSize));
  const blocks: Array<{ date: string; startHour: number; startMinute: number; duration: number }> = [];
  for (let offset = 0; offset < 30 && blocks.length < blocksNeeded; offset++) {
    const dateObj = addCalendarDays(today, offset);
    const date = formatLocalDate(dateObj);
    if (date > deadline) break;
    for (const hour of preferredHours) {
      const occupied = tasks.some((item) => {
        if (item.date !== date || item.startHour == null || item.completed) return false;
        const itemStart = item.startHour * 60 + (item.startMinute ?? 0);
        const candidate = hour * 60;
        return candidate < itemStart + taskDuration(item) && itemStart < candidate + blockSize;
      });
      if (!occupied && (date !== formatLocalDate(now) || hour * 60 > now.getHours() * 60 + now.getMinutes())) {
        blocks.push({ date, startHour: hour, startMinute: 0, duration: Math.min(blockSize, duration - blocks.length * blockSize) });
        break;
      }
    }
  }
  return {
    blocks,
    feasible: blocks.length === blocksNeeded,
    summary: blocks.length
      ? `${blocks.length} protected ${blockSize}-minute ${blocks.length === 1 ? "session" : "sessions"}, starting ${blocks[0].date} at ${String(blocks[0].startHour).padStart(2, "0")}:00.`
      : "The current plan has no clean opening. Nora can rebalance the week.",
  };
}

export function suggestReschedule(task: PlannerTask, tasks: PlannerTask[], now = new Date()) {
  const schedule = suggestTaskSchedule({ ...task, date: null, startHour: null, startMinute: null }, tasks, now);
  const movedCount = (task.history ?? []).filter((event) => event.type === "rescheduled").length;
  return {
    action: movedCount >= 2 || taskDuration(task) > 90 ? "split" : schedule.feasible ? "move" : "reduce",
    proposal: schedule.blocks[0] ?? null,
    message: movedCount >= 2
      ? "This task has moved more than once. Splitting it may make the next step easier."
      : schedule.blocks[0]
        ? `Looks like this task moved. ${schedule.summary}`
        : "The week is crowded. Reducing the scope may protect the deadline.",
  };
}

export function recommendBreak({
  focusMinutes,
  cognitiveLoad = "focused",
  energy = 5,
  recovery = 70,
}: {
  focusMinutes: number;
  cognitiveLoad?: "simple" | "focused" | "deep";
  energy?: number;
  recovery?: number;
}) {
  let minutes = focusMinutes >= 150 ? 30 : focusMinutes >= 80 ? 12 : focusMinutes >= 45 ? 7 : 4;
  if (cognitiveLoad === "deep") minutes += 2;
  if (energy <= 3 || recovery < 45) minutes += 3;
  minutes = Math.min(30, Math.max(3, minutes));
  const type = minutes >= 20 ? "recovery" : cognitiveLoad === "deep" ? "physical" : "mental";
  const suggestion = type === "recovery"
    ? "Eat, rest, or step into sunlight."
    : type === "physical" ? "Stand, stretch, drink water, or walk briefly." : "Look outside and let your attention become quiet.";
  return { minutes, type, suggestion };
}

export function createFocusSession(
  task: PlannerTask,
  duration?: number,
  now = new Date(),
): FocusSessionRecord {
  const minutes = duration ?? (
    task.cognitiveLoad === "deep" ? 90 : task.cognitiveLoad === "simple" ? 25 : 50
  );
  const firstNote = task.notes?.split(/[.\n]/).map((line) => line.trim()).find(Boolean);
  const outcome = firstNote ?? (
    task.intention ? `Move this forward because ${task.intention}` : `Complete one visible part of ${task.title}.`
  );
  return {
    id: `${task.id}-${now.getTime()}`,
    taskId: task.id,
    startTime: now.toISOString(),
    endTime: null,
    duration: minutes,
    goal: outcome,
    expectedOutcome: outcome,
    interruptions: 0,
    completion: 0,
    energyBefore: null,
    energyAfter: null,
  };
}

export function buildProductivityProfile(tasks: PlannerTask[], focusLog: Array<Record<string, unknown>>) {
  const completedSessions = focusLog.filter((event) => event.type === "completed");
  const durations = completedSessions.map((event) => Number(event.actual ?? 0)).filter(Boolean);
  const completed = tasks.filter((task) => task.completed && task.actualDuration && task.estimatedDuration);
  const estimationAccuracy = completed.length
    ? Math.round(completed.reduce((sum, task) =>
      sum + Math.min(task.actualDuration!, task.estimatedDuration!) / Math.max(task.actualDuration!, task.estimatedDuration!), 0
    ) / completed.length * 100)
    : null;
  const hourCounts = new Map<number, number>();
  completedSessions.forEach((event) => {
    const hour = new Date(Number(event.ts)).getHours();
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
  });
  return {
    averageFocusDuration: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null,
    preferredWorkTimes: [...hourCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([hour]) => hour),
    taskEstimationAccuracy: estimationAccuracy,
    breakPreference: durations.length && durations.reduce((sum, value) => sum + value, 0) / durations.length >= 60 ? "longer recovery" : "short reset",
    procrastinationPatterns: tasks.filter((task) => task.status === "deferred" || task.status === "overdue")
      .reduce<Record<string, number>>((acc, task) => ({ ...acc, [task.category ?? "Other"]: (acc[task.category ?? "Other"] ?? 0) + 1 }), {}),
  };
}

export function buildDailyPlan(tasks: PlannerTask[], date: string, energy = 5) {
  const today = tasks.filter((task) => task.date === date && !task.completed && task.type !== "break");
  const ranked = [...today].sort((a, b) => {
    const score = (task: PlannerTask) =>
      ({ critical: 4, high: 3, medium: 2, low: 1 }[task.priority ?? "medium"])
      + (task.deadline === date ? 3 : 0)
      + (task.energyLevel === "high" && energy >= 6 ? 1 : 0);
    return score(b) - score(a);
  });
  return {
    topPriorities: ranked.slice(0, 3),
    scheduled: ranked.filter((task) => task.startHour != null),
    flexible: ranked.filter((task) => task.startHour == null),
    suggestedRhythm: ranked.slice(0, 4).map((task, index) => ({
      time: task.startHour != null ? `${String(task.startHour).padStart(2, "0")}:${String(task.startMinute ?? 0).padStart(2, "0")}` : index === 0 ? "09:00" : "Flexible",
      task: task.title,
      mode: task.cognitiveLoad === "deep" ? "Deep Work" : task.cognitiveLoad === "simple" ? "Admin" : "Focus",
    })),
  };
}

export function buildDailyReview(
  tasks: PlannerTask[],
  date: string,
  focusMinutes = 0,
) {
  const day = tasks.filter((task) => task.date === date && task.type !== "break");
  const completed = day.filter((task) => task.completed);
  const hardest = completed.find((task) => task.cognitiveLoad === "deep" || task.energyLevel === "high");
  const lateAdmin = day.filter((task) =>
    !task.completed && task.category === "Admin" && (task.startHour ?? 0) >= 18
  );
  return {
    completedCount: completed.length,
    focusMinutes,
    achievement: hardest
      ? `You completed “${hardest.title}”, one of today’s most demanding tasks.`
      : completed.length ? `You completed ${completed.length} meaningful ${completed.length === 1 ? "task" : "tasks"}.` : null,
    observation: lateAdmin.length ? "Administrative work became harder to finish after 18:00." : null,
    tomorrowSuggestion: lateAdmin.length ? "Place administrative work earlier tomorrow." : null,
  };
}

export function buildWeeklyIntelligence(
  tasks: PlannerTask[],
  now = new Date(),
) {
  const start = new Date(now.getTime() - 6 * DAY_MS);
  start.setHours(0, 0, 0, 0);
  const recent = tasks.filter((task) => {
    if (!task.date) return false;
    return isoAtMidnight(task.date) >= start && isoAtMidnight(task.date) <= now;
  });
  const plannedDeep = recent.filter((task) => task.cognitiveLoad === "deep");
  const completedDeep = plannedDeep.filter((task) => task.completed);
  const estimated = recent.filter((task) => task.completed && task.estimatedDuration && task.actualDuration);
  const estimationDelta = estimated.length
    ? Math.round(estimated.reduce((sum, task) =>
      sum + (task.actualDuration! - task.estimatedDuration!) / task.estimatedDuration!, 0
    ) / estimated.length * 100)
    : null;
  const weekdayCounts = new Map<string, number>();
  recent.filter((task) => task.completed).forEach((task) => {
    const day = isoAtMidnight(task.date!).toLocaleDateString(undefined, { weekday: "long" });
    weekdayCounts.set(day, (weekdayCounts.get(day) ?? 0) + 1);
  });
  const strongestDay = [...weekdayCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const insights = [];
  if (plannedDeep.length >= 2) insights.push(`You completed ${Math.round(completedDeep.length / plannedDeep.length * 100)}% of planned deep work.`);
  if (strongestDay) insights.push(`${strongestDay} was your strongest completion day.`);
  if (estimationDelta != null && Math.abs(estimationDelta) >= 10) {
    insights.push(estimationDelta > 0
      ? `Tasks took about ${estimationDelta}% longer than estimated.`
      : `Tasks took about ${Math.abs(estimationDelta)}% less time than estimated.`);
  }
  return { deepWorkCompletionRate: plannedDeep.length ? Math.round(completedDeep.length / plannedDeep.length * 100) : null, estimationDelta, strongestDay, insights };
}

export function minutesUntil(date: string, now = new Date()) {
  return Math.round((isoAtMidnight(date).getTime() - now.getTime()) / 60_000);
}

export const TASK_INTELLIGENCE_VERSION = 2;
export const MAX_DAY_MINUTES = MINUTES_PER_DAY;
