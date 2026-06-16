import React, { useState, useRef, useEffect } from "react";
import {
  Check, ChevronLeft, ChevronRight, Clock, MessageSquare, X, Send,
  FileText, Trash2, User, RotateCcw, CalendarDays,
  Flag, Coffee, Bell, Activity, Wind, TrendingUp,
  TrendingDown, Minus, AlertTriangle, Moon, Sunrise,
  SkipForward, Sparkles, Plus, Settings,
  BarChart2, Zap, List, CheckSquare, Pencil,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import MorningCheckup, { computeReadiness } from "./MorningCheckup";
import LongTermInsights from "./LongTermInsights";
import FocusSession from "./FocusSession";
import NotificationPermissionBanner from "./components/NotificationPermissionBanner";
import NotificationSettings from "./components/NotificationSettings";
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

// ── Root ─────────────────────────────────────────────────────
export default function MobileApp({ ctx }) {
  const [mobileView,    setMobileView]    = useState("plan");
  const [planSubView,   setPlanSubView]   = useState("day");
  const [dayMode,       setDayMode]       = useState("list");
  const [planDate,      setPlanDate]      = useState(ctx.today);
  // Filter state lives here (root level) so the sheet can be rendered above everything
  const [showFilters,   setShowFilters]   = useState(false);
  const [filterType,    setFilterType]    = useState(null);
  const [filterGroup,   setFilterGroup]   = useState(null);
  const [filterComplex, setFilterComplex] = useState(null);
  const hasFilters = filterType || filterGroup || filterComplex;

  const { dark, theme, chatOpen, setChatOpen, editingTask, draft, inAppAlert, setInAppAlert,
          rescheduleTask, setRescheduleTask, saveReschedule, groups,
          focusTask, setFocusTask, userPrefs, setUserPrefs, toggleTask,
          notifBannerVisible, dismissNotifBanner, requestNotifPermission } = ctx;

  const TYPE_COLORS   = { task:"var(--accent)", deadline:"#ef4444", break:"#94a3b8" };
  const COMPLEX_COLORS = { easy:"#22c55e", medium:"#f59e0b", hard:"#ef4444" };

  return (
    <div className={`app mob-app${dark ? " dark" : ""}${theme === "liquid_glass" ? " glass" : ""}`}>

      <MobileHeader ctx={ctx} onLogoClick={() => {
        setMobileView("plan");
        setPlanSubView("day");
        setPlanDate(ctx.today);
      }} />

      <main className="mob-main">
        {mobileView === "plan"     && <MobilePlan ctx={ctx} subView={planSubView} setSubView={setPlanSubView} dayMode={dayMode} setDayMode={setDayMode} filterType={filterType} filterGroup={filterGroup} filterComplex={filterComplex} hasFilters={hasFilters} onOpenFilters={() => setShowFilters(true)} planDate={planDate} setPlanDate={setPlanDate} />}
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

    </div>
  );
}

// ── Header ───────────────────────────────────────────────────
function MobileHeader({ ctx, onLogoClick }) {
  const { today, dark } = ctx;
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
      <span className="mob-header-date">{dateText}</span>
    </header>
  );
}

// ── Plan view (Day / Month) ───────────────────────────────────
function MobilePlan({ ctx, subView, setSubView, dayMode, setDayMode,
                      filterType, filterGroup, filterComplex, hasFilters, onOpenFilters,
                      planDate, setPlanDate }) {
  const { today, tasks } = ctx;

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

          {dayMode === "list"
            ? <MobileHome ctx={ctx} planDate={planDate} planTasks={planTasks} />
            : <MobileGrid ctx={{ ...ctx, todayTasks: planTasks }} />}
        </>
      )}

      {subView === "month" && <MobileMonth ctx={ctx} onSelectDate={(d) => { setPlanDate(d); setSubView("day"); }} />}

    </div>
  );
}

