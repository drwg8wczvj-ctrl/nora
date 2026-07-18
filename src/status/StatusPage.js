import React, { useState } from "react";
import AICoachCard from "./AICoachCard";
import QuickCheckIn from "./QuickCheckIn";
import MetricCard from "./MetricCard";
import PatternsSection from "./PatternsSection";
import ActionCenter from "./ActionCenter";
import SleepScienceCard from "./SleepScienceCard";
import WorkMindToggle from "./WorkMindToggle";

// Root orchestrator for the Status page. Pure props in, JSX out — this
// component has zero knowledge of mobile vs. desktop. The only platform
// difference (outer gutter padding) is handled by whichever of App.js /
// MobileApp.js mounts <StatusPage>, by wrapping it in their own padded
// container. Everything below this point is one adaptive layout that
// reflows on its own rendered width (see StatusPage.css's use of
// auto-fit/minmax and @container queries).
//
// Split into two tabs — Work (Nora/Planner) and Mind (Atlas) — via a local
// segmented control. Both `work` and `mind` are always fully computed by the
// caller (see status/buildStatusProps.js); switching tabs is a pure
// conditional render, never a lazy/async fetch.
export default function StatusPage({ work, mind, loading = false }) {
  const [tab, setTab] = useState("work");
  const active = tab === "mind" ? mind : work;

  const safeMetrics = Array.isArray(active?.metrics) ? active.metrics : [];
  const safePatterns = Array.isArray(active?.patterns) ? active.patterns : [];
  const safeActions = Array.isArray(active?.actions) ? active.actions : [];
  const checkInItems = Array.isArray(active?.quickCheckIn?.items) ? active.quickCheckIn.items : [];

  // Only show a metrics skeleton when we're loading AND have nothing real
  // to show yet — once any metric data exists, render it even if still
  // technically "loading" (e.g. a background refresh).
  const showMetricsSkeleton = loading && safeMetrics.length === 0;

  return (
    <div className={`status-page${tab === "mind" ? " status-mind-view" : ""}`}>
      <WorkMindToggle active={tab} onChange={setTab} />

      <AICoachCard
        message={active?.aiCoach?.headline}
        tone={active?.aiCoach?.tone}
        stateLabel={active?.aiCoach?.stateLabel}
        stateColor={active?.aiCoach?.stateColor}
        confidence={active?.aiCoach?.confidence}
        signals={active?.aiCoach?.signals}
        onAskNora={active?.aiCoach?.onAskNora}
        askLabel={active?.aiCoach?.askLabel ?? "Ask Nora"}
        persona={active?.aiCoach?.persona}
        loading={loading || Boolean(active?.aiCoach?.loading)}
      />

      {tab === "mind" && <SleepScienceCard sleepAnalysis={active?.sleepAnalysis} />}

      <QuickCheckIn items={checkInItems} sleep={active?.quickCheckIn?.sleep} />

      {showMetricsSkeleton && (
        <div className="status-metrics-grid" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="status-card status-metric-card status-metric-skeleton">
              <div className="status-skeleton status-skeleton-label" />
              <div className="status-skeleton status-skeleton-value" />
              <div className="status-skeleton status-skeleton-line" />
            </div>
          ))}
        </div>
      )}

      {!showMetricsSkeleton && safeMetrics.length > 0 && (
        <div className="status-metrics-grid">
          {safeMetrics.map((metric, i) => (
            <MetricCard key={metric?.id ?? i} {...metric} />
          ))}
        </div>
      )}

      <PatternsSection patterns={safePatterns} />

      <ActionCenter actions={safeActions} />
    </div>
  );
}
