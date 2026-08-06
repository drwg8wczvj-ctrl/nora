import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import WorkMindToggle from "./WorkMindToggle";

test("switches from Nora work status to Atlas mind status", () => {
  const onChange = vi.fn();
  render(<WorkMindToggle active="work" onChange={onChange} />);

  expect(screen.getByRole("radio", { name: "Work" })).toBeChecked();
  fireEvent.click(screen.getByRole("radio", { name: "Mind" }));
  expect(onChange).toHaveBeenCalledWith("mind");
});
