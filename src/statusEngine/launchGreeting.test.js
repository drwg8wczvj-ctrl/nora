import { beforeEach, describe, expect, test } from "vitest";
import {
  buildLaunchGreeting,
  getLaunchReadingMs,
  storePreparedLaunchGreeting,
  takePreparedLaunchGreeting,
} from "./launchGreeting";

describe("launch greeting composer", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("turns a strong real signal into a two-line observation", () => {
    const greeting = buildLaunchGreeting({
      hour: 9,
      name: "George Virchenko",
      momentum: { state: "rising" },
      random: () => 0,
    });

    expect(greeting.line1).toBe("You have built real momentum.");
    expect(greeting.line2).toContain("protect it");
    expect(`${greeting.line1} ${greeting.line2}`).not.toBe("Hello, George.");
    expect(greeting.readingMs).toBeGreaterThanOrEqual(2400);
    expect(greeting.readingMs).toBeLessThanOrEqual(4000);
  });

  test("does not repeat a recently selected welcome when alternatives exist", () => {
    const first = buildLaunchGreeting({ hour: 13, name: "George", random: () => 0 });
    const second = buildLaunchGreeting({ hour: 13, name: "George", random: () => 0 });

    expect(second.id).not.toBe(first.id);
    expect(second.line2).not.toBe(first.line2);
  });

  test("uses a fresh prepared AI greeting once and rejects stale copy", () => {
    const now = Date.UTC(2026, 7, 6, 8);
    expect(storePreparedLaunchGreeting({
      line1: "You arrived at a useful moment.",
      line2: "I have kept the important things close.",
      category: "observational",
    }, now)).toBe(true);

    expect(takePreparedLaunchGreeting(now + 1000)).toMatchObject({
      line1: "You arrived at a useful moment.",
      source: "ai",
    });
    expect(takePreparedLaunchGreeting(now + 2000)).toBeNull();

    storePreparedLaunchGreeting({ line1: "Old thought.", line2: "No longer current." }, now);
    expect(takePreparedLaunchGreeting(now + 7 * 60 * 60 * 1000)).toBeNull();
  });

  test("scales reading time by length within the requested limits", () => {
    const shortMs = getLaunchReadingMs({ line1: "Welcome back.", line2: "Everything is ready." });
    const longMs = getLaunchReadingMs({
      line1: "You have already built more momentum than you probably realize.",
      line2: "I have kept the next important move clearly within reach.",
    });

    expect(shortMs).toBeGreaterThanOrEqual(2400);
    expect(longMs).toBeGreaterThan(shortMs);
    expect(longMs).toBeLessThanOrEqual(4000);
  });
});
