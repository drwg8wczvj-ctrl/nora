import React from "react";
import { Moon, HeartPulse, Activity as ActivityIcon, Zap, Lightbulb, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { formatHoursMinutes } from "../lib/healthKit";
import { computeEnergyScore, computeRecoveryScore, buildHealthNarrativeInsights } from "../statusEngine/healthInsights";

function TrendIcon({ trend }) {
  if (trend === "up" || trend === "improving") return <TrendingUp size={13} className="hsec-trend-up" />;
  if (trend === "down" || trend === "declining") return <TrendingDown size={13} className="hsec-trend-down" />;
  return <Minus size={13} className="hsec-trend-flat" />;
}

function SleepCard({ stats }) {
  return (
    <div className="status-card hsec-card">
      <div className="status-card-title-row">
        <h3 className="status-section-title"><Moon size={13} /> Sleep</h3>
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
      </div>
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

// Mounted at the end of the Mind tab — see StatusPage.js. Renders nothing
// until the user has connected at least one Health category and real data
// has actually come back for it (never a half-populated placeholder card).
export default function HealthSection({ health }) {
  const ctx = health?.context;
  if (!health?.available || !ctx) return null;

  const energy = computeEnergyScore({ sleepStats: ctx.sleep?.stats, heart: ctx.heart, activity: ctx.activity });
  const insights = buildHealthNarrativeInsights({ sleepStats: ctx.sleep?.stats, activity: ctx.activity, heart: ctx.heart });
  const showSleep = ctx.sleep?.stats?.hasData;
  const showRecovery = ctx.heart?.hasData;
  const showActivity = ctx.activity?.stats?.hasData;

  if (!showSleep && !showRecovery && !showActivity && !energy.hasData) return null;

  return (
    <div className="hsec-section">
      <div className="status-card-title-row hsec-section-title-row">
        <h3 className="status-section-title">Health</h3>
      </div>
      <div className="hsec-grid-outer">
        {showSleep && <SleepCard stats={ctx.sleep.stats} />}
        {showRecovery && <RecoveryCard heart={ctx.heart} />}
        {showActivity && <ActivityCard activity={ctx.activity} />}
        {energy.hasData && <EnergyCard energy={energy} />}
        <NoraInsightsCard insights={insights} />
      </div>
    </div>
  );
}
