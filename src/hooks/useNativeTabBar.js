import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { NativeTabBar, NAV_TABS } from '../plugins/NativeTabBar';

export function useNativeTabBar({ activeTab, mode, dark, enabled, onTabChange }) {
  const isNativeIOS =
    Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';

  const ready       = useRef(false);
  const listenerRef = useRef(null);
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
        await NativeTabBar.setup({ tabs: NAV_TABS, activeTab, mode, dark });
        if (cancelled) return;
        const listener = await NativeTabBar.addListener('tabSelected', (evt) => {
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
    NativeTabBar.setActiveTab({ tab: activeTab });
  }, [activeTab, isNativeIOS]);

  // ── Sync appearance ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!isNativeIOS || !ready.current) return;
    NativeTabBar.setAppearance({ mode, dark });
  }, [mode, dark, isNativeIOS]);

  // usingNative is only true once native setup succeeds
  return { usingNative: isNativeIOS && enabled && nativeReady };
}
