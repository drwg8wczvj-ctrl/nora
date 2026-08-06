import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import { taskListSchema, type PlannerTask } from "./taskSchema";
import { migrateTaskList, normalizeIntelligentTask } from "./taskIntelligence";
import { getTasksForDate } from "./taskSelectors";
import {
  moveTaskToSlot,
  rescheduleTask,
  toggleTaskCompletion,
  upsertTask,
} from "./taskMutations";
import {
  loadTaskRecords,
  softDeleteTaskRecords,
  subscribeToTaskRecords,
  taskFingerprint,
  upsertTaskRecords,
  type TaskRecord,
} from "./taskRepository";
import {
  baselineFromRecords,
  createSyncPlan,
  mergeTaskRecords,
  type TaskBaseline,
} from "./taskSync";

const STORAGE_KEY = "nora_tasks";

function loadTasks(): PlannerTask[] {
  try {
    const parsed = taskListSchema.safeParse(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"));
    if (parsed.success) return migrateTaskList(parsed.data);
    console.warn("[Tasks] Ignoring invalid local task data", parsed.error.issues);
  } catch {}
  return [];
}

function markLocalChanges(previous: PlannerTask[], next: PlannerTask[]) {
  const previousById = new Map(previous.map((task) => [task.id, task]));
  const now = new Date().toISOString();
  return next.map((task) => {
    const old = previousById.get(task.id);
    if (old && taskFingerprint(old) === taskFingerprint(task)) return task;
    return { ...task, updatedAt: task.updatedAt ?? now };
  });
}

export type TaskStorageMode = "local" | "connecting" | "normalized" | "fallback";

export function useTaskDomain(userId?: string) {
  const [tasks, rawSetTasks] = useState<PlannerTask[]>(loadTasks);
  const [storageMode, setStorageMode] = useState<TaskStorageMode>("local");
  const baselineRef = useRef<TaskBaseline>(new Map());
  const readyRef = useRef(false);
  const tasksRef = useRef(tasks);

  useEffect(() => { tasksRef.current = tasks; }, [tasks]);

  const setTasks = useCallback((action: SetStateAction<PlannerTask[]>) => {
    rawSetTasks((previous) => {
      const next = typeof action === "function" ? action(previous) : action;
      return markLocalChanges(previous, migrateTaskList(next));
    });
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (error) {
      console.warn("[Tasks] Could not persist local task cache", error);
    }
  }, [tasks]);

  useEffect(() => {
    readyRef.current = false;
    baselineRef.current = new Map();
    if (!userId) {
      setStorageMode("local");
      return;
    }

    let active = true;
    setStorageMode("connecting");
    void loadTaskRecords(userId)
      .then(({ available, records }) => {
        if (!active) return;
        if (!available) {
          setStorageMode("fallback");
          return;
        }
        baselineRef.current = baselineFromRecords(records);
        rawSetTasks((current) => migrateTaskList(mergeTaskRecords(current, records)));
        readyRef.current = true;
        setStorageMode("normalized");
      })
      .catch((error) => {
        if (!active) return;
        console.warn("[Task sync] Normalized storage unavailable; using snapshot fallback", error);
        setStorageMode("fallback");
      });

    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    if (!userId || storageMode !== "normalized") return;
    return subscribeToTaskRecords(userId, (record: TaskRecord) => {
      const local = tasksRef.current.find((task) => task.id === record.task.id);
      const localTime = local?.updatedAt ? Date.parse(local.updatedAt) : 0;
      if (!record.deletedAt && localTime > Date.parse(record.updatedAt)) return;

      if (record.deletedAt) {
        baselineRef.current.delete(record.task.id);
        rawSetTasks((current) => current.filter((task) => task.id !== record.task.id));
      } else {
        baselineRef.current.set(record.task.id, {
          fingerprint: taskFingerprint(record.task),
          updatedAt: record.updatedAt,
        });
        rawSetTasks((current) => upsertTask(current, normalizeIntelligentTask(record.task)));
      }
    });
  }, [storageMode, userId]);

  useEffect(() => {
    if (!userId || storageMode !== "normalized" || !readyRef.current) return;
    const timer = window.setTimeout(() => {
      const plan = createSyncPlan(tasks, baselineRef.current);
      if (!plan.upserts.length && !plan.deletes.length) return;

      void Promise.all([
        upsertTaskRecords(userId, plan.upserts),
        softDeleteTaskRecords(userId, plan.deletes),
      ]).then(([records]) => {
        for (const id of plan.deletes) baselineRef.current.delete(id);
        for (const record of records) {
          baselineRef.current.set(record.task.id, {
            fingerprint: taskFingerprint(record.task),
            updatedAt: record.updatedAt,
          });
        }
        if (records.length) {
          rawSetTasks((current) => migrateTaskList(mergeTaskRecords(current, records)));
        }
      }).catch((error) => {
        console.warn("[Task sync] Record update failed; local snapshot preserved", error);
      });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [storageMode, tasks, userId]);

  const actions = useMemo(() => ({
    upsert(task: PlannerTask) {
      setTasks((current) => upsertTask(current, normalizeIntelligentTask(task)));
    },
    toggle(id: PlannerTask["id"]) {
      setTasks((current) => toggleTaskCompletion(current, id));
    },
    reschedule(task: PlannerTask) {
      setTasks((current) => upsertTask(current, task));
    },
    skip(id: PlannerTask["id"], tomorrow: string) {
      setTasks((current) => rescheduleTask(current, id, tomorrow));
    },
    moveToSlot(id: PlannerTask["id"], hour: number, minute: number) {
      setTasks((current) => moveTaskToSlot(current, id, hour, minute));
    },
  }), [setTasks]);

  const forDate = useCallback(
    (date: string) => getTasksForDate(tasks, date),
    [tasks],
  );

  return { tasks, setTasks, actions, getTasksForDate: forDate, storageMode };
}
