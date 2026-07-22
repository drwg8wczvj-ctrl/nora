import React from "react";
import { Moon, HeartPulse, Activity as ActivityIcon, Zap, Lightbulb, HeartHandshake, Fingerprint, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatHoursMinutes, computeUsualSleepTimes } from "../lib/healthKit";
import { computeEnergyScore, computeRecoveryScore, buildHealthNarrativeInsights } from "../statusEngine/healthInsights";
import { buildPersonalBaseline } from "../statusEngine/personalBaseline";

function TrendIcon({ trend }) {
  if (trend === "up" || trend === "improving") return <TrendingUp size={13} className="hsec-trend-up" />;
  if (trend === "down" || trend === "declining") return <TrendingDown size={13} className="hsec-trend-down" />;
  return <Minus size={13} className="hsec-trend-flat" />;
}

function SleepCard({ stats, sessions }) {
  const usual = computeUsualSleepTimes(sessions);
  return (
    <div className="status-card hsec-card">
      <div className="status-card-title-row">
        <h3 className="status-section-title"><Moon size={13} /> Sleep Science</h3>
        <span className="status-sleep-disclaimer">From Apple Health</span>
      </div>
      <div className="hsec-hero">
        <span className="hsec-hero-value">{formatHoursMinutes(stats.last.asleepMinutes)}</span>
        <span className="hsec-hero-label">last night</span>
      </div>
      <div className="hsec-grid">
        <div className="hsec-stat">
          <span className="hsec-stat-label">Weekly average</span>
          <span className="hsec-stat-value">{stats.weeklyAvgMinutes ? formatHoursMinutes(stats.weeklyAvgMinutes) : "—"}</span>
        </div>
        <div className="hsec-stat">
          <span className="hsec-stat-label">Monthly trend</span>
          <span className="hsec-stat-value hsec-with-icon">
            {stats.monthlyAvgMinutes ? formatHoursMinutes(stats.monthlyAvgMinutes) : "Not enough data"}
            {stats.trend && <TrendIcon trend={stats.trend === "improving" ? "up" : stats.trend === "declining" ? "down" : "flat"} />}
          </span>
        </div>
        <div className="hsec-stat">
          <span className="hsec-stat-label">Sleep consistency</span>
          <span className="hsec-stat-value hsec-cap">{stats.consistencyLabel ?? "—"}</span>
        </div>
        <div className="hsec-stat">
          <span className="hsec-stat-label">Sleep debt (7d)</span>
          <span className="hsec-stat-value">{stats.debtMinutes > 0 ? formatHoursMinutes(stats.debtMinutes) : "None"}</span>
        </div>
        {usual && (
          <>
            <div className="hsec-stat">
              <span className="hsec-stat-label">Usual bedtime</span>
              <span className="hsec-stat-value">{usual.usualBedtime}</span>
            </div>
            <div className="hsec-stat">
              <span className="hsec-stat-label">Usual wake time</span>
              <span className="hsec-stat-value">{usual.usualWakeTime}</span>
            </div>
          </>
        )}
      </div>
      {usual && (
        <p className="hsec-note">
          Apple doesn't share your Health app's sleep schedule goal with other apps — this is your real average from the last {usual.nightsUsed} nights instead.
        </p>
      )}
    </div>
  );
}

function RecoveryCard({ heart }) {
  const recovery = computeRecoveryScore(heart);
  return (
    <div className="status-card hsec-card">
      <div className="status-card-title-row">
        <h3 className="status-section-title"><HeartPulse size={13} /> Recovery</h3>
      </div>
      <div className="hsec-hero">
        <span className="hsec-hero-value">{recovery.score}</span>
        <span className="hsec-hero-label">{recovery.label}</span>
      </div>
      <div className="hsec-grid">
        <div className="hsec-stat">
          <span className="hsec-stat-label">HRV</span>
          <span className="hsec-stat-value hsec-with-icon">
            {heart.heartRateVariability ? `${Math.round(heart.heartRateVariability)} ms` : "—"}
            <TrendIcon trend={heart.heartRateVariabilityTrend} />
          </span>
        </div>
        <div className="hsec-stat">
          <span className="hsec-stat-label">Resting heart rate</span>
          <span className="hsec-stat-value hsec-with-icon">
            {heart.restingHeartRate ? `${Math.round(heart.restingHeartRate)} bpm` : "—"}
            <TrendIcon trend={heart.restingHeartRateTrend} />
          </span>
        </div>
      </div>
      {recovery.reasons.length > 0 && <p className="hsec-note">{recovery.reasons.join(" · ")}</p>}
    </div>
  );
}

