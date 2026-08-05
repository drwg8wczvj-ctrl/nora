import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => {
  const unsubscribe = vi.fn();
  return {
    getSession: vi.fn(),
    onAuthStateChange: vi.fn(),
    unsubscribe,
    listener: undefined as ((event: string, session: unknown) => void) | undefined,
  };
});

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: auth.getSession,
      onAuthStateChange: auth.onAuthStateChange,
    },
  },
}));

import { useAuthSession } from "./useAuthSession";

describe("authentication lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.getSession.mockResolvedValue({ data: { session: null } });
    auth.onAuthStateChange.mockImplementation((listener) => {
      auth.listener = listener;
      return { data: { subscription: { unsubscribe: auth.unsubscribe } } };
    });
  });

  it("hydrates the session and cleans up the subscription", async () => {
    const session = { user: { id: "user-1" } };
    auth.getSession.mockResolvedValue({ data: { session } });
    const { result, unmount } = renderHook(() => useAuthSession());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.session).toBe(session);
    unmount();
    expect(auth.unsubscribe).toHaveBeenCalledOnce();
  });

  it("enters and exits password recovery mode", async () => {
    const { result } = renderHook(() => useAuthSession());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => auth.listener?.("PASSWORD_RECOVERY", { user: { id: "user-1" } }));
    expect(result.current.isResettingPassword).toBe(true);
    act(() => result.current.finishPasswordReset());
    expect(result.current.isResettingPassword).toBe(false);
  });
});
