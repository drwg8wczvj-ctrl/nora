import React, { useState, useMemo } from "react";
import { X, ChevronLeft, ChevronRight, Sunrise, Zap, Brain } from "lucide-react";

// ── Readiness computation (NaN-safe) ───────────────────────────
export function computeReadiness({ sleepQuality, restedScore, energyScore, clarityScore, sleepDuration } = {}) {
  // Guard: if no meaningful inputs, return null
  if (!sleepQuality && restedScore == null && energyScore == null && clarityScore == null) return null;

  let score = 0;
  score += ({ poor: 0, okay: 1, good: 2.5, great: 4 }[sleepQuality] ?? 1.5);
  score += ((( restedScore ?? 5) - 1) / 9) * 3;
  score += (((energyScore  ?? 5) - 1) / 9) * 3;
  score += (((clarityScore ?? 5) - 1) / 9) * 3;
  if (sleepDuration != null) {
    if (sleepDuration >= 8) score += 1;
    else if (sleepDuration >= 7) score += 0.6;
    else if (sleepDuration >= 6) score += 0.2;
  }
  const pct = Math.min(1, score / 14);
  const pctInt = Math.round(pct * 100);
  if (!isFinite(pctInt)) return { label: "Moderate", color: "#f59e0b", pct: 50 };
  if (pct >= 0.72) return { label: "High",     color: "#22c55e", pct: pctInt };
  if (pct >= 0.45) return { label: "Moderate", color: "#f59e0b", pct: pctInt };
  if (pct >= 0.25) return { label: "Low",      color: "#ef4444", pct: pctInt };
  return               { label: "Recovery",  color: "#8b5cf6", pct: pctInt };
}

export function generateNoraSummary({ sleepQuality, restedScore, energyScore, clarityScore, dayPressure, focusChoices = [], readiness } = {}) {
  const low = (energyScore ?? 5) <= 4 || (restedScore ?? 5) <= 4;
  const hasPressure = dayPressure?.trim().length > 0;
  const hasFocus = focusChoices.length > 0;

  let summary, tips = [];

  if (readiness?.label === "High") {
    summary = "You're in strong shape today. This is a good window for focused, important work.";
    tips = ["Tackle your hardest task first", "Protect your peak focus window", "Keep evening light to sustain the week"];
  } else if (readiness?.label === "Moderate") {
    summary = "Decent start. Your energy is usable — realistic sessions and one clear priority will carry the day.";
    tips = ["Start with one clear priority", "Keep sessions under 90 minutes", "Protect evening recovery"];
  } else if (readiness?.label === "Low") {
    summary = "Today may need a lighter start. A few small wins beat one exhausting push.";
    tips = ["Begin with one small easy task", "Avoid scheduling heavy work late", "Add a recovery break this afternoon"];
  } else {
    summary = "Your system needs recovery today. Gentle progress is still progress.";
    tips = ["Protect your rest — skip non-essential tasks", "One gentle priority only", "Avoid late-night work tonight"];
  }

  if (hasFocus) tips.push(`Stay close to your focus choices: ${focusChoices.slice(0, 2).join(", ")}.`);
  else if (hasPressure) tips.push("NORA noted your day pressure — keeping the plan realistic.");
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

// ── Scale selector ────────────────────────────────────────────────
function ScaleSelector({ value, onChange, low, high, color = "#818cf8" }) {
  return (
    <div className="mcu-scale">
      <div className="mcu-scale-btns">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button key={n}
            className={`mcu-scale-btn${value === n ? " active" : ""}${n <= 3 ? " low" : n >= 8 ? " high" : ""}`}
            style={value === n ? { background: color, borderColor: color } : {}}
            onClick={() => onChange(n)}>
            {n}
          </button>
        ))}
      </div>
      <div className="mcu-scale-labels"><span>{low}</span><span>{high}</span></div>
    </div>
  );
}

// ── Focus bubble colours ─────────────────────────────────────────
const BUBBLE_COLORS = [
  "#7c3aed", "#2563eb", "#0891b2", "#059669",
  "#d97706", "#dc2626", "#7c3aed", "#4f46e5", "#0369a1",
];

