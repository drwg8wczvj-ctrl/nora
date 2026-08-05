import { describe, expect, test } from "vitest";
import { executeTaskTool } from "./taskAiTools";
import type { PlannerTask } from "./taskSchema";

const existing: PlannerTask = {
  id: "task-1",
  title: "Write report",
  date: "2026-08-05",
  completed: false,
};

describe("AI task tool boundary", () => {
  test("prevents duplicate active tasks", () => {
    const result = executeTaskTool("add_task", {
      title: " write REPORT ",
      date: "2026-08-05",
    }, [existing]);
    expect(result.nextTasks).toEqual([existing]);
    expect(result.result).toContain("Duplicate prevented");
  });

  test("rejects same-day times in the past deterministically", () => {
    const result = executeTaskTool("add_task", {
      title: "Late work",
      date: "2026-08-05",
      startHour: 9,
    }, [], { now: new Date("2026-08-05T10:00:00") });
    expect(result.nextTasks).toEqual([]);
    expect(result.result).toContain("is in the past");
  });

  test("creates a validated task with an injected id", () => {
    const result = executeTaskTool("add_task", {
      title: "Plan sprint",
      date: "2026-08-06",
      startHour: 11,
      repeat: "weekly",
    }, [], {
      now: new Date("2026-08-05T10:00:00"),
      createId: () => "task-new",
    });
    expect(result.nextTasks[0]).toMatchObject({
      id: "task-new",
      title: "Plan sprint",
      repeat: "weekly",
      completed: false,
    });
  });

  test("moves, completes, and deletes through immutable results", () => {
    const moved = executeTaskTool("move_task", {
      taskId: "task-1",
      date: "2026-08-07",
      startHour: null,
    }, [existing]);
    expect(moved.nextTasks[0]).toMatchObject({ date: "2026-08-07", startHour: null });

    const completed = executeTaskTool("complete_task", {
      taskId: "task-1",
    }, moved.nextTasks);
    expect(completed.nextTasks[0].completed).toBe(true);

    const deleted = executeTaskTool("delete_task", {
      taskId: "task-1",
    }, completed.nextTasks);
    expect(deleted.nextTasks).toEqual([]);
  });
});
