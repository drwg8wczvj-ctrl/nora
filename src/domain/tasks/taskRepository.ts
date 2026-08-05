import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import type { Database, Json } from "../../types/database.generated";
import { taskSchema, type PlannerTask } from "./taskSchema";

export type PlannerTaskRow = Database["public"]["Tables"]["planner_tasks"]["Row"];
export type TaskRecord = {
  task: PlannerTask;
  revision: number;
  updatedAt: string;
  deletedAt: string | null;
};

const missingTableCodes = new Set(["42P01", "PGRST205"]);

export function isPlannerTasksUnavailable(error: { code?: string; message?: string } | null) {
  return Boolean(
    error && (
      missingTableCodes.has(error.code ?? "") ||
      error.message?.includes("planner_tasks")
    )
  );
}

export function taskFingerprint(task: PlannerTask) {
  const data = { ...task };
  delete data.updatedAt;
  delete data.syncRevision;
  const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stable);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
          .map(([key, item]) => [key, stable(item)]),
      );
    }
    return value;
  };
  return JSON.stringify(stable(data));
}

export function taskToRow(userId: string, task: PlannerTask) {
  const extra = { ...task };
  delete extra.updatedAt;
  delete extra.syncRevision;
  return {
    user_id: userId,
    id: task.id,
    title: task.title,
    task_date: task.date ?? null,
    task_type: task.type ?? "task",
    start_hour: task.startHour ?? null,
    start_minute: task.startMinute ?? null,
    duration_minutes: task.duration == null ? null : Math.round(task.duration),
    completed: task.completed ?? false,
    complexity: task.complexity ?? null,
    repeat_rule: task.repeat ?? null,
    repeat_end: task.repeatEnd ?? null,
    notes: task.notes ?? "",
    group_id: task.groupId == null ? null : String(task.groupId),
    reminder_offset: typeof task.reminderOffset === "number" ? task.reminderOffset : null,
    reminder_disabled: task.reminderOffset === "none",
    shared_object_id: task.sharedObjectId ?? null,
    extra: extra as Json,
    deleted_at: null,
  };
}

export function rowToRecord(row: PlannerTaskRow): TaskRecord | null {
  const extra = row.extra && typeof row.extra === "object" && !Array.isArray(row.extra)
    ? row.extra
    : {};
  const parsed = taskSchema.safeParse({
    ...extra,
    id: row.id,
    title: row.title,
    date: row.task_date,
    type: row.task_type,
    startHour: row.start_hour,
    startMinute: row.start_minute,
    duration: row.duration_minutes,
    completed: row.completed,
    complexity: row.complexity,
    repeat: row.repeat_rule,
    repeatEnd: row.repeat_end,
    notes: row.notes,
    groupId: row.group_id,
    reminderOffset: row.reminder_disabled ? "none" : row.reminder_offset,
    sharedObjectId: row.shared_object_id,
    updatedAt: row.updated_at,
    syncRevision: row.revision,
  });
  if (!parsed.success) {
    console.warn("[Task sync] Ignoring invalid normalized task", row.id, parsed.error.issues);
    return null;
  }
  return { task: parsed.data, revision: row.revision, updatedAt: row.updated_at, deletedAt: row.deleted_at };
}

export async function loadTaskRecords(userId: string) {
  const { data, error } = await supabase
    .from("planner_tasks")
    .select("*")
    .eq("user_id", userId);
  if (error) {
    if (isPlannerTasksUnavailable(error)) return { available: false as const, records: [] };
    throw error;
  }
  return {
    available: true as const,
    records: (data ?? []).map(rowToRecord).filter((value): value is TaskRecord => value !== null),
  };
}

export async function upsertTaskRecords(userId: string, tasks: PlannerTask[]) {
  if (!tasks.length) return [];
  const { data, error } = await supabase
    .from("planner_tasks")
    .upsert(tasks.map((task) => taskToRow(userId, task)), { onConflict: "user_id,id" })
    .select();
  if (error) throw error;
  return (data ?? []).map(rowToRecord).filter((value): value is TaskRecord => value !== null);
}

export async function softDeleteTaskRecords(userId: string, ids: string[]) {
  if (!ids.length) return;
  const { error } = await supabase
    .from("planner_tasks")
    .update({ deleted_at: new Date().toISOString() })
    .eq("user_id", userId)
    .in("id", ids);
  if (error) throw error;
}

export function subscribeToTaskRecords(
  userId: string,
  onChange: (record: TaskRecord) => void,
) {
  const channel = supabase
    .channel(`planner-tasks:${userId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "planner_tasks", filter: `user_id=eq.${userId}` },
      (payload: RealtimePostgresChangesPayload<PlannerTaskRow>) => {
        const row = payload.new as PlannerTaskRow;
        if (row?.id) {
          const record = rowToRecord(row);
          if (record) onChange(record);
        }
      },
    )
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}
