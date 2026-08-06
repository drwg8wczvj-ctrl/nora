import React from "react";
import {
  Activity, BedDouble, Droplets, Flame, Footprints, HeartPulse,
  Moon, PersonStanding, ShieldCheck, Wind,
} from "lucide-react";

const formatSleep = (minutes) => minutes == null ? null : `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;
const metric = (id, label, value, icon, detail) => ({ id, label, value, icon, detail });

export default function HealthWorkspace({ ctx }) {
  const health = ctx.health;
  const summary = ctx.healthSummary;
  const heart = health?.context?.heart;
  const activity = health?.context?.activity?.stats?.today;
  const metrics = [
    metric("sleep", "Sleep", formatSleep(summary?.sleepLastNightMinutes), <BedDouble />, summary?.sleepTrend),
    metric("recovery", "Recovery", summary?.recoveryScore != null ? Math.round(summary.recoveryScore) : null, <ShieldCheck />, summary?.recoveryLabel),
    metric("heart", "Resting heart rate", heart?.restingHeartRate?.latest != null ? `${Math.round(heart.restingHeartRate.latest)} bpm` : null, <HeartPulse />),
    metric("hrv", "HRV", heart?.hrv?.latest != null ? `${Math.round(heart.hrv.latest)} ms` : null, <Activity />),
    metric("steps", "Steps", summary?.activityStepsToday?.toLocaleString?.(), <Footprints />, summary?.activityTrend),
    metric("calories", "Active calories", activity?.activeEnergyKcal != null ? `${Math.round(activity.activeEnergyKcal)} kcal` : null, <Flame />),
    metric("standing", "Standing", activity?.standHours != null ? `${Math.round(activity.standHours)} hr` : null, <PersonStanding />),
    metric("water", "Water", null, <Droplets />, "Not available from current HealthKit categories"),
  ];
  const recommendation = summary?.recoveryScore != null && summary.recoveryScore < 50
    ? "Recovery is low. Prefer 30-minute focus blocks and a real break between them."
    : summary?.sleepLastNightMinutes != null && summary.sleepLastNightMinutes < 390
      ? "Sleep was below your usual need. Keep demanding work earlier and shorter."
      : summary
        ? "Your connected signals support a normal working rhythm today."
        : null;

  if (!health?.available) {
    return (
      <section className="desk-workspace desk-health-workspace">
        <div className="desk-health-unavailable">
          <Moon size={34} />
          <h1>Health is private and optional.</h1>
          <p>HealthKit is available only in the native iOS app. Connect it in Nora Settings to bring sleep, recovery, heart, and activity into Desk Mode.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="desk-workspace desk-health-workspace" aria-labelledby="desk-health-title">
      <header className="desk-workspace-intro">
        <span className="desk-eyebrow"><HeartPulse size={13} /> HealthKit</span>
        <h1 id="desk-health-title">Capacity before pressure.</h1>
        <p>Aggregated on-device signals. Raw HealthKit samples stay on this device.</p>
      </header>
      <div className="desk-health-grid">
        {metrics.map((item) => (
          <article key={item.id} className={`desk-health-card${item.value == null ? " is-unavailable" : ""}`}>
            <span>{item.icon}{item.label}</span>
            <strong>{item.value ?? "Unavailable"}</strong>
            {item.detail && <small>{item.detail}</small>}
          </article>
        ))}
      </div>
      {recommendation && <div className="desk-health-recommendation"><Wind size={17} /><p>{recommendation}</p></div>}
    </section>
  );
}
