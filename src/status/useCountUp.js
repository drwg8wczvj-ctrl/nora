import { useEffect, useRef, useState } from "react";

// Ease-out cubic — quick start, gentle settle.
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

// Animates a number from its previous displayed value to `targetValue` over
// `duration` ms using requestAnimationFrame. If targetValue isn't a finite
// number (null/undefined/NaN/non-numeric), it's returned as-is, unanimated —
// callers use this to fall back to static text for non-numeric metric values.
export function useCountUp(targetValue, { duration = 500 } = {}) {
  const isNum = typeof targetValue === "number" && Number.isFinite(targetValue);
  const [display, setDisplay] = useState(isNum ? 0 : targetValue);
  const rafRef = useRef(null);
  const valueRef = useRef(isNum ? 0 : targetValue);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    if (!isNum) {
      valueRef.current = targetValue;
      setDisplay(targetValue);
      return undefined;
    }

    const from = typeof valueRef.current === "number" ? valueRef.current : 0;
    const to = targetValue;
    const start = performance.now();

    const tick = (now) => {
      const t = duration <= 0 ? 1 : Math.min(1, (now - start) / duration);
      const value = from + (to - from) * easeOutCubic(t);
      valueRef.current = value;
      setDisplay(value);
      rafRef.current = t < 1 ? requestAnimationFrame(tick) : null;
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetValue, duration, isNum]);

  return display;
}
