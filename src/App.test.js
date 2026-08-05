import { calculateTaskWeight } from "./utils/taskUtils";

describe("planner task weighting", () => {
  test("treats breaks as minimal cognitive load", () => {
    expect(calculateTaskWeight({ type: "break", duration: 120 }, "2026-08-05")).toBe(1);
  });

  test("raises the weight for an overdue hard deadline", () => {
    const weight = calculateTaskWeight({
      title: "Prepare project deadline",
      date: "2026-08-04",
      duration: 90,
      complexity: "hard",
    }, "2026-08-05");

    expect(weight).toBe(5);
  });

  test("keeps task weight inside the supported range", () => {
    expect(calculateTaskWeight({ title: "Quick reply", duration: 5 }, "2026-08-05")).toBe(1);
    expect(calculateTaskWeight({ title: "Implement final presentation", duration: 300 }, "2026-08-05")).toBe(5);
  });
});
