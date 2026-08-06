const pad = (value) => String(value).padStart(2, "0");

export function localDateString(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addCalendarDays(dateString, amount) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return localDateString(date);
}

export function operationTask(operation, existingTasks = [], index = 0) {
  const input = operation?.input ?? {};
  if (operation?.name === "add_task") {
    return {
      id: `proposed-${index}`,
      operationIndex: index,
      proposed: true,
      title: input.title || "New task",
      date: input.date,
      startHour: input.startHour ?? null,
      startMinute: input.startMinute ?? null,
      duration: input.duration ?? 60,
      type: input.type ?? "task",
      notes: input.notes ?? "",
    };
  }
  if (operation?.name === "move_task") {
    const source = existingTasks.find((task) => task.id === input.taskId);
    return {
      ...(source ?? {}),
      id: source?.id ?? `moved-${index}`,
      operationIndex: index,
      proposed: true,
      title: source?.title ?? "Moved task",
      date: input.date ?? source?.date,
      startHour: Object.hasOwn(input, "startHour") ? input.startHour : source?.startHour ?? null,
      startMinute: Object.hasOwn(input, "startMinute") ? input.startMinute : source?.startMinute ?? null,
      duration: source?.duration ?? 60,
      notes: source?.notes ?? "",
    };
  }
  return null;
}

const interval = (task) => {
  if (task?.startHour == null) return null;
  const start = task.startHour * 60 + (task.startMinute ?? 0);
  return { start, end: start + (task.duration ?? 60) };
};

export function tasksConflict(first, second) {
  if (!first || !second || first.date !== second.date) return false;
  const a = interval(first);
  const b = interval(second);
  return Boolean(a && b && a.start < b.end && b.start < a.end);
}

const sameAppliedAdd = (task, operation) => {
  if (operation?.name !== "add_task") return false;
  const input = operation.input ?? {};
  return task?.title?.trim().toLocaleLowerCase() === String(input.title ?? "").trim().toLocaleLowerCase()
    && task?.date === input.date
    && (task?.startHour ?? null) === (input.startHour ?? null)
    && (task?.startMinute ?? null) === (input.startMinute ?? null);
};

export function buildPlanboardModel({
  existingTasks = [],
  operations = [],
  included = operations.map(() => true),
  startDate = localDateString(),
  days = 14,
  applied = false,
} = {}) {
  const activeOperations = operations
    .map((operation, index) => ({ ...operation, originalIndex: index }))
    .filter((_, index) => included[index] !== false);
  const affectedIds = new Set(activeOperations
    .filter((operation) => operation.name === "move_task" || operation.name === "delete_task")
    .map((operation) => operation.input?.taskId));
  let baseTasks = existingTasks.filter((task) => !affectedIds.has(task.id) && !task.completed);
  // After Apply, add_task operations exist in both collections: as the
  // proposal preview and as newly-created planner tasks. Consume exactly one
  // matching planner task per operation so the Planboard does not report each
  // block as overlapping itself. Other overlapping tasks remain in baseTasks.
  if (applied) {
    const consumedTaskIds = new Set();
    activeOperations.forEach((operation) => {
      const match = baseTasks.find((task) =>
        !consumedTaskIds.has(task.id) && sameAppliedAdd(task, operation)
      );
      if (match) consumedTaskIds.add(match.id);
    });
    baseTasks = baseTasks.filter((task) => !consumedTaskIds.has(task.id));
  }
  const proposedTasks = activeOperations
    .map((operation) => operationTask(operation, existingTasks, operation.originalIndex))
    .filter(Boolean);

  return Array.from({ length: days }, (_, offset) => {
    const date = addCalendarDays(startDate, offset);
    const existing = baseTasks.filter((task) => task.date === date);
    const proposed = proposedTasks.filter((task) => task.date === date);
    const conflicts = proposed.filter((task, index) =>
      existing.some((other) => tasksConflict(task, other)) ||
      proposed.some((other, otherIndex) => index !== otherIndex && tasksConflict(task, other))
    ).map((task) => task.operationIndex);
    const workloadMinutes = [...existing, ...proposed]
      .filter((task) => task.type !== "deadline")
      .reduce((total, task) => total + (task.duration ?? 60), 0);
    return {
      date,
      existing,
      proposed,
      conflicts: [...new Set(conflicts)],
      workloadMinutes,
      workload: workloadMinutes > 360 ? "overloaded" : workloadMinutes > 240 ? "heavy" : workloadMinutes > 120 ? "balanced" : "light",
    };
  });
}

export function timeLabel(task) {
  return task?.startHour == null
    ? "Flexible"
    : `${pad(task.startHour)}:${pad(task.startMinute ?? 0)}`;
}
