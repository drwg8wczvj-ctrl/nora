import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MobileShellHeader, MobileShellTabBar } from "./MobileShell";

const labels = {
  plan: "Plan",
  tasks: "Tasks",
  notes: "Notes",
  status: "Status",
  settings: "Settings",
};

test("mobile shell header exposes the current section and date", () => {
  const onLogoClick = vi.fn();
  render(
    <MobileShellHeader
      today="2026-08-05"
      activeView="plan"
      labels={labels}
      onLogoClick={onLogoClick}
    />,
  );

  expect(screen.getByLabelText(/Plan/)).toHaveTextContent("Plan");
  fireEvent.click(screen.getByRole("button", { name: "Go to today's plan" }));
  expect(onLogoClick).toHaveBeenCalledOnce();
});

test("mobile tab bar has one current destination and uses direct navigation", () => {
  const onViewChange = vi.fn();
  render(
    <MobileShellTabBar
      activeView="tasks"
      labels={labels}
      onViewChange={onViewChange}
    />,
  );

  expect(screen.getByRole("button", { name: "Tasks" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("button", { name: "Plan" })).not.toHaveAttribute("aria-current");
  fireEvent.click(screen.getByRole("button", { name: "Notes" }));
  expect(onViewChange).toHaveBeenCalledWith("notes");
});

test("mobile header reports offline state without changing its layout", () => {
  render(
    <MobileShellHeader
      today="2026-08-05"
      activeView="status"
      labels={labels}
      isOnline={false}
    />,
  );
  expect(screen.getByText("Offline")).toBeInTheDocument();
});