// ── Home view (Day list mode) ────────────────────────────────
function MobileHome({ ctx, planDate, planTasks }) {
  const {
    todayTasks, today, aiFocus, contextMode, deferredTasks,
    doneToday, totalToday, pct, toggleTask, skipTask,
    setChatInput, setChatOpen, setEditingTask, setFocusTask,
    groups, nowObj,
  } = ctx;

  // Use planTasks when browsing a different date, otherwise use todayTasks
  const effectiveDate  = planDate ?? today;
  const effectiveTasks = planTasks ?? todayTasks;

  const nowMins = nowObj.getHours() * 60 + nowObj.getMinutes();

  const scheduled = [...effectiveTasks]
    .filter((t) => t.startHour != null)
    .sort((a, b) => a.startHour * 60 + (a.startMinute ?? 0) - (b.startHour * 60 + (b.startMinute ?? 0)));

  const unscheduled = effectiveTasks.filter((t) => t.startHour == null);

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

                {tp === "task" && !t.completed && (
                  <button className="mai-focus-btn"
                    onClick={(e) => { e.stopPropagation(); setFocusTask(t); }}
                    title="Start focus session">
                    <Zap size={13} />
                  </button>
                )}
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
            <Sparkles size={15} /> Let Nora plan my day
          </button>
        </div>
      )}

      {/* Unscheduled tasks */}
      {unscheduled.length > 0 && (
        <div className="mob-agenda mob-unsched-section">
          <div className="mob-section-title">
            <Clock size={14} /> Unscheduled
          </div>
          {unscheduled.map((t) => {
            const tp    = t.type ?? "task";
            const group = getGroup(t.groupId);
            const gc    = tp === "deadline" ? "#ef4444"
                        : tp === "break"    ? "#94a3b8"
                        : group?.color ?? "var(--accent)";
            return (
              <div key={t.id}
                className={`mob-agenda-item${t.completed ? " mai-done" : ""}${tp === "deadline" ? " mai-dl" : ""}${tp === "break" ? " mai-break" : ""}`}
                style={{ "--gc": gc }}
                onClick={() => setEditingTask(t)}>
                <div className="mai-body">
                  <span className="mai-title">{t.title || (tp === "break" ? "Break" : "Deadline")}</span>
                </div>
                {tp === "task" && !t.completed && (
                  <button className="mai-focus-btn"
                    onClick={(e) => { e.stopPropagation(); setFocusTask(t); }}
                    title="Start focus session">
                    <Zap size={13} />
                  </button>
                )}
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
      )}

      {/* Quick add */}
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
                className={`mob-grid-block${t.completed ? " mob-gb-done" : ""}${tp === "break" ? " mob-gb-break" : ""}`}
                style={{ top, height, "--gc": color, background: tp === "break" ? `${color}10` : `${color}14` }}
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
  const { tasks, today, toggleTask, skipTask, setRescheduleTask, setEditingTask, groups, setFocusTask } = ctx;
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
const MOB_NOTE_COLORS = {
  yellow: { bg: "#fef9c3", border: "#fde68a", text: "#78350f" },
  pink:   { bg: "#fce7f3", border: "#f9a8d4", text: "#701a75" },
  blue:   { bg: "#dbeafe", border: "#93c5fd", text: "#1e3a8a" },
  green:  { bg: "#dcfce7", border: "#86efac", text: "#14532d" },
};

function MobileNotes({ ctx }) {
  const { notes, setNotes, deleteNote, patchNote } = ctx;
  const [openId, setOpenId] = useState(null);

  const openNote = notes.find(n => n.id === openId);
  const nc = (color) => MOB_NOTE_COLORS[color ?? "yellow"];

  const handleCreate = (color) => {
    const n = { id: uid(), title: "", content: "", color, done: false, createdAt: Date.now() };
    setNotes(p => [...p, n]);
    setOpenId(n.id);
  };

  return (
    <div className="mob-notes-v2">
      {notes.length === 0 ? (
        <div className="mob-empty-state" style={{ padding: "40px 0" }}>
          <FileText size={36} style={{ opacity: .15 }} />
          <p>No notes yet. Tap a colour to create one.</p>
        </div>
      ) : (
        <div className="mob-sticky-grid">
          {[...notes].reverse().map((note) => {
            const c = nc(note.color);
            return (
              <div key={note.id} className="mob-sticky-card"
                style={{ background: c.bg, borderColor: c.border }}
                onClick={() => setOpenId(note.id)}>
                <div className="mob-sticky-title" style={{ color: c.text }}>
                  {note.title || note.content?.split("\n")[0] || "Untitled"}
                </div>
                {note.content && (
                  <div className="mob-sticky-preview" style={{ color: c.text }}>
                    {note.content.slice(0, 60)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Color palette to create new notes */}
      <div className="mob-sticky-new-row">
        {Object.entries(MOB_NOTE_COLORS).map(([color, val]) => (
          <button key={color} className="mob-sticky-new-btn"
            style={{ background: val.bg, borderColor: val.border }}
            onClick={() => handleCreate(color)}>
            <Plus size={18} style={{ color: val.text }} />
          </button>
        ))}
      </div>

      {/* Expanded note bottom sheet */}
      {openNote && (
        <div className="mob-sticky-overlay" onClick={() => setOpenId(null)}>
          <div className="mob-sticky-sheet"
            style={{ background: nc(openNote.color).bg, borderColor: nc(openNote.color).border }}
            onClick={e => e.stopPropagation()}>
            <div className="mob-modal-handle" />
            <div className="mob-sticky-sheet-top">
              <input className="mob-sticky-sheet-title"
                style={{ color: nc(openNote.color).text }}
                value={openNote.title ?? ""}
                onChange={e => patchNote(openNote.id, { title: e.target.value })}
                placeholder="Note title" />
              <button className="mob-modal-close" onClick={() => setOpenId(null)}>
                <X size={20} />
              </button>
            </div>
            <div className="mob-sticky-color-row">
              {Object.entries(MOB_NOTE_COLORS).map(([key, val]) => (
                <button key={key} className={`mob-sticky-color-dot${openNote.color === key ? " active" : ""}`}
                  style={{ background: val.bg, borderColor: val.border, outlineColor: val.text }}
                  onClick={() => patchNote(openNote.id, { color: key })} />
              ))}
              <button className="mob-sticky-del" onClick={() => { deleteNote(openNote.id); setOpenId(null); }}>
                <Trash2 size={15} />
              </button>
            </div>
            <textarea className="mob-sticky-content"
              style={{ color: nc(openNote.color).text }}
              value={openNote.content ?? ""}
              onChange={e => patchNote(openNote.id, { content: e.target.value })}
              placeholder="Write your note…" />
          </div>
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
    sleepState, todaySleepQuality, setSleepQuality,
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
            <span className="mob-assess-rec-lbl">Nora suggests:</span> {adaptiveRecs[0]}
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

      {/* § Sleep & Recovery */}
      <div className="mob-sv2-card mob-sleep-card">
        <div className="mob-status-card-title"><Moon size={14} /> Sleep &amp; Recovery</div>
        <div className="mob-sleep-body">
          {/* Check-in */}
          <div className="mob-sleep-checkin">
            <span className="mob-sleep-checkin-lbl">How was your sleep?</span>
            <div className="mob-sleep-q-row">
              {[["poor","Poor"],["okay","Okay"],["good","Good"]].map(([val, label]) => (
                <button key={val}
                  className={`mob-sleep-q-btn mob-sq-${val}${todaySleepQuality === val ? " active" : ""}`}
                  onClick={() => setSleepQuality(val)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {/* Signals */}
          <div className="mob-sleep-signals">
            <div className="mob-sleep-signal-row">
              <span>Sleep Pressure</span>
              <span className="mob-sleep-badge" style={{ color: sleepState?.pressureColor, background: `${sleepState?.pressureColor}15` }}>
                {sleepState?.pressure ?? "—"}
              </span>
            </div>
            <div className="mob-sleep-signal-row">
              <span>Tonight's Risk</span>
              <span className="mob-sleep-badge" style={{ color: sleepState?.riskColor, background: `${sleepState?.riskColor}15` }}>
                {sleepState?.tonightRisk ?? "—"}
              </span>
            </div>
          </div>
        </div>
        {sleepState?.suggestion && (
          <div className="mob-sleep-suggestion">{sleepState.suggestion}</div>
        )}
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
          }}>Rebalance all with Nora</button>
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

      {/* § Morning Check-Up */}
      <div className="mob-sv2-card mob-checkup-card">
        <div className="mob-status-card-title"><Sunrise size={14} className="mcu-sunrise-icon" /> Morning Check-Up</div>
        {ctx.morningCheckup ? (() => {
          const r = computeReadiness(ctx.morningCheckup) ?? { label: "Moderate", color: "#f59e0b", pct: 50 };
          return (
            <div className="mob-checkup-done">
              <div className="mob-checkup-done-row">
                <span className="mob-checkup-badge">✓ Submitted</span>
                <span style={{ color: r.color, fontWeight: 700, fontSize: 13 }}>
                  {r.label}{Number.isFinite(r.pct) ? ` · ${r.pct}%` : ""}
                </span>
              </div>
              {ctx.morningCheckup.noraSummary && (
                <p className="mob-checkup-summary">"{ctx.morningCheckup.noraSummary}"</p>
              )}
              <button className="mob-checkup-btn" style={{ marginTop: 8, background: "var(--surface-2)", color: "var(--accent)", boxShadow: "none", border: "1px solid var(--border)" }}
                onClick={() => { ctx.setReviewCheckupMode(true); ctx.setShowMorningCheckup(true); }}>
                Review results →
              </button>
            </div>
          );
        })() : (
          <div className="mob-checkup-cta">
            <p className="mob-checkup-cta-text">Help Nora understand your day before planning it.</p>
            <button className="mob-checkup-btn" onClick={() => { ctx.setReviewCheckupMode && ctx.setReviewCheckupMode(false); ctx.setShowMorningCheckup(true); }}>
              Start Morning Check-Up
            </button>
          </div>
        )}
      </div>

      {/* § Long-Term Insights */}
      <div className="mob-sv2-card mob-lti-card">
        <div className="mob-status-card-title"><Activity size={14} /> Long-Term Insights</div>
        {(() => {
          const entries = Object.entries(ctx.dailyMetrics || {});
          const hasData = entries.length >= 3;
          if (!hasData) return <p className="mob-checkup-cta-text">Complete a few check-ins to unlock your trends.</p>;
          const recent = entries.slice(-7).map(([, v]) => v.energy).filter(Boolean);
          const trend = recent.length >= 3 && recent.slice(-3).reduce((a, b) => a + b, 0) / 3 > recent.slice(0, 3).reduce((a, b) => a + b, 0) / 3 ? "↑ improving" : "→ stable";
          return (
            <div className="mob-lti-preview">
              <p className="mob-lti-signal">Energy {trend} this week · {entries.length} days tracked</p>
              <button className="mob-checkup-btn" onClick={() => ctx.setShowLongTermInsights(true)}>Open Insights →</button>
            </div>
          );
        })()}
      </div>

      {/* § 7 What NORA Recommends */}
      {adaptiveRecs.length > 0 && (
        <div className="mob-sv2-card mob-recs-card">
          <div className="mob-status-card-title"><Zap size={14} /> What Nora Recommends</div>
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
  const {
    accountName, setAccountName,
    dark, setDark,
    theme, setTheme,
    reminderMins, setReminderMins,
    session, groups, setGroups,
    notifPermission, notifSettings, updateNotifSettings, requestNotifPermission,
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
        <div className="mob-sett-card-title"><User size={15} /> Profile</div>
        <div className="mob-sett-avatar-row">
          <div className="mob-sett-avatar">
            {(accountName?.trim()?.[0] ?? session?.user?.email?.[0] ?? "U").toUpperCase()}
          </div>
          <div className="mob-sett-avatar-info">
            <MobNameEditor name={accountName} onSave={setAccountName} />
            <span className="mob-sett-email-sm">{session?.user?.email}</span>
          </div>
        </div>
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
        <NotificationSettings
          permission={notifPermission}
          settings={notifSettings}
          updateSettings={updateNotifSettings}
          onRequestPermission={requestNotifPermission}
          reminderMins={reminderMins}
          setReminderMins={setReminderMins}
          health={ctx.notifHealth}
          sendTestNotification={ctx.sendTestNotification}
        />
      </div>

      {/* Groups */}
      <div className="mob-sett-card">
        <div className="mob-sett-card-title"><Activity size={15} /> Task Groups</div>
        {/* Existing groups */}
        {(groups || []).map(g => {
          const isBuiltin = g.id === "private" || g.id === "work";
          return (
            <div key={g.id} className="mob-group-row">
              <span className="mob-group-dot" style={{ background: g.color }} />
              <span className="mob-group-name">{g.name}</span>
              {isBuiltin
                ? <span className="mob-group-builtin">Built-in</span>
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
              placeholder="New group name" />
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
  const [chatSuggestions, setChatSuggestions] = useState(DEFAULT_CHAT_CHIPS);
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

      <div className="mob-chat-suggestions">
        <div className="mob-chat-chips-pill">
          {chatSuggestions.map((s, i) => (
            <button key={i} className="mob-chat-chip" onClick={() => {
              setChatInput(s); setChatGhost(""); setChatSuggestions(DEFAULT_CHAT_CHIPS);
              inputRef.current?.focus();
            }}>{s}</button>
          ))}
        </div>
      </div>
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
