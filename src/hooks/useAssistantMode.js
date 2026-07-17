import { useState, useEffect, useCallback } from "react";

const SETTINGS_KEY = "nora_assistant_mode_v1";

const DEFAULT_SETTINGS = {
  twoAssistantMode: false, // OFF by default — existing users see no change until they opt in
  atlasIntroSeen: false,
};

// Feature flag for the Planner/Atlas two-assistant experience. Mirrors
// useNotifications.js's shape (init-by-merge so new fields backfill for
// existing users, single updateSettings(patch) merge callback).
export function useAssistantMode() {
  const [settings, setSettings] = useState(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
  }, [settings]);

  const updateSettings = useCallback((patch) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  return { settings, updateSettings };
}
