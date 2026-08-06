import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Play, Pause, Check, Coffee, RotateCcw,
  Music2, SkipForward, Zap, HelpCircle, Clock,
} from "lucide-react";
import { saveUserPreferences } from "./lib/noraApi";
import { apiFetch } from "./lib/apiBase";
import CloseButton from "./components/CloseButton";
import "./FocusSession.css";

// ── Config ─────────────────────────────────────────────────────────────────────

const RADIUS = 54;
const CIRC   = 2 * Math.PI * RADIUS; // 339.29

const DURATION_OPTS = [15, 25, 45, 60];

const MUSIC_OPTS = [
  { key: "deep", label: "Deep Focus",  sub: "Minimal, intense",  url: "https://www.youtube.com/results?search_query=deep+focus+music" },
  { key: "calm", label: "Calm Study",  sub: "Lo-fi, gentle",     url: "https://www.youtube.com/results?search_query=lofi+study+music" },
  { key: "low",  label: "Light Focus", sub: "Low-energy ambient", url: "https://www.youtube.com/results?search_query=ambient+focus+low+energy" },
  { key: "none", label: "No Music",    sub: "Silence only",       url: null },
];

const BLOCK_REASONS = [
  { key: "too_hard",      label: "Too hard",      emoji: "🧱", msg: "Let's break this into the smallest step possible.", response: "micro_start" },
  { key: "too_boring",    label: "Too boring",    emoji: "😴", msg: "A 5-minute sprint — no pressure beyond that.",     response: "sprint"      },
  { key: "too_unclear",   label: "Too unclear",   emoji: "❓", msg: "Let's define exactly what step one looks like.",   response: "define"      },
  { key: "too_tired",     label: "Too tired",     emoji: "🪫", msg: "Just open it. No pressure to do anything yet.",   response: "light"       },
  { key: "no_motivation", label: "No motivation", emoji: "💤", msg: "What changes when this is done?",                 response: "why"         },
];

// ── Utilities ──────────────────────────────────────────────────────────────────

const getMicroStart = (title = "") => {
  const tl = title.toLowerCase();
  if (/read|study|learn|review/.test(tl))       return ["Open it and read the first page only.", "Set a 5-min timer and start anywhere.", "Write 3 things you need to understand."];
  if (/write|essay|report|draft/.test(tl))       return ["Open a doc and type one sentence.", "Bullet your 3 main ideas — nothing else.", "Write only the title and first paragraph."];
  if (/code|build|implement|fix|debug/.test(tl)) return ["Open the file and read it once.", "Write a comment describing what needs to happen.", "Make one tiny change and run it."];
  if (/email|message|call|reply/.test(tl))       return ["Open it and read — don't respond yet.", "Type just the first line of a reply.", "Draft 2 sentences and save."];
  if (/clean|tidy|organis|organiz/.test(tl))     return ["Set a 5-min timer and pick one corner.", "Remove 5 things from one surface.", "Put away 10 items — that's it."];
  return [`Spend 5 minutes on "${title}" — that's it.`, "Set a timer. Anything counts.", "Do the smallest possible piece right now."];
};

