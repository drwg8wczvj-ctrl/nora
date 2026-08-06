export const DESK_WORKSPACES = [
  { id: "now", label: "Now" },
  { id: "focus", label: "Focus" },
  { id: "timeline", label: "Timeline" },
  { id: "music", label: "Music" },
  { id: "insights", label: "Insights" },
  { id: "journal", label: "Journal" },
  { id: "health", label: "Health" },
];

// Backwards-compatible export for stored Desk Mode preferences and old tests.
export const DESK_PAGES = DESK_WORKSPACES;

export const NOW_WIDGETS = [
  { id: "clock", label: "Clock", size: "hero" },
  { id: "focus", label: "Current focus", size: "wide" },
  { id: "schedule", label: "Schedule", size: "standard" },
  { id: "progress", label: "Progress", size: "standard" },
  { id: "energy", label: "Energy", size: "compact" },
  { id: "recovery", label: "Recovery", size: "compact" },
  { id: "music", label: "Music", size: "wide" },
  { id: "observation", label: "AI observation", size: "wide" },
];

const DAY_MS = 86400000;
const pad = (value) => String(value).padStart(2, "0");
export const dateKey = (date = new Date()) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export function taskMinutes(task) {
  return task?.startHour == null ? null : task.startHour * 60 + (task.startMinute ?? 0);
}

export function buildDeskTimeline(tasks = [], now = new Date()) {
  const today = dateKey(now);
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const allToday = tasks
    .filter((task) => task.date === today && taskMinutes(task) != null)
    .sort((a, b) => taskMinutes(a) - taskMinutes(b));
  const items = allToday.filter((task) => !task.completed);
  const current = items.find((task) => {
    const start = taskMinutes(task);
    return start <= currentMinutes && currentMinutes < start + (task.duration ?? 60);
  }) ?? null;
  const next = items.find((task) => taskMinutes(task) > currentMinutes) ?? null;
  const nextMeeting = items.find((task) =>
    taskMinutes(task) > currentMinutes
    && (task.type === "meeting" || /\b(meeting|call|sync|interview)\b/i.test(task.title ?? ""))
  ) ?? null;
  const gaps = [];
  let cursor = Math.max(currentMinutes, 8 * 60);
  for (const task of items.filter((item) => taskMinutes(item) >= cursor)) {
    const start = taskMinutes(task);
    if (start - cursor >= 20) gaps.push({ start: cursor, end: start, minutes: start - cursor });
    cursor = Math.max(cursor, start + (task.duration ?? 60));
  }
  const dayEnd = 20 * 60;
  if (dayEnd - cursor >= 20) gaps.push({ start: cursor, end: dayEnd, minutes: dayEnd - cursor });
  const freeMinutes = gaps.reduce((sum, gap) => sum + gap.minutes, 0);
  return { items, allToday, current, next, nextMeeting, gaps, freeMinutes };
}

export function deskGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 5) return "Still awake";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  if (hour < 22) return "Good evening";
  return "Time to wind down";
}

export function buildSmartClockContext({ now = new Date(), timeline, done = 0, total = 0 } = {}) {
  const hour = now.getHours();
  if (hour < 12) {
    return {
      period: "Morning",
      headline: timeline?.next?.title ? `First up: ${timeline.next.title}` : "A quiet start",
    };
  }
  if (hour < 18) {
    const remaining = Math.max(0, total - done);
    return {
      period: "Afternoon",
      headline: timeline?.current?.title
        ? `Working on ${timeline.current.title}`
        : `${remaining} planned ${remaining === 1 ? "task" : "tasks"} remain`,
    };
  }
  if (hour < 22) {
    return {
      period: "Evening",
      headline: total ? `${Math.round((done / total) * 100)}% of today complete` : "Room to reflect",
    };
  }
  return {
    period: "Night",
    headline: timeline?.next?.title ? `Tomorrow begins with ${timeline.next.title}` : "Let the day close",
  };
}

export function buildDeskObservation({
  done = 0,
  total = 0,
  momentum,
  energy,
  recovery,
  nextTask,
  timeline,
  now = new Date(),
  mostAvoided,
} = {}) {
  if (done > 0 && done === total) return "You've closed every planned task for today. Let the rest of the day feel lighter.";
  if (recovery != null && recovery < 45) return "Recovery is low. Shorter focus blocks will protect the quality of your work.";
  if (energy != null && energy <= 4) return "Your energy is quieter today. A gentle, clearly bounded next step will work better than forcing intensity.";
  if (timeline?.freeMinutes >= 120 && now.getHours() >= 12) return `This afternoon still has about ${Math.round(timeline.freeMinutes / 60)} hours of open space.`;
  if (done >= 3) return `You've already completed ${done} meaningful tasks today. Your consistency is carrying the day.`;
  if (mostAvoided?.daysOverdue >= 3) return `“${mostAvoided.task.title}” has been waiting ${mostAvoided.daysOverdue} days. It may need a smaller first step.`;
  if (momentum?.label) return `${momentum.label}. Keep the next step smaller than the motivation it requires.`;
  if (nextTask?.title) return `Your next clear commitment is “${nextTask.title}.” Nothing else needs your attention yet.`;
  return "Your day has room in it. Nora is quietly watching for the next useful moment.";
}

