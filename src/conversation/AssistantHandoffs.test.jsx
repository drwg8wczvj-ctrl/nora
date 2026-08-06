import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessagePartsList } from "./MessagePart";
import { assistantHandoffPart, atlasReturnPlanPart } from "./messageParts";

describe("assistant handoff cards", () => {
  it("opens a focused Atlas session", () => {
    const onOpenAtlas = vi.fn();
    const handoff = { title: "ROK preparation", objective: "Prepare for the race.", sessionType: "motorsport", suggestedMinutes: 30 };
    render(<MessagePartsList parts={[assistantHandoffPart(handoff)]} onOpenAtlas={onOpenAtlas} />);
    fireEvent.click(screen.getByRole("button", { name: /Prepare with Atlas/i }));
    expect(onOpenAtlas).toHaveBeenCalledWith(handoff);
  });

  it("returns Atlas action items to Nora", async () => {
    const onOpenNora = vi.fn().mockResolvedValue(true);
    const plan = {
      title: "Race preparation",
      summary: "Build a reliable weekend routine.",
      actionItems: [{ title: "Prepare notebook", duration: 30 }],
    };
    render(<MessagePartsList parts={[atlasReturnPlanPart(plan)]} onOpenNora={onOpenNora} />);
    fireEvent.click(screen.getByRole("button", { name: /Send action plan to Nora/i }));
    expect(onOpenNora).toHaveBeenCalledWith(plan);
    expect(await screen.findByText("Sent to Nora for scheduling")).toBeInTheDocument();
  });
});
