import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import NoteCard from "./NoteCard";

const note = {
  id: "note-1",
  type: "note",
  title: "Nora interview ideas",
  content: "Prepare three questions.",
  color: "purple",
  pinned: false,
  starred: false,
  createdAt: Date.now(),
};

test("compact note cards expose one action menu and remain keyboard-openable", () => {
  const onClick = vi.fn();
  const onMore = vi.fn();
  render(
    <NoteCard
      note={note}
      onClick={onClick}
      onMore={onMore}
      onDelete={vi.fn()}
      onPin={vi.fn()}
      onStar={vi.fn()}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "More actions for Nora interview ideas" }));
  expect(onMore).toHaveBeenCalledOnce();
  expect(onClick).not.toHaveBeenCalled();

  fireEvent.keyDown(screen.getByRole("button", { name: "Open Nora interview ideas" }), { key: "Enter" });
  expect(onClick).toHaveBeenCalledOnce();
});
