// Builds a real confirmation_card part from an already-executed task tool
// call. Shared by Planner's and Atlas's dispatchToolCall implementations —
// both execute the same 4 task tools through the same executeAiTool
// dispatcher, so the card-building logic only needs to exist once.
//
// `tasksAfter` is the task list *after* executeAiTool has applied the change
// (i.e. `nextTasks`) — this is what lets a create/move/complete card show the
// task's real resulting date/time instead of just echoing the tool input.

import { confirmationCardPart } from "./messageParts";

export function buildToolConfirmationPart(name, input, tasksAfter) {
  switch (name) {
    case "add_task": {
      const created = tasksAfter.find(
        (t) => t.title === input.title && t.date === input.date
      );
      return confirmationCardPart({
        action: "create",
        summary: `Created "${input.title}"${input.date ? ` on ${input.date}` : ""}`,
        task: created ?? { title: input.title, date: input.date, startHour: input.startHour, startMinute: input.startMinute },
      });
    }
    case "move_task": {
      const moved = tasksAfter.find((t) => t.id === input.taskId);
      const timeLabel = input.startHour != null
        ? ` at ${String(input.startHour).padStart(2, "0")}:${String(input.startMinute ?? 0).padStart(2, "0")}`
        : "";
      return confirmationCardPart({
        action: "move",
        summary: `Moved "${moved?.title ?? "task"}" to ${input.date}${timeLabel}`,
        task: moved,
      });
    }
    case "complete_task": {
      const done = tasksAfter.find((t) => t.id === input.taskId);
      return confirmationCardPart({
        action: "complete",
        summary: `Marked "${done?.title ?? "task"}" complete`,
        task: done,
      });
    }
    case "delete_task": {
      return confirmationCardPart({ action: "delete", summary: "Deleted a task" });
    }
    default:
      return null;
  }
}
