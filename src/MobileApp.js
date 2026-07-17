import React, { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import {
  Check, ChevronDown, ChevronLeft, ChevronRight, Clock, MessageSquare, X, Send,
  FileText, Trash2, User, RotateCcw, CalendarDays,
  Flag, Coffee, Bell, Activity, Wind, TrendingUp,
  AlertTriangle, Moon, Sunrise,
  SkipForward, Sparkles, Sparkle, Plus, Settings,
  BarChart2, Zap, List, CheckSquare, Pencil, Layers,
  Share2, Users, Search, KeyRound,
} from "lucide-react";
import NoteCard from "./components/NoteCard";
import NoteEditor, { NOTE_TYPE_DEFS, migrateNote } from "./components/NoteEditor";
import { supabase } from "./lib/supabase";
import MorningCheckup, { computeReadiness } from "./MorningCheckup";
import LongTermInsights from "./LongTermInsights";
import FocusSession from "./FocusSession";
import NotificationPermissionBanner from "./components/NotificationPermissionBanner";
import NotificationSettings from "./components/NotificationSettings";
import ShareModal from "./components/ShareModal";
import JoinCodeModal from "./components/JoinCodeModal";
import UsernameOnboarding from "./components/UsernameOnboarding";
import UsernameNudgeBanner from "./components/UsernameNudgeBanner";
import ProfileModal from "./components/ProfileModal";
import AvatarDisplay, { profileToAvatar } from "./components/AvatarDisplay";
import { MobileWhiteboardView } from "./Whiteboard";
import { MapPin } from "lucide-react";
import LocationField from "./components/LocationField";
import SavedPlacesManager from "./components/SavedPlacesManager";
import PricingModal from "./components/PricingModal";
import AIHub from "./aiHub/AIHub";
import { MobileToolComingSoon } from "./aiHub/AIToolComingSoon";
import { MobileAtlasChat } from "./aiHub/AtlasChat";
import { AI_HUB_TOOLS } from "./aiHub/aiToolsRegistry";
import StatusPage from "./status/StatusPage";
import "./MobileApp.css";
import { useTranslation } from "react-i18next";
import { useNativeTabBar } from "./hooks/useNativeTabBar";

// ── Local helpers ────────────────────────────────────────────
const uid  = () => Math.random().toString(36).slice(2);
const pad  = (n) => String(n).padStart(2, "0");
const fmtTime = (h, m) => `${pad(h)}:${pad(m)}`;
// ── Chat autocomplete suggestions ──────────────────────
const CHAT_SUGGESTIONS = [
  "Plan my day for today",
  "What should I focus on right now?",
  "How's my week looking?",
  "Help me reschedule my tasks this week",
  "Help me prioritize today",
  "I'm feeling overwhelmed, can you help?",
  "I have no energy today, what should I do?",
  "Rebalance my schedule this week",
  "Schedule my most important task for today",
  "What can I do with 30 minutes?",
  "Plan my morning routine",
  "Can you prioritize my tasks for today?",
  "Move my tasks to a lighter day",
  "Add a break to my afternoon",
  "Help me start this task step by step",
];
const getChatGhost = (input) => {
  if (!input || input.length < 2) return "";
  const lc = input.toLowerCase();
  for (const s of CHAT_SUGGESTIONS) {
    if (s.toLowerCase().startsWith(lc) && s.length > input.length) return s.slice(input.length);
  }
  return "";
};
const DEFAULT_CHAT_CHIPS = [
  "How's my week looking?",
  "Plan my day for today",
  "What should I focus on?",
  "Help me prioritize today",
  "Rebalance my schedule",
  "I'm feeling overwhelmed",
  "Add a break this afternoon",
  "What can I do in 30 min?",
];

const getChatAlternatives = (input, ghost) => {
  if (!input || input.trim().length < 2) return DEFAULT_CHAT_CHIPS;
  const lc = input.toLowerCase();
  const ghostFull = input + ghost;
  return CHAT_SUGGESTIONS
    .filter((s) => s.toLowerCase().startsWith(lc) && s !== ghostFull && s.length > input.length)
    .slice(0, 6);
};

const shortTitle = (title) => {
  if (!title) return "";
  const words = title.trim().split(/\s+/);
  return words.length <= 3 ? title : words.slice(0, 3).join(" ") + "…";
};

const fmtDur = (min) => {
  if (!min) return "";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60), r = min % 60;
  return r === 0 ? `${h}h` : `${h}h${r}m`;
};

// ── Status page props builder ────────────────────────────────
// Mirrors the desktop assembly in App.js exactly (same metric/action shapes,
// same colorForMetric semantics) so both shells present identical intelligence
// through the one shared <StatusPage> — only the data source (ctx.X vs bare X)
// differs.
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

