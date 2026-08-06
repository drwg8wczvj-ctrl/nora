import { buildDeskObservation, buildDeskTimeline, deskGreeting } from "./deskModeModel";

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
});
