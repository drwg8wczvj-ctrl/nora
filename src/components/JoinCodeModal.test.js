import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import JoinCodeModal from "./JoinCodeModal";

test("joins a shared task using an invite code", async () => {
  const onJoin = jest.fn().mockResolvedValue({ data: { title: "Trip to Italy" } });
  render(<JoinCodeModal onClose={jest.fn()} onJoin={onJoin} />);

  fireEvent.change(screen.getByLabelText("Invite code"), { target: { value: "abc2345" } });
  fireEvent.click(screen.getByRole("button", { name: "Join task" }));

  await waitFor(() => expect(onJoin).toHaveBeenCalledWith("ABC2345"));
  expect(await screen.findByRole("status")).toHaveTextContent("Trip to Italy");
  expect(screen.getByText("was added to your planner.")).toBeInTheDocument();
});

test("shows an invalid-code error", async () => {
  const onJoin = jest.fn().mockRejectedValue(new Error("Invalid invite code"));
  render(<JoinCodeModal onClose={jest.fn()} onJoin={onJoin} />);

  fireEvent.change(screen.getByLabelText("Invite code"), { target: { value: "wrong" } });
  fireEvent.submit(screen.getByRole("button", { name: "Join task" }).closest("form"));

  expect(await screen.findByRole("alert")).toHaveTextContent("Invalid invite code");
});
