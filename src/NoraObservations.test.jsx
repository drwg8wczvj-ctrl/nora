import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import NoraObservations from "./NoraObservations";

beforeEach(() => {
  localStorage.clear();
});

function todayKey() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

test("presents a personal discovery rather than an analytics dashboard", () => {
  const tasks = [
    { id: "a", title: "Build Nora", date: todayKey(), startHour: 8, duration: 240, completed: true, type: "task" },
    { id: "b", title: "Research", date: todayKey(), startHour: 12, duration: 180, completed: true, type: "task" },
  ];

  render(<NoraObservations tasks={tasks} />);

  expect(screen.getByRole("heading", { name: "Things Nora Noticed" })).toBeInTheDocument();
  expect(screen.getByText("Nora discovered something")).toBeInTheDocument();
  expect(screen.queryByText(/chart|statistics/i)).not.toBeInTheDocument();
});

test("can turn an observation into a conversation with Nora", () => {
  const onAskNora = vi.fn();
  const tasks = [
    { id: "a", title: "Build Nora", date: todayKey(), startHour: 8, duration: 240, completed: true, type: "task" },
    { id: "b", title: "Research", date: todayKey(), startHour: 12, duration: 180, completed: true, type: "task" },
  ];

  render(<NoraObservations tasks={tasks} onAskNora={onAskNora} />);
  fireEvent.click(screen.getByRole("button", { name: /Reflect with Nora/i }));

  expect(onAskNora).toHaveBeenCalledWith(expect.stringContaining("Help me reflect"));
});
