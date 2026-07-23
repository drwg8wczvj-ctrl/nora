import { registerPlugin } from '@capacitor/core';

// Register the native plugin. On web/PWA the fallback is a no-op so the
// React app compiles and runs unchanged outside of Capacitor.
const NoraWidgetBridge = registerPlugin('NoraWidgetBridge', {
  web: {
    setWidgetData: () => Promise.resolve({ ok: true }),
    getPendingWidgetActions: () => Promise.resolve({ actions: [] }),
  },
});

/**
 * Push a compact snapshot of today's data to the iOS widget.
 * Writes to the App Group UserDefaults that the WidgetKit extension reads,
 * then calls WidgetCenter.reloadAllTimelines() so widgets refresh immediately.
 *
 * Safe to call on web/PWA — the fallback resolves silently.
 */
export async function syncWidgetData(payload) {
  try {
    await NoraWidgetBridge.setWidgetData({ data: payload });
  } catch {
    // Running as web PWA or plugin not yet wired — ignore
  }
}

/**
 * Drains any actions queued by interactive widget buttons (currently just
 * "Complete Task", tapped without opening the app) — the widget extension
 * optimistically updates its own cached copy, but the real task list only
 * ever changes here, in the main app. Call on launch/resume; returns [] on
 * web/PWA or if nothing is queued.
 */
export async function getPendingWidgetActions() {
  try {
    const { actions } = await NoraWidgetBridge.getPendingWidgetActions();
    return Array.isArray(actions) ? actions : [];
  } catch {
    return [];
  }
}
