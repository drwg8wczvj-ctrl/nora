import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { NativeTabBar, NAV_TABS } from '../plugins/NativeTabBar';

export function useNativeTabBar({ activeTab, mode, dark, enabled, visible = true, onTabChange }) {
  const isNativeIOS =
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

  const ready       = useRef(false);
  const listenerRef = useRef(null);
  const lastNativeSelectionRef = useRef(null);
  // Only true after setup() resolves — keeps web nav visible until native is confirmed
  const [nativeReady, setNativeReady] = useState(false);

  // ── Install / teardown ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isNativeIOS || !enabled) {
      if (ready.current) {
        NativeTabBar.hide();
        listenerRef.current?.remove();
        listenerRef.current = null;
        ready.current = false;
        setNativeReady(false);
      }
      return;
    }

    let cancelled = false;

    const init = async () => {
      try {
        await NativeTabBar.setup({ tabs: NAV_TABS, activeTab, mode, dark, visible });
        if (cancelled) return;
        const listener = await NativeTabBar.addListener('tabSelected', (evt) => {
          lastNativeSelectionRef.current = evt.tab;
          onTabChange(evt.tab);
        });
        listenerRef.current = listener;
        ready.current = true;
        setNativeReady(true);
      } catch (err) {
        console.warn('[NativeTabBar] setup failed, web nav stays visible:', err);
        ready.current = false;
        setNativeReady(false);
      }
    };

    init();

    return () => {
      cancelled = true;
      listenerRef.current?.remove();
      listenerRef.current = null;
      NativeTabBar.hide();
      ready.current = false;
      setNativeReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNativeIOS, enabled]);

  // ── Sync active tab ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isNativeIOS || !ready.current) return;
    if (lastNativeSelectionRef.current === activeTab) {
      lastNativeSelectionRef.current = null;
      return;
    }
    NativeTabBar.setActiveTab({ tab: activeTab });
  }, [activeTab, isNativeIOS]);

  // ── Sync appearance ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isNativeIOS || !ready.current) return;
    NativeTabBar.setAppearance({ mode, dark });
  }, [mode, dark, isNativeIOS]);

  // ── Sync visibility ────────────────────────────────────────────────────────
  // Lightweight show()/hide() only — does NOT tear down/reinstall the native
  // view (that's what the install/teardown effect above is for). This exists
  // because the native bar renders in its own UIKit layer on top of the
  // WebView: web-only mechanisms (z-index, dimming masks, position:fixed
  // overlays) have zero effect on it, so any full-screen web modal/sheet must
  // explicitly ask the native bar to hide itself or it bleeds through.
  useEffect(() => {
    if (!isNativeIOS || !ready.current) return;
    if (visible) NativeTabBar.show();
    else NativeTabBar.hide();
  }, [visible, isNativeIOS]);

  // usingNative is only true once native setup succeeds
  return { usingNative: isNativeIOS && enabled && nativeReady };
}
