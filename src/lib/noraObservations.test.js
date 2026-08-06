import { describe, expect, it } from "vitest";
import {
  buildNoraObservations,
  markObservationsSeen,
  observationSignature,
  selectObservationDeck,
} from "./noraObservations";

const now = new Date("2026-08-05T12:00:00");

function task(id, date, startHour, completed = true, extra = {}) {
  return { id, title: `Task ${id}`, date, startHour, duration: 60, completed, type: "task", ...extra };
}

describe("Nora observations", () => {
  it("turns late-evening completion data into a candid observation", () => {
    const tasks = [
      task("1", "2026-08-01", 21, false),
      task("2", "2026-08-02", 22, false),
      task("3", "2026-08-03", 21, true),
      task("4", "2026-08-04", 23, false),
    ];

    const observations = buildNoraObservations({ tasks, now });
    expect(observations.find((item) => item.id === "late-evening")?.title)
      .toContain("rarely become real work");
  });

  it("creates a special discovery after seven fully completed days", () => {
    const metrics = Object.fromEntries(
      Array.from({ length: 7 }, (_, index) => {
        const date = new Date("2026-07-30T12:00:00");
        date.setDate(date.getDate() + index);
        return [date.toISOString().slice(0, 10), { tasksCompleted: 3, tasksTotal: 3 }];
      }),
    );

    const observations = buildNoraObservations({ metrics, now });
    const discovery = observations.find((item) => item.id === "perfect-week");
    expect(discovery?.tone).toBe("discovery");
    expect(discovery?.body).toContain("habit");
  });

  it("includes the current day's metrics even early in the morning", () => {
    const earlyNow = new Date("2026-08-05T07:30:00");
    const metrics = {
      "2026-08-05": { tasksCompleted: 2, tasksTotal: 2 },
    };
    const tasks = [
      task("today-1", "2026-08-05", 6, true, { duration: 180 }),
      task("today-2", "2026-08-05", 7, true, { duration: 180 }),
    ];

    const observations = buildNoraObservations({ metrics, tasks, now: earlyNow });
    expect(observations.some((item) => item.id === "today-workday")).toBe(true);
  });

  it("turns connected health data into personal guidance", () => {
    const observations = buildNoraObservations({
      now,
      healthSummary: {
        sleepLastNightMinutes: 360,
        sleepBaselineMinutes: 465,
        recoveryScore: 42,
      },
    });
    const health = observations.find((item) => item.id === "health-short-sleep");

    expect(health?.category).toBe("Health");
    expect(health?.body).toContain("personal baseline");
  });

  it("places unseen observations before previously seen ones", () => {
    const observations = [
      { id: "seen", fingerprint: "1", priority: 100 },
      { id: "new", fingerprint: "1", priority: 50 },
    ];
    const deck = selectObservationDeck(observations, {
      seen: [observationSignature(observations[0])],
      now,
    });
    expect(deck[0].id).toBe("new");
  });

  it("stores seen signatures without duplicates", () => {
    const values = new Map();
    const storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    };
    const item = { id: "focus", fingerprint: "v1" };
    markObservationsSeen(storage, [item, item]);
    expect(JSON.parse(values.get("nora_observations_seen_v1"))).toEqual(["focus:v1"]);
  });
});
