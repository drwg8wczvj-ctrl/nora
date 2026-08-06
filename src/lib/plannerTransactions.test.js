import { describe, expect, it } from "vitest";
import { proposalStorageKey, shouldPreviewPlannerOperations } from "./plannerTransactions";

describe("planner transactions", () => {
  it("keeps a single ordinary action immediate", () => {
    expect(shouldPreviewPlannerOperations("Move lunch to 13:00", [{}])).toBe(false);
  });

  it("previews every multi-operation change", () => {
    expect(shouldPreviewPlannerOperations("Move these tasks", [{}, {}])).toBe(true);
  });

  it("previews a broad planning request even if the model emits one operation", () => {
    expect(shouldPreviewPlannerOperations("Plan my full week", [{}])).toBe(true);
  });

  it("creates stable storage keys", () => {
    expect(proposalStorageKey("proposal-1")).toBe("nora_schedule_proposal_proposal-1");
  });
});
