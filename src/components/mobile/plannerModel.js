const dateFromIso = (isoDate) => new Date(`${isoDate}T00:00:00`);
const padPart = (value) => String(value).padStart(2, "0");

export function shiftIsoDate(isoDate, delta) {
  const date = dateFromIso(isoDate);
  date.setDate(date.getDate() + delta);
  return `${date.getFullYear()}-${padPart(date.getMonth() + 1)}-${padPart(date.getDate())}`;
}

export function formatPlannerDate(isoDate, today, locale) {
  const date = dateFromIso(isoDate);
  return {
    short: isoDate === today
      ? "Today"
      : new Intl.DateTimeFormat(locale, {
          weekday: "short",
          day: "numeric",
          month: "short",
        }).format(date),
    full: new Intl.DateTimeFormat(locale, {
      weekday: "long",
      month: "long",
      day: "numeric",
    }).format(date),
  };
}

export function buildDaySummary(tasks, planDate, today) {
  const taskItems = tasks.filter(
    (task) => task.date === planDate && (task.type ?? "task") === "task",
  );
  const completedCount = taskItems.filter((task) => task.completed).length;
  const durationMinutes = taskItems.reduce(
    (total, task) => total + (Number(task.duration) || 0),
    0,
  );
  const progress = taskItems.length
    ? Math.round((completedCount / taskItems.length) * 100)
    : 0;
  const workload = durationMinutes >= 480 || taskItems.length >= 8
    ? "heavy"
    : durationMinutes >= 300 || taskItems.length >= 5
      ? "moderate"
      : durationMinutes >= 60 || taskItems.length >= 2
        ? "light"
        : "free";

  return {
    taskCount: taskItems.length,
    completedCount,
    durationMinutes,
    progress,
    workload,
    isToday: planDate === today,
  };
}

export function partitionDayTasks(tasks, nowMinutes, isToday) {
  const scheduled = [...tasks]
    .filter((task) => task.startHour != null)
    .sort(
      (a, b) =>
        a.startHour * 60 + (a.startMinute ?? 0) -
        (b.startHour * 60 + (b.startMinute ?? 0)),
    );
  const unscheduled = tasks.filter((task) => task.startHour == null);
  const nextTask = scheduled.find((task) => {
    if (task.completed) return false;
    if (!isToday) return true;
    return task.startHour * 60 + (task.startMinute ?? 0) >= nowMinutes;
  });

  return { scheduled, unscheduled, nextTask };
}
