import { buildTaskMentionParts } from "./taskMentions";

test("highlights an exact task title inside a message", () => {
  expect(buildTaskMentionParts(
    "How do I approach the Main Exam?",
    ["Main Exam"],
  )).toEqual([
    { text: "How do I approach the ", taskTitle: null },
    { text: "Main Exam", taskTitle: "Main Exam" },
    { text: "?", taskTitle: null },
  ]);
});

test("matches case-insensitively without matching inside another word", () => {
  const parts = buildTaskMentionParts(
    "Prepare the main exam, not the domain exam.",
    ["Main Exam"],
  );
  expect(parts.filter((part) => part.taskTitle).map((part) => part.text)).toEqual(["main exam"]);
});

test("prefers the longest task title when names overlap", () => {
  const parts = buildTaskMentionParts("Review Main Exam notes", ["Main", "Main Exam"]);
  expect(parts.find((part) => part.taskTitle)).toEqual({
    text: "Main Exam",
    taskTitle: "Main Exam",
  });
});
