import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import ShareModal from "./ShareModal";
import * as sharingApi from "../lib/sharingApi";

vi.mock("../lib/sharingApi", () => ({
  createSharedObject: vi.fn(),
  getCollaborators: vi.fn(),
  addCollaboratorByUserId: vi.fn(),
  removeCollaborator: vi.fn(),
  updateCollaboratorRole: vi.fn(),
  createInviteCode: vi.fn(),
  getInviteCodes: vi.fn(),
  searchUserByUsername: vi.fn(),
  getMyProfile: vi.fn(),
  setUsername: vi.fn(),
  getActivityLog: vi.fn(),
  getComments: vi.fn(),
  addComment: vi.fn(),
  deleteComment: vi.fn(),
}));

const props = {
  objectType: "task",
  objectData: { id: "task-1", title: "Plan launch" },
  sharedObjectId: null,
  session: { user: { id: "owner-1" } },
  onClose: vi.fn(),
  onSharedObjectId: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  sharingApi.getMyProfile.mockResolvedValue({ user_id: "owner-1", username: "owner" });
  sharingApi.getCollaborators.mockResolvedValue([]);
  sharingApi.getInviteCodes.mockResolvedValue([]);
  sharingApi.getActivityLog.mockResolvedValue([]);
  sharingApi.getComments.mockResolvedValue([]);
  sharingApi.createSharedObject.mockResolvedValue("shared-1");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

test("clicking a search result shares the task with that user", async () => {
  const teammate = { user_id: "user-2", name: "Dimon", username: "dimon4ik98" };
  sharingApi.searchUserByUsername.mockResolvedValue([teammate]);
  sharingApi.addCollaboratorByUserId.mockResolvedValue(undefined);
  sharingApi.getCollaborators.mockResolvedValue([
    { id: "collab-2", ...teammate, role: "editor", avatar_type: "color" },
  ]);

  render(<ShareModal {...props} />);
  fireEvent.change(screen.getByPlaceholderText("Search by @username…"), {
    target: { value: "dimon" },
  });

  fireEvent.click(await screen.findByRole("button", { name: /Dimon/i }));

  await waitFor(() =>
    expect(sharingApi.createSharedObject).toHaveBeenCalledWith("task", props.objectData)
  );
  expect(sharingApi.addCollaboratorByUserId).toHaveBeenCalledWith("shared-1", "user-2", "editor");
  expect(sharingApi.getCollaborators).toHaveBeenCalledWith("shared-1");
  expect(props.onSharedObjectId).toHaveBeenCalledWith("shared-1");
  expect(await screen.findByRole("status")).toHaveTextContent("Shared with @dimon4ik98.");
  expect(await screen.findByText("People with access (1)")).toBeInTheDocument();
});

test("Generate creates, displays, and copies the newly returned code", async () => {
  sharingApi.createInviteCode.mockResolvedValue("ABC2345");

  render(<ShareModal {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Generate" }));

  expect(await screen.findByText("ABC2345")).toBeInTheDocument();
  expect(sharingApi.createInviteCode).toHaveBeenCalledWith("shared-1", "editor");
  expect(navigator.clipboard.writeText).toHaveBeenCalledWith("ABC2345");
});

test("a failed share action is visible instead of looking like a dead click", async () => {
  const teammate = { user_id: "user-2", name: "Dimon", username: "dimon4ik98" };
  sharingApi.searchUserByUsername.mockResolvedValue([teammate]);
  sharingApi.createSharedObject.mockRejectedValue(new Error("Sharing is unavailable"));

  render(<ShareModal {...props} />);
  fireEvent.change(screen.getByPlaceholderText("Search by @username…"), {
    target: { value: "dimon" },
  });
  fireEvent.click(await screen.findByRole("button", { name: /Dimon/i }));

  expect(await screen.findByRole("alert")).toHaveTextContent("Sharing is unavailable");
});
