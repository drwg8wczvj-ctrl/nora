import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("./taskRepository", () => ({
    taskFingerprint: (task: Record<string, unknown>) => JSON.stringify(
      Object.fromEntries(Object.entries(task).filter(([key]) => !["updatedAt", "syncRevision"].includes(key))),
    ),
    loadTaskRecords: vi.fn(),
    upsertTaskRecords: vi.fn(),
    softDeleteTaskRecords: vi.fn(),
    subscribeToTaskRecords: vi.fn(),
}));

import { useTaskDomain } from "./useTaskDomain";

describe("task domain compatibility hook", () => {
  beforeEach(() => localStorage.clear());

  test("hydrates valid legacy tasks and persists domain mutations", () => {
    localStorage.setItem("nora_tasks", JSON.stringify([{
      id: "task-1",
      title: "Existing",
      date: "2026-08-05",
      completed: false,
    }]));
    const { result } = renderHook(() => useTaskDomain());

    expect(result.current.tasks).toHaveLength(1);
    act(() => result.current.actions.toggle("task-1"));
    expect(result.current.tasks[0].completed).toBe(true);
    expect(JSON.parse(localStorage.getItem("nora_tasks") ?? "[]")[0].completed).toBe(true);
  });

  test("provides repeat-aware date selection to legacy screens", () => {
    localStorage.setItem("nora_tasks", JSON.stringify([{
      id: "task-1",
      title: "Daily",
      date: "2026-08-05",
      repeat: "daily",
      completed: false,
    }]));
    const { result } = renderHook(() => useTaskDomain());
    expect(result.current.getTasksForDate("2026-08-06")).toHaveLength(1);
  });
});
