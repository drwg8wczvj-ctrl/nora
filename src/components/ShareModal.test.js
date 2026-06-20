import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ShareModal from "./ShareModal";
import * as sharingApi from "../lib/sharingApi";

jest.mock("../lib/sharingApi", () => ({
  createSharedObject: jest.fn(),
  getCollaborators: jest.fn(),
  addCollaboratorByUserId: jest.fn(),
  removeCollaborator: jest.fn(),
  updateCollaboratorRole: jest.fn(),
  createInviteCode: jest.fn(),
  getInviteCodes: jest.fn(),
  searchUserByUsername: jest.fn(),
  getMyProfile: jest.fn(),
  setUsername: jest.fn(),
  getActivityLog: jest.fn(),
  getComments: jest.fn(),
  addComment: jest.fn(),
  deleteComment: jest.fn(),
}));

const props = {
  objectType: "task",
  objectData: { id: "task-1", title: "Plan launch" },
  sharedObjectId: null,
  session: { user: { id: "owner-1" } },
  onClose: jest.fn(),
  onSharedObjectId: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  sharingApi.getMyProfile.mockResolvedValue({ user_id: "owner-1", username: "owner" });
  sharingApi.getCollaborators.mockResolvedValue([]);
  sharingApi.getInviteCodes.mockResolvedValue([]);
  sharingApi.getActivityLog.mockResolvedValue([]);
  sharingApi.getComments.mockResolvedValue([]);
  sharingApi.createSharedObject.mockResolvedValue("shared-1");
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: jest.fn().mockResolvedValue(undefined) },
  });
});

test("clicking a search result shares the task with that user", async () => {
  const teammate = { user_id: "user-2", name: "Dimon", username: "dimon4ik98" };
  sharingApi.searchUserByUsername.mockResolvedValue([teammate]);
  sharingApi.addCollaboratorByUserId.mockResolvedValue(undefined);

  render(<ShareModal {...props} />);
  fireEvent.change(screen.getByPlaceholderText("Search by @username…"), {
    target: { value: "dimon" },
  });

  fireEvent.click(await screen.findByRole("button", { name: /Dimon/i }));

  await waitFor(() => {
    expect(sharingApi.createSharedObject).toHaveBeenCalledWith("task", props.objectData);
    expect(sharingApi.addCollaboratorByUserId).toHaveBeenCalledWith("shared-1", "user-2", "editor");
    expect(sharingApi.getCollaborators).toHaveBeenCalledWith("shared-1");
    expect(props.onSharedObjectId).toHaveBeenCalledWith("shared-1");
  });
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
