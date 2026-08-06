import { staleTaskReminderAlarmIds, taskReminderAlarmId } from "./taskReminderRegistry";

test("returns reminders whose tasks are no longer planned", () => {
  const deleted = taskReminderAlarmId("deleted-task");
  const retained = taskReminderAlarmId("retained-task");

  expect(staleTaskReminderAlarmIds(
    new Set([deleted, retained]),
    new Set([retained]),
  )).toEqual([deleted]);
});

test("builds the stable alarm id used by scheduling and cancellation", () => {
  expect(taskReminderAlarmId("task-42")).toBe("task-reminder-task-42");
});
