export const DESK_PAGES = [
  { id: "dashboard", label: "Now" },
  { id: "timeline", label: "Timeline" },
  { id: "insights", label: "Nora" },
];

export function taskMinutes(task) {
  return task?.startHour == null ? null : task.startHour * 60 + (task.startMinute ?? 0);
}

export function buildDeskTimeline(tasks = [], now = new Date()) {
  const today = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const items = tasks
    .filter((task) => !task.completed && task.date === today)
    .filter((task) => taskMinutes(task) != null)
    .sort((a, b) => taskMinutes(a) - taskMinutes(b));
  const current = items.find((task) => {
    const start = taskMinutes(task);
    return start <= currentMinutes && currentMinutes < start + (task.duration ?? 60);
  }) ?? null;
  const next = items.find((task) => taskMinutes(task) > currentMinutes) ?? null;
  return { items, current, next };
}

export function deskGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function buildDeskObservation({ done = 0, total = 0, momentum, energy, nextTask } = {}) {
  if (done > 0 && done === total) return "You've closed every planned task for today. Let the rest of the day feel lighter.";
  if (done >= 3) return `You've already completed ${done} meaningful tasks today. Your consistency is carrying the day.`;
  if (momentum?.label) return `${momentum.label}. Keep the next step smaller than the motivation it requires.`;
  if (energy != null && energy <= 4) return "Your energy is quieter today. A gentle, clearly bounded next step will work better than forcing intensity.";
  if (nextTask?.title) return `Your next clear commitment is “${nextTask.title}.” Nothing else needs your attention yet.`;
  return "Your day has room in it. Nora is quietly watching for the next useful moment.";
}
