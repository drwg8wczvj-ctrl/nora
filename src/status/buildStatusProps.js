import React from "react";
import { Zap, Wind, Activity, TrendingUp, AlertTriangle, CalendarDays, Sunrise, Moon, HeartHandshake } from "lucide-react";
import { computeReadiness } from "../MorningCheckup";

// Single shared Status-page prop builder — replaces what used to be two
// byte-for-byte-duplicated builders (App.js's `view==="status"` IIFE and
// MobileApp.js's `buildStatusPageProps`). Both shells call `buildWorkMindProps`
// identically; only the raw inputs (`engine`/`scalars`/`callbacks`) differ in
// where they're read from (bare closure vars on desktop, `ctx.*` on mobile).
const STATUS_METRIC_META = {
  mentalBattery:      { label: "Mental Battery",      unit: "%" },
  recoveryIndex:      { label: "Recovery Index",      unit: "" },
  momentum:           { label: "Momentum",            unit: "%" },
  consistency:        { label: "Consistency",         unit: "%" },
  deepWorkCapacity:   { label: "Deep Work Capacity",  unit: "%" },
  attentionStability: { label: "Attention Stability", unit: "%" },
};
const STATUS_BUCKET_COLORS = {
  mentalBattery:      { charged: "#22c55e", adequate: "#3b82f6", low: "#f59e0b", depleted: "#ef4444" },
  recoveryIndex:      { stable: "#22c55e", mild: "#f59e0b", high: "#f97316", recovery: "#ef4444", burnout: "#dc2626" },
  momentum:           { rising: "#22c55e", stable: "#3b82f6", recovery: "#f59e0b", overloaded: "#ef4444", unstable: "#f59e0b", new: "var(--accent)", recovering: "#22c55e" },
  consistency:        { steady: "#22c55e", variable: "#f59e0b", erratic: "#ef4444", building: "var(--accent)" },
  deepWorkCapacity:   { high: "#22c55e", moderate: "#3b82f6", low: "#f59e0b" },
  attentionStability: { high: "#22c55e", moderate: "#3b82f6", low: "#f59e0b", gated: "var(--text-muted)" },
};
const statusColorForMetric = (key, m) => STATUS_BUCKET_COLORS[key]?.[m.bucket] ?? "var(--accent)";
const STATUS_ACTION_ICONS = {
  reduce_cognitive_load:       <AlertTriangle size={14} />,
  begin_micro_start:           <Zap size={14} />,
  move_difficult_task_earlier: <CalendarDays size={14} />,
  protect_morning_focus:       <Sunrise size={14} />,
  schedule_recovery_break:     <Moon size={14} />,
};

// Which tab an actionCenter item belongs to — pure presentation-layer
// routing (unlike patterns.js's PATTERN_DOMAIN, action items have no other
// consumer, so this lives here rather than in statusEngine/).
const ACTION_DOMAIN = {
  reduce_cognitive_load: "mind",
  begin_micro_start: "work",
  move_difficult_task_earlier: "work",
  protect_morning_focus: "work",
  schedule_recovery_break: "mind",
};

