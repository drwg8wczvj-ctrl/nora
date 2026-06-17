import { useState, useEffect, useRef, useCallback } from "react";

const SETTINGS_KEY = "nora_notif_settings_v1";

const DEFAULT_SETTINGS = {
  enabled: false,
  taskReminders: true,
  deadlineReminders: true,
  morningCheckup: true,
  focusSessions: true,
  aiCoaching: true,
  morningTime: "08:00",
  bannerDismissed: false,
  bannerShownCount: 0,
};

export function useNotifications() {
  const [permission, setPermission] = useState(() => {
    if (typeof Notification === "undefined") return "denied";
    return Notification.permission;
  });

  const [settings, setSettings] = useState(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      const stored = raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
      // One-time migration from old nora_notif_enabled key
      const oldEnabled = localStorage.getItem("nora_notif_enabled");
      if (oldEnabled === "true" && !stored.enabled) {
        stored.enabled = true;
        localStorage.removeItem("nora_notif_enabled");
      }
      return stored;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  const [health, setHealth] = useState({
    swActive: false,
    periodicSyncSupported: false,
    periodicSyncRegistered: false,
    pushSubscribed: false,
    isIOS: false,
    alarmCount: 0,
    checkedAt: null,
  });

  const swRegRef = useRef(null);
  const reactTimers = useRef({}); // backup React setTimeout for when app is open

  // ── Service worker setup ───────────────────────────────────────────────────
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready
      .then(async (reg) => {
        swRegRef.current = reg;

        // Detect iOS
        const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);

        // Check periodic sync support + registration
        let periodicSyncSupported = "periodicSync" in reg;
        let periodicSyncRegistered = false;
        if (periodicSyncSupported) {
          try {
            const tags = await reg.periodicSync.getTags();
            periodicSyncRegistered = tags.includes("check-alarms");
          } catch {}
        }

        // Check push subscription
        let pushSubscribed = false;
        try {
          const sub = await reg.pushManager.getSubscription();
          pushSubscribed = !!sub;
        } catch {}

        // Ask SW for current alarm count
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: "GET_ALARM_COUNT" });
        }

        setHealth((h) => ({
          ...h,
          swActive: true,
          periodicSyncSupported,
          periodicSyncRegistered,
          pushSubscribed,
          isIOS,
          checkedAt: Date.now(),
        }));
      })
      .catch(() => {});
  }, []);

  // Listen for SW messages (notification clicks, alarm count replies)
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handleMessage = (event) => {
      if (event.data?.type === "NOTIFICATION_CLICK") {
        window.dispatchEvent(
          new CustomEvent("nora:notification-click", { detail: event.data.data })
        );
      }
      if (event.data?.type === "ALARM_COUNT") {
        setHealth((h) => ({ ...h, alarmCount: event.data.count }));
      }
    };
    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => navigator.serviceWorker.removeEventListener("message", handleMessage);
  }, []);

  // Persist settings
  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
  }, [settings]);

  // ── Register periodic background sync (Android Chrome) ─────────────────────
  const registerPeriodicSync = useCallback(async () => {
    const reg = swRegRef.current;
    if (!reg || !("periodicSync" in reg)) return false;
    try {
      const status = await navigator.permissions.query({ name: "periodic-background-sync" });
      if (status.state !== "granted") return false;
      await reg.periodicSync.register("check-alarms", {
        minInterval: 60 * 60 * 1000, // 1 hour
      });
      setHealth((h) => ({ ...h, periodicSyncRegistered: true }));
      return true;
    } catch {
      return false;
    }
  }, []);

  // ── Permission request ──────────────────────────────────────────────────────
  const requestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return "denied";
    try {
      const p = await Notification.requestPermission();
      setPermission(p);
      if (p === "granted") {
        setSettings((s) => ({ ...s, enabled: true, bannerDismissed: true }));
        // Try to register periodic sync once permission is granted
        await registerPeriodicSync();
      }
      return p;
    } catch {
      return "denied";
    }
  }, [registerPeriodicSync]);

  // ── Store an alarm in SW IndexedDB (survives app close) ────────────────────
  const scheduleAlarm = useCallback((id, scheduledFor, title, body, data = {}, tag) => {
    const alarm = {
      id,
      scheduledFor,
      title,
      body,
      tag: tag || id,
      data,
    };
    // Primary: store in SW IndexedDB so it survives app close
    const controller = navigator.serviceWorker?.controller;
    if (controller) {
      controller.postMessage({ type: "STORE_ALARM", alarm });
      setHealth((h) => ({ ...h, alarmCount: h.alarmCount + 1 }));
    }
    // Backup: React setTimeout for when app is open (fires exactly on time)
    const delay = scheduledFor - Date.now();
    if (delay > 0) {
      clearTimeout(reactTimers.current[id]);
      reactTimers.current[id] = setTimeout(() => {
        // SW will have already removed the alarm; show it now from React side
        showNotification(title, body, { tag, data }); // eslint-disable-line no-use-before-define
      }, delay);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cancel a scheduled alarm ────────────────────────────────────────────────
  const cancelAlarm = useCallback((id) => {
    clearTimeout(reactTimers.current[id]);
    delete reactTimers.current[id];
    const controller = navigator.serviceWorker?.controller;
    if (controller) {
      controller.postMessage({ type: "CLEAR_ALARM", id });
      setHealth((h) => ({ ...h, alarmCount: Math.max(0, h.alarmCount - 1) }));
    }
  }, []);

  // ── Display a notification (SW-first, Notification API fallback) ────────────
  const showNotification = useCallback(
    async (title, body, opts = {}) => {
      if (permission !== "granted" || !settings.enabled) return false;
      const options = {
        body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: opts.tag || ("nora-" + Date.now()),
        data: opts.data || {},
        ...opts,
      };
      if (swRegRef.current) {
        try {
          await swRegRef.current.showNotification(title, options);
          return true;
        } catch {}
      }
      try { new Notification(title, options); return true; } catch {}
      return false;
    },
    [permission, settings.enabled]
  );

  // ── Test notification ───────────────────────────────────────────────────────
  const sendTestNotification = useCallback(async () => {
    if (permission !== "granted") {
      const p = await requestPermission();
      if (p !== "granted") return false;
    }
    // Temporarily enable if needed for the test
    const wasEnabled = settings.enabled;
    if (!wasEnabled) setSettings((s) => ({ ...s, enabled: true }));
    const reg = swRegRef.current;
    let ok = false;
    if (reg) {
      try {
        await reg.showNotification("✅ Nora · Notifications Active", {
          body:  "You'll get reminders even when the app is closed.",
          icon:  "/icon-192.png",
          badge: "/icon-192.png",
          tag:   "nora-test",
          data:  { action: "test" },
        });
        ok = true;
      } catch {}
    }
    if (!ok) {
      try {
        new Notification("✅ Nora · Notifications Active", {
          body: "You'll get reminders even when the app is closed.",
          icon: "/icon-192.png",
        });
        ok = true;
      } catch {}
    }
    if (!wasEnabled) setSettings((s) => ({ ...s, enabled: false }));
    return ok;
  }, [permission, settings.enabled, requestPermission]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Settings update ─────────────────────────────────────────────────────────
  const updateSettings = useCallback((patch) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  // ── Banner visibility ────────────────────────────────────────────────────────
  const bannerVisible =
    permission === "default" &&
    !settings.bannerDismissed &&
    settings.bannerShownCount < 3;

  const dismissBanner = useCallback((permanent = false) => {
    setSettings((s) => ({
      ...s,
      bannerDismissed: permanent,
      bannerShownCount: (s.bannerShownCount || 0) + 1,
    }));
  }, []);

  return {
    permission,
    settings,
    updateSettings,
    requestPermission,
    showNotification,
    scheduleAlarm,
    cancelAlarm,
    sendTestNotification,
    bannerVisible,
    dismissBanner,
    health,
    registerPeriodicSync,
  };
}