function buildStatusPageProps(ctx) {
  const {
    energy, setEnergy, relaxation, setRelaxation, focus, setFocus, motivation, setMotivation,
    noraState, userConfidence, assessmentSummary, keySignals,
    metrics, interpretations, patterns = [], emotionalDrift = [],
    aiCoach, actionCenter = [], flowPrediction, implementationIntention,
    mostAvoided, deferredTasks, morningCheckup, dailyMetrics,
    sleepState, todaySleepQuality, setSleepQuality,
    setChatInput, setChatOpen, setRescheduleTask,
    setReviewCheckupMode, setShowMorningCheckup, setShowLongTermInsights,
  } = ctx;

  const checkInItems = [
    { id: "energy", icon: <Zap size={13} />, label: "Energy", color: "var(--accent)", value: energy, onChange: setEnergy,
      levels: [{label:"Very low",value:1},{label:"Low",value:3},{label:"Okay",value:5},{label:"Good",value:7},{label:"High",value:9}] },
    { id: "stress", icon: <Wind size={13} />, label: "Stress", color: "#3b82f6", value: relaxation, onChange: setRelaxation,
      levels: [{label:"Overwhelmed",value:1},{label:"Stressed",value:3},{label:"Okay",value:5},{label:"Calm",value:7},{label:"Relaxed",value:9}] },
    { id: "focus", icon: <Activity size={13} />, label: "Focus", color: "#22c55e", value: focus, onChange: setFocus,
      levels: [{label:"Scattered",value:1},{label:"Drifting",value:3},{label:"Okay",value:5},{label:"Focused",value:7},{label:"Deep",value:9}] },
    { id: "motivation", icon: <TrendingUp size={13} />, label: "Motivation", color: "#f59e0b", value: motivation, onChange: setMotivation,
      levels: [{label:"None",value:1},{label:"Low",value:3},{label:"Okay",value:5},{label:"Driven",value:7},{label:"Fired up",value:9}] },
  ];

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

  const readiness = morningCheckup ? (computeReadiness(morningCheckup) ?? { label: "Moderate", pct: 50 }) : null;
  const metricsEntryCount = Object.keys(dailyMetrics ?? {}).length;
  const ghostActions = [
    {
      id: "mcu", tone: "ghost",
      label: morningCheckup ? "Review Morning Check-Up" : "Start Morning Check-Up",
      meta: readiness ? `${readiness.label} readiness${Number.isFinite(readiness.pct) ? ` · ${readiness.pct}%` : ""}` : undefined,
      preview: morningCheckup?.noraSummary,
      onClick: () => { setReviewCheckupMode(!!morningCheckup); setShowMorningCheckup(true); },
    },
    {
      id: "lti", tone: "ghost", label: "Long-Term Insights",
      meta: metricsEntryCount >= 3 ? `${metricsEntryCount} days tracked` : "Complete a few check-ins to unlock",
      onClick: () => setShowLongTermInsights(true),
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

  const allPatterns = [...patterns, ...emotionalDrift.map((d) => d.text)].slice(0, 4);

  return {
    aiCoach: {
      headline: aiCoach.headline,
      stateLabel: noraState.label,
      stateColor: noraState.color,
      confidence: userConfidence,
      signals: keySignals,
      onAskNora: () => { setChatInput(assessmentSummary); setChatOpen(true); },
    },
    metrics: metricCards,
    patterns: allPatterns,
    actions: [...primaryActions, ...ghostActions],
    quickCheckIn: {
      items: checkInItems,
      sleep: { value: todaySleepQuality, onChange: setSleepQuality, meta: sleepState.suggestion },
    },
  };
}

// ── Root ─────────────────────────────────────────────────────
export default function MobileApp({ ctx }) {
  const { t } = useTranslation();
  const [mobileView,    setMobileView]    = useState("plan");
  const [planSubView,   setPlanSubView]   = useState("day");
  const [dayMode,       setDayMode]       = useState("list");
  const [planDate,      setPlanDate]      = useState(ctx.today);

  // Auto-advance planDate at midnight — if user was on "today" move to the new day
  const prevMobileTodayRef = useRef(ctx.today);
  useEffect(() => {
    if (ctx.today !== prevMobileTodayRef.current) {
      if (planDate === prevMobileTodayRef.current) setPlanDate(ctx.today);
      prevMobileTodayRef.current = ctx.today;
    }
  }, [ctx.today]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter state lives here (root level) so the sheet can be rendered above everything
  const [showFilters,   setShowFilters]   = useState(false);
  const [filterType,    setFilterType]    = useState(null);
  const [filterGroup,   setFilterGroup]   = useState(null);
  const [filterComplex, setFilterComplex] = useState(null);
  const hasFilters = filterType || filterGroup || filterComplex;

  // Bottom nav drag/dial — DOM-direct (no re-renders per frame)
  const navRef           = useRef(null);
  const navIndicatorRef  = useRef(null);
  const navDragRef       = useRef({ active: false, startX: 0, startIdx: 0, moved: false });
  const navFirstMount    = useRef(true);
  const [isDraggingNav, setIsDraggingNav] = useState(false);

  const { dark, theme, chatOpen, setChatOpen, aiHubOpen, setAiHubOpen,
          messengerOpen, setMessengerOpen, editingTask, draft, inAppAlert, setInAppAlert,
          rescheduleTask, setRescheduleTask, saveReschedule, groups,
          focusTask, setFocusTask, userPrefs, setUserPrefs, toggleTask,
          notifBannerVisible, dismissNotifBanner, requestNotifPermission,
          sharingTask, setSharingTask, session,
          atlasOpen, setAtlasOpen, atlasMessages, atlasChatInput, setAtlasChatInput,
          atlasChatLoading, sendAtlasChat, visibleAiTools } = ctx;

  const TYPE_COLORS   = { task:"var(--accent)", deadline:"#ef4444", break:"#94a3b8" };
  const COMPLEX_COLORS = { easy:"#22c55e", medium:"#f59e0b", hard:"#ef4444" };

  const VIEWS_NAV = ["plan", "tasks", "notes", "status", "settings"];
  const navIdx    = VIEWS_NAV.indexOf(mobileView);
  const isGlass   = theme === "liquid_glass";

  // The native tab bar renders in its own UIKit layer on top of the WebView,
  // so no web mechanism (z-index, dim masks, position:fixed) can cover it —
  // it has to be told to hide explicitly whenever a full-screen overlay/sheet
  // is showing, or it bleeds through on top of everything. This aggregates
  // every such surface reachable from here, plus ctx.intelOverlayOpen for the
  // three (Proactive/SuggestionCenter/Onboarding) that render as siblings of
  // <MobileApp> rather than inside it.
  const anyOverlayOpen = !!(
    ctx.showMorningCheckup || ctx.showLongTermInsights ||
    (editingTask && draft) || rescheduleTask ||
    chatOpen || aiHubOpen || messengerOpen ||
    sharingTask || ctx.showJoinCode || ctx.showOnboarding ||
    ctx.showProfileModal || ctx.pricingOpen || focusTask ||
    showFilters || mobileView === "boards" ||
    ctx.intelOverlayOpen
  );

  // Native iOS Liquid Glass tab bar — active only in glass mode on native iOS.
  // On web / PWA / Android / default mode this is a complete no-op.
  const { usingNative } = useNativeTabBar({
    activeTab: mobileView,
    mode:      isGlass ? "glass" : "default",
    dark:      !!dark,
    enabled:   isGlass,
    visible:   !anyOverlayOpen,
    onTabChange: setMobileView,
  });

  // Snap the indicator to the active tab.
  // Suppress transition on first paint so it doesn't fly in from (0,0).
  useLayoutEffect(() => {
    const nav = navRef.current;
    const ind = navIndicatorRef.current;
    if (!nav || !ind) return;
    const btns = nav.querySelectorAll(".mob-nav-btn");
    const btn  = btns[navIdx];
    if (!btn) return;

    ind.style.left   = `${btn.offsetLeft}px`;
    ind.style.top    = `${btn.offsetTop}px`;
    ind.style.width  = `${btn.offsetWidth}px`;
    ind.style.height = `${btn.offsetHeight}px`;

    if (navFirstMount.current) {
      nav.classList.add('mob-nav-no-trans');
      navFirstMount.current = false;
      requestAnimationFrame(() => nav.classList.remove('mob-nav-no-trans'));
    }
  }, [navIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  const onNavPointerDown = (e) => {
    navDragRef.current = { active: true, startX: e.clientX, startIdx: navIdx, moved: false };
    navRef.current?.setPointerCapture(e.pointerId);
  };

  const onNavPointerMove = (e) => {
    if (!navDragRef.current.active || !navRef.current) return;
    const dx = e.clientX - navDragRef.current.startX;
    if (Math.abs(dx) <= 8) return;
    if (!navDragRef.current.moved) {
      navDragRef.current.moved = true;
      setIsDraggingNav(true);
    }
    const btns = navRef.current.querySelectorAll(".mob-nav-btn");
    const tabW = btns[0] ? btns[0].offsetWidth : navRef.current.clientWidth / 5;
    const clampedIdx = Math.max(0, Math.min(4, navDragRef.current.startIdx + dx / tabW));
    if (navIndicatorRef.current) {
      navIndicatorRef.current.style.left =
        `${(btns[0]?.offsetLeft ?? 0) + clampedIdx * tabW}px`;
    }
    const snapIdx = Math.round(clampedIdx);
    navRef.current.querySelectorAll(".mob-nav-btn").forEach((btn, i) => {
      btn.style.color = i === snapIdx ? "var(--accent)" : "";
    });
  };

  const onNavPointerUp = (e) => {
    if (!navDragRef.current.active) return;
    const { moved, startX, startIdx } = navDragRef.current;
    navDragRef.current.active = false;
    navRef.current?.querySelectorAll(".mob-nav-btn").forEach((btn) => { btn.style.color = ""; });

    if (moved) {
      setIsDraggingNav(false);
      if (navRef.current) {
        const btns  = navRef.current.querySelectorAll(".mob-nav-btn");
        const tabW  = btns[0] ? btns[0].offsetWidth : navRef.current.clientWidth / 5;
        const snapped = Math.max(0, Math.min(4, Math.round(startIdx + (e.clientX - startX) / tabW)));
        setMobileView(VIEWS_NAV[snapped]);
        // useLayoutEffect fires after state update → spring-animates pill to snapped position
      }
      setTimeout(() => { navDragRef.current.moved = false; }, 0);
    } else {
      // Tap — pointer capture may have swallowed the click; navigate directly from position
      navDragRef.current.moved = false;
      if (navRef.current) {
        const btns    = navRef.current.querySelectorAll(".mob-nav-btn");
        const tabW    = btns[0] ? btns[0].offsetWidth : navRef.current.clientWidth / 5;
        const firstX  = btns[0] ? btns[0].getBoundingClientRect().left : navRef.current.getBoundingClientRect().left;
        const tapped  = Math.max(0, Math.min(4, Math.floor((e.clientX - firstX) / tabW)));
        setMobileView(VIEWS_NAV[tapped]);
      }
    }
  };

  const onNavPointerCancel = () => {
    navRef.current?.querySelectorAll(".mob-nav-btn").forEach((btn) => { btn.style.color = ""; });
    navDragRef.current = { active: false, startX: 0, startIdx: 0, moved: false };
    setIsDraggingNav(false);
    // useLayoutEffect will spring the pill back to current navIdx
  };

  return (
    <div className={`app mob-app${dark ? " dark" : ""}${theme === "liquid_glass" ? " glass" : ""}${usingNative ? " mob-native-nav" : ""}`}>

      <MobileHeader ctx={ctx} onLogoClick={() => {
        setMobileView("plan");
        setPlanSubView("day");
        setPlanDate(ctx.today);
      }} onBoardsClick={() => setMobileView("boards")}
      />

      <main className="mob-main">
        {mobileView === "plan"     && <MobilePlan ctx={ctx} subView={planSubView} setSubView={setPlanSubView} dayMode={dayMode} setDayMode={setDayMode} filterType={filterType} filterGroup={filterGroup} filterComplex={filterComplex} hasFilters={hasFilters} onOpenFilters={() => setShowFilters(true)} planDate={planDate} setPlanDate={setPlanDate} />}
        {mobileView === "tasks"    && <MobileTasks ctx={ctx} />}
        {mobileView === "notes"    && <MobileNotes ctx={ctx} />}
        {mobileView === "boards"   && <MobileWhiteboardView boards={ctx.boards} onAskNora={p => { ctx.setChatInput(p); ctx.setChatOpen(true); }} onClose={() => setMobileView("plan")} />}
        {mobileView === "status"   && <div className="status-page-mobile-gutter"><StatusPage {...buildStatusPageProps(ctx)} /></div>}
        {mobileView === "settings" && <MobileSettings ctx={ctx} />}
      </main>

      <nav
        className={`mob-bottom-nav${isDraggingNav ? " mob-nav-dragging" : ""}`}
        ref={navRef}
        onPointerDown={onNavPointerDown}
        onPointerMove={onNavPointerMove}
        onPointerUp={onNavPointerUp}
        onPointerCancel={onNavPointerCancel}
      >
        <div ref={navIndicatorRef} className="mob-nav-indicator" />
        {[
          ["plan",     t("mob.plan"),     <CalendarDays size={20} />],
          ["tasks",    t("mob.tasks"),    <CheckSquare  size={20} />],
          ["notes",    t("mob.notes"),    <FileText     size={20} />],
          ["status",   t("mob.status"),   <Activity     size={20} />],
          ["settings", t("mob.settings"), <Settings     size={20} />],
        ].map(([v, l, icon]) => (
          <button key={v}
            className={`mob-nav-btn${mobileView === v ? " mob-nav-active" : ""}`}
            onClick={() => setMobileView(v)}>
            <span className="mob-nav-icon">{icon}</span>
            <span className="mob-nav-label">{l}</span>
          </button>
        ))}
      </nav>

      <button
        className={`mob-ai-fab${(aiHubOpen || chatOpen || messengerOpen || atlasOpen) ? " fab-open" : ""}`}
        onClick={() => {
          if (aiHubOpen || chatOpen || messengerOpen || atlasOpen) {
            setAiHubOpen(false); setChatOpen(false); setMessengerOpen(false); setAtlasOpen(false);
          } else {
            setAiHubOpen(true);
          }
        }}>
        {(aiHubOpen || chatOpen || messengerOpen || atlasOpen) ? <X size={22} /> : <Sparkle size={24} strokeWidth={0} fill="currentColor" />}
      </button>

      <MobileChat ctx={ctx} />
      <MobileAtlasChat
        open={atlasOpen}
        onClose={() => setAtlasOpen(false)}
        messages={atlasMessages}
        chatInput={atlasChatInput}
        setChatInput={setAtlasChatInput}
        chatLoading={atlasChatLoading}
        onSend={sendAtlasChat}
      />
      <AIHub
        open={aiHubOpen}
        onClose={() => setAiHubOpen(false)}
        badges={{ insights: (ctx.intelCount ?? 0) > 0 }}
        tools={visibleAiTools}
        onSelect={(id) => {
          setAiHubOpen(false);
          if (id === "assistant") setChatOpen(true);
          else if (id === "atlas") setAtlasOpen(true);
          else if (id === "messenger") setMessengerOpen(true);
          else if (id === "insights") ctx.onIntelClick();
        }}
      />
      <MobileToolComingSoon
        open={messengerOpen}
        onClose={() => setMessengerOpen(false)}
        tool={AI_HUB_TOOLS.find((t) => t.id === "messenger")}
        dark={dark}
      />
      {editingTask && draft && <MobileEditModal ctx={ctx} />}
      {/* Long-Term Insights overlay */}
      {ctx.showLongTermInsights && (
        <LongTermInsights
          dark={dark}
          glass={theme === "liquid_glass"}
          metrics={ctx.dailyMetrics || {}}
          tasks={ctx.tasks || []}
          onClose={() => ctx.setShowLongTermInsights(false)}
        />
      )}

      {/* Morning Check-Up overlay */}
      {ctx.showMorningCheckup && (
        <MorningCheckup
          dark={dark}
          glass={theme === "liquid_glass"}
          today={ctx.today}
          todayTasks={ctx.todayTasks || []}
          onComplete={ctx.handleCheckupComplete}
          onClose={() => { ctx.setShowMorningCheckup(false); ctx.setReviewCheckupMode && ctx.setReviewCheckupMode(false); }}
          viewOnly={ctx.reviewCheckupMode && !!ctx.morningCheckup}
          existingData={ctx.reviewCheckupMode ? ctx.morningCheckup : null}
        />
      )}
      {rescheduleTask && (
        <MobileRescheduleModal
          task={rescheduleTask}
          onSave={saveReschedule}
          onClose={() => setRescheduleTask(null)}
        />
      )}
      {/* Focus session overlay */}
      {focusTask && (
        <FocusSession
          task={focusTask}
          dark={dark}
          userPrefs={userPrefs}
          setUserPrefs={setUserPrefs}
          notifSettings={ctx.notifSettings}
          showNotification={ctx.showNotification}
          onClose={(action) => {
            setFocusTask(null);
            if (action === "reschedule") setRescheduleTask(focusTask);
          }}
          onComplete={() => { toggleTask(focusTask.id); setFocusTask(null); }}
        />
      )}
      {/* Filter sheet — rendered at root to escape stacking context issues */}
      {showFilters && (
        <div className="mob-sheet-overlay" onClick={() => setShowFilters(false)}>
          <div className="mob-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mob-modal-handle" />
            <div className="mob-sheet-header">
              <span className="mob-sheet-title">Filters</span>
              <button className="mob-modal-close" onClick={() => setShowFilters(false)}><X size={20} /></button>
            </div>
            <div className="mob-sheet-section">
              <span className="mob-filter-lbl">Type</span>
              <div className="mob-filter-pills">
                {[["All",null],["Task","task"],["Deadline","deadline"],["Break","break"]].map(([l,v]) => (
                  <button key={l}
                    className={`mob-filter-pill${filterType===v?" active":""}`}
                    style={filterType===v && v ? { background:`${TYPE_COLORS[v]}18`, borderColor:`${TYPE_COLORS[v]}50`, color:TYPE_COLORS[v] } : {}}
                    onClick={() => setFilterType(v)}>{l}</button>
                ))}
              </div>
            </div>
            <div className="mob-sheet-section">
              <span className="mob-filter-lbl">Complexity</span>
              <div className="mob-filter-pills">
                {[["All",null],["Easy","easy"],["Medium","medium"],["Hard","hard"]].map(([l,v]) => (
                  <button key={l}
                    className={`mob-filter-pill${filterComplex===v?" active":""}`}
                    style={filterComplex===v && v ? { background:`${COMPLEX_COLORS[v]}18`, borderColor:`${COMPLEX_COLORS[v]}50`, color:COMPLEX_COLORS[v] } : {}}
                    onClick={() => setFilterComplex(v)}>{l}</button>
                ))}
              </div>
            </div>
            {groups.length > 0 && (
              <div className="mob-sheet-section">
                <span className="mob-filter-lbl">Group</span>
                <div className="mob-filter-pills">
                  <button className={`mob-filter-pill${!filterGroup?" active":""}`} onClick={() => setFilterGroup(null)}>All</button>
                  {groups.map(g => (
                    <button key={g.id}
                      className={`mob-filter-pill${filterGroup===g.id?" active":""}`}
                      style={filterGroup===g.id ? { background:g.color+"25", borderColor:g.color, color:g.color } : {}}
                      onClick={() => setFilterGroup(g.id)}>
                      <span style={{ display:"inline-block",width:7,height:7,borderRadius:"50%",background:g.color,marginRight:4 }} />
                      {g.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {hasFilters && (
              <button className="mob-filter-clear" style={{ margin:"8px 20px 12px", alignSelf:"flex-start" }}
                onClick={() => { setFilterType(null); setFilterGroup(null); setFilterComplex(null); }}>
                Clear all filters
              </button>
            )}
          </div>
        </div>
      )}

      {inAppAlert && (
        <div className="notif-toast" role="alert">
          <Bell size={18} className="notif-toast-icon" />
          <div className="notif-toast-text">
            <div className="notif-toast-title">{inAppAlert.title}</div>
            <div className="notif-toast-body">Starting in {inAppAlert.offset} min · {inAppAlert.timeStr}</div>
          </div>
          <button className="notif-toast-close" onClick={() => setInAppAlert(null)}><X size={14} /></button>
        </div>
      )}

      {/* Notification permission banner — shown contextually */}
      {notifBannerVisible && (
        <NotificationPermissionBanner
          onAllow={requestNotifPermission}
          onLater={() => dismissNotifBanner(false)}
          onNever={() => dismissNotifBanner(true)}
        />
      )}

      {/* Share modal */}
      {sharingTask && (
        <ShareModal
          objectType={sharingTask.type === "deadline" ? "deadline" : "task"}
          objectData={sharingTask}
          sharedObjectId={sharingTask.sharedObjectId ?? null}
          session={session}
          onClose={() => setSharingTask?.(null)}
          onSharedObjectId={(id) => {
            ctx.setTasks?.((prev) => prev.map((t) =>
              t.id === sharingTask.id ? { ...t, sharedObjectId: id } : t
            ));
            setSharingTask?.((prev) => prev ? { ...prev, sharedObjectId: id } : null);
            ctx.setSharedObjects?.((prev) => {
              const object = { id, type: sharingTask.type === "deadline" ? "deadline" : "task", data: sharingTask, collaborators: [] };
              return prev.some(item => item.id === id) ? prev.map(item => item.id === id ? { ...item, ...object } : item) : [...prev, object];
            });
          }}
          onCollaboratorsChange={(id, collaborators) => {
            ctx.setSharedObjects?.((prev) => {
              const object = { id, type: sharingTask.type === "deadline" ? "deadline" : "task", data: sharingTask, collaborators };
              return prev.some(item => item.id === id) ? prev.map(item => item.id === id ? { ...item, ...object } : item) : [...prev, object];
            });
          }}
        />
      )}

      {ctx.showJoinCode && <JoinCodeModal onClose={() => ctx.setShowJoinCode?.(false)} onJoin={ctx.handleJoinCode} />}

      {/* Username nudge banner */}
      {ctx.showUsernameBanner && !ctx.showOnboarding && (
        <UsernameNudgeBanner
          onSetUp={() => { ctx.setShowUsernameBanner?.(false); ctx.setShowOnboarding?.(true); }}
          onLater={() => ctx.setShowUsernameBanner?.(false)}
        />
      )}

      {/* Username onboarding */}
      {ctx.showOnboarding && (
        <UsernameOnboarding
          displayName={ctx.userProfile?.name ?? ctx.accountName ?? ""}
          onComplete={(result) => {
            ctx.setShowOnboarding?.(false);
            ctx.setUserProfile?.((p) => ({ ...p, ...result }));
            if (result.name) ctx.setAccountName?.(result.name);
          }}
          onSkip={() => ctx.setShowOnboarding?.(false)}
        />
      )}

      {/* Profile modal */}
      {ctx.showProfileModal && (
        <ProfileModal
          session={session}
          onClose={() => ctx.setShowProfileModal?.(false)}
          onSaved={(updated) => {
            ctx.setUserProfile?.((p) => ({ ...p, ...updated }));
            if (updated.name) ctx.setAccountName?.(updated.name);
          }}
        />
      )}

      {/* Pricing modal */}
      {ctx.pricingOpen && (
        <PricingModal
          onClose={() => ctx.setPricingOpen?.(false)}
          currentPlan={ctx.subscription?.plan ?? "free"}
          userId={session?.user?.id}
          userEmail={session?.user?.email}
        />
      )}

    </div>
  );
}

// ── Header ───────────────────────────────────────────────────
function MobileHeader({ ctx, onLogoClick, onBoardsClick }) {
  const { today, dark, isOnline } = ctx;
  const d = new Date(today + "T00:00:00");
  const dayName  = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getDay()];
  const dateText = `${dayName}, ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()]} ${d.getDate()}`;
  return (
    <header className="mob-header">
      <button className="mob-brand-btn" onClick={onLogoClick} aria-label="Go to today's plan">
        <img
          src={dark ? "/logo-dark.png" : "/logo-light.png"}
          className="mob-brand-logo"
          alt="Nora" />
      </button>
      <span className="mob-header-date">
        {dateText}
        {isOnline === false && <span className="mob-offline-pill">Offline</span>}
      </span>
      {onBoardsClick && (
        <button className="mob-header-boards-btn" onClick={onBoardsClick} aria-label="Whiteboards">
          <Layers size={18} />
        </button>
      )}
    </header>
  );
}

// ── Swipe Row (right = done, left = reschedule) ───────────────
function SwipeRow({ children, onDone, onReschedule }) {
  const outerRef = useRef(null);
  const ts = useRef({ startX: 0, startY: 0, locked: null, dx: 0 });
  const [dx, setDx] = useState(0);
  const [flash, setFlash] = useState(null); // 'done' | 'reschedule'

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const onStart = (e) => {
      ts.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, locked: null, dx: 0 };
    };
    const onMove = (e) => {
      const s = ts.current;
      const ddx = e.touches[0].clientX - s.startX;
      const ddy = e.touches[0].clientY - s.startY;
      if (s.locked === null) {
        if (Math.abs(ddx) > 6 || Math.abs(ddy) > 6)
          s.locked = Math.abs(ddx) > Math.abs(ddy) ? 'h' : 'v';
        return;
      }
      if (s.locked === 'v') return;
      e.preventDefault();
      const clamped = Math.max(-120, Math.min(120, ddx));
      s.dx = clamped;
      setDx(clamped);
    };
    const onEnd = () => {
      const { locked, dx: d } = ts.current;
      if (locked !== 'h') { setDx(0); return; }
      if (d > 60) {
        setFlash('done'); setDx(0);
        setTimeout(() => { setFlash(null); onDone?.(); }, 300);
      } else if (d < -60) {
        setFlash('reschedule'); setDx(0);
        setTimeout(() => { setFlash(null); onReschedule?.(); }, 300);
      } else {
        setDx(0);
      }
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove',  onMove,  { passive: false });
    el.addEventListener('touchend',   onEnd,   { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove',  onMove);
      el.removeEventListener('touchend',   onEnd);
    };
  }, [onDone, onReschedule]); // eslint-disable-line

  return (
    <div ref={outerRef} className={`swipe-row${flash ? ` swipe-fl-${flash}` : ''}`}>
      <div className="swipe-bg swipe-bg-done"><Check size={16} /></div>
      <div className="swipe-bg swipe-bg-rsc"><RotateCcw size={16} /></div>
      <div className="swipe-inner"
        style={dx !== 0 ? { transform: `translateX(${dx}px)`, transition: 'none' } : undefined}>
        {children}
      </div>
    </div>
  );
}

// ── Day Summary strip ─────────────────────────────────────────
function DaySummary({ tasks, planDate, today, doneToday, totalToday, pct }) {
  const dayTasks = tasks.filter((t) => t.date === planDate && (t.type ?? 'task') === 'task');
  const taskCount = dayTasks.length;
  const mins = dayTasks.reduce((s, t) => s + (t.duration ?? 0), 0);
  const timeLabel = mins >= 60
    ? `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ''}`
    : mins > 0 ? `${mins}m` : null;
  const workload = mins >= 480 || taskCount >= 8 ? 'heavy'
    : mins >= 300 || taskCount >= 5 ? 'moderate'
    : mins >= 60  || taskCount >= 2 ? 'light'
    : 'free';
  const WL = { free: 'Free', light: 'Light', moderate: 'Moderate', heavy: 'Heavy' };
  const isToday = planDate === today;
  if (taskCount === 0) return null;
  return (
    <div className="mob-day-summary">
      <div className="mob-ds-stats">
        <span className="mob-ds-tasks">{taskCount} task{taskCount !== 1 ? 's' : ''}</span>
        {timeLabel && <span className="mob-ds-time">· {timeLabel}</span>}
        <span className={`mob-ds-wl mob-ds-wl-${workload}`}>{WL[workload]}</span>
      </div>
      {isToday && totalToday > 0 && (
        <>
          <div className="mob-ds-bar">
            <div className="mob-ds-bar-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="mob-ds-pct">{doneToday} of {totalToday} done</div>
        </>
      )}
    </div>
  );
}

// ── Plan view (Day / Month) ───────────────────────────────────
function MobilePlan({ ctx, subView, setSubView, dayMode, setDayMode,
                      filterType, filterGroup, filterComplex, hasFilters, onOpenFilters,
                      planDate, setPlanDate }) {
  const { today, tasks, doneToday, totalToday, pct } = ctx;
  const [zoomLevel, setZoomLevel] = useState(1);

  const shiftDate = (delta) => {
    const d = new Date(planDate + "T00:00:00");
    d.setDate(d.getDate() + delta);
    // Use local date parts to avoid UTC offset shifting the date
    setPlanDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
  };

  const dateLabel = planDate === today ? "Today"
    : new Date(planDate + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });

  // Filtered tasks for the selected plan date
  const planTasks = tasks.filter((t) => {
    if (t.date !== planDate) return false;
    if (filterType  && (t.type ?? "task") !== filterType)  return false;
    if (filterGroup && t.groupId !== filterGroup)           return false;
    if (filterComplex && t.complexity !== filterComplex)    return false;
    return true;
  });

  return (
    <div className="mob-plan">
      {/* Day / Month toggle */}
      <div className="mob-plan-segs">
        <div className={`mob-seg-pill mob-seg-pill-${subView === "day" ? 0 : 1}`} />
        <button className={`mob-seg-btn${subView === "day" ? " active" : ""}`} onClick={() => setSubView("day")}>Day</button>
        <button className={`mob-seg-btn${subView === "month" ? " active" : ""}`} onClick={() => setSubView("month")}>Month</button>
      </div>

      {subView === "day" && (
        <>
          {/* Date navigation */}
          <div className="mob-plan-date-row">
            <button className="mob-date-nav-btn" onClick={() => shiftDate(-1)}><ChevronLeft size={18} /></button>
            <button className={`mob-date-label${planDate === today ? " is-today" : ""}`} onClick={() => setPlanDate(today)}>
              {dateLabel}
            </button>
            <button className="mob-date-nav-btn" onClick={() => shiftDate(1)}><ChevronRight size={18} /></button>
          </div>

          {/* List / Grid + Filters row */}
          <div className="mob-day-controls">
            <div className="mob-day-mode-row" style={{ margin: 0 }}>
              <button className={`mob-mode-btn${dayMode === "list" ? " active" : ""}`} onClick={() => setDayMode("list")}>
                <Sparkles size={13} /> Smart
              </button>
              <button className={`mob-mode-btn${dayMode === "grid" ? " active" : ""}`} onClick={() => setDayMode("grid")}>
                <BarChart2 size={13} /> Grid
              </button>
            </div>
            <button
              className={`mob-plan-filter-btn${hasFilters ? " active" : ""}`}
              onClick={onOpenFilters}>
              Filters{hasFilters ? " ●" : ""}
            </button>
          </div>

          <DaySummary tasks={tasks} planDate={planDate} today={today}
            doneToday={doneToday} totalToday={totalToday} pct={pct} />

          {dayMode === "list"
            ? <MobileHome ctx={ctx} planDate={planDate} planTasks={planTasks} />
            : <MobileGrid ctx={{ ...ctx, todayTasks: planTasks, effectiveDate: planDate ?? today, zoomLevel, setZoomLevel }} />}
        </>
      )}

      {subView === "month" && <MobileMonth ctx={ctx} onSelectDate={(d) => { setPlanDate(d); setSubView("day"); }} />}

    </div>
  );
}

// ── Home view (Day smart mode) ───────────────────────────────
function MobileHome({ ctx, planDate, planTasks }) {
  const {
    todayTasks, today, aiFocus, contextMode, deferredTasks,
    doneToday, totalToday, pct, toggleTask,
    setChatInput, setChatOpen, setEditingTask, setFocusTask,
    setRescheduleTask, groups, nowObj,
  } = ctx;

  const effectiveDate  = planDate ?? today;
  const effectiveTasks = planTasks ?? todayTasks;
  const nowMins = nowObj.getHours() * 60 + nowObj.getMinutes();
  const [expandedId, setExpandedId] = useState(null);

  const scheduled = [...effectiveTasks]
    .filter((t) => t.startHour != null)
    .sort((a, b) => a.startHour * 60 + (a.startMinute ?? 0) - (b.startHour * 60 + (b.startMinute ?? 0)));

  const unscheduled = effectiveTasks.filter((t) => t.startHour == null);
  const nextTask = scheduled.find(
    (t) => !t.completed && t.startHour * 60 + (t.startMinute ?? 0) >= nowMins
  );
  const getGroup = (id) => groups.find((g) => g.id === id);

  const renderItem = (t, showTime) => {
    const tp    = t.type ?? "task";
    const group = getGroup(t.groupId);
    const gc    = tp === "deadline" ? "#ef4444"
                : tp === "break"    ? "#94a3b8"
                : group?.color ?? "var(--accent)";
    const tMins = t.startHour != null ? t.startHour * 60 + (t.startMinute ?? 0) : null;
    const isPast = tMins != null && tMins < nowMins && effectiveDate === today;
    const isNext = t === nextTask;
    const isExp  = expandedId === t.id;

    return (
      <SwipeRow key={t.id}
        onDone={tp === "task" ? () => { toggleTask(t.id); setExpandedId(null); } : undefined}
        onReschedule={() => { setRescheduleTask(t); setExpandedId(null); }}
      >
        <div
          className={`mai2${t.completed ? " mai2-done" : ""}${isPast && !t.completed ? " mai2-past" : ""}${isNext ? " mai2-next" : ""}${tp === "break" ? " mai2-break" : ""}${tp === "deadline" ? " mai2-dl" : ""}${isExp ? " mai2-open" : ""}`}
          style={{ "--gc": gc }}
          onClick={() => setExpandedId((p) => p === t.id ? null : t.id)}
        >
          <div className="mai2-main">
            {showTime && t.startHour != null && (
              <span className="mai2-time">{fmtTime(t.startHour, t.startMinute ?? 0)}</span>
            )}
            <div className="mai2-body">
              <span className="mai2-title">{t.title || (tp === "break" ? "Break" : "Deadline")}</span>
              <div className="mai2-meta">
                {t.duration && <span className="mai2-dur">{fmtDur(t.duration)}</span>}
                {group && (
                  <span className="mai2-group">
                    <span className="mai2-gdot" style={{ background: group.color }} />
                    {group.name}
                  </span>
                )}
                {isNext && <span className="mai2-badge">Up next</span>}
              </div>
            </div>
            {tp === "task" ? (
              <button className={`mai2-check${t.completed ? " done" : ""}`}
                onClick={(e) => { e.stopPropagation(); toggleTask(t.id); }}>
                {t.completed && <Check size={12} strokeWidth={3} />}
              </button>
            ) : (
              <span className="mai2-type-icon">
                {tp === "break" ? <Coffee size={13} /> : <Flag size={13} />}
              </span>
            )}
          </div>

          {isExp && (
            <div className="mai2-actions" onClick={(e) => e.stopPropagation()}>
              {tp === "task" && !t.completed && (
                <button className="mai2-act mai2-act-focus"
                  onClick={() => { setFocusTask(t); setExpandedId(null); }}>
                  <Zap size={13} /> Focus
                </button>
              )}
              {tp === "task" && (
                <button className={`mai2-act ${t.completed ? "mai2-act-undo" : "mai2-act-done"}`}
                  onClick={() => { toggleTask(t.id); setExpandedId(null); }}>
                  <Check size={13} /> {t.completed ? "Undo" : "Done"}
                </button>
              )}
              <button className="mai2-act mai2-act-move"
                onClick={() => { setRescheduleTask(t); setExpandedId(null); }}>
                <RotateCcw size={13} /> Move
              </button>
              <button className="mai2-act mai2-act-edit"
                onClick={() => { setEditingTask(t); setExpandedId(null); }}>
                <Pencil size={13} /> Edit
              </button>
            </div>
          )}
        </div>
      </SwipeRow>
    );
  };

  return (
    <div className="mob-home">

      {/* AI Focus Card */}
      <div className="mob-focus-card">
        <div className="mob-focus-card-top">
          <span className="mob-ctx-badge" style={{
            background: `${contextMode.color}1a`,
            color: contextMode.color,
            borderColor: `${contextMode.color}40`,
          }}>
            <Sparkles size={11} /> {contextMode.label}
          </span>
          {totalToday > 0 && <span className="mob-done-pill">{doneToday}/{totalToday}</span>}
        </div>

        {aiFocus.priorityTask ? (
          <>
            <p className="mob-focus-eyebrow">Focus on next</p>
            <h2 className="mob-focus-title">{aiFocus.priorityTask.title}</h2>
            {aiFocus.priorityTask.startHour != null && (
              <p className="mob-focus-time">
                {fmtTime(aiFocus.priorityTask.startHour, aiFocus.priorityTask.startMinute ?? 0)}
                {aiFocus.priorityTask.duration ? ` · ${fmtDur(aiFocus.priorityTask.duration)}` : ""}
              </p>
            )}
          </>
        ) : (
          <h2 className="mob-focus-title mob-focus-empty">You're all caught up.</h2>
        )}

        <p className="mob-focus-insight">{aiFocus.insight}</p>

        {totalToday > 0 && (
          <div className="mob-progress-track">
            <div className="mob-progress-fill" style={{ width: `${pct}%`, background: contextMode.color }} />
          </div>
        )}

        <div className="mob-focus-actions">
          {aiFocus.priorityTask && !aiFocus.priorityTask.completed && (
            <button className="mob-btn mob-btn-done" onClick={() => setFocusTask(aiFocus.priorityTask)}>
              <Zap size={17} /> Start Focus
            </button>
          )}
          {aiFocus.priorityTask && (
            <button className="mob-btn mob-btn-skip" onClick={() => toggleTask(aiFocus.priorityTask.id)}>
              <Check size={17} /> Done
            </button>
          )}
          <button className="mob-btn mob-btn-ai" onClick={() => {
            setChatInput(aiFocus.priorityTask
              ? `What's the best way to tackle "${aiFocus.priorityTask.title}" right now?`
              : "What should I focus on today?");
            setChatOpen(true);
          }}>
            <MessageSquare size={17} /> Ask Nora
          </button>
        </div>
      </div>

      {/* Deferred nudge */}
      {deferredTasks.length > 0 && (
        <button className="mob-nudge-bar" onClick={() => {
          setChatInput(`I have ${deferredTasks.length} deferred task${deferredTasks.length > 1 ? "s" : ""}. Can you help me find the best time for them this week?`);
          setChatOpen(true);
        }}>
          <RotateCcw size={14} />
          <span>{deferredTasks.length} task{deferredTasks.length > 1 ? "s" : ""} still pending — tap to reschedule</span>
          <ChevronRight size={14} />
        </button>
      )}

      {/* Scheduled */}
      {scheduled.length > 0 ? (
        <div className="mob-agenda2">
          <div className="mob-section-title"><Clock size={14} /> Today's Schedule</div>
          {scheduled.map((t) => renderItem(t, true))}
        </div>
      ) : (
        <div className="mob-empty-state">
          <Sparkles size={36} style={{ opacity: .15 }} />
          <p>Nothing scheduled today.</p>
          <button className="mob-plan-cta" onClick={() => {
            setChatInput("Plan my day. Consider my energy level and current workload.");
            setChatOpen(true);
          }}>
            <Sparkles size={15} /> Let Nora plan my day
          </button>
        </div>
      )}

      {/* Unscheduled */}
      {unscheduled.length > 0 && (
        <div className="mob-agenda2 mob-unsched-section">
          <div className="mob-section-title"><Clock size={14} /> Unscheduled</div>
          {unscheduled.map((t) => renderItem(t, false))}
        </div>
      )}

      {/* Quick add */}
      <div className="mob-task-create-row">
        <button className="mob-quick-add" onClick={() => {
          ctx.setEditingTask({
            id: uid(), type: "task",
            title: "", date: effectiveDate,
            startHour: null, startMinute: null,
            duration: null, repeat: null, repeatEnd: null,
            completed: false, notes: "", complexity: null,
            groupId: null, reminderOffset: null,
          });
        }}>
          <Plus size={18} /> Add task
        </button>
        <button className="mob-join-task" onClick={() => ctx.setShowJoinCode?.(true)}>
          <KeyRound size={18} /> Join task
        </button>
      </div>

    </div>
  );
}

// ── Grid view (timetable) — Google Calendar style ────────────
function MobileGrid({ ctx }) {
  const { todayTasks, groups, toggleTask, setEditingTask, setTasks, nowObj, effectiveDate, today, zoomLevel = 1, setZoomLevel } = ctx;
  const scrollRef = useRef(null);
  const gridRef   = useRef(null);

  // Pinch-to-zoom
  const [zoomHint, setZoomHint]  = useState(null); // null = hidden; number = % shown
  const pinchRef                 = useRef(null);    // { startDist, startZoom }
  const zoomHintTimerRef         = useRef(null);
  const zoomLevelRef             = useRef(zoomLevel);
  const setZoomRef               = useRef(setZoomLevel ?? (() => {}));
  // Keep refs current every render (stable setters — just being explicit)
  zoomLevelRef.current = zoomLevel;
  setZoomRef.current   = setZoomLevel ?? (() => {});

  // Layout constants — kept in a ref so the passive touchmove listener reads current values
  const PX_H = Math.round(64 * zoomLevel);
  const PX_M = PX_H / 60;

  const scheduled = [...todayTasks]
    .filter((t) => t.startHour != null)
    .sort((a, b) => a.startHour * 60 + (a.startMinute ?? 0) - (b.startHour * 60 + (b.startMinute ?? 0)));
  const unscheduled = todayTasks.filter((t) => t.startHour == null);
  const getGroup = (id) => groups.find((g) => g.id === id);

  // Always show 07:00–22:00 minimum; expand to fit tasks
  const firstH = scheduled.length
    ? Math.max(0, Math.min(7, scheduled[0].startHour - 1))
    : 7;
  const lastH = scheduled.length
    ? Math.min(24, Math.max(22, Math.ceil(Math.max(...scheduled.map(
        t => t.startHour + ((t.startMinute ?? 0) + (t.duration ?? 60)) / 60
      ))) + 1))
    : 22;
  const hours  = Array.from({ length: lastH - firstH + 1 }, (_, i) => firstH + i);
  const totalH = (lastH - firstH + 1) * PX_H;

  // Keep a ref of layout values so the passive touchmove handler (added once) sees current values
  const layoutRef = useRef({ firstH, PX_M, totalH });
  layoutRef.current = { firstH, PX_M, totalH };

  // Overlap columns
  const withCols = (() => {
    const res = scheduled.map(t => ({
      ...t,
      _s: t.startHour * 60 + (t.startMinute ?? 0),
      _e: t.startHour * 60 + (t.startMinute ?? 0) + (t.duration ?? 60),
      _col: 0, _nc: 1,
    }));
    const colEnd = [];
    for (const t of res) {
      let c = colEnd.findIndex(e => e <= t._s);
      if (c < 0) c = colEnd.length;
      colEnd[c] = t._e; t._col = c;
    }
    for (const t of res) {
      let nc = t._col + 1;
      for (const u of res) if (u._s < t._e && u._e > t._s) nc = Math.max(nc, u._col + 1);
      t._nc = nc;
    }
    return res;
  })();

  const nowMin  = nowObj.getHours() * 60 + nowObj.getMinutes();
  const nowTop  = (nowMin - firstH * 60) * PX_M;
  const showNow = effectiveDate === today && nowMin >= firstH * 60 && nowMin <= lastH * 60;

  // ── Drag state ───────────────────────────────────────────────
  const [dragId,      setDragId]      = useState(null);
  const [dragTop,     setDragTop]     = useState(0);
  const [dragTimeMin, setDragTimeMin] = useState(0);

  const dragStartRef  = useRef(null); // { taskId, startY, startX, origTop, origMin, origH, origM, dragging }
  const longPressRef  = useRef(null);
  const clickBlockRef = useRef(false); // prevents click from firing after drag ends

  // Non-passive touch handlers — must use addEventListener (React synthetic events are passive)
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const onStart = (e) => {
      if (e.touches.length !== 2) return;
      // Two fingers → start pinch; cancel any pending drag
      clearTimeout(longPressRef.current);
      dragStartRef.current = null;
      const [t0, t1] = [e.touches[0], e.touches[1]];
      const dx = t0.clientX - t1.clientX;
      const dy = t0.clientY - t1.clientY;
      pinchRef.current = {
        startDist: Math.sqrt(dx * dx + dy * dy),
        startZoom: zoomLevelRef.current,
      };
      e.preventDefault();
    };

    const onMove = (e) => {
      // ── Pinch zoom (2 fingers) ──────────────────────────
      if (e.touches.length === 2) {
        if (!pinchRef.current) return;
        e.preventDefault();
        const [t0, t1] = [e.touches[0], e.touches[1]];
        const dx  = t0.clientX - t1.clientX;
        const dy  = t0.clientY - t1.clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const raw  = pinchRef.current.startZoom * (dist / pinchRef.current.startDist);
        const next = parseFloat(Math.max(0.5, Math.min(3, raw)).toFixed(2));
        setZoomRef.current(next);
        // Show transient percentage indicator
        clearTimeout(zoomHintTimerRef.current);
        setZoomHint(Math.round(next * 100));
        zoomHintTimerRef.current = setTimeout(() => setZoomHint(null), 1200);
        return;
      }

      // ── Single-finger drag ──────────────────────────────
      const ref = dragStartRef.current;
      if (!ref) return;
      const touch = e.touches[0];
      if (!ref.dragging) {
        const dy = Math.abs(touch.clientY - ref.startY);
        const dx = Math.abs(touch.clientX - ref.startX);
        if (dy > 8 || dx > 8) {
          clearTimeout(longPressRef.current);
          dragStartRef.current = null;
        }
        return;
      }
      e.preventDefault();
      const { firstH: fH, PX_M: pxm, totalH: tH } = layoutRef.current;
      const dy     = touch.clientY - ref.startY;
      const newTop = Math.max(0, Math.min(tH - 36, ref.origTop + dy));
      const rawMin = fH * 60 + newTop / pxm;
      const snap   = Math.max(0, Math.min(1439, Math.round(rawMin / 5) * 5));
      setDragTop(newTop);
      setDragTimeMin(snap);
    };

    container.addEventListener("touchstart", onStart, { passive: false });
    container.addEventListener("touchmove",  onMove,  { passive: false });
    return () => {
      container.removeEventListener("touchstart", onStart);
      container.removeEventListener("touchmove",  onMove);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTaskTouchStart = useCallback((e, task) => {
    const touch   = e.touches[0];
    const origMin = task.startHour * 60 + (task.startMinute ?? 0);
    const { firstH: fH, PX_M: pxm } = layoutRef.current;
    const origTop = (origMin - fH * 60) * pxm;

    dragStartRef.current = {
      taskId: task.id,
      startY: touch.clientY,
      startX: touch.clientX,
      origTop,
      origMin,
      origH: task.startHour,
      origM: task.startMinute ?? 0,
      dragging: false,
    };

    clearTimeout(longPressRef.current);
    longPressRef.current = setTimeout(() => {
      const ref = dragStartRef.current;
      if (!ref || ref.taskId !== task.id) return;

      navigator.vibrate?.(50);
      ref.dragging = true;
      clickBlockRef.current = true;

      setDragId(task.id);
      setDragTop(origTop);
      setDragTimeMin(origMin);
    }, 300);
  }, []); // eslint-disable-line

  const handleContainerTouchEnd = useCallback((e) => {
    // End pinch when fewer than 2 fingers remain
    if (!e || e.touches.length < 2) pinchRef.current = null;

    clearTimeout(longPressRef.current);
    const ref = dragStartRef.current;
    dragStartRef.current = null;

    if (!ref?.dragging) {
      setDragId(null);
      return;
    }

    // Snap to 5-minute grid
    const h = Math.max(0, Math.min(23, Math.floor(dragTimeMin / 60)));
    const m = Math.min(55, Math.round((dragTimeMin % 60) / 5) * 5);

    if (h !== ref.origH || m !== ref.origM) {
      setTasks(p => p.map(t =>
        t.id === ref.taskId ? { ...t, startHour: h, startMinute: m } : t
      ));
    }

    setDragId(null);
    // Block the synthetic click that fires after touchend on mobile
    setTimeout(() => { clickBlockRef.current = false; }, 80);
  }, [dragTimeMin, setTasks]);

  // Tap on grid background → create task at that time
  const handleGridClick = useCallback((e) => {
    if (e.target !== gridRef.current) return;
    const rect     = gridRef.current.getBoundingClientRect();
    const y        = e.clientY - rect.top;
    const { firstH: fH, PX_M: pxm } = layoutRef.current;
    const totalMin = fH * 60 + Math.round(y / pxm);
    const h        = Math.max(0, Math.min(23, Math.floor(totalMin / 60)));
    const m        = Math.min(55, Math.round((totalMin % 60) / 5) * 5);
    setEditingTask({
      id: uid(), type: "task",
      title: "", date: effectiveDate ?? today,
      startHour: h, startMinute: m,
      duration: 60, repeat: null, repeatEnd: null,
      completed: false, notes: "", complexity: null,
      groupId: null, reminderOffset: null,
    });
  }, [setEditingTask, effectiveDate, today]);

  // Auto-scroll to now on mount
  useEffect(() => {
    if (scrollRef.current && showNow) {
      scrollRef.current.scrollTop = Math.max(0, nowTop - 100);
    }
  }, []); // eslint-disable-line

  const dragH = Math.max(0, Math.min(23, Math.floor(dragTimeMin / 60)));
  const dragM = dragTimeMin % 60;

  return (
    <div
      ref={scrollRef}
      className="mob-timetable"
      onTouchEnd={handleContainerTouchEnd}
      onTouchCancel={handleContainerTouchEnd}>

      {/* Pinch-zoom percentage indicator */}
      {zoomHint !== null && (
        <div className="mob-pinch-hint">{zoomHint}%</div>
      )}

      <div
        ref={gridRef}
        className="mob-tt-grid"
        style={{ height: totalH }}
        onClick={handleGridClick}>

        {/* Hour lines */}
        {hours.map(h => (
          <div key={h} className="mob-tt-hour" style={{ top: (h - firstH) * PX_H }}>
            <span className="mob-tt-hlabel">{fmtTime(h, 0)}</span>
            <span className="mob-tt-hline" />
          </div>
        ))}

        {/* Empty-day hint */}
        {scheduled.length === 0 && (
          <div className="mob-tt-empty-hint" style={{ top: (totalH / 2) - 20 }}>
            Tap to schedule a task
          </div>
        )}

        {/* Current time indicator */}
        {showNow && (
          <div className="mob-tt-now" style={{ top: nowTop }}>
            <span className="mob-tt-ndot" />
            <span className="mob-tt-nbar" />
          </div>
        )}

        {/* Drag time badge — shows current minute while dragging */}
        {dragId && (
          <div className="mob-tt-drag-badge" style={{ top: dragTop }}>
            {fmtTime(dragH, dragM)}
          </div>
        )}

        {/* Tasks */}
        {withCols.map(t => {
          const isDragging = dragId === t.id;
          const tp    = t.type ?? "task";
          const group = getGroup(t.groupId);
          const gc    = tp === "deadline" ? "#ef4444"
                      : tp === "break"    ? "#94a3b8"
                      : group?.color ?? "var(--accent)";
          const top       = isDragging ? dragTop : (t._s - firstH * 60) * PX_M;
          const height    = Math.max(6, (t._e - t._s) * PX_M - 2);
          const showTitle = height >= 18;
          const showMeta  = height >= 42;
          const isPast = effectiveDate === today && t._s < nowMin;
          const isNext = !isDragging && withCols.find(x => !x.completed && x._s >= nowMin) === t;

          return (
            <div key={t.id}
              className={[
                "mob-tt-task",
                height < 18     ? "tt-tiny"   : "",
                t.completed      ? "tt-done"  : "",
                isPast && !t.completed && !isDragging ? "tt-past"  : "",
                isNext           ? "tt-next"  : "",
                tp === "break"   ? "tt-break" : "",
                tp === "deadline"? "tt-dl"    : "",
                isDragging       ? "tt-dragging" : "",
              ].filter(Boolean).join(" ")}
              style={{
                top, height,
                "--gc":  gc,
                "--col": isDragging ? 0 : t._col,
                "--nc":  isDragging ? 1 : t._nc,
              }}
              onClick={() => {
                if (clickBlockRef.current) return;
                setEditingTask(t);
              }}
              onTouchStart={(e) => handleTaskTouchStart(e, t)}>
              {isDragging && <div className="mob-tt-drag-bar" />}
              <div className="mob-tt-inner">
                {showTitle && (
                  <span className="mob-tt-title">
                    {t.title || (tp === "break" ? "Break" : "Deadline")}
                  </span>
                )}
                {showMeta && (
                  <span className="mob-tt-meta">
                    {fmtTime(
                      isDragging ? dragH : t.startHour,
                      isDragging ? dragM : (t.startMinute ?? 0)
                    )}{t.duration ? ` · ${fmtDur(t.duration)}` : ""}
                  </span>
                )}
              </div>
              {tp === "task" && !isDragging && showTitle && (
                <button className={`mob-tt-cb${t.completed ? " done" : ""}`}
                  onClick={e => { e.stopPropagation(); toggleTask(t.id); }}>
                  {t.completed && <Check size={9} strokeWidth={3} />}
                </button>
              )}
              {tp === "deadline" && showTitle && <span className="mob-tt-dl-icon"><Flag size={10}/></span>}
            </div>
          );
        })}
      </div>

      {/* Unscheduled tasks */}
      {unscheduled.length > 0 && (
        <div className="mob-tt-unsched">
          <p className="mob-tt-usec-lbl">Unscheduled</p>
          {unscheduled.map(t => {
            const tp    = t.type ?? "task";
            const group = getGroup(t.groupId);
            const gc    = tp === "deadline" ? "#ef4444"
                        : tp === "break"    ? "#94a3b8"
                        : group?.color ?? "var(--accent)";
            return (
              <div key={t.id}
                className={`mob-tt-ui${t.completed ? " tt-done" : ""}`}
                style={{ "--gc": gc }}
                onClick={() => setEditingTask(t)}>
                <span className="mob-tt-title" style={{ flex: 1 }}>
                  {t.title || (tp === "break" ? "Break" : "Task")}
                </span>
                {tp === "task" && (
                  <button className={`mob-tt-cb${t.completed ? " done" : ""}`}
                    onClick={e => { e.stopPropagation(); toggleTask(t.id); }}>
                    {t.completed && <Check size={9} strokeWidth={3} />}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Month / Calendar view ────────────────────────────────────
function MobileMonth({ ctx, onSelectDate }) {
  const { tasks, today, setEditingTask } = ctx;
  const [cur, setCur] = useState(() => {
    const [y, m] = today.split("-");
    return { year: Number(y), month: Number(m) - 1 };
  });
  const [sel, setSel] = useState(today);

  const { year, month } = cur;
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7; // 0=Mon … 6=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const taskMap = {};
  tasks.forEach((t) => {
    if (!taskMap[t.date]) taskMap[t.date] = [];
    taskMap[t.date].push(t);
  });

  const shiftMonth = (d) => {
    setCur(({ year, month }) => {
      let nm = month + d, ny = year;
      if (nm < 0) { nm = 11; ny--; }
      if (nm > 11) { nm = 0; ny++; }
      return { year: ny, month: nm };
    });
  };

  const cells = Array.from({ length: Math.ceil((firstDay + daysInMonth) / 7) * 7 }, (_, i) => {
    const day = i - firstDay + 1;
    if (day < 1 || day > daysInMonth) return null;
    const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return { day, ds, ts: taskMap[ds] || [] };
  });

  const selTasks = taskMap[sel] || [];

  return (
    <div className="mob-month-view">
      <div className="mob-month-nav">
        <button className="mob-month-nav-btn" onClick={() => shiftMonth(-1)}><ChevronLeft size={20} /></button>
        <span className="mob-month-title">{MONTHS[month]} {year}</span>
        <button className="mob-month-nav-btn" onClick={() => shiftMonth(1)}><ChevronRight size={20} /></button>
      </div>

      <div className="mob-cal-grid">
        {["Mo","Tu","We","Th","Fr","Sa","Su"].map((d) => (
          <div key={d} className="mob-cal-dow">{d}</div>
        ))}
        {cells.map((cell, i) => {
          if (!cell) return <div key={i} className="mob-cal-empty" />;
          const { day, ds, ts } = cell;
          const isToday = ds === today;
          const isSel = ds === sel;
          const hasDl      = ts.some((t) => t.type === "deadline");
          const doneCount  = ts.filter((t) => t.completed && t.type !== "break").length;
          const pendCount  = ts.filter((t) => !t.completed && t.type !== "break" && t.type !== "deadline").length;
          return (
            <div key={ds}
              className={`mob-cal-cell${isToday ? " mob-cal-today" : ""}${isSel ? " mob-cal-sel" : ""}`}
              onClick={() => setSel(ds)}>
              <span className="mob-cal-num">{day}</span>
              <div className="mob-cal-dots">
                {hasDl && <span className="mob-dot mob-dot-dl" />}
                {doneCount > 0 && <span className="mob-dot mob-dot-done" />}
                {pendCount > 0 && <span className="mob-dot" />}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mob-cal-day-panel">
        <div className="mob-section-title">
          <CalendarDays size={13} />
          {sel === today ? "Today" : sel}
          <span className="mob-cal-task-count">{selTasks.length} item{selTasks.length !== 1 ? "s" : ""}</span>
          {onSelectDate && (
            <button className="mob-cal-view-day-btn" onClick={() => onSelectDate(sel)}>
              View Day →
            </button>
          )}
        </div>
        {selTasks.length === 0 ? (
          <p className="mob-cal-empty-msg">Nothing planned</p>
        ) : (
          selTasks.map((t) => {
            const tp = t.type ?? "task";
            const color = tp === "deadline" ? "#ef4444" : tp === "break" ? "#94a3b8" : "var(--accent)";
            return (
              <div key={t.id} className={`mob-cal-task-row${t.completed ? " done" : ""}`}
                style={{ borderLeftColor: color }}
                onClick={() => setEditingTask(t)}>
                <span className="mob-cal-task-name">{t.title || (tp === "break" ? "Break" : "Deadline")}</span>
                {t.startHour != null && <span className="mob-cal-task-time">{fmtTime(t.startHour, t.startMinute ?? 0)}</span>}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Tasks view ───────────────────────────────────────────────
function MobileTasks({ ctx }) {
  const { tasks, today, toggleTask, skipTask, setRescheduleTask, setEditingTask, groups, setFocusTask,
          setSharingTask } = ctx;
  const [filterType, setFilterType]       = useState(null);
  const [filterGroup, setFilterGroup]     = useState(null);
  const [filterComplex, setFilterComplex] = useState(null);
  const [showFilters, setShowFilters]     = useState(false);

  const getGroup = (id) => groups.find((g) => g.id === id);

  const sorted = [...tasks]
    .filter((t) => {
      if (filterType   && (t.type ?? "task") !== filterType)     return false;
      if (filterGroup  && t.groupId !== filterGroup)              return false;
      if (filterComplex && t.complexity !== filterComplex)        return false;
      return true;
    })
    .sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      const at = a.startHour != null ? a.startHour * 60 + (a.startMinute ?? 0) : 9999;
      const bt = b.startHour != null ? b.startHour * 60 + (b.startMinute ?? 0) : 9999;
      return at - bt;
    });

  const hasFilters = filterType || filterGroup || filterComplex;

  const active    = sorted.filter((t) => !t.completed);
  const completed = sorted.filter((t) => t.completed).slice(0, 10);

  // Group active tasks by date
  const tomorrow = (() => {
    const d = new Date(today + "T00:00:00");
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  })();

  const deferred = active.filter((t) => t.date < today);
  const todayItems = active.filter((t) => t.date === today);
  const tomorrowItems = active.filter((t) => t.date === tomorrow);
  const future = active.filter((t) => t.date > tomorrow);

  // Group future tasks by date
  const futureByDate = [];
  let lastFutureDate = null;
  future.forEach((t) => {
    if (t.date !== lastFutureDate) {
      futureByDate.push({ date: t.date, items: [] });
      lastFutureDate = t.date;
    }
    futureByDate[futureByDate.length - 1].items.push(t);
  });

  const renderTask = (t) => {
    const tp    = t.type ?? "task";
    const group = getGroup(t.groupId);
    const gc    = tp === "deadline" ? "#ef4444"
                : tp === "break"    ? "#94a3b8"
                : group?.color ?? "var(--accent)";
    const isDeferred = !t.completed && t.date < today;
    return (
      <div key={t.id}
        className={`mob-task-row${t.completed ? " mtr-done" : ""}${isDeferred ? " mtr-deferred" : ""}`}
        style={{ "--gc": gc }}
        onClick={() => setEditingTask(t)}>

        <div className="mtr-left">
          {tp === "task" ? (
            <button className={`mob-check${t.completed ? " checked" : ""}`}
              onClick={(e) => { e.stopPropagation(); toggleTask(t.id); }}>
              {t.completed && <Check size={13} strokeWidth={3} />}
            </button>
          ) : (
            <span className="mtr-icon">
              {tp === "deadline"
                ? <Flag size={15} style={{ color: t.completed ? "#22c55e" : "#ef4444" }} />
                : <Coffee size={14} style={{ color: "#94a3b8" }} />}
            </span>
          )}
        </div>

        <div className="mtr-body">
          <span className="mtr-title">{shortTitle(t.title) || (tp === "break" ? "Break" : "Deadline")}</span>
          <span className="mtr-meta">
            {t.startHour != null && <span>{fmtTime(t.startHour, t.startMinute ?? 0)} </span>}
            {t.duration && <span>{fmtDur(t.duration)}</span>}
          </span>
        </div>

        {(tp === "deadline" || !t.completed) && (
          <div className="mtr-actions" onClick={(e) => e.stopPropagation()}>
            {tp === "deadline" && (
              <button
                className={`mtr-act mtr-act-done-dl${t.completed ? " dl-done" : ""}`}
                onClick={() => toggleTask(t.id)}>
                <Check size={13} />
              </button>
            )}
            {tp === "task" && !t.completed && (
              <button className="mtr-act mtr-act-focus" title="Start focus session" onClick={() => setFocusTask(t)}>
                <Zap size={15} />
              </button>
            )}
            {tp === "task" && !t.completed && (
              <button className="mtr-act" title="Skip to tomorrow" onClick={() => skipTask(t.id)}>
                <SkipForward size={15} />
              </button>
            )}
            {tp === "task" && !t.completed && (
              <button className="mtr-act mtr-act-ai" title="Move task" onClick={() => setRescheduleTask(t)}>
                <CalendarDays size={15} />
              </button>
            )}
            <button className="mtr-act mtr-act-share" title="Share"
              onClick={() => setSharingTask?.(t)}>
              {t.sharedObjectId
                ? <Users size={14} style={{ color: "var(--accent)" }} />
                : <Share2 size={14} />}
            </button>
          </div>
        )}
      </div>
    );
  };

  const DaySection = ({ label, items, accent }) => {
    if (!items.length) return null;
    return (
      <div className="mob-tasks-day-group">
        <div className={`mob-tasks-day-header${accent ? " mob-day-hdr-accent" : ""}`}>{label}
          <span className="mob-tasks-day-count">{items.length}</span>
        </div>
        {items.map((t) => renderTask(t))}
      </div>
    );
  };

  const fmt = (ds) => {
    const d = new Date(ds + "T00:00:00");
    return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  };

  return (
    <div className="mob-tasks">
      {/* Filter bar */}
      <div className="mob-filter-bar">
        <button
          className={`mob-filter-toggle${showFilters ? " active" : ""}${hasFilters ? " has-active" : ""}`}
          onClick={() => setShowFilters(f => !f)}>
          <List size={14} /> Filters{hasFilters ? " ●" : ""}
        </button>
        {hasFilters && (
          <button className="mob-filter-clear" onClick={() => { setFilterType(null); setFilterGroup(null); setFilterComplex(null); }}>
            Clear
          </button>
        )}
      </div>
      {showFilters && (
        <div className="mob-filters-panel">
          {/* Type */}
          <div className="mob-filter-section">
            <span className="mob-filter-lbl">Type</span>
            <div className="mob-filter-pills">
              {[["All", null], ["Task", "task"], ["Deadline", "deadline"], ["Break", "break"]].map(([l, v]) => (
                <button key={l} className={`mob-filter-pill${filterType === v ? " active" : ""}`}
                  onClick={() => setFilterType(v)}>{l}</button>
              ))}
            </div>
          </div>
          {/* Complexity */}
          <div className="mob-filter-section">
            <span className="mob-filter-lbl">Complexity</span>
            <div className="mob-filter-pills">
              {[["All", null], ["Easy", "easy"], ["Medium", "medium"], ["Hard", "hard"]].map(([l, v]) => (
                <button key={l} className={`mob-filter-pill${filterComplex === v ? " active" : ""}`}
                  onClick={() => setFilterComplex(v)}>{l}</button>
              ))}
            </div>
          </div>
          {/* Groups */}
          {groups.length > 0 && (
            <div className="mob-filter-section">
              <span className="mob-filter-lbl">Group</span>
              <div className="mob-filter-pills">
                <button className={`mob-filter-pill${!filterGroup ? " active" : ""}`} onClick={() => setFilterGroup(null)}>All</button>
                {groups.map(g => (
                  <button key={g.id} className={`mob-filter-pill${filterGroup === g.id ? " active" : ""}`}
                    style={filterGroup === g.id ? { background: g.color + "25", borderColor: g.color, color: g.color } : {}}
                    onClick={() => setFilterGroup(g.id)}>
                    <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: g.color, marginRight: 4 }} />
                    {g.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {sorted.length === 0 ? (
        <div className="mob-empty-state">
          <CalendarDays size={36} style={{ opacity: .15 }} />
          <p>{hasFilters ? "No tasks match these filters." : "No tasks yet."}</p>
        </div>
      ) : (
        <>
          {deferred.length > 0 && (
            <div className="mob-tasks-day-group">
              <div className="mob-tasks-day-header mob-day-hdr-deferred">
                Pending <span className="mob-tasks-day-count">{deferred.length}</span>
              </div>
              {deferred.map((t) => renderTask(t))}
            </div>
          )}
          <DaySection label="Today" items={todayItems} accent />
          <DaySection label="Tomorrow" items={tomorrowItems} />
          {futureByDate.map(({ date, items }) => (
            <DaySection key={date} label={fmt(date)} items={items} />
          ))}
          {completed.length > 0 && (
            <div className="mob-tasks-day-group">
              <div className="mob-tasks-day-header mob-day-hdr-done">
                Completed <span className="mob-tasks-day-count">{completed.length}</span>
              </div>
              {completed.map((t) => renderTask(t))}
            </div>
          )}
        </>
      )}

      <div className="mob-task-create-row">
        <button className="mob-quick-add" onClick={() => {
          ctx.setEditingTask({
            id: uid(), type: "task", title: "", date: today,
            startHour: null, startMinute: null, duration: null,
            repeat: null, repeatEnd: null, completed: false,
            notes: "", complexity: null, groupId: null, reminderOffset: null,
          });
        }}>
          <Plus size={18} /> Add task
        </button>
        <button className="mob-join-task" onClick={() => ctx.setShowJoinCode?.(true)}>
          <KeyRound size={18} /> Join task
        </button>
      </div>
    </div>
  );
}

// ── Notes view ───────────────────────────────────────────────
function MobileNotes({ ctx }) {
  const { notes, setNotes, deleteNote, patchNote } = ctx;
  const [openId,      setOpenId]      = useState(null);
  const [deletingId,  setDeletingId]  = useState(null);
  const [newNoteId,   setNewNoteId]   = useState(null);
  const [noteSearch,  setNoteSearch]  = useState("");

  const openNote = openId ? notes.find(n => n.id === openId) : null;
  const migrated = openNote ? migrateNote(openNote) : null;

  const closeNote = () => {
    if (openNote) {
      const m = migrateNote(openNote);
      const isEmpty = !m.title?.trim() && !m.content?.trim() && !m.items?.length;
      const justCreated = (Date.now() - (openNote.createdAt ?? 0)) < 30_000;
      if (isEmpty && justCreated) deleteNote(openNote.id);
    }
    setOpenId(null);
  };

  const handleDelete = (id) => {
    setDeletingId(id);
    if (openId === id) setOpenId(null);
    setTimeout(() => { deleteNote(id); setDeletingId(null); }, 200);
  };

  const handleCreate = (type = "note") => {
    const n = { id: uid(), type, title: "", content: "", items: [], color: "cream", pinned: false, starred: false, createdAt: Date.now(), updatedAt: Date.now() };
    setNotes(p => [...p, n]);
    setNewNoteId(n.id);
    setTimeout(() => setNewNoteId(null), 400);
    setOpenId(n.id);
  };

  const migratedNotes = notes.map(migrateNote);
  const filtered = migratedNotes.filter(n => {
    if (!noteSearch) return true;
    const q = noteSearch.toLowerCase();
    return n.title?.toLowerCase().includes(q) ||
           n.content?.toLowerCase().includes(q) ||
           n.items?.some(i => i.text?.toLowerCase().includes(q));
  });
  const sorted = [...filtered].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.starred !== b.starred) return a.starred ? -1 : 1;
    return (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0);
  });
  const pinnedNotes = sorted.filter(n => n.pinned);
  const otherNotes  = sorted.filter(n => !n.pinned);

  const renderNoteCard = (note) => (
    <NoteCard
      key={note.id}
      note={note}
      deleting={deletingId === note.id}
      isNew={newNoteId === note.id}
      onClick={() => setOpenId(note.id)}
      onDelete={() => handleDelete(note.id)}
      onPin={() => patchNote(note.id, { pinned: !note.pinned })}
      onStar={() => patchNote(note.id, { starred: !note.starred })}
    />
  );

  // Split notes into two explicit columns (avoids CSS columns overlap bug)
  const splitColumns = (notes) => {
    const left  = notes.filter((_, i) => i % 2 === 0);
    const right = notes.filter((_, i) => i % 2 === 1);
    return { left, right };
  };

  const renderMasonry = (notes) => {
    const { left, right } = splitColumns(notes);
    return (
      <div className="mob-notes-masonry">
        <div className="mob-notes-col">{left.map(renderNoteCard)}</div>
        <div className="mob-notes-col">{right.map(renderNoteCard)}</div>
      </div>
    );
  };

  const [firstType, ...typeShortcuts] = NOTE_TYPE_DEFS;

  return (
    <>
      <div className="mob-notes-v2">

        {/* ── New-note creation bar ── */}
        <div className="mob-notes-newbar">
          <button
            className="mob-notes-newbar-main"
            onClick={() => handleCreate("note")}
          >
            <firstType.icon size={16} className="mob-notes-newbar-icon" />
            <span className="mob-notes-newbar-hint">New note…</span>
          </button>
          <div className="mob-notes-newbar-divider" />
          <div className="mob-notes-newbar-types">
            {typeShortcuts.map(t => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  className="mob-notes-newbar-type-btn"
                  onClick={() => handleCreate(t.key)}
                  title={t.label}
                >
                  <Icon size={15} />
                </button>
              );
            })}
          </div>
        </div>

        {/* Search */}
        <div className="mob-notes-search-bar">
          <Search size={13} className="mob-notes-search-icon" />
          <input
            className="mob-notes-search-input"
            value={noteSearch}
            onChange={e => setNoteSearch(e.target.value)}
            placeholder="Search notes…"
          />
          {noteSearch && (
            <button className="mob-notes-search-clear" onClick={() => setNoteSearch("")}>
              <X size={12} />
            </button>
          )}
        </div>

        {/* Empty state */}
        {sorted.length === 0 && (
          <div className="mob-empty-state" style={{ padding: "40px 0" }}>
            <FileText size={36} style={{ opacity: .12 }} />
            <p>{noteSearch ? "No notes match." : "Tap \"New note\" above to get started."}</p>
          </div>
        )}

        {/* Pinned section */}
        {pinnedNotes.length > 0 && (
          <>
            <div className="mob-notes-section-hdr">Pinned</div>
            {renderMasonry(pinnedNotes)}
          </>
        )}

        {/* Other notes */}
        {otherNotes.length > 0 && (
          <>
            {pinnedNotes.length > 0 && <div className="mob-notes-section-hdr">Notes</div>}
            {renderMasonry(otherNotes)}
          </>
        )}
      </div>

      {/* Note editor — bottom sheet, outside scroll container */}
      {migrated && (
        <NoteEditor
          note={migrated}
          isMobile={true}
          onPatch={fields => patchNote(openNote.id, fields)}
          onDelete={() => handleDelete(openNote.id)}
          onClose={closeNote}
        />
      )}
    </>
  );
}

// ── Settings view ────────────────────────────────────────────
function MobNameEditor({ name, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(name ?? "");
  const inputRef = useRef(null);

  const startEdit = () => { setDraft(name ?? ""); setEditing(true); setTimeout(() => inputRef.current?.focus(), 60); };
  const confirm   = () => { onSave(draft.trim()); setEditing(false); };
  const cancel    = () => setEditing(false);

  if (editing) return (
    <div className="mob-name-editor-row">
      <input ref={inputRef} className="mob-name-input" value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") confirm(); if (e.key === "Escape") cancel(); }}
        placeholder="Your name" />
      <button className="mob-name-confirm" onClick={confirm}><Check size={14} strokeWidth={3} /></button>
      <button className="mob-name-cancel"  onClick={cancel}><X size={14} /></button>
    </div>
  );

  return (
    <div className="mob-name-editor-row">
      <span className="mob-sett-display-name">{name || "No name set"}</span>
      <button className="mob-name-pencil" onClick={startEdit}><Pencil size={13} /></button>
    </div>
  );
}

const GROUP_PRESET_COLORS = ["#ef4444","#f97316","#eab308","#22c55e","#06b6d4","#3b82f6","#8b5cf6","#ec4899"];

function MobileSettings({ ctx }) {
  const { t, i18n } = useTranslation();
  const {
    accountName, setAccountName,
    dark, setDark,
    theme, setTheme,
    reminderMins, setReminderMins,
    session, groups, setGroups,
    notifPermission, notifSettings, updateNotifSettings, requestNotifPermission,
    userProfile, setShowProfileModal,
    assistantSettings, updateAssistantSettings,
  } = ctx;

  const [newGroupName,  setNewGroupName]  = useState("");
  const [newGroupColor, setNewGroupColor] = useState(GROUP_PRESET_COLORS[0]);

  const addGroup = () => {
    const name = newGroupName.trim();
    if (!name) return;
    if (groups.some(g => g.name.toLowerCase() === name.toLowerCase())) return;
    setGroups(g => [...g, { id: uid(), name, color: newGroupColor }]);
    setNewGroupName("");
  };
  const deleteGroup = (id) => {
    if (id === "private" || id === "work") return;
    setGroups(g => g.filter(x => x.id !== id));
  };

  return (
    <div className="mob-settings">
      {/* Profile */}
      <div className="mob-sett-card">
        <div className="mob-sett-card-title"><User size={15} /> {t("account.profile")}</div>
        <div className="mob-sett-avatar-row">
          <button className="mob-sett-avatar-btn" onClick={() => setShowProfileModal?.(true)}>
            <AvatarDisplay avatar={profileToAvatar(userProfile)} size={44} />
          </button>
          <div className="mob-sett-avatar-info">
            <MobNameEditor name={accountName} onSave={setAccountName} />
            <span className="mob-sett-email-sm">{session?.user?.email}</span>
            {userProfile?.username && (
              <span className="mob-sett-username">@{userProfile.username}</span>
            )}
          </div>
        </div>
        <button className="mob-edit-profile-btn" onClick={() => setShowProfileModal?.(true)}>
          {t("account.editProfileAvatar")}
        </button>
        <button className="mob-edit-profile-btn" onClick={() => ctx.setShowJoinCode?.(true)}>
          <KeyRound size={14} /> {t("account.joinInviteCode")}
        </button>
      </div>

      {/* Appearance */}
      <div className="mob-sett-card">
        <div className="mob-sett-card-title"><Activity size={15} /> {t("settings.appearance")}</div>
        <div className="mob-sett-row">
          <span className="mob-sett-row-label">{t("settings.darkMode")}</span>
          <button className={`mob-toggle${dark ? " on" : ""}`} onClick={() => setDark((d) => !d)}>
            <span className="mob-toggle-knob" />
          </button>
        </div>
        <div className="mob-sett-divider" />
        <div className="mob-sett-row">
          <span className="mob-sett-row-label">{t("settings.theme")}</span>
        </div>
        <div className="mob-theme-pills">
          <button className={`mob-theme-pill${theme === "default" ? " active" : ""}`}
            onClick={() => setTheme("default")}>{t("settings.default")}</button>
          <button className={`mob-theme-pill${theme === "liquid_glass" ? " active" : ""}`}
            onClick={() => setTheme("liquid_glass")}>{t("settings.liquidGlass")}</button>
        </div>
        <div className="mob-sett-divider" />
        <div className="mob-sett-row">
          <span className="mob-sett-row-label">{t("settings.language")}</span>
        </div>
        <div className="mob-theme-pills">
          <button className={`mob-theme-pill${i18n.resolvedLanguage === "en" ? " active" : ""}`}
            onClick={() => i18n.changeLanguage("en")}>🇬🇧 EN</button>
          <button className={`mob-theme-pill${i18n.resolvedLanguage === "de" ? " active" : ""}`}
            onClick={() => i18n.changeLanguage("de")}>🇩🇪 DE</button>
          <button className={`mob-theme-pill${i18n.resolvedLanguage === "ru" ? " active" : ""}`}
            onClick={() => i18n.changeLanguage("ru")}>🇷🇺 RU</button>
        </div>
      </div>

      {/* AI experience */}
      <div className="mob-sett-card">
        <div className="mob-sett-card-title"><Sparkle size={15} /> {t("settings.twoAssistantMode")}</div>
        <div className="mob-sett-row">
          <span className="mob-sett-row-label">{t("settings.twoAssistantMode")}</span>
          <button className={`mob-toggle${assistantSettings.twoAssistantMode ? " on" : ""}`}
            onClick={() => updateAssistantSettings({ twoAssistantMode: !assistantSettings.twoAssistantMode })}>
            <span className="mob-toggle-knob" />
          </button>
        </div>
        {assistantSettings.twoAssistantMode && (
          <p className="mob-sett-hint">{t("settings.twoAssistantModeDesc")}</p>
        )}
      </div>

      {/* Notifications */}
      <div className="mob-sett-card">
        <div className="mob-sett-card-title"><Bell size={15} /> {t("settings.notifications")}</div>
        <NotificationSettings
          permission={notifPermission}
          settings={notifSettings}
          updateSettings={updateNotifSettings}
          onRequestPermission={requestNotifPermission}
          reminderMins={reminderMins}
          setReminderMins={setReminderMins}
          health={ctx.notifHealth}
          sendTestNotification={ctx.sendTestNotification}
          testServerPush={ctx.testServerPush}
          forceResubscribe={ctx.forceResubscribe}
        />
      </div>

      {/* Places & Transport */}
      <div className="mob-sett-card">
        <div className="mob-sett-card-title"><MapPin size={15} /> Places</div>
        <SavedPlacesManager
          savedPlaces={ctx.savedPlaces ?? []}
          onSavedPlacesChange={ctx.setSavedPlaces ?? (() => {})}
          transportProfile={ctx.transportProfile ?? { defaultMode: "mixed" }}
          onTransportProfileChange={ctx.setTransportProfile ?? (() => {})}
        />
      </div>

      {/* Groups */}
      <div className="mob-sett-card">
        <div className="mob-sett-card-title"><Activity size={15} /> {t("account.taskGroups")}</div>
        {/* Existing groups */}
        {(groups || []).map(g => {
          const isBuiltin = g.id === "private" || g.id === "work";
          return (
            <div key={g.id} className="mob-group-row">
              <span className="mob-group-dot" style={{ background: g.color }} />
              <span className="mob-group-name">{g.name}</span>
              {isBuiltin
                ? <span className="mob-group-builtin">{t("account.builtin")}</span>
                : <button className="mob-group-del" onClick={() => deleteGroup(g.id)} aria-label={`Delete ${g.name}`}>
                    <Trash2 size={14} />
                  </button>
              }
            </div>
          );
        })}
        {/* Add new group */}
        <div className="mob-group-add-row">
          <div className="mob-group-colors">
            {GROUP_PRESET_COLORS.map(c => (
              <button key={c}
                className={`mob-group-color-dot${newGroupColor === c ? " active" : ""}`}
                style={{ background: c, "--dot-color": c }}
                onClick={() => setNewGroupColor(c)}
                aria-label={c} />
            ))}
          </div>
          <div className="mob-group-input-row">
            <input className="mob-sett-input" value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addGroup(); }}
              placeholder={t("account.newGroupName")} />
            <button className="mob-group-add-btn"
              style={{ background: newGroupColor, opacity: newGroupName.trim() ? 1 : 0.4 }}
              onClick={addGroup} disabled={!newGroupName.trim()}>
              <Plus size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Account */}
      <div className="mob-sett-card">
        <div className="mob-sett-card-title"><User size={15} /> {t("account.account")}</div>
        <p className="mob-sett-email-text">{session?.user?.email}</p>
        {/* Upgrade button */}
        <button
          className="mob-upgrade-btn"
          onClick={() => ctx.setPricingOpen?.(true)}
        >
          <span className="mob-upgrade-plan-badge">
            {ctx.subscription?.plan === "free"  ? "Free"
           : ctx.subscription?.plan === "plus"  ? "Plus"
           : ctx.subscription?.plan === "pro"   ? "Pro"
           : ctx.subscription?.plan === "team"  ? "Team"
           : "Free"}
          </span>
          {ctx.subscription?.plan === "free" ? "Upgrade to Pro" : "Manage Subscription"}
        </button>
        <button className="mob-signout-btn" onClick={() => supabase.auth.signOut()}>
          {t("account.signOut")}
        </button>
      </div>
    </div>
  );
}

// ── Chat overlay ─────────────────────────────────────────────
function MobileChat({ ctx }) {
  const { chatOpen, setChatOpen, messages, chatInput, setChatInput, chatLoading, sendChat,
          microStartMode, setMicroStartMode, dark,
          todayTasks = [], deferredTasks = [], energy, focus } = ctx;
  const [chatSuggestions, setChatSuggestions] = useState(DEFAULT_CHAT_CHIPS);
  const [chatGhost,       setChatGhost]       = useState("");
  const [aiChatSuggestions, setAiChatSuggestions] = useState(null);
  const [aiChatSugLoading,  setAiChatSugLoading]  = useState(false);
  const aiChatSugFetchedRef = useRef(false);
  const endRef      = useRef(null);
  const inputRef    = useRef(null);
  const [chatAtBottom, setChatAtBottom] = useState(true);
  const [suggestionsVisible, setSuggestionsVisible] = useState(() => {
    try { return localStorage.getItem("nora_mobile_chat_suggestions") !== "hidden"; }
    catch { return true; }
  });

  const toggleSuggestions = () => {
    setSuggestionsVisible((visible) => {
      const next = !visible;
      try { localStorage.setItem("nora_mobile_chat_suggestions", next ? "visible" : "hidden"); } catch {}
      return next;
    });
  };

  useEffect(() => {
    if (!chatOpen || !suggestionsVisible || aiChatSugFetchedRef.current) return;
    aiChatSugFetchedRef.current = true;
    setAiChatSugLoading(true);
    fetch("/api/tips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "chat_prompts",
        context: {
          todayTaskCount: todayTasks.length,
          todayTasks: todayTasks.slice(0, 4).map((t) => ({ title: t.title })),
          deferredCount: deferredTasks.length,
          dayOfWeek: new Date().toLocaleDateString("en-US", { weekday: "long" }),
          energy,
          focus,
        },
      }),
    })
      .then((r) => r.json())
      .then((d) => { if (d.tips?.length) setAiChatSuggestions(d.tips.slice(0, 3)); })
      .catch(() => {})
      .finally(() => setAiChatSugLoading(false));
  }, [chatOpen, suggestionsVisible]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
    setChatAtBottom(true);
  }, [messages, chatLoading]);

  // Reset textarea height when input is cleared after send
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    if (!chatInput) {
      el.style.height = "";   // remove inline height → CSS min-height takes over
    }
  }, [chatInput]);

  return (
    <div className={`mob-chat${chatOpen ? " mob-chat-open" : ""}`}>
      <div className="mob-chat-header">
        <div className="mob-chat-brand">
          <img src={dark ? "/logo-dark.png" : "/logo-light.png"} className="mob-chat-avatar-logo" alt="Nora" />
          <div>
            <div className="mob-chat-title-text">Nora</div>
            <div className="mob-chat-sub">Your productivity assistant</div>
          </div>
        </div>
        <button className="mob-chat-close" onClick={() => setChatOpen(false)}>
          <X size={20} />
        </button>
      </div>

      <div className="mob-chat-messages-wrap">
        <div className="mob-chat-messages"
          onScroll={(e) => {
            const el = e.currentTarget;
            setChatAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
          }}>
          {messages.map((m, i) => (
            <div key={i} className={`mob-chat-msg mob-chat-${m.role}`}>
              <div className="mob-chat-bubble">{m.content}</div>
            </div>
          ))}
          {chatLoading && (
            <div className="mob-chat-msg mob-chat-assistant">
              <div className="mob-chat-bubble mob-chat-typing">
                <span /><span /><span />
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
        {!chatAtBottom && (
          <button className="chat-scroll-btn"
            onClick={() => endRef.current?.scrollIntoView({ behavior: "smooth" })}>
            <ChevronDown size={16} />
          </button>
        )}
      </div>

      {suggestionsVisible && <div className="mob-chat-suggestions">
        {!chatInput ? (
          <div className="mob-chat-ai-bubbles">
            {aiChatSugLoading ? (
              [0, 1, 2].map((i) => <div key={i} className="mob-chat-ai-bubble-shimmer" />)
            ) : (
              (aiChatSuggestions ?? ["What should I focus on today?", "Help me plan my day", "How's my workload this week?"]).map((s, i) => (
                <button key={i} className="mob-chat-ai-bubble" onClick={() => {
                  setChatInput(s); setChatGhost(""); setChatSuggestions(DEFAULT_CHAT_CHIPS);
                  inputRef.current?.focus();
                }}>{s}</button>
              ))
            )}
          </div>
        ) : (
          chatSuggestions.length > 0 && (
            <div className="mob-chat-chips-pill">
              {chatSuggestions.map((s, i) => (
                <button key={i} className="mob-chat-chip" onClick={() => {
                  setChatInput(s); setChatGhost(""); setChatSuggestions(DEFAULT_CHAT_CHIPS);
                  inputRef.current?.focus();
                }}>{s}</button>
              ))}
            </div>
          )
        )}
      </div>}
      <div className="mob-chat-input-bar">
        <button
          className={`mob-suggestions-toggle${suggestionsVisible ? " on" : ""}`}
          onClick={toggleSuggestions}
          aria-label={suggestionsVisible ? "Hide suggested prompts" : "Show suggested prompts"}
          title={suggestionsVisible ? "Hide suggestions" : "Show suggestions"}>
          <Sparkles size={16} />
        </button>
        <button
          className={`mob-micro-btn${microStartMode ? " on" : ""}`}
          onClick={() => setMicroStartMode((m) => !m)}>
          <Zap size={15} />
        </button>
        <div className="mob-chat-input-wrap">
          {chatGhost && (
            <div className="mob-chat-ghost" aria-hidden="true">
              {chatInput}<span className="mob-chat-ghost-text">{chatGhost}</span>
            </div>
          )}
          <textarea
            ref={inputRef}
            className="mob-chat-input"
            value={chatInput}
            rows={2}
            onChange={(e) => {
              const val = e.target.value;
              setChatInput(val);
              const ghost = getChatGhost(val);
              setChatGhost(ghost);
              setChatSuggestions(getChatAlternatives(val, ghost));
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setChatGhost(""); setChatSuggestions(DEFAULT_CHAT_CHIPS);
              } else if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendChat();
                setChatGhost(""); setChatSuggestions(DEFAULT_CHAT_CHIPS);
              }
            }}
            placeholder="Ask Nora anything…" />
        </div>
        <button className="mob-chat-send" onClick={sendChat} disabled={chatLoading || !chatInput.trim()}>
          {chatLoading ? <span className="dot-spin" /> : <Send size={18} />}
        </button>
      </div>
    </div>
  );
}

// ── Reschedule modal ──────────────────────────────────────────
function MobileRescheduleModal({ task, onSave, onClose }) {
  const HOURS = Array.from({ length: 24 }, (_, i) => i);
  const pad2  = (n) => String(n).padStart(2, "0");
  const fmtH  = (h) => `${pad(h)}:00`;

  const [date,   setDate]   = useState(task.date);
  const [hour,   setHour]   = useState(task.startHour ?? "");
  const [minute, setMinute] = useState(task.startMinute ?? 0);
  const [notes,  setNotes]  = useState(task.notes ?? "");

  const handleSave = () => {
    onSave({
      ...task,
      date,
      startHour:   hour === "" ? null : Number(hour),
      startMinute: hour === "" ? null : Number(minute),
      notes,
    });
  };

  return (
    <div className="mob-modal-overlay" onClick={onClose}>
      <div className="mob-modal mob-reschedule-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mob-modal-handle" />
        <div className="mob-modal-header">
          <span className="mob-reschedule-title">Move task</span>
          <button className="mob-modal-close" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="mob-reschedule-task-name">{task.title || "Untitled"}</div>
        <div className="mob-modal-body">
          <div className="mob-modal-field">
            <label className="mob-modal-label">Date</label>
            <input type="date" className="mob-modal-select"
              value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="mob-modal-field">
            <label className="mob-modal-label">Time</label>
            <div className="mob-time-row">
              <select className="mob-modal-select mob-time-select"
                value={hour}
                onChange={(e) => setHour(e.target.value === "" ? "" : Number(e.target.value))}>
                <option value="">No time</option>
                {HOURS.map((h) => <option key={h} value={h}>{fmtH(h)}</option>)}
              </select>
              {hour !== "" && (
                <select className="mob-modal-select mob-min-select"
                  value={minute}
                  onChange={(e) => setMinute(Number(e.target.value))}>
                  {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                    <option key={m} value={m}>:{pad2(m)}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <div className="mob-modal-field">
            <label className="mob-modal-label">Notes</label>
            <textarea className="mob-modal-notes" rows={3}
              value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Why did it move?" />
          </div>
        </div>
        <div className="mob-modal-footer">
          <button className="mob-modal-delete" style={{ color: "var(--text-muted)", borderColor: "var(--border)" }} onClick={onClose}>
            Cancel
          </button>
          <button className="mob-modal-save" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ── Task edit modal ───────────────────────────────────────────
function MobileEditModal({ ctx }) {
  const { draft, setDraft, saveTask, deleteTask, groups, setSharingTask } = ctx; // eslint-disable-line

  return (
    <div className="mob-modal-overlay" onClick={() => ctx.setEditingTask(null)}>
      <div className="mob-modal" onClick={(e) => e.stopPropagation()}>

        <div className="mob-modal-handle" />

        <div className="mob-modal-header">
          <input
            className="mob-modal-title-input"
            value={draft.title}
            placeholder="Task title"
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            autoFocus />
          <button className="mob-modal-close" onClick={() => ctx.setEditingTask(null)}>
            <X size={20} />
          </button>
        </div>

        <div className="mob-modal-body">

          {/* Type */}
          <div className="mob-modal-field">
            <label className="mob-modal-label">Type</label>
            <div className="mob-type-row">
              {[["task","Task"],["deadline","Deadline"],["break","Break"]].map(([val, lbl]) => (
                <button key={val}
                  className={`mob-type-btn mob-type-${val}${(draft.type ?? "task") === val ? " active" : ""}`}
                  onClick={() => setDraft((d) => ({ ...d, type: val }))}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {/* Date */}
          <div className="mob-modal-field">
            <label className="mob-modal-label">Date</label>
            <input type="date" className="mob-modal-select"
              value={draft.date}
              onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} />
          </div>

          {/* Time */}
          <div className="mob-modal-field">
            <label className="mob-modal-label">Time</label>
            <div className="mob-modal-select mob-time-display">
              {draft.startHour != null
                ? fmtTime(draft.startHour, draft.startMinute ?? 0)
                : <span className="mob-time-empty">No time</span>}
              <input
                type="time"
                className="mob-time-native"
                value={draft.startHour != null ? `${pad(draft.startHour)}:${pad(draft.startMinute ?? 0)}` : ""}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) {
                    setDraft(d => ({ ...d, startHour: null, startMinute: null }));
                  } else {
                    const [h, m] = val.split(":").map(Number);
                    setDraft(d => ({ ...d, startHour: h, startMinute: m }));
                  }
                }}
              />
            </div>
          </div>

          {/* Duration */}
          {(draft.type ?? "task") !== "deadline" && (
            <div className="mob-modal-field">
              <label className="mob-modal-label">Duration</label>
              <select className="mob-modal-select"
                value={draft.duration ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, duration: e.target.value === "" ? null : Number(e.target.value) }))}>
                <option value="">No duration</option>
                {Array.from({ length: 48 }, (_, i) => (i + 1) * 5).map((m) => (
                  <option key={m} value={m}>{fmtDur(m)}</option>
                ))}
              </select>
            </div>
          )}

          {/* Repeat */}
          <div className="mob-modal-field">
            <label className="mob-modal-label">Repeat</label>
            <select className="mob-modal-select"
              value={draft.repeat ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, repeat: e.target.value || null }))}>
              <option value="">No repeat</option>
              <option value="daily">Every day</option>
              <option value="weekly">Every week</option>
              <option value="monthly">Every month</option>
            </select>
          </div>

          {/* Group */}
          {(draft.type ?? "task") === "task" && (
            <div className="mob-modal-field">
              <label className="mob-modal-label">Group</label>
              <div className="mob-pill-row">
                {groups.map((g) => (
                  <button key={g.id}
                    className={`mob-pill${draft.groupId === g.id ? " active" : ""}`}
                    style={{ "--gc": g.color }}
                    onClick={() => setDraft((d) => ({ ...d, groupId: d.groupId === g.id ? null : g.id }))}>
                    <span className="mob-gdot" />{g.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Complexity */}
          {(draft.type ?? "task") === "task" && (
            <div className="mob-modal-field">
              <label className="mob-modal-label">Complexity</label>
              <div className="mob-type-row">
                {[["easy","Easy","#22c55e"],["medium","Medium","#f59e0b"],["hard","Hard","#ef4444"]].map(([val, lbl, color]) => (
                  <button key={val}
                    className={`mob-type-btn mob-complexity-btn${draft.complexity === val ? " active" : ""}`}
                    style={draft.complexity === val ? { background: color + "22", borderColor: color, color } : {}}
                    onClick={() => setDraft((d) => ({ ...d, complexity: d.complexity === val ? null : val }))}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Location */}
          <div className="mob-modal-field">
            <label className="mob-modal-label">Location</label>
            <LocationField
              value={draft.location ?? null}
              onChange={(loc) => setDraft((d) => ({ ...d, location: loc }))}
              savedPlaces={ctx.savedPlaces ?? []}
            />
          </div>

          {/* Notes */}
          <div className="mob-modal-field">
            <label className="mob-modal-label">Notes</label>
            <textarea className="mob-modal-notes" rows={3}
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              placeholder="Add notes…" />
          </div>

        </div>

        <div className="mob-modal-footer">
          <button className="mob-modal-delete" onClick={() => deleteTask(draft.id)}>
            <Trash2 size={15} /> Delete
          </button>
          <button className="mob-modal-share" title="Share"
            onClick={() => { ctx.setEditingTask(null); setSharingTask?.(draft); }}>
            {draft.sharedObjectId ? <Users size={15} /> : <Share2 size={15} />}
          </button>
          <button className="mob-modal-save" onClick={saveTask}>Save</button>
        </div>

      </div>
    </div>
  );
}
