export const taskReminderAlarmId = (taskId) => `task-reminder-${taskId}`;

export function staleTaskReminderAlarmIds(previousIds, nextIds) {
  const desired = nextIds instanceof Set ? nextIds : new Set(nextIds);
  return [...previousIds].filter((id) => !desired.has(id));
}
