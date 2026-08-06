import {
  buildBehaviorInsights,
  buildDeskObservation,
  buildDeskTimeline,
  computeDeskFocusStats,
  deskGreeting,
} from "./deskModeModel";

describe("Desk Mode model", () => {
  const now = new Date("2026-08-06T10:20:00");

  it("finds current and next timeline blocks", () => {
    const timeline = buildDeskTimeline([
      { id: "a", title: "Focus", date: "2026-08-06", startHour: 10, duration: 45 },
      { id: "b", title: "Lunch", date: "2026-08-06", startHour: 12, duration: 30 },
    ], now);
    expect(timeline.current.id).toBe("a");
    expect(timeline.next.id).toBe("b");
  });

  it("creates calm conversational observations", () => {
    expect(buildDeskObservation({ done: 3, total: 5 })).toContain("3 meaningful tasks");
    expect(deskGreeting(now)).toBe("Good morning");
  });

  it("turns real focus history into daily statistics", () => {
    const log = [
      { type: "started", ts: new Date("2026-08-06T08:00:00").getTime() },
      { type: "completed", actual: 48, distractionCount: 0, ts: new Date("2026-08-06T08:48:00").getTime() },
      { type: "started", ts: new Date("2026-08-06T09:30:00").getTime() },
      { type: "distracted", ts: new Date("2026-08-06T09:50:00").getTime() },
      { type: "completed", actual: 32, distractionCount: 1, ts: new Date("2026-08-06T10:10:00").getTime() },
    ];
    const stats = computeDeskFocusStats(log, now);

    expect(stats.todayMinutes).toBe(80);
    expect(stats.longestSession).toBe(48);
    expect(stats.distractionCount).toBe(1);
    expect(stats.completionRate).toBe(100);
  });

  it("does not invent insights without supporting behavior", () => {
    expect(buildBehaviorInsights({ tasks: [], focusLog: [], now })).toEqual([]);
  });
});
