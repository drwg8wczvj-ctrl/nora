import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { hapticLight } from "./lib/haptics";
import BrandStar from "./components/BrandStar";
import { getLaunchReadingMs } from "./statusEngine/launchGreeting";
import "./LaunchSplash.css";

const ARRIVAL_DELAY_MS = 56;
const STAR_SETTLE_MS = 520;
const DEPARTURE_PAUSE_MS = 320;
const DOCKING_MS = 880;
const HANDOFF_MS = 140;

// Nora's cold-launch signature moment. The real app mounts underneath this
// opaque layer. Its actual AI Hub button is measured, so the travelling star
// becomes the persistent button at precisely the same on-screen position.
export default function LaunchSplash({
  dark,
  glass,
  greeting,
  onGreetingShown,
  onReveal,
  onComplete,
}) {
  const [phase, setPhase] = useState("intro");
  const [dockRect, setDockRect] = useState(null);
  const hapticFiredRef = useRef(false);
  const greetingRef = useRef(greeting);
  const callbacksRef = useRef({ onGreetingShown, onReveal, onComplete });

  greetingRef.current = greeting;
  callbacksRef.current = { onGreetingShown, onReveal, onComplete };

  const measureFab = useCallback(() => {
    const fab = document.querySelector(".mob-ai-fab, .chat-fab");
    const rect = fab ? fab.getBoundingClientRect() : null;
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    const measured = {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    };
    setDockRect(measured);
    return measured;
  }, []);

  useLayoutEffect(() => {
    measureFab();
  }, [measureFab]);

  useEffect(() => {
    const timers = new Set();
    let cancelled = false;
    const wait = (duration) => new Promise((resolve) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        resolve();
      }, duration);
      timers.add(timer);
    });

    const run = async () => {
      const reduceMotion = typeof window !== "undefined"
        && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

      if (reduceMotion) {
        setPhase("speaking");
        callbacksRef.current.onGreetingShown?.();
        await wait(getLaunchReadingMs(greetingRef.current));
        if (cancelled) return;
        setPhase("done");
        callbacksRef.current.onReveal?.();
        await wait(220);
        if (!cancelled) callbacksRef.current.onComplete?.();
        return;
      }

      await wait(ARRIVAL_DELAY_MS);
      if (cancelled) return;
      setPhase("arriving");

      await wait(STAR_SETTLE_MS);
      if (cancelled) return;
      setPhase("speaking");
      callbacksRef.current.onGreetingShown?.();

      // Read at the moment the words appear. A fast AI response may replace
      // the local composition before this point, but never mid-sentence.
      const readingMs = greetingRef.current?.readingMs ?? getLaunchReadingMs(greetingRef.current);
      await wait(Math.max(2400, Math.min(4000, readingMs)));
      if (cancelled) return;

      setPhase("departing");
      await wait(DEPARTURE_PAUSE_MS);
      if (cancelled) return;

      measureFab();
      setPhase("docking");
      callbacksRef.current.onReveal?.();
      await wait(DOCKING_MS);
      if (cancelled) return;

      if (!hapticFiredRef.current) {
        hapticFiredRef.current = true;
        hapticLight();
      }
      setPhase("landed");
      await wait(HANDOFF_MS);
      if (cancelled) return;

      setPhase("done");
      callbacksRef.current.onComplete?.();
    };

    run();
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      timers.clear();
    };
  }, [measureFab]);

  const visible = phase !== "intro";
  const docking = phase === "docking" || phase === "landed" || phase === "done";
  const dockStyle = dockRect ? {
    width: dockRect.width,
    height: dockRect.height,
    borderRadius: Math.round(dockRect.width * 0.34),
    "--launch-dock-x": `${dockRect.left + dockRect.width / 2 - window.innerWidth / 2}px`,
    "--launch-dock-y": `${dockRect.top + dockRect.height / 2 - window.innerHeight / 2}px`,
  } : undefined;

  return (
    <div
      className={`launch-splash launch-splash-${phase}${dark ? " dark" : ""}${glass ? " glass" : ""}`}
      data-phase={phase}
    >
      <div className="launch-splash-bg" aria-hidden="true" />
      <div
        className={`launch-splash-mark${visible ? " visible" : ""}${docking && dockRect ? " docking" : ""}${docking && !dockRect ? " fading-out" : ""}`}
        style={dockStyle}
        aria-hidden="true"
      >
        <div className="launch-splash-aura" />
        <div className="launch-splash-logo">
          <BrandStar className="launch-splash-star" size={24} tone="purple" />
          <span className="launch-splash-wordmark">NORA</span>
        </div>
      </div>

      <div className="launch-splash-greeting" role="status" aria-live="polite" aria-atomic="true">
        <div className="launch-splash-greeting-line1">{greeting?.line1}</div>
        <div className="launch-splash-greeting-line2">{greeting?.line2}</div>
      </div>
    </div>
  );
}
