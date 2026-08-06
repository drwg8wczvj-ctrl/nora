import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import StatusModesGuide from "./StatusModesGuide";

test("explains every mode and marks the current one", () => {
  const onBack = vi.fn();
  render(<StatusModesGuide activeMode="Peak Focus" onBack={onBack} />);

  expect(screen.getByRole("heading", { name: "How Nora modes work" })).toBeInTheDocument();
  expect(screen.getAllByRole("article")).toHaveLength(6);
  expect(screen.getByText("Your mode now")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Back to status" }));
  expect(onBack).toHaveBeenCalledOnce();
});
