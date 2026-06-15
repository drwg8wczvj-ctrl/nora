import { useState, useEffect, useRef } from 'react';

export function usePWA() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [installable, setInstallable] = useState(false);
  const swReg = useRef(null);
  const deferredPrompt = useRef(null);

  // Register service worker and watch for updates
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        swReg.current = reg;

        // A new SW is already waiting from a previous page load
        if (reg.waiting) setUpdateAvailable(true);

        reg.addEventListener('updatefound', () => {
          const next = reg.installing;
          if (!next) return;
          next.addEventListener('statechange', () => {
            if (next.state === 'installed' && navigator.serviceWorker.controller) {
              // A new version installed alongside the existing one — prompt to update
              setUpdateAvailable(true);
            }
          });
        });
      } catch (err) {
        console.warn('[NORA SW] registration failed:', err);
      }
    };

    register();

    // When skipWaiting fires, the new SW takes control; reload to apply update
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  }, []);

  // Android / Chrome install prompt
  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      deferredPrompt.current = e;
      setInstallable(true);
    };
    const onInstalled = () => {
      setInstallable(false);
      deferredPrompt.current = null;
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const applyUpdate = () => {
    const reg = swReg.current;
    if (reg?.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    } else {
      window.location.reload();
    }
  };

  const promptInstall = async () => {
    if (!deferredPrompt.current) return false;
    deferredPrompt.current.prompt();
    const { outcome } = await deferredPrompt.current.userChoice;
    deferredPrompt.current = null;
    if (outcome === 'accepted') setInstallable(false);
    return outcome === 'accepted';
  };

  return { updateAvailable, installable, applyUpdate, promptInstall };
}