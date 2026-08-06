import React, { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  ChevronDown, ChevronUp, Eye, EyeOff, Grid2X2, Maximize2,
  Settings2, SlidersHorizontal, X,
} from "lucide-react";
import BrandStar from "../BrandStar";
import FocusWorkspace from "./FocusWorkspace";
import NowWorkspace from "./workspaces/NowWorkspace";
import {
  buildBehaviorInsights,
  buildDeskTimeline,
  computeDeskFocusStats,
  readFocusLog,
} from "./deskModeModel";
import { useAmbientIntelligence } from "./useAmbientIntelligence";
import { useDeskMedia } from "./useDeskMedia";
import { useDeskPreferences } from "./useDeskPreferences";
import { buildDailyReview, buildWeeklyIntelligence } from "../../domain/tasks/taskIntelligence";
import "./DeskMode.css";

const TimelineWorkspace = lazy(() => import("./workspaces/TimelineWorkspace"));
const MusicWorkspace = lazy(() => import("./workspaces/MusicWorkspace"));
const InsightsWorkspace = lazy(() => import("./workspaces/InsightsWorkspace"));
const JournalWorkspace = lazy(() => import("./workspaces/JournalWorkspace"));
const HealthWorkspace = lazy(() => import("./workspaces/HealthWorkspace"));

