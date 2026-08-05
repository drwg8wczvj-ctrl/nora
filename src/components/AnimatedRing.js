import React, { useEffect, useState } from "react";
import "./AnimatedRing.css";

// A progress ring that draws itself from 0 to `pct` (0-100) on mount or
// whenever `pct` changes — respects prefers-reduced-motion by rendering at
// its final value immediately. Purely presentational; pass whatever should
// sit in the center (a number, a label) as children.
export default function AnimatedRing({ pct, size = 96, strokeWidth = 8, color = "#f59e0b", trackOpacity = 0.15, duration = 900, children, className = "" }) {
  const [animatedPct, setAnimatedPct] = useState(0);

  useEffect(() => {
    const target = pct ?? 0;
    const reduceMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) { setAnimatedPct(target); return undefined; }

    let raf;
    let start = null;
    const step = (ts) => {
      if (start == null) start = ts;
      const t = Math.min(1, (ts - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setAnimatedPct(target * eased);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [pct, duration]);

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.max(0, Math.min(100, animatedPct)) / 100);

  return (
    <div className={`anim-ring ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="anim-ring-svg">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth} opacity={trackOpacity} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
        />
      </svg>
      <div className="anim-ring-center">{children}</div>
    </div>
  );
}
