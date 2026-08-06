import {
  buildDaySummary,
  formatPlannerDate,
  partitionDayTasks,
  shiftIsoDate,
} from "./plannerModel";

test("shifts ISO dates without UTC timezone drift", () => {
  expect(shiftIsoDate("2026-08-05", 1)).toBe("2026-08-06");
  expect(shiftIsoDate("2026-03-01", -1)).toBe("2026-02-28");
});

test("builds the selected day's workload and completion summary", () => {
  const summary = buildDaySummary([
    { date: "2026-08-05", type: "task", duration: 120, completed: true },
    { date: "2026-08-05", type: "task", duration: 240, completed: false },
    { date: "2026-08-05", type: "break", duration: 30 },
    { date: "2026-08-06", type: "task", duration: 60 },
  ], "2026-08-05", "2026-08-05");

  expect(summary).toMatchObject({
    taskCount: 2,
    completedCount: 1,
    durationMinutes: 360,
    progress: 50,
    workload: "moderate",
    isToday: true,
  });
});

test("partitions tasks and selects the next unfinished scheduled item", () => {
  const result = partitionDayTasks([
    { id: "late", startHour: 15, startMinute: 0, completed: false },
    { id: "unscheduled", startHour: null, completed: false },
    { id: "past", startHour: 9, startMinute: 0, completed: false },
    { id: "done", startHour: 12, startMinute: 0, completed: true },
  ], 13 * 60, true);

  expect(result.scheduled.map((task) => task.id)).toEqual(["past", "done", "late"]);
  expect(result.unscheduled.map((task) => task.id)).toEqual(["unscheduled"]);
  expect(result.nextTask.id).toBe("late");
});

test("formats today as a stable label while retaining the full date", () => {
  const result = formatPlannerDate("2026-08-05", "2026-08-05", "en-GB");
  expect(result.short).toBe("Today");
  expect(result.full).toMatch(/Wednesday/);
});
