import { useState, useEffect, useCallback, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import {
  isHealthAvailable, requestHealthAuthorization, getHealthRequestedStatus,
  fetchHealthContext, HEALTH_CATEGORIES,
} from "../lib/healthKit";

const SETTINGS_KEY = "nora_health_settings_v1";
const DEFAULT_SETTINGS = {
  enabledCategories: [],   // which categories the user has turned on in Settings
  everConnected: false,    // has requestAuthorization ever been called at all
};

// Health data itself is never persisted here (or anywhere outside this
// session's React state) — only the tiny preference of which categories are
// turned on. See src/lib/healthKit.js's header for the full privacy note.
export function useHealthKit() {
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

  const isNativeIOS = Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";
  const [available, setAvailable] = useState(false);
  const [requestedStatus, setRequestedStatus] = useState({});
  const [context, setContext] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastFetchedAt, setLastFetchedAt] = useState(null);
  const fetchInFlight = useRef(false);

  useEffect(() => {
    if (!isNativeIOS) return;
    isHealthAvailable().then(setAvailable).catch(() => setAvailable(false));
  }, [isNativeIOS]);

  const refresh = useCallback(async () => {
    if (!available || settings.enabledCategories.length === 0 || fetchInFlight.current) return;
    fetchInFlight.current = true;
    setLoading(true);
    try {
      const [ctx, status] = await Promise.all([
        fetchHealthContext(settings.enabledCategories),
        getHealthRequestedStatus(settings.enabledCategories),
      ]);
      setContext(ctx);
      setRequestedStatus(status);
      setLastFetchedAt(Date.now());
    } catch (e) {
      console.warn("HealthKit refresh failed:", e.message);
    } finally {
      setLoading(false);
      fetchInFlight.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available, settings.enabledCategories.join(",")]);

  useEffect(() => { refresh(); }, [refresh]);

  // Re-check when the app comes back to the foreground (e.g. after a night's
  // sleep synced from an Apple Watch) rather than polling on a timer.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const requestAccess = useCallback(async (categories) => {
    if (!available) return false;
    const granted = await requestHealthAuthorization(categories);
    setSettings((s) => ({
      ...s,
      everConnected: true,
      enabledCategories: [...new Set([...s.enabledCategories, ...categories])],
    }));
    return granted;
  }, [available]);

  const setCategoryEnabled = useCallback((category, enabled) => {
    setSettings((s) => ({
      ...s,
      enabledCategories: enabled
        ? [...new Set([...s.enabledCategories, category])]
        : s.enabledCategories.filter((c) => c !== category),
    }));
  }, []);

  // iOS never lets an app programmatically revoke HealthKit permission —
  // the user has to do that in Settings.app → Privacy → Health. "Disconnect"
  // here means: stop reading, forget which categories were on, and drop any
  // health data currently held in memory.
  const disconnect = useCallback(() => {
    setSettings(DEFAULT_SETTINGS);
    setContext(null);
    setLastFetchedAt(null);
  }, []);

  return {
    isNativeIOS, available,
    allCategories: HEALTH_CATEGORIES,
    enabledCategories: settings.enabledCategories,
    everConnected: settings.everConnected,
    requestedStatus,
    context, loading, lastFetchedAt,
    requestAccess, setCategoryEnabled, disconnect, refresh,
  };
}
