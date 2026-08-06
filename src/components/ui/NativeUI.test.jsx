import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  NativeButton,
  NativeDialog,
  NativeField,
  NativeListRow,
  NativeSegmentedControl,
  NativeSheet,
  NativeSwitch,
} from "./NativeUI";
import NativeUIReference from "./NativeUIReference";

test("segmented control reports and changes the selected value", () => {
  const onChange = vi.fn();
  render(
    <NativeSegmentedControl
      label="Planner range"
      value="day"
      onChange={onChange}
      options={[
        { value: "day", label: "Day" },
        { value: "week", label: "Week" },
      ]}
    />,
  );

  expect(screen.getByRole("radio", { name: "Day" })).toBeChecked();
  fireEvent.click(screen.getByRole("radio", { name: "Week" }));
  expect(onChange).toHaveBeenCalledWith("week");
});

test("field exposes its validation message accessibly", () => {
  render(<NativeField label="Task name" error="A task name is required" />);
  const input = screen.getByLabelText("Task name");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAccessibleDescription("A task name is required");
});

test("switch exposes and changes its checked state", () => {
  const onChange = vi.fn();
  render(<NativeSwitch checked label="AI handoffs" onChange={onChange} />);

  const control = screen.getByRole("switch", { name: "AI handoffs" });
  expect(control).toBeChecked();
  fireEvent.click(control);
  expect(onChange).toHaveBeenCalledWith(false);
});

test("interactive rows and sheets preserve native control semantics", () => {
  const onRowClick = vi.fn();
  const onClose = vi.fn();
  render(
    <div className="native-ui">
      <NativeListRow title="Open task" onClick={onRowClick} />
      <NativeSheet open title="Plan preview" onClose={onClose}>
        <NativeButton>Approve</NativeButton>
      </NativeSheet>
    </div>,
  );

  fireEvent.click(screen.getByRole("button", { name: /open task/i }));
  expect(onRowClick).toHaveBeenCalledOnce();
  expect(screen.getByRole("dialog", { name: "Plan preview" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Close sheet" }));
  expect(onClose).toHaveBeenCalledOnce();
});

test("native dialogs close from the keyboard and expose their title", () => {
  const onClose = vi.fn();
  render(
    <NativeDialog open title="Edit task" onClose={onClose}>
      <input aria-label="Task title" />
    </NativeDialog>,
  );

  expect(screen.getByRole("dialog", { name: "Edit task" })).toBeInTheDocument();
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
});

test("component reference supports both approved persona palettes", () => {
  const { rerender } = render(<NativeUIReference persona="nora" />);
  expect(screen.getByRole("main", { name: "Native UI component reference" })).toHaveAttribute("data-persona", "nora");
  expect(screen.getByText("NORA")).toBeInTheDocument();

  rerender(<NativeUIReference persona="atlas" />);
  expect(screen.getByRole("main", { name: "Native UI component reference" })).toHaveAttribute("data-persona", "atlas");
  expect(screen.getByText("ATLAS")).toBeInTheDocument();
});
