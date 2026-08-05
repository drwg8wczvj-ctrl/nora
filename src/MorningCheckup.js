import React, { useState, useMemo, useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Sunrise, Zap, Brain, Moon, Target, Wind, Heart, BatteryCharging, HeartHandshake, Send, Sparkle, TrendingUp } from "lucide-react";
import CloseButton from "./components/CloseButton";
import AnimatedNumber from "./components/AnimatedNumber";
import AnimatedRing from "./components/AnimatedRing";
import { apiFetch } from "./lib/apiBase";
import { computeReadiness, computeReadinessSubScores } from "./statusEngine/readiness";
import { computeSleepAnalysis, estimateSleepDuration, buildRecentNights } from "./statusEngine/sleepScience";
import { selectAdaptiveQuestion, buildAdaptiveCheckupInputs } from "./statusEngine/adaptiveCheckup";
import { selectCandidateRecommendations } from "./statusEngine/morningRecommendations";
import { mineAllPatterns } from "./statusEngine/patterns";
import { containsBannedLanguage } from "./statusEngine/interpretations";
import { buildSleepCheckupInsights, computeUsualSleepTimes } from "./lib/healthKit";
import { computeRecoveryScore } from "./statusEngine/healthInsights";
import { buildMorningGreeting, buildMorningFacts, buildSleepGoalVsActual } from "./statusEngine/morningBriefing";
import "./MorningCheckup.css";

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

// Tappable starting points for "Ask Atlas about today's condition" — the
// user can tap one as-is or edit it before sending; free text always works too.
const ASK_ATLAS_EXAMPLES = [
  "I still feel exhausted.",
  "My sleep score says 85 but I feel terrible.",
  "I have no motivation.",
  "I have a headache.",
  "I feel anxious.",
  "I think I overtrained yesterday.",
];

