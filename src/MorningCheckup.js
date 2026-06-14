import React, { useState } from "react";
import { X, ChevronLeft, ChevronRight, Moon, Zap, Brain, Sun } from "lucide-react";

// ── Readiness computation ────────────────────────────────────────
export function computeReadiness({ sleepQuality, restedScore, energyScore, clarityScore, sleepDuration }) {
  let score = 0;
  score += ({ poor: 0, okay: 1, good: 2.5, great: 4 }[sleepQuality] ?? 1);
  score += ((restedScore  - 1) / 9) * 3;
  score += ((energyScore  - 1) / 9) * 3;
  score += ((clarityScore - 1) / 9) * 3;
  if (sleepDuration != null) {
    if (sleepDuration >= 8) score += 1;
    else if (sleepDuration >= 7) score += 0.6;
    else if (sleepDuration >= 6) score += 0.2;
  }
  const pct = Math.min(1, score / 14);
  const pctInt = Math.round(pct * 100);
  if (pct >= 0.72) return { label: "High",     color: "#22c55e", pct: pctInt };
  if (pct >= 0.45) return { label: "Moderate", color: "#f59e0b", pct: pctInt };
  return               { label: "Low",      color: "#ef4444", pct: pctInt };
}

export function generateNoraSummary({ sleepQuality, restedScore, energyScore, clarityScore, dayPressure, readiness }) {
  const low  = energyScore <= 4 || restedScore <= 4;
  const hasPressure = dayPressure?.trim().length > 0;

  let summary;
  let tips = [];

  if (readiness.label === "High") {
    summary = "You're in strong shape today. This is a good window for focused, important work.";
    tips = ["Tackle your hardest task first", "Protect your peak focus window", "Keep evening light to sustain the week"];
  } else if (readiness.label === "Moderate") {
    summary = "Decent start. Your energy is usable — realistic sessions and one clear priority will carry the day.";
    tips = ["Start with one clear priority", "Keep sessions under 90 minutes", "Protect evening recovery"];
  } else {
    summary = "Today may need a lighter start. A few small wins beat one exhausting push.";
    tips = ["Begin with one small easy task", "Avoid scheduling heavy work late", "Add a recovery break this afternoon"];
  }

  if (hasPressure) tips.push("NORA noted your day pressure — let's keep the plan realistic.");
  if (low && !hasPressure) tips.push("Consider Micro Start mode for anything that feels heavy.");

  return { summary, tips: tips.slice(0, 3) };
}

function parseSleepDuration(bedtime, wakeTime) {
  if (!bedtime || !wakeTime) return null;
  const [bh, bm] = bedtime.split(":").map(Number);
  const [wh, wm] = wakeTime.split(":").map(Number);
  let mins = (wh * 60 + wm) - (bh * 60 + bm);
  if (mins < 0) mins += 24 * 60;
  return Math.round(mins / 60 * 10) / 10;
}

// ── Scale selector (1-10) ───────────────────────────────────────
function ScaleSelector({ value, onChange, low, high }) {
  return (
    <div className="mcu-scale">
      <div className="mcu-scale-btns">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            className={`mcu-scale-btn${value === n ? " active" : ""}${n <= 3 ? " low" : n >= 8 ? " high" : ""}`}
            onClick={() => onChange(n)}>
            {n}
          </button>
        ))}
      </div>
      <div className="mcu-scale-labels">
        <span>{low}</span>
        <span>{high}</span>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────
