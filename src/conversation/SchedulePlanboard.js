import React, { useMemo, useState } from "react";
import { CalendarDays, Clock3, GripVertical, Info, X } from "lucide-react";
import { NativeButton, NativeIconButton } from "../components/ui/NativeUI";
import { proposalStorageKey } from "../lib/plannerTransactions";
import { addCalendarDays, buildPlanboardModel, localDateString, operationTask, timeLabel } from "./planboardModel";
import "./SchedulePlanboard.css";

const dayFormatter = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric" });
const fullDayFormatter = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" });

const formatDay = (date, formatter) => formatter.format(new Date(`${date}T12:00:00`));

export default function SchedulePlanboard({ proposal, existingTasks = [], onPlannerAction }) {
  const initialOperations = proposal?.operations ?? [];
  const [operations, setOperations] = useState(initialOperations);
  const [included, setIncluded] = useState(() => initialOperations.map(() => true));
  const [selectedDate, setSelectedDate] = useState(() =>
    initialOperations.find((operation) => operation.input?.date)?.input.date ??
    localDateString(proposal?.createdAt)
  );
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [status, setStatus] = useState(() => {
    try { return localStorage.getItem(proposalStorageKey(proposal?.id)) ?? "pending"; }
    catch { return "pending"; }
  });

  const createdDate = localDateString(proposal?.createdAt);
  const firstOperationDate = operations
    .map((operation) => operation.input?.date)
    .filter(Boolean)
    .sort()[0];
  const startDate = firstOperationDate && firstOperationDate > addCalendarDays(createdDate, 13)
    ? firstOperationDate
    : createdDate;
  const days = useMemo(() => buildPlanboardModel({
    existingTasks,
    operations,
    included,
    startDate,
    days: 14,
    applied: status === "applied",
  }), [existingTasks, operations, included, startDate, status]);
  const selectedDay = days.find((day) => day.date === selectedDate) ?? days[0];
  const activeOperations = operations.filter((_, index) => included[index] !== false);
  const conflictCount = days.reduce((total, day) => total + day.conflicts.length, 0);

  const rememberStatus = (nextStatus) => {
    setStatus(nextStatus);
    try { localStorage.setItem(proposalStorageKey(proposal?.id), nextStatus); } catch {}
  };

  const updateOperation = (index, patch) => {
    setOperations((current) => current.map((operation, operationIndex) =>
      operationIndex === index
        ? { ...operation, input: { ...operation.input, ...patch } }
        : operation
    ));
  };

  const updateOperationTime = (index, value) => {
    if (!value) {
      updateOperation(index, { startHour: null, startMinute: null });
      return;
    }
    const [hour, minute] = value.split(":").map(Number);
    updateOperation(index, { startHour: hour, startMinute: minute });
  };

  const apply = async () => {
    if (!activeOperations.length || conflictCount) return;
    const applied = await onPlannerAction?.("apply", { ...proposal, operations: activeOperations });
    if (applied !== false) rememberStatus("applied");
  };

  const reject = async () => {
    await onPlannerAction?.("reject", proposal);
    rememberStatus("rejected");
  };

  const dropOnDay = (date) => {
    if (draggedIndex == null) return;
    updateOperation(draggedIndex, { date });
    setSelectedDate(date);
    setDraggedIndex(null);
  };

  return (
    <section className="planboard" aria-label="Proposed two-week schedule">
      <header className="planboard-head">
        <div>
          <div className="planboard-kicker"><CalendarDays size={14} /> Two-week Planboard</div>
          <div className="planboard-summary">
            {activeOperations.length} selected change{activeOperations.length === 1 ? "" : "s"}
            {conflictCount ? ` · ${conflictCount} conflict${conflictCount === 1 ? "" : "s"}` : " · Ready to review"}
          </div>
          <p className="planboard-trust">Nothing changes until you apply this plan.</p>
        </div>
        <div className="planboard-legend" aria-label="Legend">
          <span><i className="planboard-dot existing" />Existing</span>
          <span><i className="planboard-dot proposed" />Proposed</span>
        </div>
      </header>

      <div className="planboard-days" aria-label="Fourteen day overview">
        {days.map((day) => (
          <button
            type="button"
            key={day.date}
            className={`planboard-day${selectedDay?.date === day.date ? " selected" : ""}${day.conflicts.length ? " conflict" : ""}`}
            onClick={() => setSelectedDate(day.date)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => dropOnDay(day.date)}
          >
            <span>{formatDay(day.date, dayFormatter)}</span>
            <strong>{Math.round(day.workloadMinutes / 60 * 10) / 10}h</strong>
            <i className={`planboard-load ${day.workload}`} />
          </button>
        ))}
      </div>

      <div className="planboard-day-head">
        <strong>{formatDay(selectedDay.date, fullDayFormatter)}</strong>
        <span>{selectedDay.workload} workload</span>
      </div>

      <div className="planboard-blocks">
        {selectedDay.existing
          .slice()
          .sort((a, b) => (a.startHour ?? 99) - (b.startHour ?? 99))
          .map((task) => (
            <div className="planboard-block planboard-existing" key={task.id}>
              <span className="planboard-block-time">{timeLabel(task)}</span>
              <span className="planboard-block-title">{task.title}</span>
            </div>
          ))}

        {selectedDay.proposed
          .slice()
          .sort((a, b) => (a.startHour ?? 99) - (b.startHour ?? 99))
          .map((task) => {
            const operationIndex = task.operationIndex;
            const operation = operations[operationIndex];
            const conflict = selectedDay.conflicts.includes(operationIndex);
            return (
              <div
                className={`planboard-block planboard-proposed${conflict ? " has-conflict" : ""}`}
                key={`${operationIndex}-${task.date}`}
                draggable
                onDragStart={() => setDraggedIndex(operationIndex)}
                onDragEnd={() => setDraggedIndex(null)}
              >
                <GripVertical size={14} className="planboard-grip" />
                <div className="planboard-block-content">
                  <span className="planboard-block-title">{task.title}</span>
                  <div className="planboard-edit-row">
                    <label>
                      <span>Date</span>
                      <input type="date" value={task.date ?? ""} onChange={(event) => {
                        updateOperation(operationIndex, { date: event.target.value });
                        setSelectedDate(event.target.value);
                      }} />
                    </label>
                    <label>
                      <span>Time</span>
                      <input
                        type="time"
                        value={task.startHour == null ? "" : `${String(task.startHour).padStart(2, "0")}:${String(task.startMinute ?? 0).padStart(2, "0")}`}
                        onChange={(event) => updateOperationTime(operationIndex, event.target.value)}
                      />
                    </label>
                    <label>
                      <span>Minutes</span>
                      <input
                        type="number"
                        min="10"
                        max="480"
                        step="5"
                        value={task.duration ?? 60}
                        onChange={(event) => updateOperation(operationIndex, { duration: Number(event.target.value) })}
                        disabled={operation.name === "move_task"}
                      />
                    </label>
                  </div>
                  {conflict && <span className="planboard-conflict">Overlaps another block—choose a different time.</span>}
                  {(task.notes || operation.input?.notes) && (
                    <details className="planboard-why">
                      <summary><Info size={12} /> Why here?</summary>
                      <p>{task.notes || operation.input.notes}</p>
                    </details>
                  )}
                </div>
                <NativeIconButton
                  className="planboard-remove"
                  label={`Exclude ${task.title}`}
                  size="compact"
                  variant="plain"
                  onClick={() => setIncluded((current) => current.map((value, index) => index === operationIndex ? false : value))}
                >
                  <X size={14} />
                </NativeIconButton>
              </div>
            );
          })}

        {!selectedDay.existing.length && !selectedDay.proposed.length && (
          <div className="planboard-empty">No blocks on this day. Drag a proposed block here to move it.</div>
        )}
      </div>

      {operations.some((operation, index) => included[index] === false) && (
        <div className="planboard-excluded">
          {operations.map((operation, index) => included[index] === false && (
            <NativeButton variant="tertiary" size="compact" key={index} onClick={() => setIncluded((current) => current.map((value, itemIndex) => itemIndex === index ? true : value))}>
              Restore {operation.label}
            </NativeButton>
          ))}
        </div>
      )}

      {operations.some((operation) => !operationTask(operation, existingTasks, 0)) && (
        <div className="planboard-other">
          <Clock3 size={13} />
          {operations.map((operation, index) => !operationTask(operation, existingTasks, index) && included[index] !== false
            ? (
              <span className="planboard-other-item" key={index}>
                {operation.label}
                <NativeIconButton
                  label={`Exclude ${operation.label}`}
                  size="compact"
                  variant="plain"
                  onClick={() => setIncluded((current) => current.map((value, itemIndex) => itemIndex === index ? false : value))}
                >
                  <X size={12} />
                </NativeIconButton>
              </span>
            )
            : null)}
        </div>
      )}

      {status === "pending" ? (
        <footer className="planboard-actions">
          <NativeButton className="planboard-apply" onClick={apply} disabled={!activeOperations.length || Boolean(conflictCount)}>
            Apply selected
          </NativeButton>
          <NativeButton variant="secondary" onClick={() => onPlannerAction?.("adjust", { ...proposal, operations: activeOperations })}>Adjust with Nora</NativeButton>
          <NativeButton variant="tertiary" onClick={reject}>Not now</NativeButton>
        </footer>
      ) : (
        <footer className={`planboard-result ${status}`}>
          {status === "applied" ? "Selected changes applied" : "Proposal dismissed"}
        </footer>
      )}
    </section>
  );
}
