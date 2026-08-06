import { defaultDeskPreferences, normalizeDeskPreferences } from "./useDeskPreferences";

test("restores missing workspaces and keeps Now visible", () => {
  const result = normalizeDeskPreferences({
    workspaceOrder: ["music", "now"],
    hiddenWorkspaces: ["now", "health"],
  });
  expect(result.workspaceOrder[0]).toBe("music");
  expect(result.workspaceOrder).toContain("focus");
  expect(result.hiddenWorkspaces).not.toContain("now");
});

test("normalizes invalid focus and widget settings", () => {
  const defaults = defaultDeskPreferences();
  const result = normalizeDeskPreferences({
    focusMinutes: 999,
    breakMinutes: 0,
    widgets: [{ id: "clock", size: "impossible", hidden: true }],
  });
  expect(result.focusMinutes).toBe(120);
  expect(result.breakMinutes).toBe(defaults.breakMinutes);
  expect(result.widgets.find((widget) => widget.id === "clock")).toMatchObject({
    size: "hero",
    hidden: true,
  });
});