function ActivityCard({ activity }) {
  const { today, weeklyAvgSteps, trend, weeklyTotalExerciseMinutes } = activity.stats;
  return (
    <div className="status-card hsec-card">
      <div className="status-card-title-row">
        <h3 className="status-section-title"><ActivityIcon size={13} /> Activity</h3>
      </div>
      <div className="hsec-hero">
        <span className="hsec-hero-value">{Math.round(today.steps).toLocaleString()}</span>
        <span className="hsec-hero-label">steps today</span>
      </div>
      <div className="hsec-grid">
        <div className="hsec-stat">
          <span className="hsec-stat-label">Walking distance</span>
          <span className="hsec-stat-value">{(today.distanceMeters / 1000).toFixed(1)} km</span>
        </div>
        <div className="hsec-stat">
          <span className="hsec-stat-label">Calories burned</span>
          <span className="hsec-stat-value">{Math.round(today.activeEnergyKcal)} kcal</span>
        </div>
        <div className="hsec-stat">
          <span className="hsec-stat-label">Exercise minutes</span>
          <span className="hsec-stat-value">{Math.round(today.exerciseMinutes)} min</span>
        </div>
        <div className="hsec-stat">
          <span className="hsec-stat-label">Weekly trend</span>
          <span className="hsec-stat-value hsec-with-icon">
            {weeklyAvgSteps ? `${Math.round(weeklyAvgSteps).toLocaleString()} avg` : "—"}
            <TrendIcon trend={trend} />
          </span>
        </div>
      </div>
      {activity.workouts.length > 0 && (
        <p className="hsec-note">
          {activity.workouts.length} workout{activity.workouts.length !== 1 ? "s" : ""} this week · {Math.round(weeklyTotalExerciseMinutes)} min total
        </p>
      )}
    </div>
  );
}

function EnergyCard({ energy }) {
  return (
    <div className="status-card hsec-card hsec-energy">
      <div className="status-card-title-row">
        <h3 className="status-section-title"><Zap size={13} /> Energy Score</h3>
      </div>
      <div className="hsec-hero">
        <span className="hsec-hero-value">{energy.score}</span>
        <span className="hsec-hero-label">{energy.label}</span>
      </div>
      {energy.reasons.length > 0 && (
        <ul className="hsec-reasons">
          {energy.reasons.map((r, i) => <li key={i}>{r}</li>)}
        </ul>
      )}
    </div>
  );
}

function NoraInsightsCard({ insights }) {
  if (!insights.length) return null;
  return (
    <div className="status-card hsec-card hsec-insights-card">
      <div className="status-card-title-row">
        <h3 className="status-section-title"><Lightbulb size={13} /> Nora Insights</h3>
      </div>
      <ul className="hsec-reasons">
        {insights.map((line, i) => <li key={i}>{line}</li>)}
      </ul>
    </div>
  );
}

function BaselineCard({ baseline }) {
  if (!baseline.sentences.length) return null;
  return (
    <div className="status-card hsec-card hsec-baseline-card">
      <div className="status-card-title-row">
        <h3 className="status-section-title"><Fingerprint size={13} /> Your Personal Baseline</h3>
      </div>
      <ul className="hsec-reasons">
        {baseline.sentences.map((line, i) => <li key={i}>{line}</li>)}
      </ul>
      <p className="hsec-note">Learned from your own history — not a generic average.</p>
    </div>
  );
}

function ConnectPrompt({ onOpenHealthSettings }) {
  return (
    <div className="status-card hsec-card hsec-connect-prompt">
      <div className="hsec-connect-icon"><HeartHandshake size={18} /></div>
      <div className="hsec-connect-text">
        <span className="hsec-connect-title">See your real sleep, recovery, and activity here</span>
        <span className="hsec-connect-sub">Connect Apple Health in Settings to replace estimates with your real numbers.</span>
      </div>
      {onOpenHealthSettings && (
        <button type="button" className="hsec-connect-btn" onClick={onOpenHealthSettings}>Open Settings</button>
      )}
    </div>
  );
}

// Mounted near the top of the Mind tab — see StatusPage.js. Three states:
// (1) not on iOS / HealthKit unavailable → renders nothing, there's nothing
// to offer; (2) on iOS, available, but nothing connected yet → a prompt
// pointing at Settings, so "where's my health data" has an answer right on
// this page instead of requiring the user to already know Settings has a
// Health section; (3) connected → the real cards, only the ones that
// actually have data back yet.
export default function HealthSection({ health, onOpenHealthSettings = null, tasks = [], dailyMetrics = {} }) {
  if (!health?.isNativeIOS || !health?.available) return null;

  if (health.enabledCategories.length === 0) {
    return <ConnectPrompt onOpenHealthSettings={onOpenHealthSettings} />;
  }

  const ctx = health.context;
  if (!ctx) return null; // first fetch since connecting hasn't resolved yet

  const energy = computeEnergyScore({ sleepStats: ctx.sleep?.stats, heart: ctx.heart, activity: ctx.activity });
  const insights = buildHealthNarrativeInsights({ sleepStats: ctx.sleep?.stats, activity: ctx.activity, heart: ctx.heart });
  const baseline = buildPersonalBaseline({
    sleepSessions: ctx.sleep?.sessions ?? [],
    activityHistory: ctx.activity?.history ?? [],
    tasks,
    dailyMetrics,
  });
  const showSleep = ctx.sleep?.stats?.hasData;
  const showRecovery = ctx.heart?.hasData;
  const showActivity = ctx.activity?.stats?.hasData;

  if (!showSleep && !showRecovery && !showActivity && !energy.hasData) return null;

  return (
    <div className="hsec-section">
      <div className="hsec-grid-outer">
        {showSleep && <SleepCard stats={ctx.sleep.stats} sessions={ctx.sleep.sessions} />}
        {showRecovery && <RecoveryCard heart={ctx.heart} />}
        {showActivity && <ActivityCard activity={ctx.activity} />}
        {energy.hasData && <EnergyCard energy={energy} />}
        <BaselineCard baseline={baseline} />
        <NoraInsightsCard insights={insights} />
      </div>
    </div>
  );
}
