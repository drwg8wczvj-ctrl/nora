import { useState, useEffect, useRef, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { PushNotifications } from "@capacitor/push-notifications";
import { savePushSubscription, scheduleServerAlarm, cancelServerAlarm, saveApnsToken } from "../lib/noraApi";
import { browserEnv } from "../config/env";

const SETTINGS_KEY = "nora_notif_settings_v1";
const IS_NATIVE = Capacitor.isNativePlatform();

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

// cyrb53 — fast, well-distributed 53-bit string hash (public domain, bryc).
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

// Deterministic map from an arbitrary alarm id string to a stable positive
// 32-bit int, required by @capacitor/local-notifications' numeric `id` field.
// XOR-folds the 53-bit hash's high/low halves (rather than a plain modulo)
// to preserve entropy from both halves. Never returns 0.
function tagToNotificationId(tag) {
  const h = cyrb53(String(tag));
  const lo = h & 0x7fffffff;
  const hi = Math.floor(h / 0x80000000) & 0x7fffffff;
  return ((lo ^ hi) >>> 0) || 1;
}

export function useNotifications() {
  const [permission, setPermission] = useState(() => {
    if (IS_NATIVE) return "default"; // resolved async below via checkPermissions()
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
  // Always-fresh ref used by scheduleAlarm's setTimeout callbacks so they
  // see the current permission + settings.enabled even though scheduleAlarm
  // itself has empty deps (to avoid re-registering timers on every render).
  const showNotifRef = useRef(null);

  // ── Native: resolve current permission state on mount ───────────────────────
  useEffect(() => {
    if (!IS_NATIVE) return;
    LocalNotifications.checkPermissions().then(({ display }) => {
      setPermission(display === "granted" ? "granted" : display === "denied" ? "denied" : "default");
    }).catch(() => {});
  }, []);

  // ── Native: APNs push registration (server/cross-device-triggered pushes) ───
  // Separate concern from local alarm scheduling below — this is a one-time
  // registration flow, not tied to any particular scheduleAlarm call site.
  useEffect(() => {
    if (!IS_NATIVE) return;
    let regHandle, errHandle;

    PushNotifications.addListener("registration", (token) => {
      saveApnsToken(token.value).catch(() => {});
    }).then((h) => { regHandle = h; });

    PushNotifications.addListener("registrationError", (err) => {
      console.warn("[PushNotifications] registration error", err);
    }).then((h) => { errHandle = h; });

    return () => { regHandle?.remove(); errHandle?.remove(); };
  }, []);

  // ── Native: route notification taps into the same click event web uses ──────
  useEffect(() => {
    if (!IS_NATIVE) return;
    let handle;
    LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
      window.dispatchEvent(
        new CustomEvent("nora:notification-click", { detail: event.notification.extra })
      );
    }).then((h) => { handle = h; });
    return () => handle?.remove();
  }, []);

  // ── Service worker setup (web only) ──────────────────────────────────────────
  useEffect(() => {
    if (IS_NATIVE) return;
    if (!("serviceWorker" in navigator)) return;

    // Helper to send CONFIGURE to whichever SW is currently controlling the page
    const sendConfigure = (worker) => {
      const supabaseUrl = browserEnv.supabaseUrl;
      const anonKey     = browserEnv.supabaseAnonKey;
      if (supabaseUrl && anonKey && worker) {
        worker.postMessage({ type: "CONFIGURE", supabaseUrl, anonKey });
      }
    };

    // Re-send config whenever the SW controller changes (e.g. after an update)
    const onControllerChange = () => {
      if (navigator.serviceWorker.controller) {
        sendConfigure(navigator.serviceWorker.controller);
      }
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker.ready
      .then(async (reg) => {
        swRegRef.current = reg;

        // Persist Supabase URL + anon key in SW IndexedDB so that the
        // pushsubscriptionchange handler can call replace_subscription even
        // when the SW restarts cold (no in-memory state, no open app tab).
        const worker = navigator.serviceWorker.controller ?? reg.active;
        if (worker) {
          const supabaseUrl = browserEnv.supabaseUrl;
          const anonKey     = browserEnv.supabaseAnonKey;
          if (supabaseUrl && anonKey) {
            worker.postMessage({ type: "CONFIGURE", supabaseUrl, anonKey });
          }
        }

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

        // Check push subscription and sync to server
        // Fetch VAPID key from server so key rotations work even with cached bundle
        let pushSubscribed = false;
        try {
          let vapidKey;
          try {
            const EDGE = browserEnv.supabaseUrl;
            const ANON = browserEnv.supabaseAnonKey;
            if (EDGE) {
              const res = await fetch(`${EDGE}/functions/v1/nora-push`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  ...(ANON ? { "Authorization": `Bearer ${ANON}` } : {}),
                },
                body: JSON.stringify({ action: "get_vapid_key" }),
              });
              const data = await res.json();
              vapidKey = data.publicKey || null;
            }
          } catch {}
          if (!vapidKey) vapidKey = browserEnv.vapidPublicKey;

          const lastKey = localStorage.getItem("nora_vapid_key_v1");
          let sub = await reg.pushManager.getSubscription();

          if (Notification.permission === "granted" && vapidKey) {
            if (sub && lastKey !== vapidKey) {
              await sub.unsubscribe().catch(() => {});
              sub = null;
            }
            if (sub) {
              localStorage.setItem("nora_vapid_key_v1", vapidKey);
              savePushSubscription(sub.toJSON()).catch(() => {});
              pushSubscribed = true;
            } else {
              const raw = atob(vapidKey.replace(/-/g, "+").replace(/_/g, "/"));
              const appServerKey = Uint8Array.from(raw, (c) => c.charCodeAt(0));
              const newSub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appServerKey });
              localStorage.setItem("nora_vapid_key_v1", vapidKey);
              await savePushSubscription(newSub.toJSON()).catch(() => {});
              pushSubscribed = true;
            }
          } else {
            pushSubscribed = !!sub;
          }
        } catch (e) {
          console.warn("Push subscription sync:", e);
        }

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

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  // Listen for SW messages (notification clicks, alarm count replies)
  useEffect(() => {
    if (IS_NATIVE) return;
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

  // ── Subscribe to Web Push (VAPID) — web only, meaningless without a SW ──────
  const subscribeToPush = useCallback(async () => {
    if (IS_NATIVE) return false;
    const reg = swRegRef.current;
    if (!reg?.pushManager) return false;

    // Fetch the current VAPID public key from the server so that key rotations
    // work even when the React bundle is cached by the service worker.
    let vapidKey;
    try {
      const EDGE = browserEnv.supabaseUrl;
      const ANON = browserEnv.supabaseAnonKey;
      if (EDGE) {
        const res = await fetch(`${EDGE}/functions/v1/nora-push`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(ANON ? { "Authorization": `Bearer ${ANON}` } : {}),
          },
          body: JSON.stringify({ action: "get_vapid_key" }),
        });
        const data = await res.json();
        vapidKey = data.publicKey || null;
      }
    } catch {}
    // Fall back to build-time env var if server unreachable
    if (!vapidKey) vapidKey = browserEnv.vapidPublicKey;
    if (!vapidKey) return false;

    try {
      const lastKey = localStorage.getItem("nora_vapid_key_v1");
      let sub = await reg.pushManager.getSubscription();
      // Force re-subscribe if VAPID key changed since last subscribe
      if (sub && lastKey !== vapidKey) {
        await sub.unsubscribe().catch(() => {});
        sub = null;
      }
      if (!sub) {
        const raw = atob(vapidKey.replace(/-/g, "+").replace(/_/g, "/"));
        const appServerKey = Uint8Array.from(raw, (c) => c.charCodeAt(0));
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: appServerKey });
      }
      localStorage.setItem("nora_vapid_key_v1", vapidKey);
      await savePushSubscription(sub.toJSON()).catch(() => {});
      setHealth((h) => ({ ...h, pushSubscribed: true }));
      return true;
    } catch (e) {
      console.warn("subscribeToPush:", e);
      return false;
    }
  }, []);

  // ── Register periodic background sync (Android Chrome) — web only ──────────
  const registerPeriodicSync = useCallback(async () => {
    if (IS_NATIVE) return false;
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
    if (IS_NATIVE) {
      try {
        // PushNotifications.requestPermissions() authorizes the same underlying
        // UNUserNotificationCenter grant that LocalNotifications needs, so a
        // single request covers both — no second/duplicate permission prompt.
        const { receive } = await PushNotifications.requestPermissions();
        const granted = receive === "granted";
        setPermission(granted ? "granted" : "denied");
        if (granted) {
          setSettings((s) => ({ ...s, enabled: true, bannerDismissed: true }));
          PushNotifications.register();
        }
        return granted ? "granted" : "denied";
      } catch {
        return "denied";
      }
    }
    if (typeof Notification === "undefined") return "denied";
    try {
      const p = await Notification.requestPermission();
      setPermission(p);
      if (p === "granted") {
        setSettings((s) => ({ ...s, enabled: true, bannerDismissed: true }));
        await registerPeriodicSync();
        await subscribeToPush();
      }
      return p;
    } catch {
      return "denied";
    }
  }, [registerPeriodicSync, subscribeToPush]);

  // ── Schedule an alarm — native: OS-level local notification (survives app  ──
  // close entirely on its own). Web: 3-layer SW/server/setTimeout design.
  const scheduleAlarm = useCallback((id, scheduledFor, title, body, data = {}, tag) => {
    if (IS_NATIVE) {
      const notifId = tagToNotificationId(id);
      LocalNotifications.schedule({
        notifications: [{
          id: notifId,
          title,
          body,
          schedule: { at: new Date(scheduledFor) },
          extra: { ...data, tag: tag || id },
        }],
      }).catch((e) => console.warn("[LocalNotifications] schedule failed", e));
      setHealth((h) => ({ ...h, alarmCount: h.alarmCount + 1 }));
      return;
    }

    const alarm = { id, scheduledFor, title, body, tag: tag || id, data };

    // Layer 1: SW IndexedDB — checked on every SW wake-up (same device)
    const controller = navigator.serviceWorker?.controller;
    if (controller) {
      controller.postMessage({ type: "STORE_ALARM", alarm });
      setHealth((h) => ({ ...h, alarmCount: h.alarmCount + 1 }));
    }

    // Layer 2: Supabase server alarm — sent via Web Push by pg_cron (cross-device)
    scheduleServerAlarm(alarm).catch(() => {});

    // Layer 3: React setTimeout — fires exactly on time when app is open.
    // Uses showNotifRef so the callback always sees the CURRENT permission and
    // settings.enabled, not the stale values captured when scheduleAlarm was
    // first created. Tag falls back to id (matching alarm.tag above) so this
    // layer dedupes identically to the other two instead of generating its
    // own random tag when a caller omits one.
    const delay = scheduledFor - Date.now();
    if (delay > 0) {
      clearTimeout(reactTimers.current[id]);
      reactTimers.current[id] = setTimeout(() => {
        showNotifRef.current?.(title, body, { tag: tag || id, data });
      }, delay);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cancel a scheduled alarm ────────────────────────────────────────────────
  const cancelAlarm = useCallback((id) => {
    if (IS_NATIVE) {
      const notifId = tagToNotificationId(id);
      LocalNotifications.cancel({ notifications: [{ id: notifId }] }).catch(() => {});
      setHealth((h) => ({ ...h, alarmCount: Math.max(0, h.alarmCount - 1) }));
      return;
    }
    clearTimeout(reactTimers.current[id]);
    delete reactTimers.current[id];
    const controller = navigator.serviceWorker?.controller;
    if (controller) {
      controller.postMessage({ type: "CLEAR_ALARM", id });
      setHealth((h) => ({ ...h, alarmCount: Math.max(0, h.alarmCount - 1) }));
    }
    cancelServerAlarm(id).catch(() => {});
  }, []);

  // ── Display a notification (native: immediate local notification;          ──
  // web: SW-first, Notification API fallback) ─────────────────────────────────
  const showNotification = useCallback(
    async (title, body, opts = {}) => {
      if (permission !== "granted" || !settings.enabled) return false;
      if (IS_NATIVE) {
        try {
          await LocalNotifications.schedule({
            notifications: [{
              id: tagToNotificationId(opts.tag || `nora-${Date.now()}`),
              title,
              body,
              extra: opts.data || {},
            }],
          });
          return true;
        } catch {
          return false;
        }
      }
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
  // Keep the ref current so setTimeout callbacks in scheduleAlarm always use
  // the latest version (with up-to-date permission + settings.enabled).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { showNotifRef.current = showNotification; }, [showNotification]);

  // ── Test notification ───────────────────────────────────────────────────────
  const sendTestNotification = useCallback(async () => {
    if (permission !== "granted") {
      const p = await requestPermission();
      if (p !== "granted") return false;
    }
    // Temporarily enable if needed for the test
    const wasEnabled = settings.enabled;
    if (!wasEnabled) setSettings((s) => ({ ...s, enabled: true }));

    let ok = false;
    if (IS_NATIVE) {
      try {
        await LocalNotifications.schedule({
          notifications: [{
            id: tagToNotificationId("nora-test"),
            title: "✅ Notifications on",
            body: "You'll get reminders, even when it's closed.",
            extra: { action: "test" },
          }],
        });
        ok = true;
      } catch {}
    } else {
      const reg = swRegRef.current;
      if (reg) {
        try {
          await reg.showNotification("✅ Notifications on", {
            body:  "You'll get reminders, even when it's closed.",
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
          new Notification("✅ Notifications on", {
            body: "You'll get reminders, even when it's closed.",
            icon: "/icon-192.png",
          });
          ok = true;
        } catch {}
      }
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

  const forceResubscribe = useCallback(async () => {
    if (IS_NATIVE) return false; // no subscription concept for local notifications
    const reg = swRegRef.current;
    if (!reg?.pushManager) return false;
    try {
      const sub = await reg.pushManager.getSubscription();
      if (sub) await sub.unsubscribe().catch(() => {});
      localStorage.removeItem("nora_vapid_key_v1");
      setHealth(h => ({ ...h, pushSubscribed: false }));
      return await subscribeToPush();
    } catch (e) {
      console.warn("forceResubscribe:", e);
      return false;
    }
  }, [subscribeToPush]); // eslint-disable-line react-hooks/exhaustive-deps

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
    subscribeToPush,
    forceResubscribe,
  };
}
