import type { PlannerTask } from "./taskSchema";
import type { TaskRecord } from "./taskRepository";
import { taskFingerprint } from "./taskRepository";

export type TaskBaseline = Map<string, { fingerprint: string; updatedAt: string }>;

export function baselineFromRecords(records: TaskRecord[]): TaskBaseline {
  return new Map(records.map((record) => [
    record.task.id,
    { fingerprint: taskFingerprint(record.task), updatedAt: record.updatedAt },
  ]));
}

export function mergeTaskRecords(local: PlannerTask[], records: TaskRecord[]) {
  const merged = new Map(local.map((task) => [task.id, task]));
  for (const record of records) {
    if (record.deletedAt) {
      merged.delete(record.task.id);
      continue;
    }
    const current = merged.get(record.task.id);
    const localTime = current?.updatedAt ? Date.parse(current.updatedAt) : 0;
    const remoteTime = Date.parse(record.updatedAt);
    if (!current || remoteTime >= localTime) merged.set(record.task.id, record.task);
  }
  return [...merged.values()];
}

export function createSyncPlan(tasks: PlannerTask[], baseline: TaskBaseline) {
  const currentIds = new Set(tasks.map((task) => task.id));
  return {
    upserts: tasks.filter((task) => baseline.get(task.id)?.fingerprint !== taskFingerprint(task)),
    deletes: [...baseline.keys()].filter((id) => !currentIds.has(id)),
  };
}
