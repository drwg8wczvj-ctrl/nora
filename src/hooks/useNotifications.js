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
      // Migrate from old nora_notif_enabled key
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

  const swRegRef = useRef(null);

  // Cache SW registration for SW-based notifications (works when app is backgrounded)
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.ready
      .then((reg) => { swRegRef.current = reg; })
      .catch(() => {});
  }, []);

  // Persist settings
  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch {}
  }, [settings]);

  // Route SW notification clicks to app navigation
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handleMessage = (event) => {
      if (event.data?.type === "NOTIFICATION_CLICK") {
        window.dispatchEvent(
          new CustomEvent("nora:notification-click", { detail: event.data.data })
        );
      }
    };
    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => navigator.serviceWorker.removeEventListener("message", handleMessage);
  }, []);

  const updateSettings = useCallback((patch) => {
    setSettings((s) => ({ ...s, ...patch }));
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === "undefined") return "denied";
    try {
      const p = await Notification.requestPermission();
      setPermission(p);
      if (p === "granted") {
        setSettings((s) => ({ ...s, enabled: true, bannerDismissed: true }));
      }
      return p;
    } catch {
      return "denied";
    }
  }, []);

  // Show a notification — prefers SW (works backgrounded on Android) over Notification API
  const showNotification = useCallback(
    async (title, body, opts = {}) => {
      if (permission !== "granted" || !settings.enabled) return;
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
          return;
        } catch {}
      }
      try { new Notification(title, options); } catch {}
    },
    [permission, settings.enabled]
  );

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
    bannerVisible,
    dismissBanner,
  };
}
