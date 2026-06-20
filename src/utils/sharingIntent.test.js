import { extractJoinInviteCode } from "./sharingIntent";

test("recognizes a conversational request to connect to a shared task", () => {
  expect(extractJoinInviteCode("Connect me to the task NRAR248")).toBe("NRAR248");
  expect(extractJoinInviteCode("please join abc2345")).toBe("ABC2345");
});

test("does not treat an unrelated identifier as a join request", () => {
  expect(extractJoinInviteCode("My reference is NRAR248")).toBeNull();
});