const pad2    = (n) => String(n).padStart(2, "0");
const fmtSecs = (s) => `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;

const logFocusEvent = (type, data = {}) => {
  try {
    const raw = localStorage.getItem("nora_focus_log") ?? "[]";
    const log = JSON.parse(raw);
    log.push({ type, ...data, ts: Date.now() });
    localStorage.setItem("nora_focus_log", JSON.stringify(log.slice(-500)));
  } catch {}
};

const computeFocusInsights = () => {
  try {
    const log       = JSON.parse(localStorage.getItem("nora_focus_log") ?? "[]");
    const started   = log.filter((e) => e.type === "started");
    const completed = log.filter((e) => e.type === "completed");
    const distracted = log.filter((e) => e.type === "distracted");
    const reasons   = log.filter((e) => e.type === "block_reason");
    const rc = {};
    reasons.forEach((e) => { rc[e.reason] = (rc[e.reason] ?? 0) + 1; });
    const topReason   = Object.entries(rc).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const durations   = completed.filter((e) => e.actual > 0).map((e) => e.actual);
    const avgDuration = durations.length
      ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length) : null;
    return {
      sessions_started:              started.length,
      sessions_completed:            completed.length,
      avg_focus_duration:            avgDuration,
      top_block_reason:              topReason,
      avg_distractions_per_session:  completed.length
        ? Math.round((distracted.length / completed.length) * 10) / 10 : null,
    };
  } catch { return {}; }
};

// ── FUTURE BLOCKING HOOK ───────────────────────────────────────────────────────
// Architecture placeholder for future distraction-blocking integrations.
// - Android: UsageStatsManager / AccessibilityService (requires native wrapper)
// - Desktop: Browser extension via native messaging
// When implemented: blockDistractions(appList, durationSecs) / unblockDistractions()
// ─────────────────────────────────────────────────────────────────────────────────

// ── Component ──────────────────────────────────────────────────────────────────

export default function FocusSession({ task, dark, onClose, onComplete, userPrefs, setUserPrefs, notifSettings, showNotification }) {
  const today = new Date().toISOString().slice(0, 10);
  const daysDeferred = (task?.date && task.date < today)
    ? Math.floor((new Date(today) - new Date(task.date + "T00:00:00")) / 86400000) : 0;

  const [phase,         setPhase]          = useState(daysDeferred >= 2 ? "check" : "prepare");
  const [blockReason,   setBlockReason]    = useState(null);
  const [duration,      setDuration]       = useState(() => {
    if (task?.duration) return DURATION_OPTS.reduce((a, b) => Math.abs(b - task.duration) < Math.abs(a - task.duration) ? b : a);
    return 25;
  });
  const [music,         setMusic]          = useState(null);
  const [timeLeft,      setTimeLeft]       = useState(null);
  const [running,       setRunning]        = useState(false);
  const [distractCount, setDistractionCount] = useState(0);

  const phaseRef     = useRef(phase);
  const startedAtRef = useRef(null);
  const distractRef  = useRef(0);
  const intervalRef  = useRef(null);

  const [aiTip,      setAiTip]      = useState(null);
  const [aiComplete, setAiComplete] = useState(null);
  const tipFetchedRef = useRef(false);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Fetch AI tip once when prepare phase is active
  useEffect(() => {
    if (phase !== "prepare" || tipFetchedRef.current) return;
    tipFetchedRef.current = true;
    apiFetch("/api/tips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "focus_start",
        context: {
          taskTitle:    task?.title ?? "this task",
          blockReason:  blockReason?.label ?? null,
          daysDeferred: daysDeferred,
          duration:     duration,
        },
      }),
    })
      .then(r => r.json())
      .then(d => { if (d.tip) setAiTip(d.tip); })
      .catch(() => {});
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch AI completion note when session ends
  useEffect(() => {
    if (phase !== "completed") return;
    apiFetch("/api/tips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "focus_complete",
        context: {
          taskTitle:    task?.title ?? "this task",
          distractCount: distractCount,
          duration:     duration,
        },
      }),
    })
      .then(r => r.json())
      .then(d => { if (d.tip) setAiComplete(d.tip); })
      .catch(() => {});
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const microStarts = getMicroStart(task?.title);
  const totalSecs   = duration * 60;
  const BREAK_SECS  = 300;
  const ringMax     = phaseRef.current === "break" ? BREAK_SECS : totalSecs;
  const ringProgress = timeLeft != null ? timeLeft / ringMax : 1;

  // ── Timer ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!running) { clearInterval(intervalRef.current); return; }
    intervalRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t === null || t <= 1) {
          clearInterval(intervalRef.current);
          setRunning(false);
          if (phaseRef.current === "break") {
            setPhase("prepare");
            if (notifSettings?.focusSessions) {
              showNotification?.("☕ Break's over", "Ready to focus again?", { tag: `focus-break-${task?.id}` });
            }
          } else {
            setPhase("completed");
            if (notifSettings?.focusSessions) {
              showNotification?.("🎯 Focus session complete", "Nice work. Ready for what's next?", { tag: `focus-done-${task?.id}` });
            }
          }
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps

  // Log + save insights when session completes
  useEffect(() => {
    if (phase !== "completed") return;
    const actual = startedAtRef.current
      ? Math.round((Date.now() - startedAtRef.current) / 60000) : duration;
    logFocusEvent("completed", {
      taskId: task?.id, taskTitle: task?.title,
      plannedDuration: duration, actual,
      distractionCount: distractRef.current,
    });
    const insights = computeFocusInsights();
    const updated  = { ...(userPrefs ?? {}), focus_stats: insights };
    setUserPrefs?.(updated);
    saveUserPreferences(updated).catch(() => {});
  }, [phase]); // eslint-disable-line

  // ── Actions ───────────────────────────────────────────────────
  const startFocus = useCallback((overrideSecs = null) => {
    const secs = overrideSecs ?? totalSecs;
    clearInterval(intervalRef.current);
    setTimeLeft(secs);
    setRunning(true);
    startedAtRef.current = Date.now();
    setPhase("running");
    logFocusEvent("started", { taskId: task?.id, taskTitle: task?.title, duration });
  }, [task, duration, totalSecs]);

  const startBreak = useCallback(() => {
    clearInterval(intervalRef.current);
    setTimeLeft(BREAK_SECS);
    setRunning(true);
    setPhase("break");
  }, []);

  const handlePause = () => { clearInterval(intervalRef.current); setRunning(false); setPhase("paused"); };
  const handleResume = () => { setRunning(true); setPhase("running"); };

  const handleDistracted = () => {
    clearInterval(intervalRef.current);
    setRunning(false);
    distractRef.current++;
    setDistractionCount(distractRef.current);
    setPhase("distracted");
    logFocusEvent("distracted", { taskId: task?.id });
  };

  const handleSelectBlock = (reason) => {
    setBlockReason(reason);
    logFocusEvent("block_reason", { taskId: task?.id, reason: reason.key });
    setPhase("prepare");
  };

  const handleRestart5 = () => {
    distractRef.current++;
    setDistractionCount(distractRef.current);
    startFocus(5 * 60);
  };

  const isActive = phase === "running" || phase === "paused" || phase === "break";

  return (
    <div className={`fs-overlay native-ui${dark ? " dark" : ""}`} role="dialog" aria-modal="true" aria-label="Focus session">
      <div className="fs-backdrop" onClick={() => onClose?.()} />

      <div className="fs-panel">
        <CloseButton onClick={() => onClose?.()} label="Close focus session" className="fs-close-btn" />

        {/* ── Friction check ── */}
        {phase === "check" && (
          <div className="fs-phase">
            <div className="fs-phase-icon fs-icon-neutral"><HelpCircle size={28} /></div>
            <h2 className="fs-title">What's getting in the way?</h2>
            <p className="fs-sub">No pressure. Let's find the right approach.</p>
            <div className="fs-block-grid">
              {BLOCK_REASONS.map((r) => (
                <button key={r.key} className="fs-block-btn" onClick={() => handleSelectBlock(r)}>
                  <span className="fs-block-emoji">{r.emoji}</span>
                  <span>{r.label}</span>
                </button>
              ))}
            </div>
            <button className="fs-text-link" onClick={() => setPhase("prepare")}>
              I'm ready — skip this →
            </button>
          </div>
        )}

        {/* ── Prepare ── */}
        {phase === "prepare" && (
          <div className="fs-phase">
            {(aiTip || blockReason) && (
              <div className="fs-nora-tip">
                <Zap size={13} />
                <span>{aiTip ?? `Nora: "${blockReason.msg}"`}</span>
              </div>
            )}

            <h2 className="fs-task-title">{task?.title ?? "Focus Session"}</h2>

            <div className="fs-first-step">
              <span className="fs-step-label">Start here</span>
              <span className="fs-step-text">
                {blockReason?.response === "micro_start" && microStarts[0]}
                {blockReason?.response === "sprint"      && `Quick sprint: ${microStarts[0]}`}
                {blockReason?.response === "define"      && `Define step one: ${microStarts[1] ?? microStarts[0]}`}
                {blockReason?.response === "light"       && "Just open it and look. Nothing else."}
                {blockReason?.response === "why"         && `Finishing "${task?.title}" moves things forward. Start for 5 min.`}
                {!blockReason && microStarts[0]}
              </span>
            </div>

            <div className="fs-section">
              <span className="fs-section-label"><Clock size={12} /> Duration</span>
              <div className="fs-chip-row">
                {DURATION_OPTS.map((d) => (
                  <button key={d} className={`fs-chip${duration === d ? " active" : ""}`} onClick={() => setDuration(d)}>
                    {d}m
                  </button>
                ))}
              </div>
            </div>

            <div className="fs-section">
              <span className="fs-section-label"><Music2 size={12} /> Focus music</span>
              <div className="fs-music-grid">
                {MUSIC_OPTS.map((m) => (
                  <button key={m.key}
                    className={`fs-music-chip${music?.key === m.key ? " active" : ""}`}
                    onClick={() => setMusic(music?.key === m.key ? null : m)}>
                    <span className="fs-music-name">{m.label}</span>
                    <span className="fs-music-sub">{m.sub}</span>
                  </button>
                ))}
              </div>
              {music?.url && (
                <button className="fs-music-open" onClick={() => window.open(music.url, "_blank", "noopener")}>
                  Open playlist ↗
                </button>
              )}
            </div>

            <button className="fs-start-btn" onClick={() => startFocus()}>
              <Play size={15} /> Start {duration}min focus
            </button>
          </div>
        )}

        {/* ── Running / Paused / Break ── */}
        {isActive && (
          <div className="fs-phase fs-phase-active">
            <div className="fs-ring-wrap">
              <svg className="fs-ring-svg" viewBox="0 0 120 120" aria-hidden="true">
                <circle className="fs-ring-track" cx="60" cy="60" r={RADIUS} />
                <circle
                  className={`fs-ring-arc${phase === "break" ? " fs-arc-break" : ""}`}
                  cx="60" cy="60" r={RADIUS}
                  style={{
                    strokeDasharray: CIRC,
                    strokeDashoffset: CIRC * (1 - ringProgress),
                    transform: "rotate(-90deg)",
                    transformOrigin: "60px 60px",
                    transition: running ? "stroke-dashoffset 1s linear" : "none",
                  }}
                />
              </svg>
              <div className="fs-ring-center">
                <span className="fs-time-digits">
                  {timeLeft != null ? fmtSecs(timeLeft) : fmtSecs(totalSecs)}
                </span>
                <span className="fs-time-label">
                  {phase === "paused" ? "Paused" : phase === "break" ? "Break" : "Focusing"}
                </span>
              </div>
            </div>

            {phase !== "break" && (
              <>
                <p className="fs-active-task">{task?.title}</p>
                <p className="fs-active-step">{microStarts[0]}</p>
              </>
            )}
            {phase === "break" && (
              <p className="fs-active-task">Step away. Breathe. You're doing great.</p>
            )}

            <div className="fs-run-actions">
              {phase === "running" && (
                <button className="fs-act fs-act-ghost" onClick={handlePause}>
                  <Pause size={15} /> Pause
                </button>
              )}
              {phase === "paused" && (
                <button className="fs-act fs-act-primary" onClick={handleResume}>
                  <Play size={15} /> Resume
                </button>
              )}
              {phase !== "break" && (
                <>
                  <button className="fs-act fs-act-warn" onClick={handleDistracted}>
                    I got distracted
                  </button>
                  <button className="fs-act fs-act-success" onClick={() => { clearInterval(intervalRef.current); setRunning(false); setPhase("completed"); }}>
                    <Check size={15} /> Finish
                  </button>
                </>
              )}
              {phase === "break" && (
                <button className="fs-act fs-act-primary" onClick={() => startFocus()}>
                  <Play size={15} /> I'm back — start session
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── Distracted ── */}
        {phase === "distracted" && (
          <div className="fs-phase">
            <div className="fs-phase-icon fs-icon-warm"><Coffee size={28} /></div>
            <h2 className="fs-title">That's okay — it happens.</h2>
            <p className="fs-sub">Let's make this easier to start again.</p>
            <div className="fs-recovery-list">
              <button className="fs-recover-btn" onClick={handleRestart5}>
                <RotateCcw size={16} />
                <span><strong>Restart — just 5 minutes</strong><small>Low bar. No pressure.</small></span>
              </button>
              <button className="fs-recover-btn" onClick={() => { setBlockReason(null); setPhase("prepare"); }}>
                <Zap size={16} />
                <span><strong>Simplify the task</strong><small>Pick an easier first step.</small></span>
              </button>
              <button className="fs-recover-btn" onClick={() => onClose?.("reschedule")}>
                <SkipForward size={16} />
                <span><strong>Reschedule it</strong><small>Find a better slot today.</small></span>
              </button>
              <button className="fs-recover-btn" onClick={startBreak}>
                <Coffee size={16} />
                <span><strong>Take a 5-min break</strong><small>Step away, then come back.</small></span>
              </button>
            </div>
          </div>
        )}

        {/* ── Completed ── */}
        {phase === "completed" && (
          <div className="fs-phase">
            <div className="fs-phase-icon fs-icon-success"><Check size={28} /></div>
            <h2 className="fs-title">Session complete.</h2>
            <p className="fs-sub">
              {aiComplete ?? (
                distractCount === 0
                  ? "Clean focus — no distractions. That's real momentum."
                  : distractCount === 1
                    ? "You got distracted once and came back. That's the skill."
                    : `You recovered from ${distractCount} distractions and finished. That counts.`
              )}
            </p>
            {!aiComplete && distractCount > 0 && (
              <div className="fs-nora-tip">
                <Zap size={13} />
                <span>Returning from distraction is itself a focus skill. You practiced it.</span>
              </div>
            )}
            <div className="fs-complete-actions">
              <button className="fs-start-btn" onClick={() => onComplete?.()}>
                <Check size={15} /> Mark task done
              </button>
              <button className="fs-act fs-act-ghost" onClick={() => onClose?.()}>
                Return to schedule
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
