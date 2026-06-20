import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Check, ChevronDown, ChevronLeft, ChevronRight, Clock, MessageSquare, X, Send,
  FileText, Trash2, User, RotateCcw, CalendarDays,
  Flag, Coffee, Bell, Activity, Wind, TrendingUp,
  TrendingDown, Minus, AlertTriangle, Moon, Sunrise,
  SkipForward, Sparkles, Plus, Settings,
  BarChart2, Zap, List, CheckSquare, Pencil, Layers,
  Share2, Users, Search,
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
import UsernameOnboarding from "./components/UsernameOnboarding";
import UsernameNudgeBanner from "./components/UsernameNudgeBanner";
import ProfileModal from "./components/ProfileModal";
import AvatarDisplay, { profileToAvatar } from "./components/AvatarDisplay";
import { MobileWhiteboardView } from "./Whiteboard";
import "./MobileApp.css";

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

// ── Root ─────────────────────────────────────────────────────
export default function MobileApp({ ctx }) {
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

  const { dark, theme, chatOpen, setChatOpen, editingTask, draft, inAppAlert, setInAppAlert,
          rescheduleTask, setRescheduleTask, saveReschedule, groups,
          focusTask, setFocusTask, userPrefs, setUserPrefs, toggleTask,
          notifBannerVisible, dismissNotifBanner, requestNotifPermission,
          sharingTask, setSharingTask, session } = ctx;

  const TYPE_COLORS   = { task:"var(--accent)", deadline:"#ef4444", break:"#94a3b8" };
  const COMPLEX_COLORS = { easy:"#22c55e", medium:"#f59e0b", hard:"#ef4444" };

  return (
    <div className={`app mob-app${dark ? " dark" : ""}${theme === "liquid_glass" ? " glass" : ""}`}>

      <MobileHeader ctx={ctx} onLogoClick={() => {
        setMobileView("plan");
        setPlanSubView("day");
        setPlanDate(ctx.today);
      }} onBoardsClick={() => setMobileView("boards")} />

      <main className="mob-main">
        {mobileView === "plan"     && <MobilePlan ctx={ctx} subView={planSubView} setSubView={setPlanSubView} dayMode={dayMode} setDayMode={setDayMode} filterType={filterType} filterGroup={filterGroup} filterComplex={filterComplex} hasFilters={hasFilters} onOpenFilters={() => setShowFilters(true)} planDate={planDate} setPlanDate={setPlanDate} />}
        {mobileView === "tasks"    && <MobileTasks ctx={ctx} />}
        {mobileView === "notes"    && <MobileNotes ctx={ctx} />}
        {mobileView === "boards"   && <MobileWhiteboardView boards={ctx.boards} onAskNora={p => { ctx.setChatInput(p); ctx.setChatOpen(true); }} onClose={() => setMobileView("plan")} />}
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
          }}
        />
      )}

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

    </div>
  );
}

// ── Header ───────────────────────────────────────────────────
function MobileHeader({ ctx, onLogoClick, onBoardsClick }) {
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
  const { notes, setNotes, deleteNote, patchNote } = ctx;
  const [openId,      setOpenId]      = useState(null);
  const [deletingId,  setDeletingId]  = useState(null);
  const [noteSearch,  setNoteSearch]  = useState("");

  const openNote = openId ? notes.find(n => n.id === openId) : null;
  const migrated = openNote ? migrateNote(openNote) : null;

  const closeNote = () => {
    if (openNote) {
      const m = migrateNote(openNote);
      if (!m.title?.trim() && !m.content?.trim() && !m.items?.length) {
        deleteNote(openNote.id);
      }
    }
    setOpenId(null);
  };

  const handleDelete = (id) => {
    setDeletingId(id);
    if (openId === id) setOpenId(null);
    setTimeout(() => { deleteNote(id); setDeletingId(null); }, 200);
  };

  const handleCreate = (type = "note") => {
    const n = { id: uid(), type, title: "", content: "", items: [], color: "default", pinned: false, starred: false, createdAt: Date.now(), updatedAt: Date.now() };
    setNotes(p => [...p, n]);
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
    <div key={note.id} className="mob-notes-masonry-item">
      <NoteCard
        note={note}
        deleting={deletingId === note.id}
        onClick={() => setOpenId(note.id)}
        onDelete={() => handleDelete(note.id)}
        onPin={() => patchNote(note.id, { pinned: !note.pinned })}
        onStar={() => patchNote(note.id, { starred: !note.starred })}
      />
    </div>
  );

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
            <div className="mob-notes-masonry">
              {pinnedNotes.map(renderNoteCard)}
            </div>
          </>
        )}

        {/* Other notes */}
        {otherNotes.length > 0 && (
          <>
            {pinnedNotes.length > 0 && <div className="mob-notes-section-hdr">Notes</div>}
            <div className="mob-notes-masonry">
              {otherNotes.map(renderNoteCard)}
            </div>
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
            <div className="mob-sleep-checkin-header">
              <span className="mob-sleep-checkin-lbl">How was your sleep?</span>
              {ctx.morningCheckup?.sleepQuality && ctx.morningCheckup.sleepQuality === todaySleepQuality && (
                <span className="mob-sleep-from-checkup">✓ from check-up</span>
              )}
            </div>
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
          if (!hasData) return (
            <div className="mob-lti-preview">
              <p className="mob-checkup-cta-text">Complete a few check-ins to unlock your trends.</p>
              <button className="mob-checkup-btn" onClick={() => ctx.setShowLongTermInsights(true)}>Open Insights →</button>
            </div>
          );
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
    userProfile, setShowProfileModal,
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
          Edit profile &amp; avatar
        </button>
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
          testServerPush={ctx.testServerPush}
          forceResubscribe={ctx.forceResubscribe}
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

  useEffect(() => {
    if (chatOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [chatOpen]);

  useEffect(() => {
    if (!chatOpen || aiChatSugFetchedRef.current) return;
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
  }, [chatOpen]); // eslint-disable-line react-hooks/exhaustive-deps

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

      <div className="mob-chat-suggestions">
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

  const HOURS_RANGE = Array.from({ length: 24 }, (_, i) => i);

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
                {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                  <option key={m} value={m}>:{pad(m)}</option>
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
