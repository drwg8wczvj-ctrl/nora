import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { AssistantChatComposer, AssistantChatHeader } from "./AssistantChatUI";

test("assistant chat header exposes history and close controls", () => {
  const onHistory = vi.fn();
  const onClose = vi.fn();
  render(
    <AssistantChatHeader
      title="Nora"
      subtitle="Planning and execution"
      onHistory={onHistory}
      onClose={onClose}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Open conversations" }));
  fireEvent.click(screen.getByRole("button", { name: "Close Nora" }));

  expect(onHistory).toHaveBeenCalledOnce();
  expect(onClose).toHaveBeenCalledOnce();
});

test("assistant composer sends non-empty messages", () => {
  const onSend = vi.fn();
  render(
    <AssistantChatComposer
      value="Plan tomorrow"
      onChange={() => {}}
      onSend={onSend}
      placeholder="Ask Nora anything…"
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "Send message" }));
  expect(onSend).toHaveBeenCalledOnce();
});

test("assistant composer disables send for an empty value", () => {
  render(
    <AssistantChatComposer
      value=" "
      onChange={() => {}}
      onSend={() => {}}
      placeholder="Talk to Atlas…"
    />,
  );

  expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
});

test("assistant composer resizes when its value is filled programmatically", () => {
  const inputRef = React.createRef();
  const { rerender } = render(
    <AssistantChatComposer value="" inputRef={inputRef} onChange={() => {}} onSend={() => {}} placeholder="Ask Nora anything…" />,
  );
  Object.defineProperty(inputRef.current, "scrollHeight", { configurable: true, value: 96 });
  rerender(
    <AssistantChatComposer value={"A long pasted message ".repeat(20)} inputRef={inputRef} onChange={() => {}} onSend={() => {}} placeholder="Ask Nora anything…" />,
  );
  expect(inputRef.current.style.height).toBe("96px");
});
