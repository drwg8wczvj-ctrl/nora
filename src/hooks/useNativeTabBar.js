import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { NativeTabBar, NAV_TABS } from '../plugins/NativeTabBar';

/**
 * Manages the native iOS Liquid Glass tab bar overlay.
 *
 * When `enabled` is true AND the app is running as a native iOS build,
 * this hook installs the native overlay and hides the web bottom nav.
 * On web / Android / when `enabled` is false, it is a complete no-op.
 *
 * @param {object}   opts
 * @param {string}   opts.activeTab   - current tab id ('plan' | 'tasks' | …)
 * @param {string}   opts.mode        - 'glass' | 'default'
 * @param {boolean}  opts.dark        - dark theme active
 * @param {boolean}  opts.enabled     - true only when glass mode is on
 * @param {function} opts.onTabChange - called with the new tab id on native tap
 * @returns {{ usingNative: boolean }}
 */
export function useNativeTabBar({ activeTab, mode, dark, enabled, onTabChange }) {
  const isNativeIOS =
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

  const ready     = useRef(false);
  const listenerRef = useRef(null);

  // ── Install / teardown when enabled/platform changes ──────────────────────
  useEffect(() => {
    if (!isNativeIOS || !enabled) {
      // Clean up any previously installed overlay
      if (ready.current) {
        NativeTabBar.hide();
        listenerRef.current?.remove();
        listenerRef.current = null;
        ready.current = false;
      }
      return;
    }

    let cancelled = false;

    const init = async () => {
      await NativeTabBar.setup({
        tabs:      NAV_TABS,
        activeTab,
        mode,
        dark,
      });

      if (cancelled) return;

      const listener = await NativeTabBar.addListener('tabSelected', (evt) => {
        onTabChange(evt.tab);
      });

      listenerRef.current = listener;
      ready.current = true;
    };

    init();

    return () => {
      cancelled = true;
      listenerRef.current?.remove();
      listenerRef.current = null;
      NativeTabBar.hide();
      ready.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNativeIOS, enabled]);

  // ── Sync active tab to native (DOM-direct equivalent, no re-renders) ──────
  useEffect(() => {
    if (!isNativeIOS || !ready.current) return;
    NativeTabBar.setActiveTab({ tab: activeTab });
  }, [activeTab, isNativeIOS]);

  // ── Sync appearance on mode/dark toggle ───────────────────────────────────
  useEffect(() => {
    if (!isNativeIOS || !ready.current) return;
    NativeTabBar.setAppearance({ mode, dark });
  }, [mode, dark, isNativeIOS]);

  return { usingNative: isNativeIOS && enabled };
}