const FOCUS_SESSION_KEY = "nora_desk_focus_v2";
const pad = (value) => String(value).padStart(2, "0");
const formatTimer = (seconds) => `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function readFocusOverlay(now) {
  try {
    const session = JSON.parse(localStorage.getItem(FOCUS_SESSION_KEY) ?? "null");
    if (!session || !["running", "paused"].includes(session.phase)) return null;
    const remaining = session.phase === "running" && session.endAt
      ? Math.max(0, Math.ceil((session.endAt - now.getTime()) / 1000))
      : session.remainingSeconds;
    return formatTimer(remaining);
  } catch {
    return null;
  }
}

function DeskHeader({ workspaces, active, onChange, onCustomize }) {
  return (
    <header className="desk-header">
      <div className="desk-brand">
        <BrandStar size={19} tone="white" />
        <span>Nora</span>
        <i>Desk Mode</i>
      </div>
      <nav className="desk-workspace-nav" aria-label="Desk Mode workspaces">
        {workspaces.map((workspace) => (
          <button
            key={workspace.id}
            className={active === workspace.id ? "active" : ""}
            onClick={() => onChange(workspace.id)}
            aria-current={active === workspace.id ? "page" : undefined}
          >
            {workspace.label}
          </button>
        ))}
      </nav>
      <button className="desk-customize-button" onClick={onCustomize} aria-label="Customize Desk Mode">
        <Settings2 />
      </button>
    </header>
  );
}

function LoadingWorkspace() {
  return (
    <div className="desk-workspace-loading" aria-label="Loading workspace">
      <BrandStar size={24} tone="current" />
    </div>
  );
}

function CustomizeDesk({
  preferences,
  moveWidget,
  toggleWidget,
  cycleWidgetSize,
  toggleWorkspace,
  update,
  onClose,
}) {
  return (
    <div className="desk-customize-backdrop" onClick={onClose}>
      <section className="desk-customize" onClick={(event) => event.stopPropagation()} aria-labelledby="desk-customize-title">
        <header>
          <div><span className="desk-eyebrow">Personal dashboard</span><h2 id="desk-customize-title">Make Desk Mode yours</h2></div>
          <button onClick={onClose} aria-label="Close customization"><X /></button>
        </header>
        <div className="desk-customize-columns">
          <section>
            <h3><Grid2X2 size={14} /> Now widgets</h3>
            <p>Reorder, resize, or hide cards. The layout is remembered on this device.</p>
            <div className="desk-widget-settings">
              {preferences.widgets.map((widget, index) => (
                <div key={widget.id} className={widget.hidden ? "is-hidden" : ""}>
                  <span><strong>{widget.label}</strong><small>{widget.size}</small></span>
                  <button onClick={() => moveWidget(widget.id, -1)} disabled={index === 0} aria-label={`Move ${widget.label} earlier`}><ChevronUp /></button>
                  <button onClick={() => moveWidget(widget.id, 1)} disabled={index === preferences.widgets.length - 1} aria-label={`Move ${widget.label} later`}><ChevronDown /></button>
                  <button onClick={() => cycleWidgetSize(widget.id)} aria-label={`Resize ${widget.label}`}><Maximize2 /></button>
                  <button onClick={() => toggleWidget(widget.id)} aria-label={`${widget.hidden ? "Show" : "Hide"} ${widget.label}`}>{widget.hidden ? <Eye /> : <EyeOff />}</button>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h3><SlidersHorizontal size={14} /> Workspaces</h3>
            <p>Now always remains available. Other workspaces can be hidden.</p>
            <div className="desk-workspace-settings">
              {preferences.workspaceOrder.map((id) => (
                <label key={id}>
                  <input
                    type="checkbox"
                    checked={id === "now" || !preferences.hiddenWorkspaces.includes(id)}
                    disabled={id === "now"}
                    onChange={() => toggleWorkspace(id)}
                  />
                  <span>{id[0].toUpperCase() + id.slice(1)}</span>
                </label>
              ))}
            </div>
            <h3>Focus rhythm</h3>
            <label className="desk-setting-slider">
              <span>Focus session <strong>{preferences.focusMinutes} min</strong></span>
              <input type="range" min="15" max="120" step="5" value={preferences.focusMinutes} onChange={(event) => update({ ...preferences, focusMinutes: Number(event.target.value) })} />
            </label>
            <label className="desk-setting-slider">
              <span>Suggested break <strong>{preferences.breakMinutes} min</strong></span>
              <input type="range" min="3" max="20" value={preferences.breakMinutes} onChange={(event) => update({ ...preferences, breakMinutes: Number(event.target.value) })} />
            </label>
          </section>
        </div>
      </section>
    </div>
  );
}

export default function DeskMode({ ctx }) {
  const now = useClock();
  const {
    preferences,
    workspaces,
    update,
    moveWidget,
    toggleWidget,
    cycleWidgetSize,
    toggleWorkspace,
  } = useDeskPreferences();
  const [workspace, setWorkspace] = useState("now");
  const [customizing, setCustomizing] = useState(false);
  const timeline = useMemo(() => buildDeskTimeline(ctx.tasks ?? [], now), [ctx.tasks, now]);
  const focusStats = useMemo(
    () => computeDeskFocusStats(readFocusLog(localStorage), now),
    // Refresh naturally with the Desk clock.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [now.getMinutes(), workspace],
  );
  const ambientObservation = useAmbientIntelligence({ ctx, timeline, now, focusStats });
  const workflowReview = useMemo(
    () => buildDailyReview(ctx.tasks ?? [], ctx.today, focusStats.todayMinutes),
    [ctx.tasks, ctx.today, focusStats.todayMinutes],
  );
  const weeklyWorkflow = useMemo(
    () => buildWeeklyIntelligence(ctx.tasks ?? [], now),
    [ctx.tasks, now],
  );
  const behaviorInsights = useMemo(() => buildBehaviorInsights({
    tasks: ctx.tasks,
    healthSummary: ctx.healthSummary,
    focusStats,
    weekTrend: ctx.weekTrend,
    focusPatterns: ctx.focusPatterns,
  }), [ctx.focusPatterns, ctx.healthSummary, ctx.tasks, ctx.weekTrend, focusStats])
    .concat([
      workflowReview.observation,
      workflowReview.tomorrowSuggestion,
      ...weeklyWorkflow.insights,
    ].filter(Boolean))
    .slice(0, 8);
  const mediaController = useDeskMedia({
    ambientSound: preferences.ambientSound,
    ambientVolume: preferences.ambientVolume,
    onAmbientChange: ({ sound, volume }) => update((current) => ({
      ...current,
      ambientSound: sound,
      ambientVolume: volume,
    })),
  });
  const activeWorkspace = workspaces.some((item) => item.id === workspace) ? workspace : "now";
  const defaultFocusTask = ctx.focusTask ?? timeline.current ?? ctx.aiFocus?.priorityTask ?? timeline.next;
  const focusOverlay = readFocusOverlay(now);

  const openFocus = (task) => {
    ctx.setFocusTask?.(task);
    setWorkspace("focus");
  };

  let content;
  if (activeWorkspace === "now") {
    content = (
      <NowWorkspace
        ctx={ctx}
        now={now}
        timeline={timeline}
        observation={ambientObservation}
        widgets={preferences.widgets}
        media={mediaController.media}
        onOpenWorkspace={setWorkspace}
        onStartFocus={openFocus}
      />
    );
  } else if (activeWorkspace === "focus") {
    content = (
      <FocusWorkspace
        ctx={ctx}
        defaultTask={defaultFocusTask}
        focusMinutes={preferences.focusMinutes}
        breakMinutes={preferences.breakMinutes}
        media={mediaController.media}
        onOpenMusic={() => setWorkspace("music")}
        onExit={() => setWorkspace("now")}
      />
    );
  } else if (activeWorkspace === "timeline") {
    content = <TimelineWorkspace timeline={timeline} now={now} />;
  } else if (activeWorkspace === "music") {
    content = (
      <MusicWorkspace
        controller={mediaController}
        focusOverlay={focusOverlay}
        ambientSound={preferences.ambientSound}
        ambientVolume={preferences.ambientVolume}
      />
    );
  } else if (activeWorkspace === "insights") {
    content = <InsightsWorkspace insights={behaviorInsights} observation={ambientObservation} />;
  } else if (activeWorkspace === "journal") {
    content = <JournalWorkspace ctx={ctx} />;
  } else {
    content = <HealthWorkspace ctx={ctx} />;
  }

  const immersiveFocus = activeWorkspace === "focus" && Boolean(defaultFocusTask);
  return (
    <main className={`desk-mode native-ui dark${immersiveFocus ? " desk-mode-focus" : ""}`} aria-label="Nora Desk Mode">
      <div className="desk-ambient" aria-hidden="true" />
      {!immersiveFocus && (
        <DeskHeader
          workspaces={workspaces}
          active={activeWorkspace}
          onChange={setWorkspace}
          onCustomize={() => setCustomizing(true)}
        />
      )}
      <div className="desk-workspace-viewport">
        <Suspense fallback={<LoadingWorkspace />}>{content}</Suspense>
      </div>
      {!immersiveFocus && ambientObservation && (
        <div className="desk-ambient-whisper" aria-live="polite">
          <BrandStar size={13} tone="current" />
          <span>{ambientObservation}</span>
        </div>
      )}
      {customizing && (
        <CustomizeDesk
          preferences={preferences}
          moveWidget={moveWidget}
          toggleWidget={toggleWidget}
          cycleWidgetSize={cycleWidgetSize}
          toggleWorkspace={toggleWorkspace}
          update={update}
          onClose={() => setCustomizing(false)}
        />
      )}
    </main>
  );
}
