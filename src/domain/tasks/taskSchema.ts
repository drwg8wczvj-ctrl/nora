import { z } from "zod";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const taskSchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1).max(500),
  date: dateString.nullish(),
  startHour: z.number().int().min(0).max(23).nullish(),
  startMinute: z.number().int().min(0).max(59).nullish(),
  duration: z.number().finite().positive().max(10_080).nullish(),
  completed: z.boolean().optional(),
  type: z.enum(["task", "deadline", "break"]).optional(),
  complexity: z.enum(["easy", "medium", "hard"]).nullish(),
  repeat: z.enum(["daily", "weekly", "monthly"]).nullish(),
  repeatEnd: dateString.nullish(),
  notes: z.string().max(20_000).optional(),
  groupId: z.union([z.string(), z.number()]).nullish(),
  reminderOffset: z.union([z.number().finite().min(0).max(43_200), z.literal("none")]).nullish(),
  sharedObjectId: z.string().uuid().nullish(),
  updatedAt: z.string().datetime({ offset: true }).optional(),
  syncRevision: z.number().int().positive().optional(),
}).passthrough();

export const taskListSchema = z.array(taskSchema).max(10_000);

export type PlannerTask = z.infer<typeof taskSchema>;