// Weekly bars (last 7 days of the given 0-100 series, most-recent last).
function WeeklyBars({ values = [] }) {
  const days = ["S", "M", "T", "W", "T", "F", "S"];
  const todayIdx = new Date().getDay();
  return (
    <div className="mcu-weekly-bars">
      {values.map((v, i) => {
        const dayIdx = (todayIdx - (values.length - 1 - i) + 7) % 7;
        return (
          <div key={i} className="mcu-weekly-bar-col">
            <div className="mcu-weekly-bar-track">
              <div
                className={`mcu-weekly-bar-fill${i === values.length - 1 ? " today" : ""}`}
                style={{ height: `${Math.max(4, Math.min(100, v))}%` }}
              />
            </div>
            <span className="mcu-weekly-bar-label">{days[dayIdx]}</span>
          </div>
        );
      })}
    </div>
  );
}

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
  healthSleep = null,    // { sessions, stats } from useHealthKit()'s context.sleep, or null if unavailable
  health = null,         // full useHealthKit() return — used by the new Briefing screen
  healthSummary = null,  // pre-digested HealthKit + personal-baseline summary (see useStatusEngine.js)
  onAskAtlas = null,     // (message: string) => void — closes this screen, opens Atlas, and sends the message
}) {
  // 0: Briefing (Atlas already knows) · 1: Sleep · 2: How you feel · 3: Reflect · 4+: Summary
  const TOTAL_STEPS = 4;

  const [step, setStep] = useState(viewOnly ? TOTAL_STEPS : 0);
  const [data, setData] = useState(viewOnly && existingData ? existingData : { ...EMPTY_CHECKUP_DATA });
  const [showSleepTimes, setShowSleepTimes] = useState(false);
  const [sleepPrefillSource, setSleepPrefillSource] = useState(null); // null | "lastNight" | "usual"
  const [askAtlasText, setAskAtlasText] = useState("");

  // Auto-prefill bedtime/wake time, once, the first time this checkup opens
  // with nothing entered yet — the user only has to correct it, never
  // re-enter it from scratch. Prefers last night's actual recorded HealthKit
  // sleep session; falls back to the user's own historical usual bedtime/
  // wake time (computeUsualSleepTimes) when there's no recorded session for
  // last night at all — e.g. the Watch wasn't worn to bed — since an
  // educated guess from real history still beats an empty field.
  useEffect(() => {
    if (viewOnly || data.bedtime || data.wakeTime) return;
    const toTimeInput = (d) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const last = healthSleep?.stats?.hasData ? healthSleep.stats.last : null;
    if (last?.bedtime && last?.wakeTime) {
      setData((d) => ({ ...d, bedtime: toTimeInput(last.bedtime), wakeTime: toTimeInput(last.wakeTime) }));
      setShowSleepTimes(true);
      setSleepPrefillSource("lastNight");
      return;
    }
    const usual = healthSleep?.sessions?.length ? computeUsualSleepTimes(healthSleep.sessions) : null;
    if (usual) {
      setData((d) => ({ ...d, bedtime: usual.usualBedtime, wakeTime: usual.usualWakeTime }));
      setShowSleepTimes(true);
      setSleepPrefillSource("usual");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ── Morning Briefing (step 0) — Atlas already knows before asking anything ──
  const ctx = health?.context;
  const sleepStats = ctx?.sleep?.stats ?? null;
  const heart = ctx?.heart ?? null;
  const activity = ctx?.activity ?? null;

  const briefingRecovery = useMemo(() => computeRecoveryScore(heart), [heart]);
  const sleepGoalVsActual = useMemo(() => buildSleepGoalVsActual({ health }), [health]);

  const heuristicGreeting = useMemo(() => buildMorningGreeting({
    healthSummary, recoveryTrendDeclining3d: engineContext.recoveryTrendDeclining3d, recoveryState: engineContext.recoveryState,
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const facts = useMemo(() => buildMorningFacts({
    health, healthSummary, tasks: engineContext.tasks ?? [], today, dailyMetrics: engineContext.dailyMetrics ?? {},
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const weeklyTrend = useMemo(() => {
    const dm = engineContext.dailyMetrics ?? {};
    const dates = Object.keys(dm).filter((d) => d <= today).sort().slice(-7);
    return dates.map((d) => Math.round(dm[d]?.recoveryScore ?? 0));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // AI-enhanced greeting/analysis — fetched once, on mount, using only ambient
  // data (nothing the user hasn't answered yet exists at this point). Falls
  // back silently to the heuristic greeting + real facts list above, which
  // already rendered instantly with zero wait.
  const [aiBriefing, setAiBriefing] = useState(null);
  const briefingRequestedRef = useRef(false);
  useEffect(() => {
    if (viewOnly || briefingRequestedRef.current) return;
    briefingRequestedRef.current = true;
    apiFetch("/api/tips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "morning_briefing",
        context: {
          healthSummary,
          recoveryState: engineContext.recoveryState ?? null,
          recoveryTrendDeclining3d: !!engineContext.recoveryTrendDeclining3d,
          facts,
          dayOfWeek: WEEKDAY_NAMES[new Date(today + "T00:00:00").getDay()],
          deferredCount: engineContext.deferredTasks?.length ?? 0,
          workloadToday: engineContext.workloadForecast?.[0]?.level ?? null,
        },
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d?.greeting || d?.analysis) setAiBriefing(d);
      })
      .catch(() => {/* heuristic greeting/facts already stand */});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const displayGreetingLine2 = aiBriefing?.greeting ?? heuristicGreeting[1];

  const set = (key, val) => setData(d => ({ ...d, [key]: val }));
  const toggleFocus = (chip) => setData(d => ({
    ...d,
    focusChoices: d.focusChoices.includes(chip)
      ? d.focusChoices.filter(c => c !== chip)
      : [...d.focusChoices, chip],
  }));

  const submitAskAtlas = (text) => {
    const message = (text ?? askAtlasText).trim();
    if (!message || !onAskAtlas) return;
    onAskAtlas(message);
  };

  const canNext = [
    true,
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
    apiFetch("/api/tips", {
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

  const showSleepRing = sleepStats?.hasData;
  const showRecoveryRing = briefingRecovery.hasData;
  const showActivityRing = activity?.stats?.hasData;
  const hasAnyHealthRing = showSleepRing || showRecoveryRing || showActivityRing;
  const stepsBaseline = healthSummary?.activityBaselineSteps ?? 10000;

  return (
    <div className={`mcu-screen${dark ? " dark" : ""}${glass ? " glass" : ""}`}>
      {/* Sunrise gradient decoration */}
      <div className="mcu-sunrise-glow" />

      <div className="mcu-page">
        {/* Progress bar */}
        <div className="mcu-progress-bar">
          <div className="mcu-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>

        {/* Top bar */}
        <div className="mcu-top-bar">
          {step > 0 && step < TOTAL_STEPS && !viewOnly
            ? <button className="mcu-back" onClick={() => setStep(s => s - 1)}><ChevronLeft size={18} /></button>
            : <div className="mcu-brand"><Sunrise size={16} className="mcu-sunrise-icon" /><span>Morning Briefing</span></div>}
          <CloseButton onClick={onClose} />
        </div>

        {/* Body */}
        <div className="mcu-body">

          {/* ── 0: Briefing — Atlas already knows before asking anything ── */}
          {step === 0 && (
            <div className="mcu-step mcu-briefing">
              <div className="mcu-briefing-greeting">
                <Sunrise size={30} className="mcu-sunrise-icon mcu-anim-in" style={{ animationDelay: "0ms" }} />
                <h1 className="mcu-greeting-line1 mcu-anim-in" style={{ animationDelay: "70ms" }}>{heuristicGreeting[0]}</h1>
                <p className="mcu-greeting-line2 mcu-anim-in" style={{ animationDelay: "150ms" }}>{displayGreetingLine2}</p>
              </div>

              {!hasAnyHealthRing && !sleepGoalVsActual && (
                <p className="mcu-briefing-note mcu-anim-in" style={{ animationDelay: "220ms" }}>
                  Connect Apple Health in Settings so Atlas can brief you on real sleep, recovery, and activity data every morning.
                </p>
              )}

              {hasAnyHealthRing && (
                <div className="mcu-briefing-grid mcu-anim-in" style={{ animationDelay: "220ms" }}>
                  {showSleepRing && (
                    <div className="mcu-briefing-stat">
                      <AnimatedRing pct={Math.min(100, (sleepStats.last.asleepMinutes / 480) * 100)} size={68} strokeWidth={6} color="#818cf8">
                        <AnimatedNumber value={sleepStats.last.asleepMinutes / 60} format={(n) => `${n.toFixed(1)}h`} className="mcu-briefing-stat-value" />
                      </AnimatedRing>
                      <span className="mcu-briefing-stat-label">Sleep</span>
                    </div>
                  )}
                  {showRecoveryRing && (
                    <div className="mcu-briefing-stat">
                      <AnimatedRing pct={briefingRecovery.score} size={68} strokeWidth={6} color="#22c55e">
                        <AnimatedNumber value={briefingRecovery.score} className="mcu-briefing-stat-value" />
                      </AnimatedRing>
                      <span className="mcu-briefing-stat-label">Recovery</span>
                    </div>
                  )}
                  {showActivityRing && (
                    <div className="mcu-briefing-stat">
                      <AnimatedRing pct={Math.min(100, (activity.stats.today.steps / Math.max(1, stepsBaseline)) * 100)} size={68} strokeWidth={6} color="#f59e0b">
                        <AnimatedNumber value={activity.stats.today.steps} format={(n) => Math.round(n).toLocaleString()} className="mcu-briefing-stat-value mcu-briefing-stat-value-sm" />
                      </AnimatedRing>
                      <span className="mcu-briefing-stat-label">Steps</span>
                    </div>
                  )}
                </div>
              )}

              {sleepGoalVsActual && (
                <div className="mcu-briefing-card mcu-anim-in" style={{ animationDelay: "300ms" }}>
                  <div className="mcu-briefing-card-title"><Moon size={13} /> Sleep Schedule</div>
                  <div className="mcu-sleep-schedule-row">
                    <div className="mcu-sleep-schedule-col">
                      <span className="mcu-sleep-schedule-label">Goal</span>
                      <span className="mcu-sleep-schedule-times">
                        {sleepGoalVsActual.goal ? `${sleepGoalVsActual.goal.bedtime} → ${sleepGoalVsActual.goal.wake}` : "—"}
                      </span>
                    </div>
                    <div className="mcu-sleep-schedule-divider" />
                    <div className="mcu-sleep-schedule-col">
                      <span className="mcu-sleep-schedule-label">Actual</span>
                      <span className="mcu-sleep-schedule-times">
                        {sleepGoalVsActual.actual ? `${sleepGoalVsActual.actual.bedtime} → ${sleepGoalVsActual.actual.wake}` : "—"}
                      </span>
                    </div>
                  </div>
                  {sleepGoalVsActual.goal && (
                    <p className="mcu-briefing-note">
                      "Goal" is your own real average from the last {sleepGoalVsActual.goal.nightsUsed} nights — Apple doesn't share your Health app's sleep schedule with other apps.
                    </p>
                  )}
                </div>
              )}

              {weeklyTrend.length >= 3 && (
                <div className="mcu-briefing-card mcu-anim-in" style={{ animationDelay: "380ms" }}>
                  <div className="mcu-briefing-card-title"><TrendingUp size={13} /> Recovery This Week</div>
                  <WeeklyBars values={weeklyTrend} />
                </div>
              )}

              {facts.length > 0 && (
                <div className="mcu-facts-list">
                  {facts.map((f, i) => (
                    <div key={i} className="mcu-fact-card mcu-anim-in" style={{ animationDelay: `${460 + i * 90}ms` }}>
                      <Sparkle size={13} className="mcu-fact-icon" />
                      <span>{f}</span>
                    </div>
                  ))}
                </div>
              )}

              {(aiBriefing?.analysis) && (
                <p className="mcu-briefing-analysis mcu-anim-in" style={{ animationDelay: `${460 + facts.length * 90 + 90}ms` }}>
                  {aiBriefing.analysis}
                </p>
              )}
            </div>
          )}

          {/* ── 1: Sleep quality (+ optional exact times) ── */}
          {step === 1 && (
            <div className="mcu-step">
              <div className="mcu-step-header">
                <Sunrise size={32} className="mcu-sunrise-icon" />
                <h2 className="mcu-title">You slept well. Do you actually feel rested?</h2>
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
                  {sleepPrefillSource === "lastNight" && (
                    <div className="mcu-health-prefill-badge">Filled in from Apple Health — edit if this looks off</div>
                  )}
                  {sleepPrefillSource === "usual" && (
                    <div className="mcu-health-prefill-badge">No sleep recorded last night — filled in from your usual schedule, edit if today was different</div>
                  )}
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
                  {healthSleep?.stats?.hasData && (
                    <ul className="mcu-health-insights">
                      {buildSleepCheckupInsights(healthSleep.sessions, healthSleep.stats).slice(1).map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── 2: How your body feels (rested + energy + clarity) ── */}
          {step === 2 && (
            <div className="mcu-step">
              <div className="mcu-step-header">
                <div className="mcu-dual-icon"><Zap size={24} className="mcu-sunrise-icon" /><Brain size={24} className="mcu-sunrise-icon" /></div>
                <h2 className="mcu-title">Your body recovered. How does your motivation feel?</h2>
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

          {/* ── 3: The (adaptively-chosen) question + focus intentions ── */}
          {step === 3 && (
            <div className="mcu-step">
              <div className="mcu-step-header">
                <Sunrise size={32} className="mcu-sunrise-icon" />
                <h2 className="mcu-title">If your body could tell me one thing this morning...</h2>
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
              <div className="mcu-readiness-display mcu-anim-in">
                <AnimatedRing pct={summaryData.readiness.pct} size={96} strokeWidth={7} color={summaryData.readiness.color} className="mcu-readiness-ring">
                  <AnimatedNumber value={summaryData.readiness.pct} format={(n) => `${Math.round(n)}%`} className="mcu-readiness-pct" style={{ color: summaryData.readiness.color }} />
                  <span className="mcu-readiness-lbl">{summaryData.readiness.label}</span>
                </AnimatedRing>
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
                <div className="mcu-duration-badge mcu-anim-in" style={{ animationDelay: "80ms" }}>
                  {summaryData.sleepAnalysis.duration.value}h sleep
                  {summaryData.sleepAnalysis.debt?.value > 0.3 && (
                    <span className="mcu-duration-eval" style={{ color: "#f59e0b" }}>
                      {summaryData.sleepAnalysis.debt.value}h debt
                    </span>
                  )}
                </div>
              )}

              {summaryData.subScores && (
                <div className="mcu-subscores mcu-anim-in" style={{ animationDelay: "140ms" }}>
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
                        <AnimatedNumber value={s.value} className="mcu-subscore-value" style={{ color }} />
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

              {!viewOnly && onAskAtlas && displayRecommendations.length > 0 && (
                <button
                  type="button"
                  className="mcu-plan-nudge-btn"
                  onClick={() => submitAskAtlas("Based on my check-in this morning, please adjust today's plan.")}
                >
                  <Sparkle size={14} /> Ask Atlas to adjust today's plan
                </button>
              )}

              {onAskAtlas && (
                <div className="mcu-ask-atlas">
                  <div className="mcu-ask-atlas-header">
                    <HeartHandshake size={15} />
                    <span>Talk with Atlas about today's condition</span>
                  </div>
                  <div className="mcu-ask-atlas-chips">
                    {ASK_ATLAS_EXAMPLES.map((ex) => (
                      <button key={ex} type="button" className="mcu-ask-atlas-chip" onClick={() => submitAskAtlas(ex)}>
                        {ex}
                      </button>
                    ))}
                  </div>
                  <div className="mcu-ask-atlas-input-row">
                    <input
                      type="text"
                      className="mcu-ask-atlas-input"
                      placeholder="Type anything..."
                      value={askAtlasText}
                      onChange={(e) => setAskAtlasText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") submitAskAtlas(); }}
                    />
                    <button
                      type="button"
                      className="mcu-ask-atlas-send"
                      disabled={!askAtlasText.trim()}
                      onClick={() => submitAskAtlas()}
                      aria-label="Send to Atlas"
                    >
                      <Send size={15} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mcu-footer">
          {step < TOTAL_STEPS ? (
            <button className="mcu-next-btn" disabled={!canNext}
              onClick={() => { if (step === TOTAL_STEPS - 1) handleFinish(); else setStep(s => s + 1); }}>
              {step === 0 ? "Begin check-in" : step === TOTAL_STEPS - 1 ? "See Nora's read" : "Continue"}
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
