import React, { useState, useMemo, useEffect, useRef } from "react";
import { X, ChevronLeft, ChevronRight, Sunrise, Zap, Brain, Moon, Target, Wind, Heart, BatteryCharging } from "lucide-react";
import { apiUrl } from "./lib/apiBase";
import { computeReadiness, computeReadinessSubScores } from "./statusEngine/readiness";
import { computeSleepAnalysis, estimateSleepDuration, buildRecentNights } from "./statusEngine/sleepScience";
import { selectAdaptiveQuestion, buildAdaptiveCheckupInputs } from "./statusEngine/adaptiveCheckup";
import { selectCandidateRecommendations } from "./statusEngine/morningRecommendations";
import { mineAllPatterns } from "./statusEngine/patterns";
import { containsBannedLanguage } from "./statusEngine/interpretations";

// Re-exported so App.js/MobileApp.js's `import { computeReadiness } from "./MorningCheckup"`
// keeps working unchanged — the real implementation now lives in statusEngine/readiness.js
// (it needs to be importable by widget sync / Action Center without pulling in this component).
export { computeReadiness };

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function generateNoraSummary({ readiness } = {}) {
  if (!readiness) return "";
  if (readiness.label === "High")     return "You're in strong shape today. This is a good window for focused, important work.";
  if (readiness.label === "Moderate") return "Decent start. Your energy is usable — realistic sessions and one clear priority will carry the day.";
  if (readiness.label === "Low")      return "Today may need a lighter start. A few small wins beat one exhausting push.";
  return "Your system needs recovery today. Gentle progress is still progress.";
}

function subScoreColor(v) {
  if (v == null) return "#94a3b8";
  if (v >= 72) return "#22c55e";
  if (v >= 45) return "#f59e0b";
  if (v >= 25) return "#ef4444";
  return "#8b5cf6";
}

const SUBSCORE_META = [
  { key: "recovery",           label: "Recovery",  icon: BatteryCharging },
  { key: "energy",             label: "Energy",    icon: Zap },
  { key: "focus",              label: "Focus",     icon: Target },
  { key: "mentalClarity",      label: "Clarity",   icon: Brain },
  { key: "stress",             label: "Calm",      icon: Wind },
  { key: "emotionalStability", label: "Stability", icon: Heart },
];

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

const EMPTY_CHECKUP_DATA = {
  sleepQuality: null, bedtime: "", wakeTime: "",
  restedScore: null, energyScore: null, clarityScore: null,
  dayPressure: "", focusChoices: [], adaptiveAnswer: "",
};

