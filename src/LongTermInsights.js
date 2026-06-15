import React, { useState, useMemo } from "react";
import { X, TrendingUp, TrendingDown, Minus, Activity, Zap, Wind, Brain, Moon, BarChart2 } from "lucide-react";

// ── SVG sparkline ────────────────────────────────────────────────
function SparkLine({ values, color = "var(--accent)", height = 48, fill = true }) {
  if (!values || values.length < 2) return <div style={{ height }} />;
  const max = Math.max(...values, 0.1);
  const min = Math.min(...values);
  const range = max - min || 1;
  const W = 100, H = 100;
  const pts = values.map((v, i) => ({
    x: (i / (values.length - 1)) * W,
    y: H - ((v - min) / range) * H,
  }));
  // smooth bezier
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const cx = (pts[i - 1].x + pts[i].x) / 2;
    d += ` C ${cx} ${pts[i - 1].y} ${cx} ${pts[i].y} ${pts[i].x} ${pts[i].y}`;
  }
  const area = `${d} L ${pts[pts.length - 1].x} ${H} L ${pts[0].x} ${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }}>
      {fill && <path d={area} fill={color} opacity="0.12" />}
      <path d={d} stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ── Trend badge ──────────────────────────────────────────────────
function TrendBadge({ values }) {
  if (!values || values.length < 3) return null;
  const recent  = values.slice(-3).reduce((a, b) => a + b, 0) / 3;
  const earlier = values.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
  const delta   = recent - earlier;
  if (delta > 0.3) return <span className="lti-trend up"><TrendingUp size={11} /> improving</span>;
  if (delta < -0.3) return <span className="lti-trend down"><TrendingDown size={11} /> declining</span>;
  return <span className="lti-trend stable"><Minus size={11} /> stable</span>;
}

// ── Bar chart (time of day) ──────────────────────────────────────
function HourBars({ hourCounts, peakHour }) {
  const max = Math.max(...Object.values(hourCounts), 1);
  const hours = Array.from({ length: 24 }, (_, i) => i);
  return (
    <div className="lti-hour-bars">
      {hours.map(h => (
        <div key={h} className={`lti-hour-bar-wrap${h === peakHour ? " peak" : ""}`}>
          <div className="lti-hour-bar" style={{ height: `${Math.max(2, ((hourCounts[h] || 0) / max) * 100)}%` }} />
          {h % 6 === 0 && <span className="lti-hour-lbl">{h === 0 ? "12a" : h === 12 ? "12p" : h < 12 ? `${h}a` : `${h - 12}p`}</span>}
        </div>
      ))}
    </div>
  );
}

// ── Data helpers ─────────────────────────────────────────────────
function getRange(metrics, days) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return Object.entries(metrics)
    .filter(([date]) => new Date(date) >= cutoff)
    .sort((a, b) => a[0].localeCompare(b[0]));
}

function extractSeries(entries, key) {
  return entries.map(([, v]) => v[key] ?? null).filter(v => v != null);
}

function avg(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function computeTaskStats(tasks) {
  const completed = tasks.filter(t => t.completed && t.startHour != null);
  const hourCounts = {};
  completed.forEach(t => { hourCounts[t.startHour] = (hourCounts[t.startHour] || 0) + 1; });
  const peakHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  const byType = {};
  tasks.forEach(t => { const tp = t.type ?? "task"; byType[tp] = (byType[tp] || 0) + 1; });
  const byComplexity = { easy: 0, medium: 0, hard: 0 };
  const byComplexityDone = { easy: 0, medium: 0, hard: 0 };
  tasks.forEach(t => {
    if (t.complexity) { byComplexity[t.complexity] = (byComplexity[t.complexity] || 0) + 1; }
    if (t.completed && t.complexity) { byComplexityDone[t.complexity] = (byComplexityDone[t.complexity] || 0) + 1; }
  });
  const bestComplexity = Object.entries(byComplexityDone)
    .map(([k, v]) => ({ k, rate: byComplexity[k] ? v / byComplexity[k] : 0 }))
    .sort((a, b) => b.rate - a.rate)[0]?.k;
  // Streak
  const completedDays = new Set(tasks.filter(t => t.completed).map(t => t.date));
  let maxStreak = 0, cur = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < 90; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0, 10);
    if (completedDays.has(ds)) { cur++; maxStreak = Math.max(maxStreak, cur); }
    else cur = 0;
    if (ds === today && !completedDays.has(ds)) cur = 0;
  }
  return { hourCounts, peakHour: peakHour != null ? Number(peakHour) : null, bestComplexity, maxStreak, totalCompleted: completed.length };
}

function generateInsights(entries, tasks) {
  const insights = [];
  const energy = extractSeries(entries, "energy");
  const stress  = extractSeries(entries, "stress");
  const focus   = extractSeries(entries, "focus");

  const sleep   = entries.map(([, v]) => v.sleepQuality);

  if (energy.length >= 7) {
      const late  = entries.filter(([, v]) => v.loadLevel === "heavy");
    if (late.length >= 3) insights.push("High-load days tend to correlate with lower energy the following morning.");
  }
  const completed = tasks.filter(t => t.completed && t.startHour != null);
  const hourCounts = {};
  completed.forEach(t => { hourCounts[t.startHour] = (hourCounts[t.startHour] || 0) + 1; });
  const peakH = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (peakH != null) {
    const h = Number(peakH);
    const label = h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
    insights.push(`Your completion rate is highest in the ${label} — around ${h}:00.`);
  }
  if (focus.length >= 5 && avg(focus.slice(-3)) > avg(focus.slice(0, 3)) + 0.5) {
    insights.push("Your focus is trending upward this period — a good sign of consistency.");
  } else if (focus.length >= 5 && avg(focus.slice(-3)) < avg(focus.slice(0, 3)) - 0.5) {
    insights.push("Focus has been declining recently. Shorter sessions and earlier starts may help.");
  }
  if (stress.length >= 5 && avg(stress.slice(-3)) < avg(stress.slice(0, 3)) - 0.5) {
    insights.push("Stress levels have been rising. Consider protecting more of your evenings.");
  }
  const poorSleep = sleep.filter(v => v === "poor" || v === "okay").length;
  if (poorSleep > sleep.length * 0.5 && sleep.length >= 5) {
    insights.push("Sleep quality has been mixed. Even small improvements in bedtime can lift next-day energy.");
  }
  return insights.slice(0, 3);
}

// ── Main component ───────────────────────────────────────────────
const METRIC_DEFS = [
  { key: "energy",     label: "Energy",     icon: <Zap size={14} />,      color: "#7c3aed" },
  { key: "stress",     label: "Calm",       icon: <Wind size={14} />,     color: "#3b82f6",  invert: true },
  { key: "focus",      label: "Focus",      icon: <Brain size={14} />,    color: "#22c55e" },
  { key: "motivation", label: "Motivation", icon: <Activity size={14} />, color: "#f59e0b" },
  { key: "sleepScore", label: "Sleep",      icon: <Moon size={14} />,     color: "#818cf8" },
];

const SLEEP_SCORE = { poor: 2, okay: 5, good: 8, great: 10 };

export default function LongTermInsights({ dark, glass, metrics, tasks, onClose }) {
  const [range, setRange] = useState(30);
  const [activeMetric, setActiveMetric] = useState("energy");

  const entries = useMemo(() => getRange(metrics, range), [metrics, range]);

  const enrichedEntries = useMemo(() => entries.map(([date, v]) => [date, {
    ...v,
    sleepScore: SLEEP_SCORE[v.sleepQuality] ?? null,
    stress: v.stress != null ? v.stress : null,
  }]), [entries]);

  const dates = enrichedEntries.map(([d]) => d.slice(5)); // MM-DD
  const insights = useMemo(() => generateInsights(enrichedEntries, tasks), [enrichedEntries, tasks]);
  const taskStats = useMemo(() => computeTaskStats(tasks), [tasks]);
  const readinessSeries = extractSeries(enrichedEntries, "readinessScore");
  const activeSeries    = extractSeries(enrichedEntries, activeMetric);

  const noData = enrichedEntries.length < 3;

  return (
    <div className={`lti-overlay${dark ? " dark" : ""}${glass ? " glass" : ""}`}>
      <div className="lti-page">

        {/* Header */}
        <div className="lti-header">
          <div className="lti-header-left">
            <h1 className="lti-title">Long-Term Insights</h1>
            <p className="lti-subtitle">Your patterns over time</p>
          </div>
          <button className="lti-close" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Time range */}
        <div className="lti-range-row">
          {[7, 30, 90].map(d => (
            <button key={d} className={`lti-range-btn${range === d ? " active" : ""}`} onClick={() => setRange(d)}>
              {d}d
            </button>
          ))}
        </div>

        {noData ? (
          <div className="lti-no-data">
            <Activity size={40} style={{ opacity: .2 }} />
            <p>Complete a few daily check-ins to unlock your trends.</p>
            <p style={{ opacity: .6, fontSize: 13 }}>Data appears here as you log energy, sleep, and focus.</p>
          </div>
        ) : (
          <div className="lti-content">

            {/* ── Readiness trend ── */}
            {readinessSeries.length >= 3 && (
              <div className="lti-card lti-card-full">
                <div className="lti-card-header">
                  <div>
                    <div className="lti-card-title"><Activity size={14} /> Readiness Trend</div>
                    <div className="lti-card-sub">Combined score from sleep, energy, and workload</div>
                  </div>
                  <div className="lti-big-num">
                    {readinessSeries[readinessSeries.length - 1]}%
                    <TrendBadge values={readinessSeries} />
                  </div>
                </div>
                <SparkLine values={readinessSeries} color="#818cf8" height={72} />
                <div className="lti-date-labels">
                  <span>{dates[0]}</span><span>{dates[dates.length - 1]}</span>
                </div>
              </div>
            )}

            {/* ── Condition timeline ── */}
            <div className="lti-card lti-card-full">
              <div className="lti-card-title"><BarChart2 size={14} /> Condition Timeline</div>
              <div className="lti-metric-tabs">
                {METRIC_DEFS.map(m => (
                  <button key={m.key}
                    className={`lti-metric-tab${activeMetric === m.key ? " active" : ""}`}
                    style={activeMetric === m.key ? { borderColor: m.color, color: m.color, background: `${m.color}14` } : {}}
                    onClick={() => setActiveMetric(m.key)}>
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>
              {activeSeries.length >= 2 ? (
                <>
                  <SparkLine
                    values={activeSeries}
                    color={METRIC_DEFS.find(m => m.key === activeMetric)?.color ?? "var(--accent)"}
                    height={80} />
                  <div className="lti-date-labels">
                    <span>{dates[0]}</span><span>{dates[dates.length - 1]}</span>
                  </div>
                </>
              ) : (
                <p className="lti-mini-empty">Not enough data for this metric yet.</p>
              )}
            </div>

            {/* ── Metric cards grid ── */}
            <div className="lti-metrics-grid">
              {METRIC_DEFS.map(m => {
                const series = extractSeries(enrichedEntries, m.key);
                if (series.length < 2) return null;
                const current = series[series.length - 1];
                return (
                  <div key={m.key} className="lti-metric-card">
                    <div className="lti-metric-card-header">
                      <span className="lti-metric-icon" style={{ color: m.color }}>{m.icon}</span>
                      <span className="lti-metric-name">{m.label}</span>
                      <TrendBadge values={series} />
                    </div>
                    <SparkLine values={series} color={m.color} height={40} />
                    <div className="lti-metric-val">{typeof current === "number" ? (Number.isInteger(current) ? current : current.toFixed(1)) : current}</div>
                  </div>
                );
              })}
            </div>

            {/* ── Productivity by hour ── */}
            {Object.keys(taskStats.hourCounts).length > 0 && (
              <div className="lti-card lti-card-full">
                <div className="lti-card-header">
                  <div>
                    <div className="lti-card-title"><Zap size={14} /> When You Work Best</div>
                    <div className="lti-card-sub">Task completions by hour of day</div>
                  </div>
                  {taskStats.peakHour != null && (
                    <div className="lti-big-num">{taskStats.peakHour}:00</div>
                  )}
                </div>
                <HourBars hourCounts={taskStats.hourCounts} peakHour={taskStats.peakHour} />
              </div>
            )}

            {/* ── Your patterns ── */}
            <div className="lti-card lti-card-full">
              <div className="lti-card-title"><Activity size={14} /> Your Patterns</div>
              <div className="lti-stats-grid">
                <div className="lti-stat">
                  <span className="lti-stat-val">{taskStats.totalCompleted}</span>
                  <span className="lti-stat-lbl">Tasks done this period</span>
                </div>
                {taskStats.peakHour != null && (
                  <div className="lti-stat">
                    <span className="lti-stat-val">{taskStats.peakHour < 12 ? `${taskStats.peakHour} AM` : taskStats.peakHour === 12 ? "12 PM" : `${taskStats.peakHour - 12} PM`}</span>
                    <span className="lti-stat-lbl">Peak productive hour</span>
                  </div>
                )}
                {taskStats.bestComplexity && (
                  <div className="lti-stat">
                    <span className="lti-stat-val" style={{ textTransform: "capitalize" }}>{taskStats.bestComplexity}</span>
                    <span className="lti-stat-lbl">Best completion complexity</span>
                  </div>
                )}
                {taskStats.maxStreak > 1 && (
                  <div className="lti-stat">
                    <span className="lti-stat-val">{taskStats.maxStreak}d</span>
                    <span className="lti-stat-lbl">Longest streak</span>
                  </div>
                )}
                {readinessSeries.length >= 3 && (
                  <div className="lti-stat">
                    <span className="lti-stat-val">{Math.round(avg(readinessSeries))}%</span>
                    <span className="lti-stat-lbl">Avg readiness</span>
                  </div>
                )}
                {activeSeries.length >= 3 && (
                  <div className="lti-stat">
                    <span className="lti-stat-val">{Math.round(avg(extractSeries(enrichedEntries, "energy") || [0]) * 10) / 10}</span>
                    <span className="lti-stat-lbl">Avg energy (/10)</span>
                  </div>
                )}
              </div>
            </div>

            {/* ── NORA's insights ── */}
            {insights.length > 0 && (
              <div className="lti-card lti-card-full lti-insights-card">
                <div className="lti-card-title">Nora's Read on You</div>
                <div className="lti-insights-list">
                  {insights.map((ins, i) => (
                    <div key={i} className="lti-insight-item">
                      <span className="lti-insight-dot" />
                      {ins}
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
