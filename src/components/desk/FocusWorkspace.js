import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Check, Coffee, FastForward, Headphones, Pause, Play, RotateCcw,
  Sparkles, Square, Target, Volume2, X,
} from "lucide-react";
import {
  buildFocusIntelligence,
  computeDeskFocusStats,
  focusCoachMessage,
  readFocusLog,
} from "./deskModeModel";

const SESSION_KEY = "nora_desk_focus_v2";
const pad = (value) => String(value).padStart(2, "0");
const formatTimer = (seconds) => `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;
const formatMinutes = (minutes) => minutes >= 60
  ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
  : `${minutes}m`;
const readSession = () => {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null"); } catch { return null; }
};
const appendFocusEvent = (event) => {
  try {
    const log = readFocusLog(localStorage);
    localStorage.setItem("nora_focus_log", JSON.stringify([...log, { ...event, ts: Date.now() }].slice(-500)));
  } catch {}
};

function FocusStat({ label, value }) {
  return <div className="desk-focus-stat"><strong>{value}</strong><span>{label}</span></div>;
}

export default function FocusWorkspace({
  ctx,
  defaultTask,
  focusMinutes,
  breakMinutes,
  media,
  onOpenMusic,
  onExit,
}) {
  const task = ctx.focusTask ?? defaultTask ?? null;
  const configuredSeconds = focusMinutes * 60;
  const stored = readSession();
  const canRestore = stored?.taskId && stored.taskId === task?.id && !["completed", "idle"].includes(stored.phase);
  const [session, setSession] = useState(() => canRestore ? stored : {
    taskId: task?.id ?? null,
    phase: task ? "ready" : "idle",
    totalSeconds: configuredSeconds,
    remainingSeconds: configuredSeconds,
    endAt: null,
    startedAt: null,
    distractions: 0,
  });
  const [tick, setTick] = useState(Date.now());
  const [statsVersion, setStatsVersion] = useState(0);
  const completionLoggedRef = useRef(false);

  useEffect(() => {
    if (task?.id && session.taskId !== task.id) {
      setSession({
        taskId: task.id,
        phase: "ready",
        totalSeconds: configuredSeconds,
        remainingSeconds: configuredSeconds,
        endAt: null,
        startedAt: null,
        distractions: 0,
      });
    }
  }, [configuredSeconds, session.taskId, task?.id]);

  useEffect(() => {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch {}
  }, [session]);

  const running = session.phase === "running" || session.phase === "break";
  const remaining = running && session.endAt
    ? Math.max(0, Math.ceil((session.endAt - tick) / 1000))
    : session.remainingSeconds;
  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(() => setTick(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [running]);
  useEffect(() => {
    if (!running || remaining > 0) return;
    if (session.phase === "break") {
      setSession((current) => ({
        ...current,
        phase: "break-complete",
        remainingSeconds: 0,
        endAt: null,
      }));
    } else {
      setSession((current) => ({ ...current, phase: "completed", remainingSeconds: 0, endAt: null }));
    }
  }, [configuredSeconds, remaining, running, session.phase]);

  const elapsedSeconds = session.phase === "break"
    ? breakMinutes * 60 - remaining
    : Math.max(0, session.totalSeconds - remaining);
  const stats = useMemo(
    () => computeDeskFocusStats(readFocusLog(localStorage), new Date()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [statsVersion, session.phase],
  );
  useEffect(() => {
    if (session.phase !== "completed" || completionLoggedRef.current) return;
    completionLoggedRef.current = true;
    appendFocusEvent({
      type: "completed",
      taskId: task?.id,
      taskTitle: task?.title,
      plannedDuration: Math.round(session.totalSeconds / 60),
      actual: Math.max(1, Math.round(elapsedSeconds / 60)),
      distractionCount: session.distractions,
    });
    setStatsVersion((value) => value + 1);
  }, [elapsedSeconds, session, task]);

  const start = () => {
    completionLoggedRef.current = false;
    const now = Date.now();
    setSession((current) => ({
      ...current,
      phase: "running",
      endAt: now + current.remainingSeconds * 1000,
      startedAt: current.startedAt ?? now,
    }));
    if (!session.startedAt) {
      appendFocusEvent({ type: "started", taskId: task?.id, taskTitle: task?.title, duration: Math.round(session.totalSeconds / 60) });
    }
  };
  const pause = () => setSession((current) => ({ ...current, phase: "paused", remainingSeconds: remaining, endAt: null }));
  const recordDistraction = () => {
    appendFocusEvent({ type: "distracted", taskId: task?.id });
    setSession((current) => ({ ...current, distractions: current.distractions + 1 }));
  };
  const complete = () => setSession((current) => ({
    ...current,
    phase: "completed",
    remainingSeconds: Math.max(0, remaining),
    endAt: null,
  }));
  const takeBreak = () => setSession((current) => ({
    ...current,
    phase: "break",
    totalSeconds: breakMinutes * 60,
    remainingSeconds: breakMinutes * 60,
    endAt: Date.now() + breakMinutes * 60 * 1000,
    startedAt: Date.now(),
  }));
  const reset = () => {
    completionLoggedRef.current = false;
    setSession({
      taskId: task?.id ?? null,
      phase: task ? "ready" : "idle",
      totalSeconds: configuredSeconds,
      remainingSeconds: configuredSeconds,
      endAt: null,
      startedAt: null,
      distractions: 0,
    });
  };
  const startFreshSession = () => {
    const now = Date.now();
    completionLoggedRef.current = false;
    setSession({
      taskId: task?.id ?? null,
      phase: "running",
      totalSeconds: configuredSeconds,
      remainingSeconds: configuredSeconds,
      endAt: now + configuredSeconds * 1000,
      startedAt: now,
      distractions: 0,
    });
    appendFocusEvent({
      type: "started",
      taskId: task?.id,
      taskTitle: task?.title,
      duration: Math.round(configuredSeconds / 60),
    });
  };
  const finish = () => {
    localStorage.removeItem(SESSION_KEY);
    ctx.setFocusTask?.(null);
    reset();
    onExit?.();
  };

  if (!task) {
    return (
      <section className="desk-workspace desk-focus-empty">
        <Target size={42} />
        <h1>Choose one commitment.</h1>
        <p>Schedule a task or open its action menu and start Focus. Desk Mode will remove everything else.</p>
      </section>
    );
  }

  if (session.phase === "completed") {
    const actualMinutes = Math.max(1, Math.round(elapsedSeconds / 60));
    const suggestedBreak = Math.max(5, Math.min(15, Math.round(actualMinutes / 7)));
    return (
      <section className="desk-workspace desk-focus-complete">
        <div className="desk-complete-mark"><Check /></div>
        <span className="desk-eyebrow">Great work</span>
        <h1>{actualMinutes} minutes completed</h1>
        <p>{session.distractions ? `${session.distractions} ${session.distractions === 1 ? "interruption" : "interruptions"}` : "No interruptions"}</p>
        <div className="desk-complete-summary">
          <FocusStat label="Today’s total" value={formatMinutes(stats.todayMinutes)} />
          <FocusStat label="Suggested break" value={`${suggestedBreak}m`} />
          <FocusStat label="Completion rate" value={`${stats.completionRate}%`} />
        </div>
        <div className="desk-complete-actions">
          <button onClick={startFreshSession}><Play /> Continue</button>
          <button className="primary" onClick={takeBreak}><Coffee /> Take Break</button>
          <button onClick={finish}><Check /> Finish</button>
        </div>
      </section>
    );
  }

  if (session.phase === "break" || session.phase === "break-complete") {
    return (
      <section className="desk-workspace desk-break-workspace">
        <div className="desk-breathing-orb" aria-hidden="true" />
        <span className="desk-eyebrow">Break Mode</span>
        <time>{formatTimer(remaining)}</time>
        <h1>Let your attention reset.</h1>
        <div className="desk-break-suggestions">
          <span>Stretch your shoulders</span><span>Drink water</span><span>Take a short walk</span>
        </div>
        <button className="desk-primary-action" onClick={() => {
          setSession((current) => ({
            ...current,
            phase: "ready",
            totalSeconds: configuredSeconds,
            remainingSeconds: configuredSeconds,
            endAt: null,
          }));
        }}><FastForward /> Skip break</button>
        {session.phase === "break-complete" && (
          <button onClick={startFreshSession}><Play /> Ready? Resume Focus</button>
        )}
      </section>
    );
  }

  const progress = session.totalSeconds ? Math.max(0, Math.min(1, elapsedSeconds / session.totalSeconds)) : 0;
  const radius = 92;
  const circumference = 2 * Math.PI * radius;
  const focusScore = Math.max(0, Math.min(100, 92 - session.distractions * 12 + Math.min(8, stats.currentStreak * 2)));
  const coach = focusCoachMessage({
    remainingSeconds: remaining,
    totalSeconds: session.totalSeconds,
    running: session.phase === "running",
    phase: session.phase,
  });
  const intelligence = buildFocusIntelligence({
    elapsedMinutes: Math.floor(elapsedSeconds / 60),
    stats,
    task,
    distractions: session.distractions,
  });

  return (
    <section className={`desk-workspace desk-focus-active is-${session.phase}`} aria-label={`Focus on ${task.title}`}>
      <header>
        <div>
          <span className="desk-eyebrow">Current task</span>
          <h1>{task.title}</h1>
        </div>
        <button onClick={onExit} aria-label="Leave Focus workspace"><X /></button>
      </header>
      <div className="desk-focus-stage">
        <div className="desk-focus-ring">
          <svg viewBox="0 0 210 210" aria-hidden="true">
            <circle cx="105" cy="105" r={radius} />
            <circle
              className="progress"
              cx="105"
              cy="105"
              r={radius}
              style={{
                strokeDasharray: circumference,
                strokeDashoffset: circumference * (1 - progress),
              }}
            />
          </svg>
          <div><time>{formatTimer(remaining)}</time><span>{session.phase === "paused" ? "Paused" : "Deep work"}</span></div>
        </div>
        <div className="desk-focus-score">
          <span>Focus score</span>
          <strong>{focusScore}</strong>
          <small>{session.distractions} distractions</small>
        </div>
      </div>
      <div className="desk-focus-controls">
        <button className="primary" onClick={session.phase === "running" ? pause : start}>
          {session.phase === "running" ? <><Pause /> Pause</> : <><Play /> {session.phase === "paused" ? "Resume" : "Begin"}</>}
        </button>
        <button onClick={recordDistraction}><RotateCcw /> I got distracted</button>
        <button onClick={complete}><Square /> Finish session</button>
      </div>
      <div className="desk-focus-lower">
        <button className="desk-focus-music" onClick={onOpenMusic}><Headphones /><span><strong>{media.title}</strong><small>{media.artist}</small></span><Volume2 /></button>
        <div className="desk-focus-stats">
          <FocusStat label="Today" value={formatMinutes(stats.todayMinutes)} />
          <FocusStat label="Sessions" value={stats.sessionsToday} />
          <FocusStat label="Remaining" value={stats.remainingSessions} />
          <FocusStat label="Streak" value={`${stats.currentStreak}d`} />
          <FocusStat label="Deep work" value={formatMinutes(stats.deepWorkMinutes)} />
          <FocusStat label="Longest" value={formatMinutes(stats.longestSession)} />
        </div>
      </div>
      <footer className="desk-focus-coaching" aria-live="polite">
        <Sparkles size={14} />
        <span>{intelligence ?? coach}</span>
      </footer>
    </section>
  );
}
