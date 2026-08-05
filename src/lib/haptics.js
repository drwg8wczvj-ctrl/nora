import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { Capacitor } from "@capacitor/core";

// Thin wrapper around @capacitor/haptics — every call is a real Taptic Engine
// invocation on-device (UIImpactFeedbackGenerator / UINotificationFeedbackGenerator /
// UISelectionFeedbackGenerator under the hood), never CSS-simulated. No-ops
// silently on web/Android/PWA so call sites never need their own platform checks.
const isNativeIOS = () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios";

async function safeCall(fn) {
  if (!isNativeIOS()) return;
  try { await fn(); } catch { /* haptics are a nice-to-have, never worth surfacing an error for */ }
}

// A light tap — closing a sheet/modal, toggling a switch, tapping a close (X) button.
export const hapticLight = () => safeCall(() => Haptics.impact({ style: ImpactStyle.Light }));

// A firmer tap — selecting an item from an action menu, confirming a destructive choice.
export const hapticMedium = () => safeCall(() => Haptics.impact({ style: ImpactStyle.Medium }));

// Moving through discrete options — segmented control / toggle group changes,
// scrolling through a picker. Matches UISelectionFeedbackGenerator exactly.
export const hapticSelection = () => safeCall(() => Haptics.selectionChanged());

// Outcome feedback — a save succeeded, an action failed.
export const hapticSuccess = () => safeCall(() => Haptics.notification({ type: NotificationType.Success }));
export const hapticWarning = () => safeCall(() => Haptics.notification({ type: NotificationType.Warning }));
export const hapticError   = () => safeCall(() => Haptics.notification({ type: NotificationType.Error }));
