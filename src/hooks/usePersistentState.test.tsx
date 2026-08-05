import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { readPersistentValue, usePersistentState } from "./usePersistentState";

describe("persistent application state", () => {
  beforeEach(() => localStorage.clear());

  it("falls back when persisted JSON is invalid", () => {
    localStorage.setItem("broken", "{");
    expect(readPersistentValue("broken", "fallback")).toBe("fallback");
  });

  it("hydrates and persists updates", () => {
    localStorage.setItem("preference", JSON.stringify({ compact: true }));
    const { result } = renderHook(() => usePersistentState("preference", { compact: false }));
    expect(result.current[0]).toEqual({ compact: true });

    act(() => result.current[1]({ compact: false }));
    expect(JSON.parse(localStorage.getItem("preference") ?? "{}")).toEqual({ compact: false });
  });
});
