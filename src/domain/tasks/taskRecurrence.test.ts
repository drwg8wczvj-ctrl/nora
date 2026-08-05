import { describe, expect, test } from "vitest";
import { getTasksForDate, buildOccupiedBlocksContext } from "./taskSelectors";
import { isRepeatMatch } from "./taskRecurrence";
import type { PlannerTask } from "./taskSchema";

const task = (overrides: Partial<PlannerTask> = {}): PlannerTask => ({
  id: "task-1",
  title: "Weekly review",
  date: "2026-08-03",
  completed: false,
  ...overrides,
});

describe("task recurrence", () => {
  test("daily recurrence starts after the origin date", () => {
    const daily = task({ repeat: "daily" });
    expect(isRepeatMatch(daily, "2026-08-03")).toBe(false);
    expect(isRepeatMatch(daily, "2026-08-04")).toBe(true);
  });

  test("weekly recurrence matches every seventh calendar day", () => {
    const weekly = task({ repeat: "weekly" });
    expect(isRepeatMatch(weekly, "2026-08-09")).toBe(false);
    expect(isRepeatMatch(weekly, "2026-08-10")).toBe(true);
    expect(isRepeatMatch(weekly, "2026-08-17")).toBe(true);
  });

  test("monthly recurrence preserves the day of month", () => {
    const monthly = task({ date: "2026-01-15", repeat: "monthly" });
    expect(isRepeatMatch(monthly, "2026-02-15")).toBe(true);
    expect(isRepeatMatch(monthly, "2026-02-14")).toBe(false);
  });

  test("repeat end is inclusive", () => {
    const ending = task({ repeat: "daily", repeatEnd: "2026-08-05" });
    expect(isRepeatMatch(ending, "2026-08-05")).toBe(true);
    expect(isRepeatMatch(ending, "2026-08-06")).toBe(false);
  });

  test("date selection includes direct and projected tasks once", () => {
    const tasks = [
      task({ repeat: "daily" }),
      task({ id: "task-2", title: "Direct", date: "2026-08-04" }),
    ];
    expect(getTasksForDate(tasks, "2026-08-04").map((item) => item.id)).toEqual([
      "task-2",
      "task-1",
    ]);
  });

  test("occupied-block context expands recurring scheduled work", () => {
    const context = buildOccupiedBlocksContext([
      task({ repeat: "daily", startHour: 9, startMinute: 30, duration: 45 }),
    ], "2026-08-03", 2);

    expect(context).toContain('09:30–10:15 "Weekly review"');
    expect(context.split("\n")).toHaveLength(2);
  });
});
