import { findTaskReferences } from "./taskReferences";

describe("task references", () => {
  const tasks = [
    { id: "1", title: "Send quarterly report" },
    { id: "2", title: "Book dentist" },
  ];

  it("matches an existing task title case-insensitively", () => {
    expect(findTaskReferences("Question about SEND QUARTERLY REPORT", tasks)).toEqual([tasks[0]]);
  });

  it("does not treat an unrelated message as a task reference", () => {
    expect(findTaskReferences("How is my workload?", tasks)).toEqual([]);
  });
});
