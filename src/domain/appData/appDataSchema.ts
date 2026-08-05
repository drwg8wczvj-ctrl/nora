import { z } from "zod";
import { taskListSchema } from "../tasks/taskSchema";

export const userAppDataSchema = z.object({
  tasks: taskListSchema.nullish(),
  groups: z.array(z.record(z.string(), z.unknown())).max(1_000).nullish(),
  notes: z.array(z.record(z.string(), z.unknown())).max(10_000).nullish(),
  preferences: z.record(z.string(), z.unknown()).nullish(),
}).passthrough();

export type UserAppData = z.infer<typeof userAppDataSchema>;
