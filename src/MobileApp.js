import React, { useState, useRef, useEffect } from "react";
import {
  Check, ChevronLeft, ChevronRight, Clock, MessageSquare, X, Send,
  FileText, Trash2, User, RotateCcw, CalendarDays,
  Flag, Coffee, Bell, Activity, Wind, TrendingUp,
  TrendingDown, Minus, AlertTriangle,
  SkipForward, Sparkles, Plus, Settings,
  BarChart2, Zap, List, CheckSquare,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import "./MobileApp.css";

// ── Local helpers ────────────────────────────────────────────
const uid  = () => Math.random().toString(36).slice(2);
const pad  = (n) => String(n).padStart(2, "0");
const fmtTime = (h, m) => {
  const suffix = h < 12 ? "AM" : "PM";
  const hr = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hr}:${pad(m)} ${suffix}`;
};
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
const getChatAlternatives = (input, ghost) => {
  if (!input || input.trim().length < 2) return [];
  const lc = input.toLowerCase();
  const ghostFull = input + ghost;
  return CHAT_SUGGESTIONS
    .filter((s) => s.toLowerCase().startsWith(lc) && s !== ghostFull && s.length > input.length)
    .slice(0, 2);
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

// ── Root ─────────────────────────────────────────────────────
export default function MobileApp({ ctx }) {
  const [mobileView, setMobileView] = useState("plan");
  const [planSubView, setPlanSubView] = useState("day");  // "day" | "month"
  const [dayMode, setDayMode] = useState("list");          // "list" | "grid"
  const { dark, theme, chatOpen, setChatOpen, editingTask, draft, inAppAlert, setInAppAlert,
          rescheduleTask, setRescheduleTask, saveReschedule } = ctx;

  return (
    <div className={`app mob-app${dark ? " dark" : ""}${theme === "liquid_glass" ? " glass" : ""}`}>

      <MobileHeader ctx={ctx} />

      <main className="mob-main">
        {mobileView === "plan"     && <MobilePlan ctx={ctx} subView={planSubView} setSubView={setPlanSubView} dayMode={dayMode} setDayMode={setDayMode} />}
        {mobileView === "tasks"    && <MobileTasks ctx={ctx} />}
        {mobileView === "notes"    && <MobileNotes ctx={ctx} />}
        {mobileView === "status"   && <MobileStatus ctx={ctx} />}
        {mobileView === "settings" && <MobileSettings ctx={ctx} />}
      </main>

      <nav className="mob-bottom-nav">
        {[
          ["plan",     "Plan",     <CalendarDays size={21} />],
          ["tasks",    "Tasks",    <CheckSquare size={21} />],
          ["notes",    "Notes",    <FileText size={21} />],
          ["status",   "Status",   <Activity size={21} />],
          ["settings", "Settings", <Settings size={21} />],
        ].map(([v, l, icon]) => (
          <button key={v}
            className={`mob-nav-btn${mobileView === v ? " mob-nav-active" : ""}`}
            onClick={() => setMobileView(v)}>
            {icon}
            <span>{l}</span>
          </button>
        ))}
      </nav>

      <button
        className={`mob-ai-fab${chatOpen ? " fab-open" : ""}`}
        onClick={() => setChatOpen((o) => !o)}>
        {chatOpen ? <X size={22} /> : <Sparkles size={22} />}
      </button>

      <MobileChat ctx={ctx} />
      {editingTask && draft && <MobileEditModal ctx={ctx} />}
      {rescheduleTask && (
        <MobileRescheduleModal
          task={rescheduleTask}
          onSave={saveReschedule}
          onClose={() => setRescheduleTask(null)}
        />
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

    </div>
  );
}

// ── Header ───────────────────────────────────────────────────
function MobileHeader({ ctx }) {
  const { today, dark } = ctx;
  const d = new Date(today + "T00:00:00");
  const dayName  = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][d.getDay()];
  const dateText = `${dayName}, ${["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][d.getMonth()]} ${d.getDate()}`;
  return (
    <header className="mob-header">
      <img
        src={dark ? "/logo-dark.png" : "/logo-light.png"}
        className="mob-brand-logo"
        alt="NORA" />
      <span className="mob-header-date">{dateText}</span>
    </header>
  );
}

// ── Plan view (Day / Month) ───────────────────────────────────
function MobilePlan({ ctx, subView, setSubView, dayMode, setDayMode }) {
  return (
    <div className="mob-plan">
      {/* Sub-view toggle */}
      <div className="mob-plan-segs">
        <div className={`mob-seg-pill mob-seg-pill-${subView === "day" ? 0 : 1}`} />
        <button className={`mob-seg-btn${subView === "day" ? " active" : ""}`} onClick={() => setSubView("day")}>Day</button>
        <button className={`mob-seg-btn${subView === "month" ? " active" : ""}`} onClick={() => setSubView("month")}>Month</button>
      </div>

      {subView === "day" && (
        <>
          {/* List / Grid toggle inside Day */}
          <div className="mob-day-mode-row">
            <button className={`mob-mode-btn${dayMode === "list" ? " active" : ""}`} onClick={() => setDayMode("list")}>
              <List size={14} /> List
            </button>
            <button className={`mob-mode-btn${dayMode === "grid" ? " active" : ""}`} onClick={() => setDayMode("grid")}>
              <BarChart2 size={14} /> Grid
            </button>
          </div>
          {dayMode === "list" ? <MobileHome ctx={ctx} /> : <MobileGrid ctx={ctx} />}
        </>
      )}

      {subView === "month" && <MobileMonth ctx={ctx} />}
    </div>
  );
}

// ── Home view (Day list mode) ────────────────────────────────
function MobileHome({ ctx }) {
  const {
    todayTasks, today, aiFocus, contextMode, deferredTasks,
    doneToday, totalToday, pct, toggleTask, skipTask,
    setChatInput, setChatOpen, setEditingTask,
    groups, nowObj,
  } = ctx;

  const nowMins = nowObj.getHours() * 60 + nowObj.getMinutes();

  const scheduled = [...todayTasks]
    .filter((t) => t.startHour != null)
    .sort((a, b) => a.startHour * 60 + (a.startMinute ?? 0) - (b.startHour * 60 + (b.startMinute ?? 0)));

  const nextTask = scheduled.find(
    (t) => !t.completed && t.startHour * 60 + (t.startMinute ?? 0) >= nowMins
  );

  const getGroup = (id) => groups.find((g) => g.id === id);

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
          {totalToday > 0 && (
            <span className="mob-done-pill">{doneToday}/{totalToday}</span>
          )}
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

        {/* Action buttons */}
        <div className="mob-focus-actions">
          {aiFocus.priorityTask && (
            <button className="mob-btn mob-btn-done" onClick={() => toggleTask(aiFocus.priorityTask.id)}>
              <Check size={17} /> Done
            </button>
          )}
          {aiFocus.priorityTask && (
            <button className="mob-btn mob-btn-skip" onClick={() => skipTask(aiFocus.priorityTask.id)}>
              <SkipForward size={17} /> Later
            </button>
          )}
          <button className="mob-btn mob-btn-ai" onClick={() => {
            setChatInput(aiFocus.priorityTask
              ? `What's the best way to tackle "${aiFocus.priorityTask.title}" right now?`
              : "What should I focus on today?");
            setChatOpen(true);
          }}>
            <MessageSquare size={17} /> Ask NORA
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

      {/* Mini agenda */}
      {scheduled.length > 0 ? (
        <div className="mob-agenda">
          <div className="mob-section-title">
            <Clock size={14} /> Today's Schedule
          </div>
          {scheduled.map((t) => {
            const tp    = t.type ?? "task";
            const group = getGroup(t.groupId);
            const gc    = tp === "deadline" ? "#ef4444"
                        : tp === "break"    ? "#94a3b8"
                        : group?.color ?? "var(--accent)";
            const tMins = t.startHour * 60 + (t.startMinute ?? 0);
            const isPast = tMins < nowMins;
            const isNext = t === nextTask;
            return (
              <div key={t.id}
                className={`mob-agenda-item${t.completed ? " mai-done" : ""}${isPast && !t.completed ? " mai-past" : ""}${isNext ? " mai-next" : ""}${tp === "break" ? " mai-break" : ""}${tp === "deadline" ? " mai-dl" : ""}`}
                style={{ "--gc": gc }}
                onClick={() => setEditingTask(t)}>

                <div className="mai-time-col">
                  <span className="mai-time">{fmtTime(t.startHour, t.startMinute ?? 0)}</span>
                  {t.duration && <span className="mai-dur">{fmtDur(t.duration)}</span>}
                </div>

                <div className="mai-body">
                  <span className="mai-title">{t.title || (tp === "break" ? "Break" : "Deadline")}</span>
                  {isNext && <span className="mai-next-tag">Up next</span>}
                </div>

                {tp === "task" ? (
                  <button
                    className={`mai-check${t.completed ? " checked" : ""}`}
                    onClick={(e) => { e.stopPropagation(); toggleTask(t.id); }}>
                    {t.completed ? <Check size={14} strokeWidth={3} /> : null}
                  </button>
                ) : (
                  <span className="mai-type-icon">
                    {tp === "break" ? <Coffee size={14} /> : <Flag size={14} />}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mob-empty-state">
          <Sparkles size={36} style={{ opacity: .15 }} />
          <p>Nothing scheduled today.</p>
          <button className="mob-plan-cta" onClick={() => {
            setChatInput("Plan my day. Consider my energy level and current workload.");
            setChatOpen(true);
          }}>
            <Sparkles size={15} /> Let NORA plan my day
          </button>
        </div>
      )}

      {/* Quick add */}
      <button className="mob-quick-add" onClick={() => {
        ctx.setEditingTask({
          id: uid(), type: "task",
          title: "", date: today,
          startHour: null, startMinute: null,
          duration: null, repeat: null, repeatEnd: null,
          completed: false, notes: "", complexity: null,
          groupId: null, reminderOffset: null,
        });
      }}>
        <Plus size={18} /> Add task
      </button>

    </div>
  );
}

// ── Grid view (24h timeline) ─────────────────────────────────
function MobileGrid({ ctx }) {
  const { todayTasks, nowObj, toggleTask, setEditingTask } = ctx;
  const HOURS = Array.from({ length: 24 }, (_, i) => i);
  const CELL = 64; // px per hour
  const nowMins = nowObj.getHours() * 60 + nowObj.getMinutes();
  const gridRef = useRef(null);

  useEffect(() => {
    if (gridRef.current) {
      const scrollTo = Math.max(0, (nowMins / 60) * CELL - 120);
      gridRef.current.scrollTop = scrollTo;
    }
  }, []); // eslint-disable-line

  const scheduled = todayTasks.filter((t) => t.startHour != null);

  const fmt = (h) => h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`;

  return (
    <div className="mob-grid-scroll" ref={gridRef}>
      <div className="mob-grid-inner" style={{ height: 24 * CELL + 32 }}>
        {/* Hour rows */}
        {HOURS.map((h) => (
          <div key={h} className="mob-grid-hour-row" style={{ top: h * CELL + 16, height: CELL }}>
            <span className="mob-grid-h-label">{fmt(h)}</span>
            <div className="mob-grid-h-line" />
          </div>
        ))}

        {/* Current time line */}
        <div className="mob-grid-now-wrap" style={{ top: (nowMins / 60) * CELL + 16 }}>
          <div className="mob-grid-now-dot" />
          <div className="mob-grid-now-line" />
        </div>

        {/* Task blocks */}
        <div className="mob-grid-blocks">
          {scheduled.map((t) => {
            const startMin = t.startHour * 60 + (t.startMinute ?? 0);
            const dur = t.duration ?? 30;
            const top = (startMin / 60) * CELL + 16;
            const height = Math.max(28, (dur / 60) * CELL - 3);
            const tp = t.type ?? "task";
            const color = tp === "deadline" ? "#ef4444" : tp === "break" ? "#94a3b8" : "var(--accent)";
            return (
              <div key={t.id}
                className={`mob-grid-block${t.completed ? " mob-gb-done" : ""}`}
                style={{ top, height, borderLeftColor: color, background: `${color}18` }}
                onClick={() => setEditingTask(t)}>
                <span className="mob-gb-title">{shortTitle(t.title) || (tp === "break" ? "Break" : "Deadline")}</span>
                {t.duration && <span className="mob-gb-dur">{fmtDur(t.duration)}</span>}
                {tp === "task" && (
                  <button
                    className={`mob-gb-check${t.completed ? " checked" : ""}`}
                    onClick={(e) => { e.stopPropagation(); toggleTask(t.id); }}>
                    {t.completed && <Check size={10} strokeWidth={3} />}
                  </button>
                )}
                {tp === "deadline" && !t.completed && (
                  <button className="mob-gb-dl-done" onClick={(e) => { e.stopPropagation(); toggleTask(t.id); }}>
                    <Check size={10} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Month / Calendar view ────────────────────────────────────
function MobileMonth({ ctx }) {
  const { tasks, today, setEditingTask } = ctx;
  const [cur, setCur] = useState(() => {
    const [y, m] = today.split("-");
    return { year: Number(y), month: Number(m) - 1 };
  });
  const [sel, setSel] = useState(today);

  const { year, month } = cur;
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const firstDay = new Date(year, month, 1).getDay();
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
        {["Su","Mo","Tu","We","Th","Fr","Sa"].map((d) => (
          <div key={d} className="mob-cal-dow">{d}</div>
        ))}
        {cells.map((cell, i) => {
          if (!cell) return <div key={i} className="mob-cal-empty" />;
          const { day, ds, ts } = cell;
          const isToday = ds === today;
          const isSel = ds === sel;
          const hasDl = ts.some((t) => t.type === "deadline");
          const taskCount = ts.filter((t) => t.type !== "break").length;
          return (
            <div key={ds}
              className={`mob-cal-cell${isToday ? " mob-cal-today" : ""}${isSel ? " mob-cal-sel" : ""}`}
              onClick={() => setSel(ds)}>
              <span className="mob-cal-num">{day}</span>
              <div className="mob-cal-dots">
                {hasDl && <span className="mob-dot mob-dot-dl" />}
                {taskCount > 0 && <span className="mob-dot" />}
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
  const { tasks, today, toggleTask, skipTask, setRescheduleTask, setEditingTask, groups } = ctx;

  const getGroup = (id) => groups.find((g) => g.id === id);

  const sorted = [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    const at = a.startHour != null ? a.startHour * 60 + (a.startMinute ?? 0) : 9999;
    const bt = b.startHour != null ? b.startHour * 60 + (b.startMinute ?? 0) : 9999;
    return at - bt;
  });

  // Deadlines always stay in their day section even when done
  const active    = sorted.filter((t) => !t.completed || t.type === "deadline");
  const completed = sorted.filter((t) => t.completed && t.type !== "deadline").slice(0, 10);

  // Group active tasks by date
  const tomorrow = (() => {
    const d = new Date(today + "T00:00:00");
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
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
              <button className="mtr-act" title="Skip to tomorrow" onClick={() => skipTask(t.id)}>
                <SkipForward size={15} />
              </button>
            )}
            {tp === "task" && !t.completed && (
              <button className="mtr-act mtr-act-ai" title="Move task" onClick={() => setRescheduleTask(t)}>
                <CalendarDays size={15} />
              </button>
            )}
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
      {tasks.length === 0 ? (
        <div className="mob-empty-state">
          <CalendarDays size={36} style={{ opacity: .15 }} />
          <p>No tasks yet.</p>
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
    </div>
  );
}

// ── Notes view ───────────────────────────────────────────────
function MobileNotes({ ctx }) {
  const { notes, setNotes, toggleNote, updateNote, deleteNote } = ctx;
  const [text, setText] = useState("");
  const inputRef = useRef(null);

  const addNote = () => {
    if (!text.trim()) return;
    setNotes((p) => [...p, { id: uid(), content: text.trim(), done: false, createdAt: Date.now() }]);
    setText("");
    inputRef.current?.focus();
  };

  return (
    <div className="mob-notes">
      <div className="mob-notes-add-bar">
        <textarea
          ref={inputRef}
          className="mob-notes-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addNote(); } }}
          placeholder="Write a note…"
          rows={2} />
        <button className="mob-notes-add-btn" onClick={addNote} disabled={!text.trim()}>
          <Plus size={20} />
        </button>
      </div>

      {notes.length === 0 ? (
        <div className="mob-empty-state">
          <FileText size={36} style={{ opacity: .15 }} />
          <p>No notes yet.</p>
        </div>
      ) : (
        <div className="mob-notes-list">
          {[...notes].reverse().map((note) => (
            <div key={note.id} className={`mob-note-card${note.done ? " done" : ""}`}>
              <button
                className={`mob-note-check${note.done ? " checked" : ""}`}
                onClick={() => toggleNote(note.id)}>
                {note.done && <Check size={12} strokeWidth={3} />}
              </button>
              <textarea
                className="mob-note-text"
                value={note.content}
                onChange={(e) => updateNote(note.id, e.target.value)}
                rows={1}
                onInput={(e) => {
                  e.target.style.height = "auto";
                  e.target.style.height = e.target.scrollHeight + "px";
                }} />
              <button className="mob-note-del" onClick={() => deleteNote(note.id)}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Status view ──────────────────────────────────────────────
function MobileStatus({ ctx }) {
  const {
    energy, setEnergy, relaxation, setRelaxation,
    focus, setFocus, motivation, setMotivation,
    noraState, userConfidence, assessmentSummary, keySignals,
    recoveryState, workloadForecast, weekTrend,
    adaptiveRecs, deferredTasks, mostAvoided,
    setChatInput, setChatOpen, doneToday, totalToday, pct,
    focusPatterns, adaptivePlanData, behaviorProfile,
    weeklyReflection, predictiveSignals,
    setRescheduleTask,
  } = ctx;

  const maxWl = Math.max(...workloadForecast.map((d) => d.load), 1);

  const CHECKIN_DEFS = [
    { Icon: Zap,        title:"Energy",     color:"var(--accent)", value:energy,     set:setEnergy,
      levels:[{l:"Very low",v:1},{l:"Low",v:3},{l:"Okay",v:5},{l:"Good",v:7},{l:"High",v:9}] },
    { Icon: Wind,       title:"Stress",     color:"#3b82f6",       value:relaxation, set:setRelaxation,
      levels:[{l:"Overwhelmed",v:1},{l:"Stressed",v:3},{l:"Okay",v:5},{l:"Calm",v:7},{l:"Relaxed",v:9}] },
    { Icon: Activity,   title:"Focus",      color:"#22c55e",       value:focus,      set:setFocus,
      levels:[{l:"Scattered",v:1},{l:"Drifting",v:3},{l:"Okay",v:5},{l:"Focused",v:7},{l:"Deep",v:9}] },
    { Icon: TrendingUp, title:"Motivation", color:"#f59e0b",       value:motivation, set:setMotivation,
      levels:[{l:"None",v:1},{l:"Low",v:3},{l:"Okay",v:5},{l:"Driven",v:7},{l:"Fired up",v:9}] },
  ];
  const closestL = (lvls, val) => lvls.reduce((p, c) => Math.abs(c.v - val) < Math.abs(p.v - val) ? c : p);

  return (
    <div className="mob-status-v2">

      {/* § 1 Assessment */}
      <div className="mob-sv2-card mob-assessment" style={{ borderTop: `3px solid ${noraState.color}` }}>
        <div className="mob-assess-header">
          <div className="mob-assess-state" style={{ color: noraState.color }}>
            <span className="mob-assess-dot" style={{ background: noraState.color }} />{noraState.label}
          </div>
          <span className={`mob-assess-conf mob-conf-${userConfidence?.level ?? "building"}`} style={{ color: userConfidence?.color }}>
            {userConfidence?.label ?? "Building Confidence"}
          </span>
        </div>
        <p className="mob-assess-summary">{assessmentSummary}</p>
        <div className="mob-assess-signals">
          {(keySignals ?? []).map((s, i) => (
            <div key={i} className="mob-signal"><span className="mob-signal-dot" />{s}</div>
          ))}
        </div>
        {adaptiveRecs?.[0] && (
          <div className="mob-assess-rec">
            <span className="mob-assess-rec-lbl">NORA suggests:</span> {adaptiveRecs[0]}
          </div>
        )}
      </div>

      {/* § 2 Daily Check-In */}
      <div className="mob-sv2-card">
        <div className="mob-status-card-title"><Activity size={14} /> Daily Check-In</div>
        <div className="mob-checkin-list">
          {CHECKIN_DEFS.map(({ Icon, title, color, value, set, levels }) => {
            const active = closestL(levels, value);
            return (
              <div key={title} className="mob-check-row">
                <div className="mob-check-meta">
                  <span className="mob-check-icon-wrap" style={{ color }}><Icon size={13} /></span>
                  <span className="mob-check-title">{title}</span>
                  <span className="mob-check-curr" style={{ color }}>{active.l}</span>
                </div>
                <div className="mob-check-levels">
                  {levels.map((lvl) => (
                    <button key={lvl.v}
                      className={`mob-check-lvl${lvl.v === active.v ? " active" : ""}`}
                      style={lvl.v === active.v ? { background: `${color}18`, borderColor: `${color}50`, color } : {}}
                      onClick={() => set(lvl.v)}>
                      {lvl.l}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* § 3 Today's Reality */}
      <div className="mob-sv2-card">
        <div className="mob-status-card-title"><CalendarDays size={14} /> Today's Reality</div>
        <div className="mob-reality-row">
          {[
            { val: doneToday, lbl: "Done", color: "#22c55e" },
            { val: Math.max(0, totalToday - doneToday), lbl: "Left", color: "var(--text)" },
            { val: deferredTasks.length, lbl: "Deferred", color: deferredTasks.length > 0 ? "#f97316" : "var(--text)" },
            { val: workloadForecast[0]?.level ?? "—", lbl: "Load", color: workloadForecast[0]?.level === "heavy" ? "#ef4444" : "#22c55e" },
          ].map(({ val, lbl, color }) => (
            <div key={lbl} className="mob-rstat">
              <span className="mob-rstat-val" style={{ color }}>{val}</span>
              <span className="mob-rstat-lbl">{lbl}</span>
            </div>
          ))}
        </div>
        {totalToday > 0 && (
          <div className="mob-progress-track" style={{ marginTop: 10 }}>
            <div className="mob-progress-fill" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>

      {/* § 4 Needs Attention */}
      <div className="mob-sv2-card">
        <div className="mob-status-card-title"><AlertTriangle size={14} /> Needs Attention</div>
        {recoveryState.level !== "stable" && (
          <div className="mob-attn-recovery" style={{ borderLeftColor: recoveryState.color }}>
            <span className="mob-attn-rec-name" style={{ color: recoveryState.color }}>{recoveryState.label}</span>
            <p className="mob-attn-rec-desc">{recoveryState.desc}</p>
          </div>
        )}
        {predictiveSignals?.filter((s) => s.confidence === "HIGH").map((s, i) => (
          <div key={i} className="mob-psignal"><Zap size={11} /> {s.message}</div>
        ))}
        {mostAvoided && (
          <div className="mob-attn-item mob-attn-avoided">
            <div className="mob-attn-info">
              <span className="mob-attn-name">{mostAvoided.task.title}</span>
              <span className="mob-attn-age">Deferred {mostAvoided.daysOverdue}d</span>
            </div>
            <p className="mob-attn-note">"{mostAvoided.daysOverdue >= 5 ? "Avoidance, not scheduling." : "5 min starts break the loop."}"</p>
            <div className="mob-attn-btns">
              <button className="mob-attn-btn" onClick={() => setRescheduleTask(mostAvoided.task)}><CalendarDays size={11} /> Move</button>
              <button className="mob-attn-btn mob-attn-micro" onClick={() => { setChatInput(`Help me micro-start "${mostAvoided.task.title}"`); setChatOpen(true); }}><Zap size={11} /> Micro</button>
            </div>
          </div>
        )}
        {deferredTasks.filter((t) => t.id !== mostAvoided?.task?.id).slice(0, 3).map((t) => (
          <div key={t.id} className={`mob-attn-item mob-attn-def-${t.urgency}`}>
            <div className="mob-attn-info">
              <span className="mob-attn-name">{t.title}</span>
              <span className="mob-attn-age">{t.daysDeferred}d pending</span>
            </div>
            <button className="mob-attn-btn" onClick={() => setRescheduleTask(t)}><CalendarDays size={11} /> Move</button>
          </div>
        ))}
        {recoveryState.level === "stable" && deferredTasks.length === 0 && (
          <p className="mob-all-clear">✓ Nothing urgent right now.</p>
        )}
        {deferredTasks.length > 1 && (
          <button className="mob-rebalance-btn" onClick={() => {
            const titles = deferredTasks.slice(0, 4).map((t) => `"${t.title}"`).join(", ");
            setChatInput(`I have ${deferredTasks.length} deferred tasks: ${titles}. Rebalance across this week.`);
            setChatOpen(true);
          }}>Rebalance all with NORA</button>
        )}
      </div>

      {/* § 5 Week Outlook */}
      <div className="mob-sv2-card">
        <div className="mob-status-card-top">
          <div className="mob-status-card-title" style={{ marginBottom: 0 }}><BarChart2 size={14} /> Week Outlook</div>
          <span className={`mob-trend-badge mob-trend-${weekTrend}`}>
            {weekTrend === "improving" ? <TrendingUp size={12} /> : weekTrend === "declining" ? <TrendingDown size={12} /> : <Minus size={12} />}
            {weekTrend === "new" ? "Starting" : weekTrend.charAt(0).toUpperCase() + weekTrend.slice(1)}
          </span>
        </div>
        <div className="mob-workload-row">
          {workloadForecast.map((day) => (
            <div key={day.date} className={`mob-wl-day${day.isToday ? " mob-wl-today" : ""}`}>
              <div className="mob-wl-bar-wrap">
                <div className={`mob-wl-bar mob-wl-${day.level}`}
                  style={{ height: `${Math.max(4, Math.round((day.load / maxWl) * 52))}px` }} />
              </div>
              <span className="mob-wl-label">{day.label}</span>
            </div>
          ))}
        </div>
        {weeklyReflection?.insights[0] && (
          <p className="mob-reflect-note">{weeklyReflection.insights[0]}</p>
        )}
      </div>

      {/* § 6 How You Work Best */}
      <div className="mob-sv2-card">
        <div className="mob-status-card-title"><Activity size={14} /> How You Work Best</div>
        <div className="mob-pattern-stats">
          {[
            { lbl: "Peak Focus", val: focusPatterns ? focusPatterns.peak.label : "—" },
            { lbl: "Avg Session", val: adaptivePlanData?.avgDur ? `${adaptivePlanData.avgDur}m` : "—" },
            { lbl: "Work Style", val: behaviorProfile?.work_style !== "unknown" ? behaviorProfile?.work_style?.charAt(0).toUpperCase() + behaviorProfile?.work_style?.slice(1) : "—" },
            { lbl: "Best Day", val: adaptivePlanData?.bestDayName ?? "—" },
          ].map(({ lbl, val }) => (
            <div key={lbl} className="mob-pstat">
              <span className="mob-pstat-lbl">{lbl}</span>
              <span className="mob-pstat-val">{val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* § 7 What NORA Recommends */}
      {adaptiveRecs.length > 0 && (
        <div className="mob-sv2-card mob-recs-card">
          <div className="mob-status-card-title"><Zap size={14} /> What NORA Recommends</div>
          {adaptiveRecs.slice(0, 3).map((r, i) => (
            <div key={i} className="mob-rec-item">
              <span className="mob-rec-num">{i + 1}</span>
              <span className="mob-rec-text">{r}</span>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

// ── Settings view ────────────────────────────────────────────
function MobileSettings({ ctx }) {
  const {
    accountName, setAccountName,
    dark, setDark,
    theme, setTheme,
    reminderMins, setReminderMins,
    session,
  } = ctx;

  return (
    <div className="mob-settings">
      {/* Profile */}
      <div className="mob-sett-card">
        <div className="mob-sett-card-title"><User size={15} /> Profile</div>
        <div className="mob-sett-avatar-row">
          <div className="mob-sett-avatar">
            {(accountName?.trim()?.[0] ?? session?.user?.email?.[0] ?? "U").toUpperCase()}
          </div>
          <div className="mob-sett-avatar-info">
            <span className="mob-sett-display-name">{accountName || "No name set"}</span>
            <span className="mob-sett-email-sm">{session?.user?.email}</span>
          </div>
        </div>
        <label className="mob-sett-label">Display name</label>
        <input
          className="mob-sett-input"
          value={accountName}
          onChange={(e) => setAccountName(e.target.value)}
          placeholder="Your name" />
      </div>

      {/* Appearance */}
      <div className="mob-sett-card">
        <div className="mob-sett-card-title"><Activity size={15} /> Appearance</div>
        <div className="mob-sett-row">
          <span className="mob-sett-row-label">Dark mode</span>
          <button className={`mob-toggle${dark ? " on" : ""}`} onClick={() => setDark((d) => !d)}>
            <span className="mob-toggle-knob" />
          </button>
        </div>
        <div className="mob-sett-divider" />
        <div className="mob-sett-row">
          <span className="mob-sett-row-label">Theme</span>
        </div>
        <div className="mob-theme-pills">
          <button className={`mob-theme-pill${theme === "default" ? " active" : ""}`}
            onClick={() => setTheme("default")}>Default</button>
          <button className={`mob-theme-pill${theme === "liquid_glass" ? " active" : ""}`}
            onClick={() => setTheme("liquid_glass")}>✦ Liquid Glass</button>
        </div>
      </div>

      {/* Notifications */}
      <div className="mob-sett-card">
        <div className="mob-sett-card-title"><Bell size={15} /> Notifications</div>
        <div className="mob-sett-row">
          <span className="mob-sett-row-label">Default reminder</span>
          <select className="mob-sett-select"
            value={reminderMins}
            onChange={(e) => setReminderMins(Number(e.target.value))}>
            <option value={0}>At start</option>
            <option value={5}>5 min before</option>
            <option value={10}>10 min before</option>
            <option value={15}>15 min before</option>
            <option value={30}>30 min before</option>
            <option value={60}>1 hour before</option>
          </select>
        </div>
      </div>

      {/* Account */}
      <div className="mob-sett-card">
        <div className="mob-sett-card-title"><User size={15} /> Account</div>
        <p className="mob-sett-email-text">{session?.user?.email}</p>
        <button className="mob-signout-btn" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}

// ── Chat overlay ─────────────────────────────────────────────
function MobileChat({ ctx }) {
  const { chatOpen, setChatOpen, messages, chatInput, setChatInput, chatLoading, sendChat,
          microStartMode, setMicroStartMode, dark } = ctx;
  const [chatSuggestions, setChatSuggestions] = useState([]);
  const [chatGhost,       setChatGhost]       = useState("");
  const endRef   = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (chatOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [chatOpen]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatLoading]);

  return (
    <div className={`mob-chat${chatOpen ? " mob-chat-open" : ""}`}>
      <div className="mob-chat-header">
        <div className="mob-chat-brand">
          <img src={dark ? "/logo-dark.png" : "/logo-light.png"} className="mob-chat-avatar-logo" alt="NORA" />
          <div>
            <div className="mob-chat-title-text">NORA</div>
            <div className="mob-chat-sub">Your productivity assistant</div>
          </div>
        </div>
        <button className="mob-chat-close" onClick={() => setChatOpen(false)}>
          <X size={20} />
        </button>
      </div>

      <div className="mob-chat-messages">
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

      {chatSuggestions.length > 0 && (
        <div className="mob-chat-suggestions">
          {chatSuggestions.map((s, i) => (
            <button key={i} className="mob-chat-chip" onClick={() => {
              setChatInput(s); setChatGhost(""); setChatSuggestions([]);
              inputRef.current?.focus();
            }}>{s}</button>
          ))}
        </div>
      )}
      <div className="mob-chat-input-bar">
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
                setChatGhost(""); setChatSuggestions([]);
              } else if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendChat();
                setChatGhost(""); setChatSuggestions([]);
              }
            }}
            placeholder="Ask NORA anything…" />
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
  const fmtH  = (h) => h === 0 ? "12:00 AM" : h < 12 ? `${h}:00 AM` : h === 12 ? "12:00 PM" : `${h - 12}:00 PM`;

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
                  {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
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
  const { draft, setDraft, saveTask, deleteTask, groups } = ctx; // eslint-disable-line

  const HOURS_RANGE = Array.from({ length: 18 }, (_, i) => i + 6);

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
            <div className="mob-time-row">
              <select className="mob-modal-select mob-time-select"
                value={draft.startHour ?? ""}
                onChange={(e) => setDraft((d) => ({
                  ...d,
                  startHour: e.target.value === "" ? null : Number(e.target.value),
                  startMinute: e.target.value === "" ? null : (d.startMinute ?? 0),
                }))}>
                <option value="">No time</option>
                {HOURS_RANGE.map((h) => <option key={h} value={h}>{fmtTime(h, 0)}</option>)}
              </select>
              <select className="mob-modal-select mob-min-select"
                disabled={draft.startHour == null}
                value={draft.startMinute ?? 0}
                onChange={(e) => setDraft((d) => ({ ...d, startMinute: Number(e.target.value) }))}>
                {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
                  <option key={m} value={m}>{`:${pad(m)}`}</option>
                ))}
              </select>
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
          <button className="mob-modal-save" onClick={saveTask}>Save</button>
        </div>

      </div>
    </div>
  );
}
