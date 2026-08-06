import React from "react";
import {
  BatteryMedium, CalendarClock, CloudSun, Headphones, HeartPulse,
  Music2, Sparkles, ThermometerSun, TimerReset, Zap,
} from "lucide-react";
import BrandStar from "../../BrandStar";
import { buildSmartClockContext, deskGreeting } from "../deskModeModel";
import { calculateDeadlineHealth, createFocusSession } from "../../../domain/tasks/taskIntelligence";

const pad = (value) => String(value).padStart(2, "0");
const formatTime = (task) => task?.startHour == null
  ? "Flexible"
  : `${pad(task.startHour)}:${pad(task.startMinute ?? 0)}`;
const formatMinutes = (minutes) => {
  if (!minutes) return "No open time";
  if (minutes < 60) return `${minutes} min free`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${hours}h${rest ? ` ${rest}m` : ""} free`;
};

function Metric({ icon, label, value, detail, color }) {
  return (
    <div className="desk-widget-metric" style={color ? { "--widget-accent": color } : undefined}>
      <span>{icon}{label}</span>
      <strong>{value ?? "—"}</strong>
      {detail && <small>{detail}</small>}
    </div>
  );
}

export default function NowWorkspace({
  ctx,
  now,
  timeline,
  observation,
  widgets,
  media,
  onOpenWorkspace,
  onStartFocus,
}) {
  const progress = ctx.totalToday ? Math.round((ctx.doneToday / ctx.totalToday) * 100) : 0;
  const smart = buildSmartClockContext({
    now,
    timeline,
    done: ctx.doneToday,
    total: ctx.totalToday,
  });
  const weather = ctx.weather ?? null;
  const recovery = ctx.healthSummary?.recoveryScore ?? ctx.metrics?.recoveryIndex?.value ?? null;
  const energy = ctx.healthSummary?.energyScore ?? ctx.energy ?? null;
  const currentTask = timeline.current ?? ctx.aiFocus?.priorityTask ?? timeline.next;
  const deadlineHealth = currentTask
    ? calculateDeadlineHealth(currentTask, ctx.tasks ?? [], now)
    : null;
  const focusSuggestion = currentTask ? createFocusSession(currentTask) : null;

  const renderWidget = (widget) => {
    const className = `desk-widget desk-widget-${widget.id} desk-size-${widget.size}`;
    if (widget.id === "clock") {
      return (
        <section key={widget.id} className={className} aria-label="Current time and context">
          <div className="desk-clock-topline">
            <span>{smart.period}</span>
            <span className="desk-live-dot">Live</span>
          </div>
          <time className="desk-clock">{pad(now.getHours())}:{pad(now.getMinutes())}</time>
          <p className="desk-date">{now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p>
          <h1>{deskGreeting(now)}, {ctx.accountName || "there"}.</h1>
          <p className="desk-smart-line">{smart.headline}</p>
          <div className="desk-weather-line">
            {weather
              ? <><CloudSun size={16} /><strong>{weather.temperature}°</strong><span>{weather.condition}</span></>
              : <><CloudSun size={16} /><span>Weather not connected</span></>}
          </div>
        </section>
      );
    }
    if (widget.id === "focus") {
      return (
        <section key={widget.id} className={className}>
          <span className="desk-eyebrow"><Zap size={13} /> Current focus</span>
          <h2>{currentTask?.title ?? "Your attention is free"}</h2>
          <p>{currentTask ? `${formatTime(currentTask)} · ${focusSuggestion.duration} min · ${deadlineHealth.level}` : ctx.contextMode?.label ?? "Focus Mode"}</p>
          {currentTask && <small>{focusSuggestion.expectedOutcome}</small>}
          {currentTask && (
            <button className="desk-primary-action" onClick={() => onStartFocus(currentTask)}>
              <TimerReset size={15} /> Begin focus
            </button>
          )}
        </section>
      );
    }
    if (widget.id === "schedule") {
      return (
        <button key={widget.id} className={className} onClick={() => onOpenWorkspace("timeline")}>
          <span className="desk-eyebrow"><CalendarClock size={13} /> Up next</span>
          <strong>{timeline.next?.title ?? "Nothing scheduled"}</strong>
          <small>{timeline.next ? formatTime(timeline.next) : formatMinutes(timeline.freeMinutes)}</small>
          <span className="desk-widget-secondary">
            Next meeting: {timeline.nextMeeting?.title ?? "None"}
          </span>
        </button>
      );
    }
    if (widget.id === "progress") {
      return (
        <section key={widget.id} className={className}>
          <span className="desk-eyebrow">Today</span>
          <strong className="desk-progress-value">{progress}%</strong>
          <div className="desk-progress"><i style={{ width: `${progress}%` }} /></div>
          <small>{ctx.doneToday ?? 0} of {ctx.totalToday ?? 0} complete · {formatMinutes(timeline.freeMinutes)}</small>
        </section>
      );
    }
    if (widget.id === "energy") {
      return (
        <section key={widget.id} className={className}>
          <Metric icon={<Zap size={14} />} label="Energy" value={energy != null ? Math.round(energy) : null} detail={energy != null ? "Current capacity" : "Check in to add data"} color="#f5a524" />
        </section>
      );
    }
    if (widget.id === "recovery") {
      return (
        <section key={widget.id} className={className}>
          <Metric icon={<HeartPulse size={14} />} label="Recovery" value={recovery != null ? Math.round(recovery) : null} detail={ctx.healthSummary ? "From HealthKit" : "Based on workload"} color="#38d39f" />
        </section>
      );
    }
    if (widget.id === "music") {
      return (
        <button key={widget.id} className={className} onClick={() => onOpenWorkspace("music")}>
          <span className="desk-eyebrow"><Music2 size={13} /> Music</span>
          <strong>{media.title}</strong>
          <small>{media.artist}</small>
          <Headphones size={20} className="desk-widget-corner-icon" />
        </button>
      );
    }
    return (
      <section key={widget.id} className={className}>
        <span className="desk-eyebrow"><BrandStar size={13} tone="current" /> Nora noticed</span>
        <blockquote>{observation}</blockquote>
        <Sparkles size={18} className="desk-widget-corner-icon" />
      </section>
    );
  };

  return (
    <section className="desk-workspace desk-now-workspace" aria-label="Now workspace">
      <div className="desk-widget-grid">
        {widgets.filter((widget) => !widget.hidden).map(renderWidget)}
      </div>
      <div className="desk-device-strip" aria-label="Device information">
        <BatteryMedium size={13} />
        <span>Display awake</span>
        {weather?.temperature != null && <><ThermometerSun size={13} /><span>{weather.temperature}°</span></>}
      </div>
    </section>
  );
}
