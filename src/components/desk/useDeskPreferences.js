import { useCallback, useMemo, useState } from "react";
import { DESK_WORKSPACES, NOW_WIDGETS } from "./deskModeModel";

const STORAGE_KEY = "nora_desk_mode_v2";
const SIZE_ORDER = ["compact", "standard", "wide", "hero"];

export function defaultDeskPreferences() {
  return {
    workspaceOrder: DESK_WORKSPACES.map((workspace) => workspace.id),
    hiddenWorkspaces: [],
    widgets: NOW_WIDGETS.map((widget) => ({ ...widget, hidden: false })),
    focusMinutes: 45,
    breakMinutes: 7,
    ambientSound: "none",
    ambientVolume: 0.35,
  };
}

export function normalizeDeskPreferences(value) {
  const fallback = defaultDeskPreferences();
  const raw = value && typeof value === "object" ? value : {};
  const validWorkspaceIds = new Set(DESK_WORKSPACES.map((workspace) => workspace.id));
  const storedOrder = Array.isArray(raw.workspaceOrder)
    ? raw.workspaceOrder.filter((id) => validWorkspaceIds.has(id))
    : [];
  const workspaceOrder = [
    ...storedOrder,
    ...fallback.workspaceOrder.filter((id) => !storedOrder.includes(id)),
  ];
  const storedWidgets = Array.isArray(raw.widgets) ? raw.widgets : [];
  const widgets = fallback.widgets.map((widget) => {
    const stored = storedWidgets.find((item) => item?.id === widget.id);
    return {
      ...widget,
      ...(stored ?? {}),
      id: widget.id,
      label: widget.label,
      size: SIZE_ORDER.includes(stored?.size) ? stored.size : widget.size,
      hidden: Boolean(stored?.hidden),
    };
  }).sort((a, b) => {
    const ai = storedWidgets.findIndex((item) => item?.id === a.id);
    const bi = storedWidgets.findIndex((item) => item?.id === b.id);
    return (ai < 0 ? 999 : ai) - (bi < 0 ? 999 : bi);
  });
  return {
    ...fallback,
    ...raw,
    workspaceOrder,
    hiddenWorkspaces: Array.isArray(raw.hiddenWorkspaces)
      ? raw.hiddenWorkspaces.filter((id) => validWorkspaceIds.has(id) && id !== "now")
      : [],
    widgets,
    focusMinutes: Math.max(15, Math.min(120, Number(raw.focusMinutes) || fallback.focusMinutes)),
    breakMinutes: Math.max(3, Math.min(30, Number(raw.breakMinutes) || fallback.breakMinutes)),
    ambientVolume: Math.max(0, Math.min(1, Number(raw.ambientVolume ?? fallback.ambientVolume))),
  };
}

function loadPreferences(storage) {
  try {
    return normalizeDeskPreferences(JSON.parse(storage?.getItem(STORAGE_KEY) ?? "null"));
  } catch {
    return defaultDeskPreferences();
  }
}

export function useDeskPreferences(storage = globalThis.localStorage) {
  const [preferences, setPreferences] = useState(() => loadPreferences(storage));
  const update = useCallback((recipe) => {
    setPreferences((current) => {
      const next = normalizeDeskPreferences(
        typeof recipe === "function" ? recipe(current) : { ...current, ...recipe },
      );
      try { storage?.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [storage]);

  const workspaces = useMemo(() => preferences.workspaceOrder
    .map((id) => DESK_WORKSPACES.find((workspace) => workspace.id === id))
    .filter((workspace) => workspace && !preferences.hiddenWorkspaces.includes(workspace.id)), [preferences]);

  const moveWidget = useCallback((id, direction) => update((current) => {
    const widgets = [...current.widgets];
    const index = widgets.findIndex((widget) => widget.id === id);
    const nextIndex = Math.max(0, Math.min(widgets.length - 1, index + direction));
    if (index < 0 || index === nextIndex) return current;
    [widgets[index], widgets[nextIndex]] = [widgets[nextIndex], widgets[index]];
    return { ...current, widgets };
  }), [update]);

  const toggleWidget = useCallback((id) => update((current) => ({
    ...current,
    widgets: current.widgets.map((widget) =>
      widget.id === id ? { ...widget, hidden: !widget.hidden } : widget),
  })), [update]);

  const cycleWidgetSize = useCallback((id) => update((current) => ({
    ...current,
    widgets: current.widgets.map((widget) => {
      if (widget.id !== id) return widget;
      const index = SIZE_ORDER.indexOf(widget.size);
      return { ...widget, size: SIZE_ORDER[(index + 1) % SIZE_ORDER.length] };
    }),
  })), [update]);

  const toggleWorkspace = useCallback((id) => update((current) => ({
    ...current,
    hiddenWorkspaces: current.hiddenWorkspaces.includes(id)
      ? current.hiddenWorkspaces.filter((item) => item !== id)
      : [...current.hiddenWorkspaces, id],
  })), [update]);

  return {
    preferences,
    workspaces,
    update,
    moveWidget,
    toggleWidget,
    cycleWidgetSize,
    toggleWorkspace,
  };
}
