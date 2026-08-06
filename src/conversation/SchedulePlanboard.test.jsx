import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SchedulePlanboard from "./SchedulePlanboard";

const proposal = {
  id: "phase-3-test",
  createdAt: new Date("2026-08-05T10:00:00").getTime(),
  userRequest: "Plan my week",
  operations: [
    {
      name: "add_task",
      label: "Add “WU study”",
      input: { title: "WU study", date: "2026-08-06", startHour: 10, startMinute: 0, duration: 60 },
    },
    {
      name: "add_task",
      label: "Add “Nora project”",
      input: { title: "Nora project", date: "2026-08-07", startHour: 14, startMinute: 0, duration: 90 },
    },
  ],
};

describe("SchedulePlanboard", () => {
  beforeEach(() => localStorage.clear());

  it("shows existing and proposed work across the two-week board", () => {
    render(
      <SchedulePlanboard
        proposal={proposal}
        existingTasks={[{ id: "existing", title: "Breakfast", date: "2026-08-06", startHour: 8, duration: 30 }]}
        onPlannerAction={vi.fn()}
      />
    );
    expect(screen.getByText("Two-week Planboard")).toBeInTheDocument();
    expect(screen.getByText("Breakfast")).toBeInTheDocument();
    expect(screen.getByText("WU study")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Apply selected" })).toBeEnabled();
  });

  it("blocks approval until a detected conflict is edited", () => {
    render(
      <SchedulePlanboard
        proposal={proposal}
        existingTasks={[{ id: "existing", title: "Existing meeting", date: "2026-08-06", startHour: 10, duration: 60 }]}
        onPlannerAction={vi.fn()}
      />
    );
    expect(screen.getByRole("button", { name: "Apply selected" })).toBeDisabled();
    const timeInputs = screen.getAllByLabelText("Time");
    fireEvent.change(timeInputs[0], { target: { value: "12:00" } });
    expect(screen.getByRole("button", { name: "Apply selected" })).toBeEnabled();
  });

  it("supports partial approval by excluding a proposed block", async () => {
    const onPlannerAction = vi.fn().mockResolvedValue(true);
    render(<SchedulePlanboard proposal={proposal} existingTasks={[]} onPlannerAction={onPlannerAction} />);
    fireEvent.click(screen.getByRole("button", { name: "Exclude WU study" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply selected" }));
    expect(onPlannerAction).toHaveBeenCalledWith(
      "apply",
      expect.objectContaining({ operations: [proposal.operations[1]] })
    );
  });

  it("clears self-overlap warnings after applying while retaining the proposal", async () => {
    localStorage.setItem("nora_schedule_proposal_phase-3-test", "applied");
    render(
      <SchedulePlanboard
        proposal={proposal}
        existingTasks={[
          { id: "created-1", ...proposal.operations[0].input },
          { id: "created-2", ...proposal.operations[1].input },
        ]}
        onPlannerAction={vi.fn()}
      />
    );
    expect(screen.getByText("Selected changes applied")).toBeInTheDocument();
    expect(screen.queryByText("Overlaps another block—choose a different time.")).not.toBeInTheDocument();
  });
});
