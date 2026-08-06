import { useState, useEffect } from "react";

export function isPhoneViewport() {
  if (typeof window === "undefined") return false;
  const ua = navigator.userAgent ?? "";
  const phoneHardware = /iPhone|iPod|Android.+Mobile/i.test(ua)
    || (navigator.maxTouchPoints > 1 && Math.min(window.innerWidth, window.innerHeight) < 600);
  return phoneHardware || window.innerWidth < 768;
}

export function useMobile() {
  const [isMobile, setIsMobile] = useState(isPhoneViewport);
  useEffect(() => {
    const handler = () => setIsMobile(isPhoneViewport());
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return isMobile;
}

export function usePhoneLandscape() {
  const read = () => isPhoneViewport() && window.innerWidth > window.innerHeight;
  const [landscape, setLandscape] = useState(read);
  useEffect(() => {
    const handler = () => setLandscape(read());
    window.addEventListener("resize", handler);
    window.addEventListener("orientationchange", handler);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("orientationchange", handler);
    };
  }, []);
  return landscape;
}
