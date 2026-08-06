import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Coffee, Pause, Play, RotateCcw, Settings2, Sparkles, X } from "lucide-react";
import BrandStar from "../BrandStar";
import { buildDeskObservation, buildDeskTimeline, DESK_PAGES, deskGreeting, taskMinutes } from "./deskModeModel";
import "./DeskMode.css";

const PAGE_KEY = "nora_desk_pages_v1";
const FOCUS_KEY = "nora_desk_focus_v1";
const pad = (value) => String(value).padStart(2, "0");
const formatTime = (task) => task?.startHour == null ? "Flexible" : `${pad(task.startHour)}:${pad(task.startMinute ?? 0)}`;
const formatRemaining = (seconds) => `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`;

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function useDeskPages() {
  const [enabled, setEnabled] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PAGE_KEY) ?? "null");
      return Array.isArray(saved) && saved.length ? saved : DESK_PAGES.map((page) => page.id);
    } catch { return DESK_PAGES.map((page) => page.id); }
  });
  const toggle = (id) => setEnabled((current) => {
    if (current.includes(id) && current.length === 1) return current;
    const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
    localStorage.setItem(PAGE_KEY, JSON.stringify(next));
    return next;
  });
  return { pages: enabled.map((id) => DESK_PAGES.find((page) => page.id === id)).filter(Boolean), enabled, toggle };
}

function DeskHeader({ page, pageCount, index, onPrevious, onNext, onCustomize }) {
  return (
    <header className="desk-header">
      <div className="desk-brand"><BrandStar size={19} tone="white" /><span>Nora</span><i>Desk Mode</i></div>
      <div className="desk-page-name" aria-live="polite">{page?.label}</div>
      <div className="desk-header-actions">
        <button onClick={onPrevious} disabled={index === 0} aria-label="Previous Desk Mode page"><ChevronLeft /></button>
        <span>{index + 1} / {pageCount}</span>
        <button onClick={onNext} disabled={index === pageCount - 1} aria-label="Next Desk Mode page"><ChevronRight /></button>
        <button onClick={onCustomize} aria-label="Customize Desk Mode"><Settings2 /></button>
      </div>
    </header>
  );
}

function DashboardPage({ ctx, now, timeline, observation, onStartFocus }) {
  const date = now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const progress = ctx.totalToday ? Math.round((ctx.doneToday / ctx.totalToday) * 100) : 0;
  return (
    <section className="desk-page desk-dashboard" aria-label="Desk dashboard">
      <div className="desk-clock-card desk-glass">
        <time className="desk-clock">{pad(now.getHours())}:{pad(now.getMinutes())}</time>
        <div className="desk-date">{date}</div>
        <div className="desk-greeting"><BrandStar size={16} tone="current" /> {deskGreeting(now)}, {ctx.accountName || "there"}.</div>
      </div>
      <div className="desk-now-card desk-glass">
        <span className="desk-eyebrow">{timeline.current ? "In progress" : "Up next"}</span>
        <h1>{timeline.current?.title ?? timeline.next?.title ?? "Your day is open"}</h1>
        {(timeline.current || timeline.next) && (
          <p>{formatTime(timeline.current ?? timeline.next)} · {(timeline.current ?? timeline.next).duration ?? 60} min</p>
        )}
        {(timeline.current ?? timeline.next) && (
          <button className="desk-focus-cta" onClick={() => onStartFocus(timeline.current ?? timeline.next)}>
            <Play size={15} /> Enter focus
          </button>
        )}
      </div>
      <div className="desk-progress-card desk-glass">
        <span className="desk-eyebrow">Today</span>
        <strong>{progress}%</strong>
        <div className="desk-progress"><i style={{ width: `${progress}%` }} /></div>
        <p>{ctx.doneToday ?? 0} of {ctx.totalToday ?? 0} planned tasks complete</p>
      </div>
      <div className="desk-observation-card desk-glass">
        <div className="desk-ai-presence"><BrandStar size={18} tone="current" /><span>Nora noticed</span></div>
        <blockquote>{observation}</blockquote>
      </div>
    </section>
  );
}

