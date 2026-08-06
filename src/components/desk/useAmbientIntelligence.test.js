import { buildAmbientCandidates, chooseAmbientInterval } from "./useAmbientIntelligence";

test("ambient interval stays between twenty and forty minutes", () => {
  expect(chooseAmbientInterval(() => 0)).toBe(20 * 60 * 1000);
  expect(chooseAmbientInterval(() => 1)).toBe(40 * 60 * 1000);
});

test("ambient candidates are derived from real schedule state", () => {
  const items = buildAmbientCandidates({
    ctx: { doneToday: 2, totalToday: 4, energy: 7, deferredTasks: [] },
    timeline: { freeMinutes: 180, next: { title: "Main Exam" } },
    now: new Date("2026-08-06T14:00:00"),
    focusStats: { currentStreak: 0 },
  });
  expect(items.some((item) => item.includes("3 hours"))).toBe(true);
});
