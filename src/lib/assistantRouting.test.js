import { describe, expect, it } from "vitest";
import {
  ASSISTANT_DOMAINS,
  atlasHandoffToPrompt,
  atlasPlanToNoraPrompt,
  buildAtlasHandoffContext,
  classifyAssistantDomain,
} from "./assistantRouting";

describe("assistant routing", () => {
  it("keeps ordinary calendar work with Nora", () => {
    expect(classifyAssistantDomain("Move my WU study block to Friday")).toBe(ASSISTANT_DOMAINS.NORA);
  });

  it("routes specialist motorsport coaching to Atlas", () => {
    expect(classifyAssistantDomain("Help me learn driver coaching for my karting race")).toBe(ASSISTANT_DOMAINS.ATLAS);
  });

  it("marks mixed coaching and scheduling requests as shared", () => {
    expect(classifyAssistantDomain("Schedule time to prepare me for a motorsport race")).toBe(ASSISTANT_DOMAINS.SHARED);
  });

  it("normalizes a compact, bounded handoff", () => {
    const handoff = buildAtlasHandoffContext({
      title: "  ROK preparation  ",
      objective: "Become more useful to the team.",
      goals: ["Reliability", "Driver feedback", "Questions for Bernardo", "Notes", "Telemetry", "Setup", "Extra"],
      suggestedMinutes: 500,
      sessionType: "motorsport",
      sourceConversationId: "planner-1",
    });

    expect(handoff.title).toBe("ROK preparation");
    expect(handoff.goals).toHaveLength(6);
    expect(handoff.suggestedMinutes).toBe(120);
    expect(handoff.sessionType).toBe("motorsport");
    expect(atlasHandoffToPrompt(handoff)).toContain("[Nora handoff: ROK preparation]");
    expect(atlasHandoffToPrompt(handoff)).toContain("Return-to-Nora conversation: planner-1");
    expect(atlasHandoffToPrompt(handoff)).toContain("return_plan_to_nora");
    expect(atlasHandoffToPrompt(handoff)).toContain("ask the single most useful first question");
  });

  it("turns an Atlas result into a scheduling brief for Nora", () => {
    const prompt = atlasPlanToNoraPrompt({
      title: "Race preparation",
      summary: "Build a reliable debrief routine.",
      actionItems: [{ title: "Prepare notebook", duration: 30, notes: "Create the session template." }],
    });
    expect(prompt).toContain("[Atlas returned an action plan: Race preparation]");
    expect(prompt).toContain("Prepare notebook");
    expect(prompt).toContain("proposal Planboard");
  });
});
