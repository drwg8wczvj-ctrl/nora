import { describe, expect, it } from "vitest";
import { buildPlanboardModel, operationTask, tasksConflict } from "./planboardModel";

const existing = [
  { id: "a", title: "Existing", date: "2026-08-06", startHour: 10, startMinute: 0, duration: 60 },
];

describe("Planboard model", () => {
  it("turns add and move operations into proposed tasks", () => {
    expect(operationTask({ name: "add_task", input: { title: "WU", date: "2026-08-06" } }, existing, 0).title).toBe("WU");
    expect(operationTask({ name: "move_task", input: { taskId: "a", date: "2026-08-07" } }, existing, 1).date).toBe("2026-08-07");
  });

  it("detects overlapping scheduled blocks", () => {
    expect(tasksConflict(existing[0], { date: "2026-08-06", startHour: 10, startMinute: 30, duration: 30 })).toBe(true);
    expect(tasksConflict(existing[0], { date: "2026-08-06", startHour: 11, startMinute: 0, duration: 30 })).toBe(false);
  });

  it("removes the old position of a moved task and reports proposal conflicts", () => {
    const days = buildPlanboardModel({
      existingTasks: existing,
      operations: [
        { name: "move_task", input: { taskId: "a", date: "2026-08-07", startHour: 9, startMinute: 0 } },
        { name: "add_task", input: { title: "Conflict", date: "2026-08-07", startHour: 9, startMinute: 30, duration: 60 } },
      ],
      startDate: "2026-08-06",
      days: 2,
    });
    expect(days[0].existing).toHaveLength(0);
    expect(days[1].conflicts).toEqual([0, 1]);
  });

  it("supports excluding individual operations", () => {
    const [day] = buildPlanboardModel({
      existingTasks: existing,
      operations: [{ name: "add_task", input: { title: "Proposed", date: "2026-08-06" } }],
      included: [false],
      startDate: "2026-08-06",
      days: 1,
    });
    expect(day.proposed).toHaveLength(0);
  });

  it("does not treat an applied task as overlapping its own proposal", () => {
    const operation = {
      name: "add_task",
      input: { title: "Study session", date: "2026-08-06", startHour: 18, startMinute: 0, duration: 90 },
    };
    const [day] = buildPlanboardModel({
      existingTasks: [
        { id: "created", title: "Study session", date: "2026-08-06", startHour: 18, startMinute: 0, duration: 90 },
      ],
      operations: [operation],
      startDate: "2026-08-06",
      days: 1,
      applied: true,
    });
    expect(day.conflicts).toEqual([]);
    expect(day.existing).toEqual([]);
    expect(day.workloadMinutes).toBe(90);
  });

  it("keeps warning about a different task after a proposal is applied", () => {
    const operation = {
      name: "add_task",
      input: { title: "Study session", date: "2026-08-06", startHour: 18, startMinute: 0, duration: 90 },
    };
    const [day] = buildPlanboardModel({
      existingTasks: [
        { id: "created", title: "Study session", date: "2026-08-06", startHour: 18, startMinute: 0, duration: 90 },
        { id: "meeting", title: "Team meeting", date: "2026-08-06", startHour: 18, startMinute: 30, duration: 30 },
      ],
      operations: [operation],
      startDate: "2026-08-06",
      days: 1,
      applied: true,
    });
    expect(day.conflicts).toEqual([0]);
    expect(day.existing.map((task) => task.id)).toEqual(["meeting"]);
  });
});
