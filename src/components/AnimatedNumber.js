import React, { useEffect, useRef, useState } from "react";

// Counts up from its previous displayed value to `value` over `duration` ms
// with an ease-out curve — respects prefers-reduced-motion by jumping
// straight to the final value. Re-triggers whenever `value` changes (e.g. a
// fresh HealthKit sync updates the number).
export default function AnimatedNumber({ value, duration = 900, format = (n) => Math.round(n).toString(), className, style }) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(null);

  useEffect(() => {
    if (value == null || Number.isNaN(value)) return undefined;
    const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) { setDisplay(value); return undefined; }

    const from = display;
    const to = value;
    let start = null;

    const step = (ts) => {
      if (start == null) start = ts;
      const t = Math.min(1, (ts - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setDisplay(from + (to - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  if (value == null || Number.isNaN(value)) return null;
  return <span className={className} style={{ fontVariantNumeric: "tabular-nums", ...style }}>{format(display)}</span>;
}
