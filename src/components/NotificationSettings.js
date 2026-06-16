import React, { useState } from "react";
import { Bell, CheckSquare, Flag, Clock, Brain, Sunrise, Send, Check } from "lucide-react";
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
    desc: "Before task start time",
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
    desc: "Daily readiness prompt",
  },
  {
    key: "focusSessions",
    icon: <Clock size={14} />,
    label: "Focus sessions",
    desc: "When session is about to start",
  },
  {
    key: "aiCoaching",
    icon: <Brain size={14} />,
    label: "AI coaching",
    desc: "Daily smart insights from Nora",
  },
];

function HealthRow({ ok, warn, label, note }) {
  const cls = ok ? "ns-hd-ok" : warn ? "ns-hd-warn" : "ns-hd-err";
  return (
    <div className={`ns-health-row ${cls}`}>
      <span className="ns-hd-dot" />
      <span className="ns-hd-label">{label}</span>
      {note && <span className="ns-hd-note">{note}</span>}
    </div>
  );
}

export default function NotificationSettings({
  permission,
  settings,
  updateSettings,
  onRequestPermission,
  reminderMins,
  setReminderMins,
  health = {},
  sendTestNotification,
}) {
  const [testSent,    setTestSent]    = useState(false);
  const [testLoading, setTestLoading] = useState(false);

  const granted = permission === "granted";
  const denied  = permission === "denied";
  const active  = granted && settings.enabled;

  const handleTest = async () => {
    setTestLoading(true);
    try {
      await sendTestNotification();
      setTestSent(true);
      setTimeout(() => setTestSent(false), 4000);
    } catch {}
    setTestLoading(false);
  };

  return (
    <div className="ns-root">

      {/* ── Permission status ─────────────────────────────── */}
      <div className={`ns-perm-row ns-perm-${granted ? "granted" : denied ? "denied" : "default"}`}>
        <span className="ns-perm-dot" />
        <span className="ns-perm-text">
          {granted
            ? "Notifications allowed"
            : denied
            ? "Blocked in browser / OS settings"
            : "Permission not yet granted"}
        </span>
        {!granted && !denied && (
          <button className="ns-enable-btn" onClick={onRequestPermission}>Enable</button>
        )}
      </div>

      {denied && (
        <p className="ns-denied-note">
          Open your browser or OS Settings → Notifications, allow this site, then reload the page.
        </p>
      )}

      {/* ── Master toggle ─────────────────────────────────── */}
      <div className="ns-master-row">
        <Bell size={14} />
        <span className="ns-master-label">All notifications</span>
        <NSToggle
          value={active}
          onChange={(v) => updateSettings({ enabled: v })}
          disabled={!granted}
        />
      </div>

      {/* ── Per-category toggles ──────────────────────────── */}
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

      {/* ── Morning reminder time ─────────────────────────── */}
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

      {/* ── Default reminder offset ───────────────────────── */}
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

      {/* ── Test notification ─────────────────────────────── */}
      <div className="ns-test-row">
        <button
          className="ns-test-btn"
          onClick={handleTest}
          disabled={!granted || testLoading}
        >
          {testLoading
            ? <span className="dot-spin" />
            : testSent
            ? <><Check size={14} /> Notification sent!</>
            : <><Send size={14} /> Send test notification</>
          }
        </button>
        {!granted && (
          <p className="ns-test-sent" style={{ color: "var(--text-muted)" }}>
            Enable notifications first.
          </p>
        )}
      </div>

      {/* ── System health panel ───────────────────────────── */}
      <div className="ns-health">
        <div className="ns-health-title">Notification Status</div>
        <div className="ns-health-rows">
          <HealthRow
            ok={granted}
            warn={permission === "default"}
            label="Permission"
            note={granted ? "granted" : denied ? "blocked" : "not asked"}
          />
          <HealthRow
            ok={health.swActive}
            label="Service worker"
            note={health.swActive ? "active" : "not registered"}
          />
          <HealthRow
            ok={health.periodicSyncRegistered}
            warn={health.periodicSyncSupported && !health.periodicSyncRegistered}
            label="Background wake-up"
            note={
              health.periodicSyncRegistered ? "registered"
              : health.periodicSyncSupported ? "supported, not registered"
              : "not supported on this platform"
            }
          />
          <HealthRow
            ok={health.alarmCount > 0}
            warn={health.alarmCount === 0}
            label="Scheduled reminders"
            note={health.alarmCount === 0 ? "none queued" : `${health.alarmCount} queued`}
          />
        </div>

        {health.alarmCount > 0 && (
          <div className="ns-health-meta">
            <span>{health.alarmCount} reminder{health.alarmCount !== 1 ? "s" : ""} stored in device queue</span>
          </div>
        )}

        {/* iOS explanation */}
        {health.isIOS && (
          <div className="ns-ios-note">
            <strong>iOS note:</strong> Reminders fire when Nora is open or running in the
            background. True background delivery requires a push server (coming soon).
            For best results, add Nora to your Home Screen.
          </div>
        )}

        {/* No periodic sync */}
        {!health.periodicSyncSupported && !health.isIOS && health.swActive && (
          <div className="ns-ios-note">
            Background wake-up is not available on this browser.
            Reminders fire reliably when Nora is open or backgrounded.
            For Android background delivery, use Chrome and install Nora to your Home Screen.
          </div>
        )}
      </div>
    </div>
  );
}