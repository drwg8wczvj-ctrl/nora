import React from "react";
import { Bell, CheckSquare, Flag, Clock, Brain, Sunrise } from "lucide-react";
import "./NotificationSettings.css";

function NSToggle({ value, onChange, disabled }) {
  return (
    <button
      type="button"
      className={`ns-toggle${value ? " on" : ""}${disabled ? " disabled" : ""}`}
      onClick={() => !disabled && onChange(!value)}
      aria-pressed={value}
    >
      <span className="ns-knob" />
    </button>
  );
}

const CATEGORIES = [
  {
    key: "taskReminders",
    icon: <CheckSquare size={14} />,
    label: "Task reminders",
    desc: "Upcoming tasks before start time",
  },
  {
    key: "deadlineReminders",
    icon: <Flag size={14} />,
    label: "Deadline alerts",
    desc: "Day before & day of deadline",
  },
  {
    key: "morningCheckup",
    icon: <Sunrise size={14} />,
    label: "Morning check-up",
    desc: "Daily readiness reminder",
  },
  {
    key: "focusSessions",
    icon: <Clock size={14} />,
    label: "Focus sessions",
    desc: "Reminder when session starts",
  },
  {
    key: "aiCoaching",
    icon: <Brain size={14} />,
    label: "AI coaching",
    desc: "Smart nudges and daily insights",
  },
];

export default function NotificationSettings({
  permission,
  settings,
  updateSettings,
  onRequestPermission,
  reminderMins,
  setReminderMins,
  dark,
}) {
  const granted = permission === "granted";
  const denied  = permission === "denied";
  const active  = granted && settings.enabled;

  return (
    <div className={`ns-root${dark ? " dark" : ""}`}>

      {/* Permission status */}
      <div className={`ns-perm-row ns-perm-${granted ? "granted" : denied ? "denied" : "default"}`}>
        <span className="ns-perm-dot" />
        <span className="ns-perm-text">
          {granted
            ? "Notifications allowed"
            : denied
            ? "Blocked in browser settings"
            : "Not yet enabled"}
        </span>
        {!granted && !denied && (
          <button className="ns-enable-btn" onClick={onRequestPermission}>
            Enable
          </button>
        )}
      </div>

      {denied && (
        <p className="ns-denied-note">
          Go to your browser or OS Settings → Notifications and allow this site, then reload.
        </p>
      )}

      {/* Master toggle */}
      <div className="ns-master-row">
        <Bell size={14} />
        <span className="ns-master-label">All notifications</span>
        <NSToggle
          value={active}
          onChange={(v) => updateSettings({ enabled: v })}
          disabled={!granted}
        />
      </div>

      {/* Per-category toggles */}
      <div className={`ns-cats${!active ? " muted" : ""}`}>
        {CATEGORIES.map(({ key, icon, label, desc }) => (
          <div key={key} className="ns-cat-row">
            <span className="ns-cat-icon">{icon}</span>
            <div className="ns-cat-text">
              <span className="ns-cat-label">{label}</span>
              <span className="ns-cat-desc">{desc}</span>
            </div>
            <NSToggle
              value={settings[key]}
              onChange={(v) => updateSettings({ [key]: v })}
              disabled={!active}
            />
          </div>
        ))}
      </div>

      {/* Morning reminder time */}
      {active && settings.morningCheckup && (
        <div className="ns-time-row">
          <Sunrise size={13} />
          <span className="ns-time-label">Morning reminder at</span>
          <input
            type="time"
            className="ns-time-input"
            value={settings.morningTime || "08:00"}
            onChange={(e) => updateSettings({ morningTime: e.target.value })}
          />
        </div>
      )}

      {/* Default reminder offset */}
      {active && settings.taskReminders && setReminderMins != null && (
        <div className="ns-time-row">
          <CheckSquare size={13} />
          <span className="ns-time-label">Remind me</span>
          <select
            className="ns-select"
            value={reminderMins}
            onChange={(e) => setReminderMins(Number(e.target.value))}
          >
            {[0, 1, 5, 10, 15, 30, 60].map((m) => (
              <option key={m} value={m}>
                {m === 0 ? "At start time" : `${m} min before`}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
