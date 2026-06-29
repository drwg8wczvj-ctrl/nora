import { registerPlugin } from '@capacitor/core';

// Register the native plugin. On web/PWA the fallback is a no-op so the
// React app compiles and runs unchanged outside of Capacitor.
const NoraWidgetBridge = registerPlugin('NoraWidgetBridge', {
  web: { setWidgetData: () => Promise.resolve({ ok: true }) },
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