// ── Main component ────────────────────────────────────────────────
export default function MorningCheckup({
  dark, glass, today, todayTasks = [],
  onComplete, onClose,
  viewOnly = false, existingData = null,
  engineContext = {},
}) {
  const TOTAL_STEPS = 3;

  // If viewOnly, jump straight to summary
  const [step, setStep] = useState(viewOnly ? TOTAL_STEPS : 0);
  const [data, setData] = useState(viewOnly && existingData ? existingData : { ...EMPTY_CHECKUP_DATA });
  const [showSleepTimes, setShowSleepTimes] = useState(false);

  const focusBubbles = useMemo(() => buildFocusBubbles(todayTasks), [todayTasks]);

  // Exactly one adaptively-selected question per morning — chosen once, deterministically,
  // when the check-up opens. Review mode reads back whichever question was asked that day
  // rather than re-selecting against today's (since-moved-on) signals.
  const adaptiveQuestion = useMemo(() => {
    if (viewOnly) return existingData?.adaptiveQuestion ?? null;
    const inputs = buildAdaptiveCheckupInputs({
      today,
      tasks: engineContext.tasks ?? [],
      taskWeights: engineContext.taskWeights ?? {},
      dailyMetrics: engineContext.dailyMetrics ?? {},
      recoveryState: engineContext.recoveryState,
      recoveryTrendDeclining3d: engineContext.recoveryTrendDeclining3d,
      deferredTasks: engineContext.deferredTasks ?? [],
      userPrefs: engineContext.userPrefs ?? {},
    });
    return selectAdaptiveQuestion(inputs);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (key, val) => setData(d => ({ ...d, [key]: val }));
  const toggleFocus = (chip) => setData(d => ({
    ...d,
    focusChoices: d.focusChoices.includes(chip)
      ? d.focusChoices.filter(c => c !== chip)
      : [...d.focusChoices, chip],
  }));

  const canNext = [
    !!data.sleepQuality,
    data.restedScore != null && data.energyScore != null && data.clarityScore != null,
    true,
  ][step] ?? true;

  const handleFinish = () => {
    const recentNights = buildRecentNights(engineContext.dailyMetrics, today);

    const todaysWorkloadLevel = engineContext.workloadForecast?.[0]?.level ?? null;

    const sleepAnalysis = computeSleepAnalysis({
      bedtime: data.bedtime, wakeTime: data.wakeTime,
      sleepQuality: data.sleepQuality, restedScore: data.restedScore,
      energyScore: data.energyScore, clarityScore: data.clarityScore,
      recentNights, idealHours: 8,
      recoveryScore: engineContext.recoveryState?.score ?? null,
      recoveryStateLevel: engineContext.recoveryState?.level ?? null,
      todaysWorkloadLevel,
    });

    // Real, already-mined pattern signals — never a fabricated "anxiety" style flag.
    const minedPatterns = mineAllPatterns({
      tasks: engineContext.tasks ?? [], taskWeights: engineContext.taskWeights ?? {},
      dailyMetrics: engineContext.dailyMetrics ?? {}, today,
    });
    const focusTrend = minedPatterns.some(p => p.id === "focus_trend_up") ? "up"
      : minedPatterns.some(p => p.id === "focus_trend_down") ? "down" : null;
    const stressTrendUp = minedPatterns.some(p => p.id === "stress_trend_up");

    const todayWeekday = WEEKDAY_NAMES[new Date(today + "T00:00:00").getDay()];
    const emotionalDriftToday = (engineContext.emotionalDrift ?? [])
      .some(d => d.weekday === todayWeekday && d.metric !== "focus");

    const subScores = computeReadinessSubScores({
      restedScore: data.restedScore, energyScore: data.energyScore, clarityScore: data.clarityScore,
      relaxationScore: data.restedScore, // rested ↔ low-stress, same mapping handleCheckupComplete uses
      recoveryState: engineContext.recoveryState,
      attentionStability: engineContext.metrics?.attentionStability,
      focusTrend, stressTrendUp, emotionalDriftToday,
      wellbeingSignal: engineContext.userPrefs?.wellbeing_signal, today,
      sleepAnalysis, todaysWorkloadLevel,
    });

    const readiness = computeReadiness({ subScores });

    const candidateRecommendations = selectCandidateRecommendations({
      sleepDebtHours: sleepAnalysis.debt?.value ?? null,
      mentalFatigueRisk: sleepAnalysis.mentalFatigueRisk?.bucket ?? null,
      circadianConsistency: sleepAnalysis.circadian?.value ?? null,
      restedScore: data.restedScore,
      cognitivePerformance: sleepAnalysis.cognitivePerformance?.value ?? null,
      todaysWorkloadLevel,
      recoveryStateLevel: engineContext.recoveryState?.level ?? null,
      energyScore: data.energyScore,
      relaxationScore: data.restedScore,
      wellbeingSignalRecent: engineContext.userPrefs?.wellbeing_signal?.date === today,
    }, 6);

    const summary = generateNoraSummary({ readiness });

    const checkup = {
      ...data, date: today,
      sleepDuration: sleepAnalysis.duration?.value ?? null,
      readinessScore: readiness.pct, readinessLabel: readiness.label,
      noraSummary: summary,
      subScores, sleepAnalysis, candidateRecommendations,
      adaptiveQuestion: adaptiveQuestion ? {
        id: adaptiveQuestion.id, kind: adaptiveQuestion.kind,
        prompt: adaptiveQuestion.prompt, answer: data.adaptiveAnswer || "",
      } : null,
    };

    setData(checkup);
    onComplete(checkup);
    setStep(TOTAL_STEPS);
  };

  // Summary is purely a function of `data` — for a fresh completion `data` was just
  // replaced with the full computed checkup above; for a review it's whatever was
  // stored. Legacy (pre-redesign) checkups simply lack `subScores`/`sleepAnalysis`/
  // `adaptiveQuestion`, so those blocks render nothing rather than crashing.
  const summaryData = useMemo(() => {
    if (step < TOTAL_STEPS) return null;
    const subScores = data.subScores ?? null;
    const readiness = subScores
      ? computeReadiness({ subScores })
      : (computeReadiness(data) ?? { label: "Moderate", color: "#f59e0b", pct: 50 });
    return {
      readiness,
      summary: data.noraSummary ?? generateNoraSummary({ readiness }),
      subScores,
      sleepAnalysis: data.sleepAnalysis ?? null,
      candidateRecommendations: data.candidateRecommendations ?? [],
      adaptiveQuestion: data.adaptiveQuestion ?? null,
    };
  }, [step, data]);

  // AI-phrased recommendations — only fetched when there's a real candidate list to
  // ground them in (new-shape checkups). Legacy reviews just show their stored noraTips.
  const [aiRecommendations, setAiRecommendations] = useState(null);
  const [recsLoading,      setRecsLoading]        = useState(false);
  const recsRequestedRef = useRef(false);

  useEffect(() => {
    if (step < TOTAL_STEPS || recsRequestedRef.current) return;
    const candidates = summaryData?.candidateRecommendations;
    if (!candidates?.length) return;
    recsRequestedRef.current = true;
    setRecsLoading(true);
    fetch(apiUrl("/api/tips"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "morning",
        context: {
          subScores: summaryData.subScores ?? {},
          sleepDebtHours: summaryData.sleepAnalysis?.debt?.value ?? null,
          sleepDurationHours: summaryData.sleepAnalysis?.duration?.value ?? null,
          adaptiveQuestion: summaryData.adaptiveQuestion
            ? { prompt: summaryData.adaptiveQuestion.prompt, answer: summaryData.adaptiveQuestion.answer }
            : null,
          candidateRecommendations: candidates,
          dayPressure: data.dayPressure,
          focusChoices: data.focusChoices ?? [],
          tasks: (todayTasks ?? []).map(t => ({ title: t.title, type: t.type })),
        },
      }),
    })
      .then(r => r.json())
      .then(d => {
        const items = (d.items ?? []).filter(it => it?.text && !containsBannedLanguage(it.text));
        if (items.length) setAiRecommendations(items);
      })
      .catch(() => {/* fall back to static candidates */})
      .finally(() => setRecsLoading(false));
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  const displayRecommendations = aiRecommendations
    ?? (summaryData?.candidateRecommendations?.length
        ? summaryData.candidateRecommendations
        : (data.noraTips ?? []).map((t, i) => ({ id: `legacy_${i}`, text: t })));

  const progressPct = Math.min(step / TOTAL_STEPS, 1) * 100;

  const SLEEP_OPTIONS = [
    { key: "poor", label: "Poor", sub: "Restless or too short",   color: "#ef4444" },
    { key: "okay", label: "Okay", sub: "Not great, not terrible", color: "#f97316" },
    { key: "good", label: "Good", sub: "Rested and refreshed",    color: "#22c55e" },
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

          {/* ── 0: Sleep quality (+ optional exact times) ── */}
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

              {!showSleepTimes ? (
                <button type="button" className="mcu-sleep-times-toggle" onClick={() => setShowSleepTimes(true)}>
                  + Log exact sleep times (optional)
                </button>
              ) : (
                <>
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
                    const d = estimateSleepDuration(data.bedtime, data.wakeTime)?.value;
                    return d != null ? (
                      <div className="mcu-duration-badge">
                        {Math.floor(d)}h {Math.round((d % 1) * 60)}m of sleep
                        <span className="mcu-duration-eval" style={{ color: d >= 7 ? "#22c55e" : d >= 6 ? "#f59e0b" : "#ef4444" }}>
                          {d >= 8 ? "Excellent" : d >= 7 ? "Good" : d >= 6 ? "Short" : "Very short"}
                        </span>
                      </div>
                    ) : null;
                  })()}
                </>
              )}
            </div>
          )}

          {/* ── 1: How your body feels (rested + energy + clarity) ── */}
          {step === 1 && (
            <div className="mcu-step">
              <div className="mcu-step-header">
                <div className="mcu-dual-icon"><Zap size={24} className="mcu-sunrise-icon" /><Brain size={24} className="mcu-sunrise-icon" /></div>
                <h2 className="mcu-title">How your body feels</h2>
                <p className="mcu-subtitle">Regardless of hours slept — how does today actually feel?</p>
              </div>
              <div className="mcu-dual-scales">
                <div className="mcu-scale-section">
                  <label className="mcu-scale-lbl"><Moon size={12} /> Rested</label>
                  <ScaleSelector value={data.restedScore} onChange={v => set("restedScore", v)} low="Exhausted" high="Fully rested" color="#818cf8" />
                </div>
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

          {/* ── 2: The (adaptively-chosen) question + focus intentions ── */}
          {step === 2 && (
            <div className="mcu-step">
              <div className="mcu-step-header">
                <Sunrise size={32} className="mcu-sunrise-icon" />
                <h2 className="mcu-title">One thing to reflect on</h2>
              </div>

              <p className="mcu-adaptive-question-text">{adaptiveQuestion?.prompt}</p>

              {adaptiveQuestion?.kind === "choice" ? (
                <div className="mcu-choice-grid">
                  {(adaptiveQuestion.options ?? []).map((opt) => (
                    <button key={opt} type="button"
                      className={`mcu-choice-btn${data.adaptiveAnswer === opt ? " active" : ""}`}
                      onClick={() => set("adaptiveAnswer", opt)}>
                      {opt}
                    </button>
                  ))}
                </div>
              ) : (
                <textarea className="mcu-pressure-input" rows={3}
                  value={data.adaptiveAnswer}
                  onChange={e => set("adaptiveAnswer", e.target.value)}
                  placeholder="Take a moment — anything you write stays just for you." />
              )}

              <div className="mcu-step-header" style={{ marginTop: 22 }}>
                <h2 className="mcu-title" style={{ fontSize: 15 }}>What will you focus on?</h2>
                <p className="mcu-subtitle">Select all that apply — Nora will protect these windows.</p>
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

          {/* ── Summary (Nora's read) ── */}
          {step >= TOTAL_STEPS && summaryData?.readiness && (
            <div className="mcu-step mcu-summary">
              <div className="mcu-readiness-display">
                <div className="mcu-readiness-ring" style={{ "--rc": summaryData.readiness.color }}>
                  <svg viewBox="0 0 36 36" className="mcu-ring-svg">
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="2.5" opacity="0.12" />
                    <circle cx="18" cy="18" r="15.9" fill="none" stroke={summaryData.readiness.color} strokeWidth="2.5"
                      strokeDasharray={`${summaryData.readiness.pct} ${100 - summaryData.readiness.pct}`}
                      strokeDashoffset="25" strokeLinecap="round" />
                  </svg>
                  <div className="mcu-readiness-center">
                    <span className="mcu-readiness-pct" style={{ color: summaryData.readiness.color }}>{summaryData.readiness.pct}%</span>
                    <span className="mcu-readiness-lbl">{summaryData.readiness.label}</span>
                  </div>
                </div>
                <div className="mcu-readiness-text">
                  <div className="mcu-readiness-title">Today's Readiness</div>
                  <div className="mcu-readiness-sub" style={{ color: summaryData.readiness.color }}>
                    {summaryData.readiness.label === "High" ? "Peak condition" :
                     summaryData.readiness.label === "Moderate" ? "Good to go" :
                     summaryData.readiness.label === "Low" ? "Take it light" : "Recovery day"}
                  </div>
                </div>
              </div>

              {summaryData.sleepAnalysis?.duration && (
                <div className="mcu-duration-badge">
                  {summaryData.sleepAnalysis.duration.value}h sleep
                  {summaryData.sleepAnalysis.debt?.value > 0.3 && (
                    <span className="mcu-duration-eval" style={{ color: "#f59e0b" }}>
                      {summaryData.sleepAnalysis.debt.value}h debt
                    </span>
                  )}
                </div>
              )}

              {summaryData.subScores && (
                <div className="mcu-subscores">
                  {SUBSCORE_META.map(({ key, label, icon: Icon }) => {
                    const s = summaryData.subScores[key];
                    if (!s) return null;
                    const color = subScoreColor(s.value);
                    return (
                      <div key={key} className="mcu-subscore-card">
                        <div className="mcu-subscore-top">
                          <Icon size={12} style={{ color }} />
                          <span className="mcu-subscore-label">{label}</span>
                        </div>
                        <span className="mcu-subscore-value" style={{ color }}>{s.value}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="mcu-nora-summary">"{summaryData.summary}"</p>

              {summaryData.adaptiveQuestion?.prompt && (
                <div className="mcu-adaptive-recap">
                  <div className="mcu-adaptive-recap-q">{summaryData.adaptiveQuestion.prompt}</div>
                  {summaryData.adaptiveQuestion.answer && (
                    <div className="mcu-adaptive-recap-a">"{summaryData.adaptiveQuestion.answer}"</div>
                  )}
                </div>
              )}

              {data.focusChoices?.length > 0 && (
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
                {recsLoading && !aiRecommendations ? (
                  <>
                    {[0, 1, 2].map(i => (
                      <div key={i} className="mcu-tip mcu-tip-skeleton">
                        <span className="mcu-tip-dot" style={{ background: summaryData.readiness.color }} />
                        <span className="mcu-tip-shimmer" />
                      </div>
                    ))}
                  </>
                ) : (
                  displayRecommendations.map((rec, i) => (
                    <div key={rec.id ?? i} className={`mcu-tip${aiRecommendations ? " mcu-tip-ai" : ""}`}>
                      <span className="mcu-tip-dot" style={{ background: summaryData.readiness.color }} />
                      {rec.text}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mcu-footer">
          {step < TOTAL_STEPS ? (
            <button className="mcu-next-btn" disabled={!canNext}
              onClick={() => { if (step === TOTAL_STEPS - 1) handleFinish(); else setStep(s => s + 1); }}>
              {step === TOTAL_STEPS - 1 ? "See Nora's read" : "Continue"}
              <ChevronRight size={18} />
            </button>
          ) : (
            <div className="mcu-footer-btns">
              {!viewOnly && (
                <button className="mcu-secondary-btn" onClick={() => { setStep(0); setShowSleepTimes(false); setData({ ...EMPTY_CHECKUP_DATA }); }}>
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
