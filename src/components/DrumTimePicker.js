import React, { useRef, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import "./DrumTimePicker.css";

const ITEM_H = 44;
const HALF   = 3; // rows above/below selected

const HOURS   = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

function DrumCol({ items, value, onChange }) {
  const ref         = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // scroll to initial value on mount (no animation)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const idx = items.indexOf(value);
    el.scrollTop = (idx >= 0 ? idx : 0) * ITEM_H;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const commit = () => {
      const idx    = Math.round(el.scrollTop / ITEM_H);
      const clamped = Math.max(0, Math.min(idx, items.length - 1));
      onChangeRef.current(items[clamped]);
    };

    let tid;
    if ("onscrollend" in el) {
      el.addEventListener("scrollend", commit, { passive: true });
      return () => el.removeEventListener("scrollend", commit);
    }
    const onScroll = () => { clearTimeout(tid); tid = setTimeout(commit, 150); };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => { el.removeEventListener("scroll", onScroll); clearTimeout(tid); };
  }, [items]);

  return (
    <div className="dtp-drum-outer">
      <div className="dtp-drum-col" ref={ref}>
        {Array(HALF).fill(0).map((_, i) => <div key={`t${i}`} className="dtp-drum-spacer" />)}
        {items.map(n => (
          <div key={n} className="dtp-drum-item">{String(n).padStart(2, "0")}</div>
        ))}
        {Array(HALF).fill(0).map((_, i) => <div key={`b${i}`} className="dtp-drum-spacer" />)}
      </div>
    </div>
  );
}

export default function DrumTimePicker({ hour, minute, onConfirm, onReset, onDismiss }) {
  const [h, setH] = useState(hour ?? 8);
  const [m, setM] = useState(minute ?? 0);

  return createPortal(
    <div className="dtp-overlay" onClick={onDismiss}>
      <div className="dtp-card" onClick={e => e.stopPropagation()}>
        <div className="dtp-cols-wrap">
          <div className="dtp-selector-bar" />
          <DrumCol items={HOURS}   value={h} onChange={setH} />
          <div className="dtp-colon">:</div>
          <DrumCol items={MINUTES} value={m} onChange={setM} />
        </div>
        <div className="dtp-footer">
          <button className="dtp-btn-reset" onClick={onReset}>Reset</button>
          <button className="dtp-btn-confirm" onClick={() => onConfirm(h, m)}>
            <Check size={22} strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
