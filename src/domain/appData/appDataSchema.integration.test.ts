import { describe, expect, test } from "vitest";
import { userAppDataSchema } from "./appDataSchema";

describe("cloud app-data boundary", () => {
  test("accepts a compatible legacy snapshot without stripping unknown fields", () => {
    const result = userAppDataSchema.parse({
      tasks: [{
        id: "task-1",
        title: "Prepare launch",
        date: "2026-08-05",
        completed: false,
        legacyReminder: 15,
      }],
      groups: [],
      notes: [],
      preferences: { theme: "liquid_glass" },
      serverOnlyColumn: "preserved",
    });

    expect(result.tasks?.[0]).toMatchObject({
      id: "task-1",
      title: "Prepare launch",
      legacyReminder: 15,
    });
    expect(result.serverOnlyColumn).toBe("preserved");
  });

  test("rejects malformed task data before it reaches application state", () => {
    const result = userAppDataSchema.safeParse({
      tasks: [{ id: "task-1", title: "", startHour: 37 }],
    });

    expect(result.success).toBe(false);
  });
});
