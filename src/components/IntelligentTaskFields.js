import React, { useMemo, useState } from "react";
import { Brain, CalendarClock, ChevronDown, ChevronUp } from "lucide-react";
import BrandStar from "./BrandStar";
import {
  calculateDeadlineHealth,
  inferTaskIntelligence,
  suggestTaskSchedule,
} from "../domain/tasks/taskIntelligence";
import "./IntelligentTaskFields.css";

const titleCase = (value) => value ? value[0].toUpperCase() + value.slice(1) : "—";

export default function IntelligentTaskFields({
  task,
  setTask,
  tasks = [],
  compact = false,
}) {
  const [advanced, setAdvanced] = useState(false);
  const suggestion = useMemo(
    () => inferTaskIntelligence(task.title, task.estimatedDuration ?? task.duration),
    [task.duration, task.estimatedDuration, task.title],
  );
  const health = useMemo(
    () => calculateDeadlineHealth(task, tasks),
    [task, tasks],
  );
  const schedule = useMemo(
    () => suggestTaskSchedule({ ...task, ...suggestion }, tasks),
    [suggestion, task, tasks],
  );
  const accept = () => setTask((current) => ({
    ...current,
    ...suggestion,
    ...(schedule.blocks[0] && current.startHour == null ? {
      date: schedule.blocks[0].date,
      startHour: schedule.blocks[0].startHour,
      startMinute: schedule.blocks[0].startMinute,
      scheduledBlocks: schedule.blocks,
      status: "planned",
    } : {}),
  }));

  return (
    <section className={`task-intelligence${compact ? " is-compact" : ""}`} aria-label="Nora task intelligence">
      <header>
        <span><BrandStar size={13} tone="purple" /> Nora suggests</span>
        <button type="button" onClick={accept}>Accept</button>
      </header>
      <div className="task-intelligence-summary">
        <span>{suggestion.estimatedDuration} min</span>
        <span>{titleCase(suggestion.energyLevel)} energy</span>
        <span>{titleCase(suggestion.cognitiveLoad)}</span>
        {task.deadline && <span className={`deadline-health is-${health.level}`}>{titleCase(health.level)}</span>}
      </div>
      <p><CalendarClock size={13} /> {schedule.summary}</p>

      <button
        type="button"
        className="task-intelligence-toggle"
        aria-expanded={advanced}
        onClick={() => setAdvanced((value) => !value)}
      >
        <Brain size={14} /> Intelligent details {advanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      {advanced && (
        <div className="task-intelligence-fields">
          <label>
            <span>Status</span>
            <select value={task.status ?? "inbox"} onChange={(event) => setTask((current) => ({ ...current, status: event.target.value }))}>
              {["inbox", "planned", "active", "paused", "waiting", "completed", "deferred", "overdue"].map((value) => (
                <option key={value} value={value}>{titleCase(value)}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Priority</span>
            <select value={task.priority ?? suggestion.priority} onChange={(event) => setTask((current) => ({ ...current, priority: event.target.value }))}>
              {["low", "medium", "high", "critical"].map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
            </select>
          </label>
          <label>
            <span>Deadline</span>
            <input type="date" value={task.deadline ?? ""} onChange={(event) => setTask((current) => ({ ...current, deadline: event.target.value || null }))} />
          </label>
          <label>
            <span>Estimated time</span>
            <input type="number" min="5" step="5" value={task.estimatedDuration ?? suggestion.estimatedDuration}
              onChange={(event) => setTask((current) => ({ ...current, estimatedDuration: Number(event.target.value) || null }))} />
          </label>
          <label>
            <span>Energy</span>
            <select value={task.energyLevel ?? suggestion.energyLevel} onChange={(event) => setTask((current) => ({ ...current, energyLevel: event.target.value }))}>
              {["low", "medium", "high"].map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
            </select>
          </label>
          <label>
            <span>Cognitive load</span>
            <select value={task.cognitiveLoad ?? suggestion.cognitiveLoad} onChange={(event) => setTask((current) => ({ ...current, cognitiveLoad: event.target.value }))}>
              {["simple", "focused", "deep"].map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
            </select>
          </label>
          <label>
            <span>Category</span>
            <input value={task.category ?? suggestion.category} onChange={(event) => setTask((current) => ({ ...current, category: event.target.value }))} />
          </label>
          <label>
            <span>Environment</span>
            <select value={task.preferredEnvironment ?? suggestion.preferredEnvironment}
              onChange={(event) => setTask((current) => ({ ...current, preferredEnvironment: event.target.value }))}>
              {["desk", "computer", "outside", "phone", "meeting", "creative"].map((value) => <option key={value} value={value}>{titleCase(value)}</option>)}
            </select>
          </label>
          <label className="task-intelligence-wide">
            <span>Why does this matter?</span>
            <textarea rows={2} value={task.intention ?? ""} onChange={(event) => setTask((current) => ({ ...current, intention: event.target.value }))}
              placeholder="Nora uses this context when the work gets difficult." />
          </label>
          {task.deadline && (
            <div className={`task-deadline-explanation task-intelligence-wide is-${health.level}`}>
              <strong>{titleCase(health.level)}</strong>
              <span>{health.message}</span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
