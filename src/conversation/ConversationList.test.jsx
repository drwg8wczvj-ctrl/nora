import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ConversationList } from "./ConversationList";

const conversations = [
  { id: "one", title: "Plan the week", last_message_at: "2026-08-05T09:00:00Z", pinned: true },
  { id: "two", title: "Prepare for WU", last_message_at: "2026-08-04T09:00:00Z", pinned: false },
];

const renderList = (overrides = {}) => {
  const props = {
    conversations,
    activeId: "one",
    loading: false,
    onSelect: vi.fn(),
    onNew: vi.fn(),
    onRename: vi.fn(),
    onPin: vi.fn(),
    onArchive: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  render(<ConversationList {...props} />);
  return props;
};

test("filters and selects conversations", () => {
  const view = renderList();
  fireEvent.change(screen.getByRole("textbox", { name: "Search conversations" }), {
    target: { value: "WU" },
  });

  expect(screen.queryByText("Plan the week")).not.toBeInTheDocument();
  fireEvent.click(screen.getByText("Prepare for WU"));
  expect(view.onSelect).toHaveBeenCalledWith("two");
});

test("starts a new conversation", () => {
  const view = renderList();
  fireEvent.click(screen.getByRole("button", { name: "New chat" }));
  expect(view.onNew).toHaveBeenCalledOnce();
});
