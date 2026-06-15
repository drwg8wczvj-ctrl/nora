import React, { useState, useEffect } from 'react';
import { usePWA } from './hooks/usePWA';
import './PWABanners.css';

export default function PWABanners({ dark }) {
  const { updateAvailable, installable, applyUpdate, promptInstall } = usePWA();
  const [showInstall, setShowInstall] = useState(false);

  // Delay install prompt — show 8s after load so it doesn't interrupt first use
  useEffect(() => {
    if (!installable) return;
    if (localStorage.getItem('nora_install_dismissed')) return;
    const t = setTimeout(() => setShowInstall(true), 8000);
    return () => clearTimeout(t);
  }, [installable]);

  const dismissInstall = () => {
    setShowInstall(false);
    localStorage.setItem('nora_install_dismissed', '1');
  };

  const handleInstall = async () => {
    await promptInstall();
    dismissInstall();
  };

  return (
    <>
      {updateAvailable && (
        <div className={`pwa-banner pwa-update-banner${dark ? ' pwa-dark' : ''}`} role="alert">
          <span className="pwa-banner-icon">✦</span>
          <span className="pwa-banner-text">New version of Nora available</span>
          <button className="pwa-btn pwa-update-btn" onClick={applyUpdate}>
            Update
          </button>
        </div>
      )}

      {showInstall && !updateAvailable && (
        <div className={`pwa-banner pwa-install-banner${dark ? ' pwa-dark' : ''}`} role="complementary">
          <span className="pwa-banner-icon">📲</span>
          <span className="pwa-banner-text">Install Nora on your device</span>
          <button className="pwa-btn pwa-install-btn" onClick={handleInstall}>
            Install
          </button>
          <button className="pwa-close-btn" onClick={dismissInstall} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
    </>
  );
}