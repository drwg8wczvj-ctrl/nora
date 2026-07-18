import React from "react";
import { Moon, BatteryCharging, Repeat, Sunrise, Target, Gauge } from "lucide-react";

const CONF_LABEL = { HIGH: "High", MEDIUM: "Medium", LOW: "Low" };

function ConfidencePill({ tier }) {
  if (!tier) return null;
  return (
    <span className={`status-sleep-conf status-sleep-conf-${tier.toLowerCase()}`}>
      {CONF_LABEL[tier] ?? tier}
    </span>
  );
}

const STAT_DEFS = [
  {
    key: "debt", icon: BatteryCharging, label: "Sleep Debt",
    value: (s) => `${s.value}h`,
    sub: (s) => s.nightsCounted ? `across ${s.nightsCounted} night${s.nightsCounted === 1 ? "" : "s"}` : null,
  },
  {
    key: "consistency", icon: Repeat, label: "Consistency",
    value: (s) => `${s.value}`,
    sub: () => "night-to-night duration",
  },
  {
    key: "circadian", icon: Sunrise, label: "Circadian Rhythm",
    value: (s) => `${s.value}`,
    sub: () => "wake-time regularity",
  },
  {
    key: "cognitivePerformance", icon: Target, label: "Predicted Focus",
    value: (s) => s.bucket ? s.bucket[0].toUpperCase() + s.bucket.slice(1) : `${s.value}`,
    sub: (s) => `${s.value}/100 today`,
  },
  {
    key: "mentalFatigueRisk", icon: Gauge, label: "Fatigue Risk",
    value: (s) => s.bucket ? s.bucket[0].toUpperCase() + s.bucket.slice(1) : `${s.value}`,
    sub: (s) => `${s.value}/100 today`,
  },
];

// Sleep science, honestly scoped: everything here is derived from self-reported
// bedtime/wake/quality (no wearable connected), so this deliberately never shows
// a fabricated "deep sleep %" or real sleep-stage breakdown — the 90-minute
// cycle count is the closest honest analog, and every stat carries its own
// confidence tier rather than pretending to a precision it doesn't have.
export default function SleepScienceCard({ sleepAnalysis }) {
  if (!sleepAnalysis) return null;
  const { duration, cycles, debt, consistency, circadian, recommendedBedtime, cognitivePerformance, mentalFatigueRisk } = sleepAnalysis;

  // predictCognitivePerformance/predictMentalFatigueRisk/recommendBedtimeTonight
  // never return null — they fall back to a recovery-state-only baseline with
  // no sleep input at all. Under a "Sleep Science" heading that's misleading,
  // so those three only render once there's at least one real sleep-derived
  // signal (duration/debt/consistency/circadian) behind them.
  const hasSleepGrounding = Boolean(duration || debt || consistency || circadian);
  if (!hasSleepGrounding) return null;

  const stats = { debt, consistency, circadian, cognitivePerformance, mentalFatigueRisk };

  return (
    <div className="status-card status-sleep-card">
      <div className="status-card-title-row">
        <h3 className="status-section-title">Sleep Science</h3>
        <span className="status-sleep-disclaimer">Estimated, not measured</span>
      </div>

      {(duration || cycles) && (
        <div className="status-sleep-hero">
          {duration && (
            <div className="status-sleep-hero-stat">
              <Moon size={14} className="status-sleep-hero-icon" />
              <span className="status-sleep-hero-value">{duration.value}<span className="status-sleep-hero-unit">h</span></span>
              <span className="status-sleep-hero-label">last night</span>
            </div>
          )}
          {cycles && (
            <div className="status-sleep-hero-stat">
              <Repeat size={14} className="status-sleep-hero-icon" />
              <span className="status-sleep-hero-value">{Math.floor(cycles.value)}<span className="status-sleep-hero-unit">cycles</span></span>
              <span className="status-sleep-hero-label">~90 min each</span>
            </div>
          )}
        </div>
      )}

      <div className="status-sleep-grid">
        {STAT_DEFS.map(({ key, icon: Icon, label, value, sub }) => {
          const stat = stats[key];
          if (!stat) return null;
          return (
            <div key={key} className="status-sleep-stat">
              <div className="status-sleep-stat-top">
                <Icon size={12} className="status-sleep-stat-icon" />
                <span className="status-sleep-stat-label">{label}</span>
                <ConfidencePill tier={stat.confidence} />
              </div>
              <span className="status-sleep-stat-value">{value(stat)}</span>
              {sub(stat) && <span className="status-sleep-stat-sub">{sub(stat)}</span>}
            </div>
          );
        })}
      </div>

      {recommendedBedtime && (
        <p className="status-sleep-recommend">
          <strong>Tonight:</strong> aim for bed by {recommendedBedtime.value}
          {debt?.value > 0.3 ? " to start repaying sleep debt." : " to stay on track."}
        </p>
      )}

      <p className="status-sleep-footnote">
        No wearable connected, so stages (deep/REM) aren't measured — this models sleep science from your check-ins instead of guessing at numbers we don't have.
      </p>
    </div>
  );
}
