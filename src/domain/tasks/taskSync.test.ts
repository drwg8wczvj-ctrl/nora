import { describe, expect, it } from "vitest";
import type { PlannerTask } from "./taskSchema";
import { taskFingerprint } from "./taskRepository";
import { baselineFromRecords, createSyncPlan, mergeTaskRecords } from "./taskSync";

const task = (id: string, title: string, updatedAt?: string): PlannerTask => ({
  id,
  title,
  date: "2026-08-05",
  ...(updatedAt ? { updatedAt } : {}),
});

describe("normalized task synchronization", () => {
  it("uses the newest version when local and remote records conflict", () => {
    const local = task("one", "local edit", "2026-08-05T12:00:00.000Z");
    const remote = task("one", "remote edit", "2026-08-05T11:00:00.000Z");
    const merged = mergeTaskRecords([local], [{
      task: remote,
      revision: 2,
      updatedAt: remote.updatedAt!,
      deletedAt: null,
    }]);
    expect(merged[0].title).toBe("local edit");
  });

  it("applies remote soft deletes", () => {
    const remote = task("one", "deleted", "2026-08-05T12:00:00.000Z");
    expect(mergeTaskRecords([task("one", "cached")], [{
      task: remote,
      revision: 3,
      updatedAt: remote.updatedAt!,
      deletedAt: "2026-08-05T12:00:00.000Z",
    }])).toEqual([]);
  });

  it("plans only changed, new, and deleted records", () => {
    const unchanged = task("one", "same", "2026-08-05T10:00:00.000Z");
    const removed = task("two", "remove", "2026-08-05T10:00:00.000Z");
    const baseline = baselineFromRecords([unchanged, removed].map((item) => ({
      task: item,
      revision: 1,
      updatedAt: item.updatedAt!,
      deletedAt: null,
    })));
    const changed = { ...unchanged, title: "changed" };
    const plan = createSyncPlan([changed, task("three", "new")], baseline);
    expect(plan.upserts.map((item) => item.id)).toEqual(["one", "three"]);
    expect(plan.deletes).toEqual(["two"]);
  });

  it("ignores synchronization metadata in content fingerprints", () => {
    const first = task("one", "same", "2026-08-05T10:00:00.000Z");
    const second = { ...first, updatedAt: "2026-08-05T11:00:00.000Z", syncRevision: 7 };
    expect(taskFingerprint(first)).toBe(taskFingerprint(second));
  });
});
