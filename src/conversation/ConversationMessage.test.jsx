import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ConversationMessage from "./ConversationMessage";
import { textPart } from "./messageParts";

describe("ConversationMessage", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("offers edit controls for user messages", () => {
    const message = { role: "user", parts: [textPart("Move my task")] };
    const onEdit = vi.fn();
    render(<ConversationMessage message={message} onEdit={onEdit} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit message" }));
    expect(onEdit).toHaveBeenCalledWith(message);
  });

  it("offers retry and copy controls for assistant messages", async () => {
    const message = { role: "assistant", parts: [textPart("Here is the plan.")] };
    const onRetry = vi.fn();
    render(<ConversationMessage message={message} assistantName="Nora" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "Try response again" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy message" }));
    expect(onRetry).toHaveBeenCalledWith(message);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("Here is the plan.");
    expect(await screen.findByRole("button", { name: "Copied" })).toBeInTheDocument();
  });
});
