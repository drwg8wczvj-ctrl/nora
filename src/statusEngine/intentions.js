const pad = (n) => String(n).padStart(2, "0");
const fmtTime = (h, m) => `${pad(h)}:${pad(m ?? 0)}`;

// Builds an "If X, then Y" implementation intention anchored to whatever task
// on today's schedule ends right before the current top-priority task starts.
// If there's no such anchor (priority task is unscheduled, first up, or
// nothing precedes it), falls back to a start-of-day framing.
export function buildImplementationIntention(todayTasks, priorityTask) {
  if (!priorityTask) return null;

  const thenClauseFor = (anchored) => anchored
    ? `immediately begin "${priorityTask.title}"`
    : `begin with "${priorityTask.title}" first`;

  if (priorityTask.startHour == null) {
    return { ifClause: "If you sit down to start your day", thenClause: thenClauseFor(false) };
  }

  const priorityStart = priorityTask.startHour * 60 + (priorityTask.startMinute ?? 0);

  const candidates = (todayTasks ?? [])
    .filter((t) => t.id !== priorityTask.id && t.startHour != null)
    .map((t) => {
      const start = t.startHour * 60 + (t.startMinute ?? 0);
      const end = start + (t.duration ?? 60);
      return { task: t, end };
    })
    .filter((c) => c.end <= priorityStart);

  if (candidates.length === 0) {
    return { ifClause: "If you sit down to start your day", thenClause: thenClauseFor(false) };
  }

  const anchor = candidates.sort((a, b) => b.end - a.end)[0].task;
  const ifClause = `If you finish your ${fmtTime(anchor.startHour, anchor.startMinute)} ${anchor.title.toLowerCase()}`;

  return { ifClause, thenClause: thenClauseFor(true) };
}