export function readFocusLog(storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage?.getItem("nora_focus_log") ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function computeDeskFocusStats(log = [], now = new Date()) {
  const today = dateKey(now);
  const started = log.filter((event) => event.type === "started");
  const completed = log.filter((event) => event.type === "completed");
  const completedWithDate = completed.map((event) => ({
    ...event,
    day: dateKey(new Date(event.ts)),
    minutes: Math.max(0, Number(event.actual ?? event.plannedDuration ?? 0)),
  }));
  const todayCompleted = completedWithDate.filter((event) => event.day === today);
  const todayMinutes = todayCompleted.reduce((sum, event) => sum + event.minutes, 0);
  const longestSession = completedWithDate.reduce((max, event) => Math.max(max, event.minutes), 0);
  const deepWorkMinutes = completedWithDate
    .filter((event) => event.minutes >= 25)
    .reduce((sum, event) => sum + event.minutes, 0);
  const distractionCount = log.filter((event) => event.type === "distracted").length;
  const completionRate = started.length ? Math.round((completed.length / started.length) * 100) : 0;
  const activeDays = [...new Set(completedWithDate.map((event) => event.day))].sort().reverse();
  let currentStreak = 0;
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  for (let index = 0; index < 366; index++) {
    if (!activeDays.includes(dateKey(cursor))) {
      if (index === 0) {
        cursor.setDate(cursor.getDate() - 1);
        continue;
      }
      break;
    }
    currentStreak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  const weekStart = new Date(now.getTime() - 6 * DAY_MS);
  weekStart.setHours(0, 0, 0, 0);
  const weeklyStreak = activeDays.filter((day) => new Date(`${day}T00:00:00`) >= weekStart).length;
  const recentCompleted = completedWithDate.filter((event) => event.ts >= now.getTime() - 7 * DAY_MS);
  return {
    todayMinutes,
    longestSession,
    sessionsToday: todayCompleted.length,
    remainingSessions: Math.max(0, 4 - todayCompleted.length),
    currentStreak,
    weeklyStreak,
    deepWorkMinutes,
    distractionCount,
    completionRate,
    averageMinutes: recentCompleted.length
      ? Math.round(recentCompleted.reduce((sum, event) => sum + event.minutes, 0) / recentCompleted.length)
      : 0,
  };
}

export function buildFocusIntelligence({ elapsedMinutes = 0, stats, task, distractions = 0 } = {}) {
  if (elapsedMinutes >= 120) return "You've worked continuously for two hours. Protect the next break.";
  if (stats?.longestSession > 0 && elapsedMinutes > stats.longestSession) return "This has become your longest uninterrupted session.";
  if (distractions >= 3) return "This task may need splitting into a smaller visible outcome.";
  if (stats?.averageMinutes > 0 && elapsedMinutes >= stats.averageMinutes) {
    return `You usually change pace after about ${stats.averageMinutes} minutes.`;
  }
  if (task?.duration >= 90 && elapsedMinutes >= 35) return "This is substantial work. One clean checkpoint may help.";
  return null;
}

export function focusCoachMessage({ remainingSeconds, totalSeconds, running, phase }) {
  if (phase === "break") return "Let your attention reset.";
  if (!running) return "The work is still here when you're ready.";
  const elapsed = totalSeconds - remainingSeconds;
  if (remainingSeconds <= 5 * 60) return "Last five minutes. Keep the ending simple.";
  if (elapsed >= totalSeconds / 2) return "Halfway there.";
  if (elapsed >= 10 * 60) return "You're entering flow.";
  return "One thing at a time.";
}

export function suggestedGapActivity(minutes) {
  if (minutes < 10) return "Breathe";
  if (minutes < 20) return "Stretch";
  if (minutes < 35) return "Inbox";
  if (minutes < 60) return "Walk";
  return "Reading";
}

export function buildBehaviorInsights({ tasks = [], healthSummary, focusStats, weekTrend, focusPatterns } = {}) {
  const insights = [];
  const completed = tasks.filter((task) => task.completed);
  const morningCompleted = completed.filter((task) => task.startHour != null && task.startHour < 12);
  if (completed.length >= 4 && morningCompleted.length / completed.length >= 0.6) {
    insights.push(`You complete ${Math.round((morningCompleted.length / completed.length) * 100)}% of scheduled work before lunch.`);
  }
  const overdueWords = new Map();
  tasks.filter((task) => !task.completed && task.date < dateKey(new Date())).forEach((task) => {
    const word = (task.title ?? "").toLowerCase().split(/\s+/)[0];
    if (word) overdueWords.set(word, (overdueWords.get(word) ?? 0) + 1);
  });
  const avoided = [...overdueWords.entries()].sort((a, b) => b[1] - a[1])[0];
  if (avoided?.[1] >= 2) insights.push(`Tasks beginning with “${avoided[0]}” are repeatedly postponed.`);
  if (healthSummary?.sleepTrend === "improving") insights.push("Your recorded sleep is improving compared with your recent baseline.");
  if (healthSummary?.recoveryScore >= 70) insights.push(`Recovery is strong today at ${Math.round(healthSummary.recoveryScore)}.`);
  if (focusStats?.weeklyStreak >= 3) insights.push(`You focused on ${focusStats.weeklyStreak} of the last 7 days.`);
  if (focusPatterns?.peakPct >= 35) {
    insights.push(`${focusPatterns.peakPct}% of completions happen in the ${focusPatterns.peak.label.toLowerCase()}.`);
  }
  if (weekTrend != null && Number.isFinite(Number(weekTrend)) && Number(weekTrend) !== 0) {
    insights.push(`This week's completion trend is ${Number(weekTrend) > 0 ? "up" : "down"} ${Math.abs(Math.round(Number(weekTrend)))}%.`);
  }
  return insights.slice(0, 6);
}