export function buildWorkMindProps(engine, scalars, callbacks) {
  const {
    metrics, interpretations, actionCenter = [], aiCoach, atlasCoach,
    noraState, userConfidence, keySignals, assessmentSummary,
    mostAvoided, deferredTasks = [], flowPrediction, implementationIntention,
    workPatterns = [], mindPatterns = [], sleepAnalysis, sleepState,
  } = engine;
  const { energy, relaxation, focus, motivation, todaySleepQuality, morningCheckup } = scalars;
  const {
    setChatInput, setChatOpen, setAtlasOpen, setRescheduleTask,
    setShowMorningCheckup, setReviewCheckupMode,
    setEnergy, setRelaxation, setFocus, setMotivation, setSleepQuality,
  } = callbacks;

  // ── Metric cards — all 6 minus Mental Battery → Work; Mental Battery → Mind ──
  const metricCards = Object.entries(metrics).map(([key, m]) => {
    const interp = interpretations[key] ?? {};
    const meta = STATUS_METRIC_META[key] ?? { label: key, unit: "" };
    const gated = Boolean(m.gated);
    return {
      id: key,
      label: meta.label,
      value: m.value,
      unit: meta.unit,
      trend: m.trend != null ? (m.trend > 0.03 ? "up" : m.trend < -0.03 ? "down" : "flat") : undefined,
      oneLinerExplanation: interp.sentence ?? meta.label,
      aiInterpretation: interp.sentence,
      recommendedAction: interp.action,
      estimatedImprovement: interp.improvement,
      accentColor: statusColorForMetric(key, m),
      gated,
      gatedMessage: gated ? `Complete ${m.sessionsNeeded ?? 3} more Focus Session${(m.sessionsNeeded ?? 3) === 1 ? "" : "s"} to unlock this.` : undefined,
    };
  });
  const workMetricCards = metricCards.filter((m) => m.id !== "mentalBattery");
  const mindMetricCards = metricCards.filter((m) => m.id === "mentalBattery");

  // ── Action Center — split by ACTION_DOMAIN, onClick logic unchanged ─────────
  const primaryActions = actionCenter.map((a) => ({
    id: a.actionKey,
    label: a.label,
    icon: STATUS_ACTION_ICONS[a.actionKey],
    tone: "primary",
    meta: a.rationale,
    onClick: () => {
      if (a.actionKey === "begin_micro_start" && mostAvoided) {
        setChatInput(`Help me micro-start "${mostAvoided.task.title}"`); setChatOpen(true);
      } else if (a.actionKey === "move_difficult_task_earlier" && deferredTasks[0]) {
        setRescheduleTask(deferredTasks[0]);
      } else if (a.actionKey === "schedule_recovery_break") {
        setChatInput("Help me schedule a recovery break today."); setChatOpen(true);
      } else {
        setChatInput(a.rationale ?? a.label); setChatOpen(true);
      }
    },
  }));
  const workPrimary = primaryActions.filter((a) => ACTION_DOMAIN[a.id] !== "mind");
  const mindPrimary = primaryActions.filter((a) => ACTION_DOMAIN[a.id] === "mind");

  const readiness = morningCheckup ? (computeReadiness(morningCheckup) ?? { label: "Moderate", pct: 50 }) : null;
  const workGhostActions = [
    {
      id: "mcu", tone: "ghost",
      label: morningCheckup ? "Review Morning Check-Up" : "Start Morning Check-Up",
      meta: readiness ? `${readiness.label} readiness${Number.isFinite(readiness.pct) ? ` · ${readiness.pct}%` : ""}` : undefined,
      preview: morningCheckup?.noraSummary,
      onClick: () => { setReviewCheckupMode(!!morningCheckup); setShowMorningCheckup(true); },
    },
    ...(flowPrediction?.confidence !== "insufficient_data" ? [{
      id: "flow_window", tone: "ghost", label: "Best Focus Window Today",
      meta: `${flowPrediction.window} · ${flowPrediction.confidence.toLowerCase()} confidence`,
      onClick: () => { setChatInput(`Schedule my most demanding task for ${flowPrediction.window}.`); setChatOpen(true); },
    }] : []),
    ...(implementationIntention ? [{
      id: "implementation_intention", tone: "ghost", label: "Today's Plan",
      preview: `${implementationIntention.ifClause}, ${implementationIntention.thenClause}.`,
      onClick: () => { setChatInput(`${implementationIntention.ifClause}, ${implementationIntention.thenClause}.`); setChatOpen(true); },
    }] : []),
  ];
  // Empty conversation is enough for AtlasChat.js's own STARTER_PROMPTS chips
  // to surface — no prefill text needed, unlike Work's chat-prefill actions.
  const mindGhostActions = [
    {
      id: "talk_to_atlas", tone: "ghost", label: "Talk to Atlas",
      icon: <HeartHandshake size={14} />,
      onClick: () => setAtlasOpen(true),
    },
  ];

  // ── Quick check-in dials — Energy → Work; Stress/Focus/Motivation → Mind ────
  const workCheckIn = [
    { id: "energy", icon: <Zap size={13} />, label: "Energy", color: "var(--accent)", value: energy, onChange: setEnergy,
      levels: [{label:"Very low",value:1},{label:"Low",value:3},{label:"Okay",value:5},{label:"Good",value:7},{label:"High",value:9}] },
  ];
  const mindCheckIn = [
    { id: "stress", icon: <Wind size={13} />, label: "Stress", color: "#3b82f6", value: relaxation, onChange: setRelaxation,
      levels: [{label:"Overwhelmed",value:1},{label:"Stressed",value:3},{label:"Okay",value:5},{label:"Calm",value:7},{label:"Relaxed",value:9}] },
    { id: "focus", icon: <Activity size={13} />, label: "Focus", color: "#22c55e", value: focus, onChange: setFocus,
      levels: [{label:"Scattered",value:1},{label:"Drifting",value:3},{label:"Okay",value:5},{label:"Focused",value:7},{label:"Deep",value:9}] },
    { id: "motivation", icon: <TrendingUp size={13} />, label: "Motivation", color: "#f59e0b", value: motivation, onChange: setMotivation,
      levels: [{label:"None",value:1},{label:"Low",value:3},{label:"Okay",value:5},{label:"Driven",value:7},{label:"Fired up",value:9}] },
  ];

  return {
    work: {
      aiCoach: {
        headline: aiCoach.headline,
        stateLabel: noraState.label,
        stateColor: noraState.color,
        confidence: userConfidence,
        signals: keySignals,
        onAskNora: () => { setChatInput(assessmentSummary); setChatOpen(true); },
      },
      metrics: workMetricCards,
      patterns: workPatterns,
      actions: [...workPrimary, ...workGhostActions],
      quickCheckIn: { items: workCheckIn },
    },
    mind: {
      aiCoach: {
        headline: atlasCoach.headline,
        askLabel: "Ask Atlas",
        persona: "atlas",
        onAskNora: () => setAtlasOpen(true),
      },
      sleepAnalysis,
      metrics: mindMetricCards,
      patterns: mindPatterns,
      actions: [...mindPrimary, ...mindGhostActions],
      quickCheckIn: {
        items: mindCheckIn,
        sleep: { value: todaySleepQuality, onChange: setSleepQuality, meta: sleepState.suggestion },
      },
    },
  };
}
