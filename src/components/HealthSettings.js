import React, { useState } from "react";
import { Moon, Activity, HeartPulse, Sparkles, Gauge, Wind, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import { HEALTH_CATEGORY_META } from "../lib/healthKit";
import "./HealthSettings.css";

function HSToggle({ value, onChange, disabled }) {
  return (
    <button
      type="button"
      className={`hs-toggle${value ? " on" : ""}${disabled ? " disabled" : ""}`}
      onClick={() => !disabled && onChange(!value)}
      aria-pressed={value}
    >
      <span className="hs-knob" />
    </button>
  );
}

const CATEGORY_ICONS = {
  sleep: <Moon size={14} />,
  activity: <Activity size={14} />,
  heart: <HeartPulse size={14} />,
  mindfulness: <Sparkles size={14} />,
  vo2max: <Gauge size={14} />,
  respiratory: <Wind size={14} />,
};

function timeAgo(ms) {
  if (!ms) return null;
  const mins = Math.round((Date.now() - ms) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return `${hours}h ago`;
}

// Health's own settings panel — mirrors NotificationSettings.js's shape
// (status row, per-category toggles, a diagnostic/status section) but is a
// fully separate component/stylesheet since the two aren't conceptually
// related beyond both being permission-gated device features.
export default function HealthSettings({ health }) {
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false);

  if (!health.isNativeIOS) {
    return (
      <div className="hs-root">
        <div className="hs-perm-row hs-perm-default">
          <span className="hs-perm-dot" />
          <span className="hs-perm-text">Apple Health is only available in the Nora iOS app.</span>
        </div>
      </div>
    );
  }

  if (!health.available) {
    return (
      <div className="hs-root">
        <div className="hs-perm-row hs-perm-denied">
          <span className="hs-perm-dot" />
          <span className="hs-perm-text">Health data isn't available on this device.</span>
        </div>
      </div>
    );
  }

  const anyEnabled = health.enabledCategories.length > 0;

  const handleToggle = async (key, next) => {
    if (next) await health.requestAccess([key]);
    else health.setCategoryEnabled(key, false);
  };

  return (
    <div className="hs-root">
      <div className={`hs-perm-row ${anyEnabled ? "hs-perm-granted" : "hs-perm-default"}`}>
        <span className="hs-perm-dot" />
        <span className="hs-perm-text">
          {anyEnabled ? "Connected to Apple Health" : "Not connected yet"}
        </span>
      </div>

      <p className="hs-intro">
        Turn on the categories you want Nora to use. Each one asks Apple Health for permission the
        first time — you can change your mind here or in the iOS Settings app any time.
      </p>

      <div className="hs-cats">
        {health.allCategories.map((key) => {
          const meta = HEALTH_CATEGORY_META[key];
          const enabled = health.enabledCategories.includes(key);
          return (
            <div key={key} className="hs-cat-row">
              <span className="hs-cat-icon">{CATEGORY_ICONS[key]}</span>
              <div className="hs-cat-text">
                <span className="hs-cat-label">{meta.label}</span>
                <span className="hs-cat-desc">{meta.description}</span>
              </div>
              <HSToggle value={enabled} onChange={(v) => handleToggle(key, v)} />
            </div>
          );
        })}
      </div>

      {anyEnabled && (
        <div className="hs-refresh-row">
          <button className="hs-refresh-btn" onClick={health.refresh} disabled={health.loading}>
            <RefreshCw size={13} className={health.loading ? "hs-spin" : ""} />
            {health.loading ? "Syncing…" : "Refresh now"}
          </button>
          {health.lastFetchedAt && !health.loading && (
            <span className="hs-refresh-meta">Last synced {timeAgo(health.lastFetchedAt)}</span>
          )}
        </div>
      )}

      <div className="hs-privacy">
        <ShieldCheck size={14} className="hs-privacy-icon" />
        <p>
          Your health data stays on this device. Nora reads it to personalize your plan and never
          uploads raw samples to a server — only the small, aggregated numbers you see in the app
          (like a sleep score) are ever used elsewhere.
        </p>
      </div>

      {anyEnabled && (
        <div className="hs-disconnect-row">
          {confirmingDisconnect ? (
            <>
              <span className="hs-disconnect-confirm-text">Stop using Health data in Nora?</span>
              <button
                className="hs-disconnect-confirm-btn"
                onClick={() => { health.disconnect(); setConfirmingDisconnect(false); }}
              >
                Disconnect
              </button>
              <button className="hs-disconnect-cancel-btn" onClick={() => setConfirmingDisconnect(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button className="hs-disconnect-btn" onClick={() => setConfirmingDisconnect(true)}>
              <Unplug size={13} /> Disconnect Apple Health
            </button>
          )}
        </div>
      )}
    </div>
  );
}