export default function MorningCheckup({ dark, glass, today, onComplete, onClose }) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState({
    sleepQuality: null,
    bedtime: "",
    wakeTime: "",
    restedScore: null,
    energyScore: null,
    clarityScore: null,
    dayPressure: "",
  });

  const TOTAL_STEPS = 5;

  const set = (key, val) => setData((d) => ({ ...d, [key]: val }));

  const canNext = [
    !!data.sleepQuality,                     // 0: sleep quality required
    true,                                     // 1: times optional
    data.restedScore != null,                 // 2: rested required
    data.energyScore != null && data.clarityScore != null, // 3: energy + clarity
    true,                                     // 4: pressure optional
  ][step] ?? true;

  const handleFinish = () => {
    const sleepDuration = parseSleepDuration(data.bedtime, data.wakeTime);
    const readiness = computeReadiness({ ...data, sleepDuration });
    const { summary, tips } = generateNoraSummary({ ...data, readiness });
    const checkup = { ...data, date: today, sleepDuration, readinessScore: readiness.pct, readinessLabel: readiness.label, noraSummary: summary, noraTips: tips };
    onComplete(checkup);
    setStep(TOTAL_STEPS); // summary step
  };

  const finalReadiness = step >= TOTAL_STEPS ? (() => {
    const sd = parseSleepDuration(data.bedtime, data.wakeTime);
    return computeReadiness({ ...data, sleepDuration: sd });
  })() : null;
  const finalSummary = finalReadiness ? generateNoraSummary({ ...data, readiness: finalReadiness }) : null;

  const SLEEP_OPTIONS = [
    { key: "poor",  label: "Poor",  sub: "Restless or very short" },
    { key: "okay",  label: "Okay",  sub: "Not great, not terrible" },
    { key: "good",  label: "Good",  sub: "Felt rested" },
    { key: "great", label: "Great", sub: "Deep and refreshing" },
  ];
  const PRESSURE_CHIPS = ["Exam", "Deadline", "Training", "Late night", "Headache", "Stress", "Big meeting"];

  return (
    <div className={`mcu-overlay${dark ? " dark" : ""}${glass ? " glass" : ""}`}>
      <div className="mcu-modal">

        {/* Header */}
        <div className="mcu-header">
          <div className="mcu-progress-bar">
            <div className="mcu-progress-fill" style={{ width: `${(step / TOTAL_STEPS) * 100}%` }} />
          </div>
          <div className="mcu-header-row">
            {step > 0 && step < TOTAL_STEPS
              ? <button className="mcu-back" onClick={() => setStep(s => s - 1)}><ChevronLeft size={20} /></button>
              : <span />}
            <span className="mcu-step-label">
              {step < TOTAL_STEPS ? `${step + 1} of ${TOTAL_STEPS}` : "Done"}
            </span>
            <button className="mcu-close" onClick={onClose}><X size={18} /></button>
          </div>
        </div>

        {/* Step content */}
        <div className="mcu-body">

          {/* ── Step 0: Sleep Quality ── */}
          {step === 0 && (
            <div className="mcu-step">
              <Moon size={28} className="mcu-step-icon" />
              <h2 className="mcu-title">How did you sleep?</h2>
              <div className="mcu-sleep-grid">
                {SLEEP_OPTIONS.map(({ key, label, sub }) => (
                  <button key={key}
                    className={`mcu-sleep-card${data.sleepQuality === key ? " active" : ""}`}
                    onClick={() => set("sleepQuality", key)}>
                    <span className="mcu-sleep-label">{label}</span>
                    <span className="mcu-sleep-sub">{sub}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Step 1: Sleep Times ── */}
          {step === 1 && (
            <div className="mcu-step">
              <Moon size={28} className="mcu-step-icon" />
              <h2 className="mcu-title">Sleep times</h2>
              <p className="mcu-subtitle">Optional — helps NORA track your patterns</p>
              <div className="mcu-time-row">
                <div className="mcu-time-field">
                  <label className="mcu-time-label">Bedtime</label>
                  <input type="time" className="mcu-time-input"
                    value={data.bedtime} onChange={e => set("bedtime", e.target.value)} />
                </div>
                <div className="mcu-time-field">
                  <label className="mcu-time-label">Wake time</label>
                  <input type="time" className="mcu-time-input"
                    value={data.wakeTime} onChange={e => set("wakeTime", e.target.value)} />
                </div>
              </div>
              {data.bedtime && data.wakeTime && (
                <p className="mcu-duration-note">
                  {(() => {
                    const d = parseSleepDuration(data.bedtime, data.wakeTime);
                    return d != null ? `Sleep duration: ${Math.floor(d)}h ${Math.round((d % 1) * 60)}m` : "";
                  })()}
                </p>
              )}
            </div>
          )}

          {/* ── Step 2: Rested ── */}
          {step === 2 && (
            <div className="mcu-step">
              <Moon size={28} className="mcu-step-icon" />
              <h2 className="mcu-title">How rested do you feel?</h2>
              <p className="mcu-subtitle">Regardless of hours — how does your body feel?</p>
              <ScaleSelector value={data.restedScore} onChange={v => set("restedScore", v)} low="Exhausted" high="Fully rested" />
            </div>
          )}

          {/* ── Step 3: Energy + Clarity ── */}
          {step === 3 && (
            <div className="mcu-step">
              <div className="mcu-dual-icon">
                <Zap size={24} className="mcu-step-icon" />
                <Brain size={24} className="mcu-step-icon" />
              </div>
              <h2 className="mcu-title">Energy &amp; clarity</h2>
              <div className="mcu-dual-scales">
                <div className="mcu-scale-section">
                  <label className="mcu-scale-lbl"><Zap size={13} /> Energy right now</label>
                  <ScaleSelector value={data.energyScore} onChange={v => set("energyScore", v)} low="Drained" high="Charged" />
                </div>
                <div className="mcu-scale-section">
                  <label className="mcu-scale-lbl"><Brain size={13} /> Mental clarity</label>
                  <ScaleSelector value={data.clarityScore} onChange={v => set("clarityScore", v)} low="Foggy" high="Sharp" />
                </div>
              </div>
            </div>
          )}

          {/* ── Step 4: Day Pressure ── */}
          {step === 4 && (
            <div className="mcu-step">
              <Sun size={28} className="mcu-step-icon" />
              <h2 className="mcu-title">Anything on your mind today?</h2>
              <p className="mcu-subtitle">Optional — helps NORA adjust planning</p>
              <div className="mcu-chips">
                {PRESSURE_CHIPS.map((chip) => (
                  <button key={chip}
                    className={`mcu-chip${data.dayPressure === chip ? " active" : ""}`}
                    onClick={() => set("dayPressure", data.dayPressure === chip ? "" : chip)}>
                    {chip}
                  </button>
                ))}
              </div>
              <textarea className="mcu-pressure-input" rows={2}
                value={data.dayPressure}
                onChange={e => set("dayPressure", e.target.value)}
                placeholder="Or describe it in your own words…" />
            </div>
          )}

          {/* ── Step 5: Summary (NORA's Read) ── */}
          {step >= TOTAL_STEPS && finalReadiness && finalSummary && (
            <div className="mcu-step mcu-summary">
              <div className="mcu-readiness-ring" style={{ "--rc": finalReadiness.color }}>
                <div className="mcu-readiness-ring-fill" style={{ "--pct": finalReadiness.pct / 100 }} />
                <div className="mcu-readiness-center">
                  <span className="mcu-readiness-pct">{finalReadiness.pct}%</span>
                  <span className="mcu-readiness-lbl" style={{ color: finalReadiness.color }}>{finalReadiness.label}</span>
                </div>
              </div>
              <h2 className="mcu-title">Today's Readiness</h2>
              <p className="mcu-nora-summary">"{finalSummary.summary}"</p>
              <div className="mcu-tips">
                {finalSummary.tips.map((tip, i) => (
                  <div key={i} className="mcu-tip">
                    <span className="mcu-tip-dot" />
                    {tip}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer navigation */}
        <div className="mcu-footer">
          {step < TOTAL_STEPS ? (
            <button
              className="mcu-next-btn"
              disabled={!canNext}
              onClick={() => {
                if (step === TOTAL_STEPS - 1) handleFinish();
                else setStep(s => s + 1);
              }}>
              {step === TOTAL_STEPS - 1 ? "See NORA's read" : "Continue"}
              <ChevronRight size={18} />
            </button>
          ) : (
            <button className="mcu-next-btn" onClick={onClose}>
              Start the day
              <ChevronRight size={18} />
            </button>
          )}
        </div>

      </div>
    </div>
  );
}
