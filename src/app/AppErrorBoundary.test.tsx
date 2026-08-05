import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppErrorBoundary } from "./AppErrorBoundary";

function BrokenComponent(): never {
  throw new Error("render failed");
}

describe("application error boundary", () => {
  it("shows a recoverable fallback when a screen crashes", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <AppErrorBoundary>
        <BrokenComponent />
      </AppErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload Nora" })).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
