import React from "react";
import { Check, Coffee, Lightbulb, Sparkles } from "lucide-react";
import { suggestedGapActivity, taskMinutes } from "../deskModeModel";

const pad = (value) => String(value).padStart(2, "0");
const clock = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

export default function TimelineWorkspace({ timeline, now }) {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const entries = [
    ...timeline.allToday.map((task) => ({
      type: "task",
      start: taskMinutes(task),
      task,
    })),
    ...timeline.gaps.map((gap) => ({ type: "gap", start: gap.start, gap })),
  ].sort((a, b) => a.start - b.start);

  return (
    <section className="desk-workspace desk-timeline-workspace" aria-labelledby="desk-timeline-title">
      <header className="desk-workspace-intro">
        <span className="desk-eyebrow">Today’s rhythm</span>
        <h1 id="desk-timeline-title">One thing at a time.</h1>
        <p>Completed work fades. The current commitment stays clear.</p>
      </header>
      <div className="desk-vertical-timeline">
        <span className="desk-now-line" style={{ "--now-position": `${Math.max(0, Math.min(100, ((currentMinutes - 8 * 60) / (12 * 60)) * 100))}%` }} />
        {entries.length ? entries.map((entry, index) => {
          if (entry.type === "gap") {
            const suggestion = suggestedGapActivity(entry.gap.minutes);
            return (
              <article key={`gap-${entry.start}`} className="desk-timeline-gap">
                <time>{clock(entry.gap.start)}</time>
                <span className="desk-timeline-node"><Sparkles size={13} /></span>
                <div>
                  <strong>{entry.gap.minutes} minutes open</strong>
                  <p><Lightbulb size={12} /> {suggestion} would fit here.</p>
                </div>
              </article>
            );
          }
          const task = entry.task;
          const start = taskMinutes(task);
          const isCurrent = !task.completed
            && start <= currentMinutes
            && currentMinutes < start + (task.duration ?? 60);
          const isPast = task.completed || start + (task.duration ?? 60) <= currentMinutes;
          return (
            <article key={task.id ?? index} className={`desk-timeline-entry${isCurrent ? " is-current" : ""}${isPast ? " is-past" : ""}`}>
              <time>{clock(start)}</time>
              <span className="desk-timeline-node">{isPast ? <Check size={13} /> : task.type === "break" ? <Coffee size={13} /> : null}</span>
              <div>
                <strong>{task.title}</strong>
                <p>{task.duration ?? 60} min{isCurrent ? " · Now" : task.completed ? " · Completed" : ""}</p>
              </div>
            </article>
          );
        }) : (
          <div className="desk-empty-state">
            <Sparkles size={22} />
            <strong>Your timeline is open.</strong>
            <p>Walk, read, clear your inbox, or leave the space untouched.</p>
          </div>
        )}
      </div>
    </section>
  );
}