// ── Generate focus bubbles from today's tasks ────────────────────
function buildFocusBubbles(todayTasks = []) {
  const fromTasks = todayTasks
    .filter(t => t.title && !t.completed && t.type !== "break")
    .map(t => (t.title.length > 24 ? t.title.slice(0, 22) + "…" : t.title))
    .slice(0, 6);
  const defaults = ["Deep work", "Recovery", "Admin", "Creative work", "Learning"];
  const extra = defaults.filter(d => !fromTasks.some(b => b.toLowerCase().includes(d.split(" ")[0].toLowerCase())));
  return [...fromTasks, ...extra].slice(0, 10);
}

// ── Main component ────────────────────────────────────────────────
export default function MorningCheckup({
  dark, glass, today, todayTasks = [],
  onComplete, onClose,
  viewOnly = false, existingData = null,
}) {
  // If viewOnly, jump straight to summary
  const [step, setStep] = useState(viewOnly ? 5 : 0);
  const [data, setData] = useState(viewOnly && existingData ? existingData : {
    sleepQuality: null, bedtime: "", wakeTime: "",
    restedScore: null, energyScore: null, clarityScore: null,
    dayPressure: "", focusChoices: [],
  });

  const TOTAL_STEPS = 5;
  const focusBubbles = useMemo(() => buildFocusBubbles(todayTasks), [todayTasks]);

  const set = (key, val) => setData(d => ({ ...d, [key]: val }));
  const toggleFocus = (chip) => setData(d => ({
    ...d,
    focusChoices: d.focusChoices.includes(chip)
      ? d.focusChoices.filter(c => c !== chip)
      : [...d.focusChoices, chip],
  }));

  const canNext = [
    !!data.sleepQuality,
    true,
    data.restedScore != null,
    data.energyScore != null && data.clarityScore != null,
    true,
  ][step] ?? true;

  const handleFinish = () => {
    const sleepDuration = parseSleepDuration(data.bedtime, data.wakeTime);
    const readiness = computeReadiness({ ...data, sleepDuration }) ?? { label: "Moderate", color: "#f59e0b", pct: 50 };
    const { summary, tips } = generateNoraSummary({ ...data, readiness });
    const checkup = { ...data, date: today, sleepDuration, readinessScore: readiness.pct, readinessLabel: readiness.label, noraSummary: summary, noraTips: tips };
    onComplete(checkup);
    setStep(TOTAL_STEPS);
  };

  const sd = parseSleepDuration(data.bedtime, data.wakeTime);
  const finalReadiness = step >= TOTAL_STEPS
    ? (computeReadiness({ ...data, sleepDuration: sd }) ?? { label: "Moderate", color: "#f59e0b", pct: 50 })
    : null;
  const finalSummary = finalReadiness ? generateNoraSummary({ ...data, readiness: finalReadiness }) : null;

  const progressPct = Math.min(step / TOTAL_STEPS, 1) * 100;

  const SLEEP_OPTIONS = [
    { key: "poor",  label: "Poor",  sub: "Restless or too short",    color: "#ef4444" },
    { key: "okay",  label: "Okay",  sub: "Not great, not terrible",  color: "#f97316" },
    { key: "good",  label: "Good",  sub: "Felt rested",              color: "#22c55e" },
    { key: "great", label: "Great", sub: "Deep and refreshing",      color: "#10b981" },
  ];

  return (
    <div className={`mcu-overlay${dark ? " dark" : ""}${glass ? " glass" : ""}`}>
      {/* Sunrise gradient decoration */}
      <div className="mcu-sunrise-glow" />

      <div className="mcu-modal">
        {/* Progress bar */}
        <div className="mcu-progress-bar">
          <div className="mcu-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>

        {/* Top bar */}
        <div className="mcu-top-bar">
          {step > 0 && step < TOTAL_STEPS && !viewOnly
            ? <button className="mcu-back" onClick={() => setStep(s => s - 1)}><ChevronLeft size={18} /></button>
            : <div className="mcu-brand"><Sunrise size={16} className="mcu-sunrise-icon" /><span>Morning Check-Up</span></div>}
          <button className="mcu-close" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Body */}
        <div className="mcu-body">

          {/* ── 0: Sleep quality ── */}
          {step === 0 && (
            <div className="mcu-step">
              <div className="mcu-step-header">
                <Sunrise size={32} className="mcu-sunrise-icon" />
                <h2 className="mcu-title">How did you sleep?</h2>
                <p className="mcu-subtitle">Your sleep shapes everything that follows today.</p>
              </div>
              <div className="mcu-sleep-grid">
                {SLEEP_OPTIONS.map(({ key, label, sub, color }) => (
                  <button key={key}
                    className={`mcu-sleep-card${data.sleepQuality === key ? " active" : ""}`}
                    style={data.sleepQuality === key ? { borderColor: color, boxShadow: `0 0 20px ${color}30` } : {}}
                    onClick={() => set("sleepQuality", key)}>
                    <span className="mcu-sleep-indicator" style={{ background: color }} />
                    <span className="mcu-sleep-label">{label}</span>
                    <span className="mcu-sleep-sub">{sub}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── 1: Sleep times ── */}
          {step === 1 && (
            <div className="mcu-step">
              <div className="mcu-step-header">
                <Sunrise size={32} className="mcu-sunrise-icon" />
                <h2 className="mcu-title">Sleep schedule</h2>
                <p className="mcu-subtitle">Optional — helps NORA track your patterns over time.</p>
              </div>
              <div className="mcu-time-row">
                <div className="mcu-time-field">
                  <label className="mcu-time-label">Bedtime</label>
                  <input type="time" className="mcu-time-input" value={data.bedtime} onChange={e => set("bedtime", e.target.value)} />
                </div>
                <div className="mcu-time-field">
                  <label className="mcu-time-label">Wake time</label>
                  <input type="time" className="mcu-time-input" value={data.wakeTime} onChange={e => set("wakeTime", e.target.value)} />
                </div>
              </div>
              {data.bedtime && data.wakeTime && (() => {
                const d = parseSleepDuration(data.bedtime, data.wakeTime);
                return d != null ? (
                  <div className="mcu-duration-badge">
                    {Math.floor(d)}h {Math.round((d % 1) * 60)}m of sleep
                    <span className="mcu-duration-eval" style={{ color: d >= 7 ? "#22c55e" : d >= 6 ? "#f59e0b" : "#ef4444" }}>
                      {d >= 8 ? "Excellent" : d >= 7 ? "Good" : d >= 6 ? "Short" : "Very short"}
                    </span>
                  </div>
                ) : null;
              })()}
            </div>
          )}

          {/* ── 2: Rested ── */}
          {step === 2 && (
            <div className="mcu-step">
              <div className="mcu-step-header">
                <Sunrise size={32} className="mcu-sunrise-icon" />
                <h2 className="mcu-title">How rested do you feel?</h2>
                <p className="mcu-subtitle">Regardless of hours — how does your body actually feel?</p>
              </div>
              <ScaleSelector value={data.restedScore} onChange={v => set("restedScore", v)} low="Exhausted" high="Fully rested" color="#818cf8" />
            </div>
          )}

          {/* ── 3: Energy + Clarity ── */}
          {step === 3 && (
            <div className="mcu-step">
              <div className="mcu-step-header">
                <div className="mcu-dual-icon"><Zap size={24} className="mcu-sunrise-icon" /><Brain size={24} className="mcu-sunrise-icon" /></div>
                <h2 className="mcu-title">Energy &amp; clarity</h2>
              </div>
              <div className="mcu-dual-scales">
                <div className="mcu-scale-section">
                  <label className="mcu-scale-lbl"><Zap size={12} /> Energy right now</label>
                  <ScaleSelector value={data.energyScore} onChange={v => set("energyScore", v)} low="Drained" high="Charged" color="#f59e0b" />
                </div>
                <div className="mcu-scale-section">
                  <label className="mcu-scale-lbl"><Brain size={12} /> Mental clarity</label>
                  <ScaleSelector value={data.clarityScore} onChange={v => set("clarityScore", v)} low="Foggy" high="Sharp" color="#22c55e" />
                </div>
              </div>
            </div>
          )}

          {/* ── 4: Focus today (task bubbles, multi-select) ── */}
          {step === 4 && (
            <div className="mcu-step">
              <div className="mcu-step-header">
                <Sunrise size={32} className="mcu-sunrise-icon" />
                <h2 className="mcu-title">What will you focus on?</h2>
                <p className="mcu-subtitle">Select all that apply — NORA will protect these windows.</p>
              </div>
              <div className="mcu-focus-bubbles">
                {focusBubbles.map((chip, i) => {
                  const selected = data.focusChoices.includes(chip);
                  const color = BUBBLE_COLORS[i % BUBBLE_COLORS.length];
                  return (
                    <button key={chip}
                      className={`mcu-focus-bubble${selected ? " active" : ""}`}
                      style={selected ? { background: `${color}22`, borderColor: color, color } : { borderColor: `${color}40` }}
                      onClick={() => toggleFocus(chip)}>
                      {chip}
                    </button>
                  );
                })}
              </div>
              {data.focusChoices.length > 0 && (
                <p className="mcu-focus-selected">{data.focusChoices.length} selected — tap again to deselect</p>
              )}
              <textarea className="mcu-pressure-input" rows={2}
                value={data.dayPressure}
                onChange={e => set("dayPressure", e.target.value)}
                placeholder="Anything else on your mind today? (optional)" />
            </div>
          )}

          {/* ── Summary (NORA's Read) ── */}
          {step >= TOTAL_STEPS && finalReadiness && finalSummary && (
            <div className="mcu-step mcu-summary">
              <div className="mcu-readiness-display">
                <div className="mcu-readiness-ring" style={{ "--rc": finalReadiness.color }}>
                  <svg viewBox="0 0 36 36" className="mcu-ring-svg">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="2.5" opacity="0.12" />
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke={finalReadiness.color} strokeWidth="2.5"
                      strokeDasharray={`${finalReadiness.pct} ${100 - finalReadiness.pct}`}
                      strokeDashoffset="25" strokeLinecap="round" />
                  </svg>
                  <div className="mcu-readiness-center">
                    <span className="mcu-readiness-pct" style={{ color: finalReadiness.color }}>{finalReadiness.pct}%</span>
                    <span className="mcu-readiness-lbl">{finalReadiness.label}</span>
                  </div>
                </div>
                <div className="mcu-readiness-text">
                  <div className="mcu-readiness-title">Today's Readiness</div>
                  <div className="mcu-readiness-sub" style={{ color: finalReadiness.color }}>
                    {finalReadiness.label === "High" ? "Peak condition" :
                     finalReadiness.label === "Moderate" ? "Good to go" :
                     finalReadiness.label === "Low" ? "Take it light" : "Recovery day"}
                  </div>
                </div>
              </div>

              <p className="mcu-nora-summary">"{finalSummary.summary}"</p>

              {data.focusChoices.length > 0 && (
                <div className="mcu-summary-focus">
                  <div className="mcu-summary-focus-label">Focus today</div>
                  <div className="mcu-summary-focus-chips">
                    {data.focusChoices.map((f, i) => (
                      <span key={f} className="mcu-summary-chip" style={{ background: `${BUBBLE_COLORS[i % BUBBLE_COLORS.length]}18`, color: BUBBLE_COLORS[i % BUBBLE_COLORS.length], borderColor: `${BUBBLE_COLORS[i % BUBBLE_COLORS.length]}40` }}>{f}</span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mcu-tips">
                {finalSummary.tips.map((tip, i) => (
                  <div key={i} className="mcu-tip">
                    <span className="mcu-tip-dot" style={{ background: finalReadiness.color }} />
                    {tip}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mcu-footer">
          {step < TOTAL_STEPS ? (
            <button className="mcu-next-btn" disabled={!canNext}
              onClick={() => { if (step === TOTAL_STEPS - 1) handleFinish(); else setStep(s => s + 1); }}>
              {step === TOTAL_STEPS - 1 ? "See NORA's read" : "Continue"}
              <ChevronRight size={18} />
            </button>
          ) : (
            <div className="mcu-footer-btns">
              {!viewOnly && (
                <button className="mcu-secondary-btn" onClick={() => { setStep(0); setData({ sleepQuality: null, bedtime: "", wakeTime: "", restedScore: null, energyScore: null, clarityScore: null, dayPressure: "", focusChoices: [] }); }}>
                  Edit check-up
                </button>
              )}
              <button className="mcu-next-btn" onClick={onClose}>
                {viewOnly ? "Close" : "Start the day"}
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
