import { describe, expect, test } from "vitest";
import {
  moveTaskToSlot,
  removeTask,
  rescheduleTask,
  toggleTaskCompletion,
  upsertTask,
} from "./taskMutations";
import type { PlannerTask } from "./taskSchema";

const first: PlannerTask = {
  id: "task-1",
  title: "First",
  date: "2026-08-05",
  completed: false,
};
const second: PlannerTask = {
  id: "task-2",
  title: "Second",
  date: "2026-08-05",
  completed: false,
};

describe("task mutations", () => {
  test("upsert updates one task without mutating the input collection", () => {
    const input = [first, second];
    const result = upsertTask(input, { ...first, title: "Updated" });
    expect(result).not.toBe(input);
    expect(result[0].title).toBe("Updated");
    expect(input[0].title).toBe("First");
    expect(result[1]).toBe(second);
  });

  test("upsert appends a new task", () => {
    const result = upsertTask([first], second);
    expect(result).toEqual([first, second]);
  });

  test("toggle changes only the requested task", () => {
    const result = toggleTaskCompletion([first, second], "task-1");
    expect(result[0].completed).toBe(true);
    expect(result[1]).toBe(second);
  });

  test("reschedule clears a previous time by default", () => {
    const result = rescheduleTask([
      { ...first, startHour: 14, startMinute: 30 },
    ], "task-1", "2026-08-06");
    expect(result[0]).toMatchObject({
      date: "2026-08-06",
      startHour: null,
      startMinute: null,
    });
  });

  test("move to slot preserves the date", () => {
    const result = moveTaskToSlot([first], "task-1", 11, 15);
    expect(result[0]).toMatchObject({
      date: "2026-08-05",
      startHour: 11,
      startMinute: 15,
    });
  });

  test("remove returns all tasks except the requested id", () => {
    expect(removeTask([first, second], "task-1")).toEqual([second]);
  });
});
