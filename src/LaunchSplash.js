import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Sparkle } from "lucide-react";
import { hapticLight } from "./lib/haptics";
import "./LaunchSplash.css";

// Nora's cold-launch signature moment. Rendered ONCE per real app process
// launch (App.js decides that, not this component) on top of the already-
// mounting real UI. Phases, each driven by a single timeout chain:
//
//   intro    (0ms)    logo fades/scales in
//   greet    (~150ms) Nora's attached speech bubble appears
//   reveal   (~470ms) the prepared interface settles in behind Nora
//   docking  (~620ms) bubble withdraws while the mark moves to the real FAB
//                     rect, gaining the FAB's own squircle/gradient as it
//                     travels — so by the time it arrives it already looks
//                     like the button, not just a shrinking logo
//   done     (~960ms) one haptic fires, the real FAB (hidden until now)
//                     crossfades in at the exact same spot, this overlay
//                     unmounts
//
// The destination is measured from the real FAB on both layouts, not guessed,
// so the travelling mark and the button occupy the same final pixels.
export default function LaunchSplash({ dark, glass, greeting, onReveal, onComplete }) {
  const [phase, setPhase] = useState("intro");
  const [dockRect, setDockRect] = useState(null);
  const hapticFiredRef = useRef(false);

  const measureFab = useCallback(() => {
    const fab = document.querySelector(".mob-ai-fab, .chat-fab");
    const rect = fab && fab.offsetParent !== null ? fab.getBoundingClientRect() : null;
    if (!rect) return null;
    const measured = {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    };
    setDockRect(measured);
    return measured;
  }, []);

  // Measure before the logo's first visible frame. The travelling element can
  // then keep the FAB's final dimensions for its whole lifetime and animate
  // only a GPU-composited transform—no layout work during the glide.
  useLayoutEffect(() => {
    measureFab();
  }, [measureFab]);

  useEffect(() => {
    const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) {
      // Respect the OS setting: skip straight to a plain, instant reveal —
      // no scale/glow/dock choreography, just get out of the way.
      onComplete?.();
      return undefined;
    }

    const timers = [];
    // Give the opaque first frame a chance to paint, then begin the entrance.
    // Without this frame boundary the initial and visible styles can be
    // coalesced by the browser and the logo appears instead of arriving.
    timers.push(setTimeout(() => setPhase("enter"), 28));
    timers.push(setTimeout(() => setPhase("greet"), 150));
    timers.push(setTimeout(() => {
      setPhase("reveal");
      onReveal?.();
    }, 470));
    timers.push(setTimeout(() => {
      // Re-measure once in case a native safe-area/tab-bar adjustment settled
      // during launch. This happens before the transform is applied.
      measureFab();
      setPhase("docking");
    }, 620));
    timers.push(setTimeout(() => {
      if (!hapticFiredRef.current) { hapticFiredRef.current = true; hapticLight(); }
      setPhase("done");
    }, 940));
    timers.push(setTimeout(() => onComplete?.(), 1000));

    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measureFab]);

  const visible = phase !== "intro";
  const docking = phase === "docking" || phase === "done";
  const dockStyle = dockRect ? {
    width: dockRect.width,
    height: dockRect.height,
    borderRadius: Math.round(dockRect.width * 0.34),
    "--launch-dock-x": `${dockRect.left + dockRect.width / 2 - window.innerWidth / 2}px`,
    "--launch-dock-y": `${dockRect.top + dockRect.height / 2 - window.innerHeight / 2}px`,
  } : undefined;

  return (
    <div className={`launch-splash launch-splash-${phase}${dark ? " dark" : ""}${glass ? " glass" : ""}`} aria-hidden="true">
      <div className="launch-splash-bg" />
      <div
        className={`launch-splash-mark${visible ? " visible" : ""}${docking && dockRect ? " docking" : ""}${docking && !dockRect ? " fading-out" : ""}`}
        style={dockStyle}
      >
        <div className="launch-splash-logo" aria-hidden="true">
          <Sparkle className="launch-splash-star" strokeWidth={0} fill="currentColor" />
          <span className="launch-splash-wordmark">NORA</span>
        </div>
        <div className="launch-splash-greeting">
          <div className="launch-splash-greeting-line1">{greeting?.line1}</div>
          <div className="launch-splash-greeting-line2">{greeting?.line2}</div>
        </div>
      </div>
    </div>
  );
}
