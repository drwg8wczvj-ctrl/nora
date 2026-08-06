import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { MobileTasks } from "./MobileApp";

function buildContext() {
  return {
    today: "2026-08-05",
    groups: [],
    tasks: [
      {
        id: "active",
        type: "task",
        title: "Prepare interview",
        date: "2026-08-05",
        startHour: 10,
        completed: false,
      },
      {
        id: "finished",
        type: "task",
        title: "Finish LinkedIn profile",
        date: "2026-08-04",
        startHour: 14,
        completed: true,
      },
    ],
    toggleTask: vi.fn(),
    skipTask: vi.fn(),
    setRescheduleTask: vi.fn(),
    setEditingTask: vi.fn(),
    setFocusTask: vi.fn(),
    setSharingTask: vi.fn(),
    setShowJoinCode: vi.fn(),
  };
}

test("places task actions before a collapsed completed archive", () => {
  const ctx = buildContext();
  render(<MobileTasks ctx={ctx} />);

  expect(screen.getByRole("button", { name: "Edit Prepare interview" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Edit Finish LinkedIn profile" })).not.toBeInTheDocument();

  const addTask = screen.getByRole("button", { name: "Add task" });
  const completedToggle = screen.getByRole("button", { name: /Completed/i });
  expect(addTask.compareDocumentPosition(completedToggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(completedToggle).toHaveAttribute("aria-expanded", "false");

  fireEvent.click(completedToggle);
  expect(completedToggle).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("button", { name: "Edit Finish LinkedIn profile" })).toBeInTheDocument();
});