function TimelinePage({ timeline, now }) {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return (
    <section className="desk-page desk-timeline-page" aria-label="Today's timeline">
      <div className="desk-page-intro">
        <span className="desk-eyebrow">Today’s rhythm</span>
        <h1>One thing at a time.</h1>
      </div>
      <div className="desk-timeline desk-glass">
        {timeline.items.length ? timeline.items.map((task) => {
          const isCurrent = timeline.current?.id === task.id;
          const isPast = taskMinutes(task) + (task.duration ?? 60) <= currentMinutes;
          return (
            <article key={task.id} className={`desk-timeline-item${isCurrent ? " current" : ""}${isPast ? " past" : ""}`}>
              <time>{formatTime(task)}</time>
              <i />
              <div><strong>{task.title}</strong><span>{task.duration ?? 60} min{task.type === "break" ? " · Break" : ""}</span></div>
              {isCurrent && <em>Now</em>}
            </article>
          );
        }) : <div className="desk-empty">Nothing scheduled. Enjoy the space.</div>}
      </div>
    </section>
  );
}

function InsightsPage({ observation, ctx }) {
  const secondary = ctx.aiFocus?.insight || ctx.weeklyReflection?.insight || "Small, repeated starts are becoming part of your rhythm.";
  return (
    <section className="desk-page desk-insights-page" aria-label="Nora insights">
      <div className="desk-insight-hero desk-glass">
        <div className="desk-star-alive"><BrandStar size={34} tone="current" /></div>
        <span className="desk-eyebrow">I noticed something</span>
        <blockquote>{observation}</blockquote>
      </div>
      <div className="desk-insight-secondary desk-glass">
        <Sparkles size={18} />
        <p>{secondary}</p>
      </div>
    </section>
  );
}

function FocusWorkspace({ task, ctx, onExit }) {
  const defaultSeconds = Math.max(15, Math.min(task?.duration ?? 25, 120)) * 60;
  const [session, setSession] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(FOCUS_KEY) ?? "null");
      if (saved?.taskId === task?.id && saved?.status !== "completed") return saved;
    } catch {}
    return { taskId: task?.id, duration: defaultSeconds, remaining: defaultSeconds, status: "ready", endAt: null, distractions: 0 };
  });
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    localStorage.setItem(FOCUS_KEY, JSON.stringify(session));
  }, [session]);
  useEffect(() => {
    if (session.status !== "running") return undefined;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [session.status]);
  const remaining = session.status === "running"
    ? Math.max(0, Math.ceil((session.endAt - now) / 1000))
    : session.remaining;
  useEffect(() => {
    if (session.status === "running" && remaining === 0) {
      setSession((current) => ({ ...current, remaining: 0, status: "completed", endAt: null }));
    }
  }, [remaining, session.status]);
  const elapsed = session.duration - remaining;
  const progress = Math.max(0, Math.min(100, (elapsed / session.duration) * 100));
  const encouragement = progress >= 75 ? "You’re deep in it now. Protect the quiet."
    : progress >= 50 ? "Halfway through. Let the work stay simple."
      : progress >= 25 ? "The hardest transition is behind you." : "Only the first step matters.";
  const start = () => setSession((current) => ({ ...current, status: "running", endAt: Date.now() + current.remaining * 1000 }));
  const pause = () => setSession((current) => ({ ...current, status: "paused", remaining, endAt: null }));
  const reset = () => setSession({ taskId: task?.id, duration: defaultSeconds, remaining: defaultSeconds, status: "ready", endAt: null, distractions: 0 });
  const finish = () => {
    localStorage.removeItem(FOCUS_KEY);
    ctx.toggleTask?.(task.id);
    ctx.setFocusTask?.(null);
  };
  return (
    <main className={`desk-focus-workspace ${session.status}`} aria-label={`Focus workspace for ${task?.title}`}>
      <div className="desk-focus-ambient" aria-hidden="true" />
      <header>
        <div className="desk-brand"><BrandStar size={19} tone="white" /><span>Nora</span><i>Deep Work</i></div>
        <button onClick={onExit} aria-label="Leave Focus Workspace"><X /></button>
      </header>
      <section className="desk-focus-main">
        <div className="desk-focus-copy">
          <span className="desk-eyebrow">{session.status === "completed" ? "Session complete" : "Your only commitment"}</span>
          <h1>{task?.title ?? "Focus Session"}</h1>
          <p>{session.status === "completed" ? "You stayed with it. That matters more than a perfect session." : encouragement}</p>
          <div className="desk-focus-first-step"><BrandStar size={16} tone="current" /><span>Start by opening the work and doing the smallest visible piece.</span></div>
        </div>
        <div className="desk-focus-timer" aria-live="polite">
          <span>{formatRemaining(remaining)}</span>
          <div className="desk-focus-progress"><i style={{ width: `${progress}%` }} /></div>
          <small>{Math.round(progress)}% of this session</small>
        </div>
      </section>
      <footer>
        {session.status === "completed" ? (
          <button className="desk-focus-primary" onClick={finish}><Check /> Complete task</button>
        ) : (
          <>
            <button className="desk-focus-primary" onClick={session.status === "running" ? pause : start}>
              {session.status === "running" ? <><Pause /> Pause gently</> : <><Play /> {session.status === "paused" ? "Return to focus" : "Begin session"}</>}
            </button>
            <button onClick={() => setSession((current) => ({ ...current, distractions: current.distractions + 1, status: "paused", remaining, endAt: null }))}>
              <Coffee /> I got distracted
            </button>
            <button onClick={reset}><RotateCcw /> Restart</button>
          </>
        )}
      </footer>
    </main>
  );
}

