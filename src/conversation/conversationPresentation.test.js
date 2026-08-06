import { describe, expect, it } from "vitest";
import { progressiveTextFrames } from "./conversationPresentation";

describe("progressive response presentation", () => {
  it("builds cumulative frames ending in the exact response", () => {
    const text = "A concise response that arrives progressively.";
    const frames = progressiveTextFrames(text, 3);
    expect(frames.length).toBeGreaterThan(1);
    expect(frames.at(-1)).toBe(text);
    expect(text.startsWith(frames[0])).toBe(true);
  });

  it("handles empty text", () => {
    expect(progressiveTextFrames("")).toEqual([""]);
  });
});