export default function DeskMode({ ctx }) {
  const now = useClock();
  const { pages, enabled, toggle } = useDeskPages();
  const [pageIndex, setPageIndex] = useState(0);
  const [customizing, setCustomizing] = useState(false);
  const scrollerRef = useRef(null);
  const timeline = useMemo(() => buildDeskTimeline(ctx.tasks ?? [], now), [ctx.tasks, now]);
  const observation = buildDeskObservation({
    done: ctx.doneToday, total: ctx.totalToday, momentum: ctx.momentum,
    energy: ctx.energy, nextTask: timeline.next,
  });
  const goTo = (index) => {
    const next = Math.max(0, Math.min(pages.length - 1, index));
    setPageIndex(next);
    scrollerRef.current?.children[next]?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  };
  if (ctx.focusTask) return <FocusWorkspace task={ctx.focusTask} ctx={ctx} onExit={() => ctx.setFocusTask(null)} />;
  return (
    <main className="desk-mode native-ui dark" aria-label="Nora Desk Mode">
      <div className="desk-ambient" aria-hidden="true" />
      <DeskHeader page={pages[pageIndex]} pageCount={pages.length} index={pageIndex}
        onPrevious={() => goTo(pageIndex - 1)} onNext={() => goTo(pageIndex + 1)}
        onCustomize={() => setCustomizing(true)} />
      <div className="desk-pages" ref={scrollerRef} onScroll={(event) => {
        const width = event.currentTarget.clientWidth;
        if (width) setPageIndex(Math.round(event.currentTarget.scrollLeft / width));
      }}>
        {pages.map((page) => page.id === "dashboard"
          ? <DashboardPage key={page.id} ctx={ctx} now={now} timeline={timeline} observation={observation} onStartFocus={ctx.setFocusTask} />
          : page.id === "timeline"
            ? <TimelinePage key={page.id} timeline={timeline} now={now} />
            : <InsightsPage key={page.id} observation={observation} ctx={ctx} />)}
      </div>
      <nav className="desk-dots" aria-label="Desk Mode pages">
        {pages.map((page, index) => <button key={page.id} className={index === pageIndex ? "active" : ""} onClick={() => goTo(index)} aria-label={`Open ${page.label}`} />)}
      </nav>
      {customizing && (
        <div className="desk-customize-backdrop" onClick={() => setCustomizing(false)}>
          <section className="desk-customize desk-glass" onClick={(event) => event.stopPropagation()} aria-label="Customize Desk Mode">
            <header><div><span className="desk-eyebrow">Desk Mode</span><h2>Choose your pages</h2></div><button onClick={() => setCustomizing(false)} aria-label="Close customization"><X /></button></header>
            <p>More widgets, sizing and reordering can plug into this page system later.</p>
            {DESK_PAGES.map((page) => (
              <label key={page.id}><input type="checkbox" checked={enabled.includes(page.id)} onChange={() => toggle(page.id)} /><span>{page.label}</span></label>
            ))}
          </section>
        </div>
      )}
    </main>
  );
}
