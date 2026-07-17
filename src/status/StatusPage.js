import React from "react";
import AICoachCard from "./AICoachCard";
import QuickCheckIn from "./QuickCheckIn";
import MetricCard from "./MetricCard";
import PatternsSection from "./PatternsSection";
import ActionCenter from "./ActionCenter";

// Root orchestrator for the Status page. Pure props in, JSX out — this
// component has zero knowledge of mobile vs. desktop. The only platform
// difference (outer gutter padding) is handled by whichever of App.js /
// MobileApp.js mounts <StatusPage>, by wrapping it in their own padded
// container. Everything below this point is one adaptive layout that
// reflows on its own rendered width (see StatusPage.css's use of
// auto-fit/minmax and @container queries).
export default function StatusPage({
  aiCoach,
  metrics,
  patterns,
  actions,
  quickCheckIn,
  loading = false,
}) {
  const safeMetrics = Array.isArray(metrics) ? metrics : [];
  const safePatterns = Array.isArray(patterns) ? patterns : [];
  const safeActions = Array.isArray(actions) ? actions : [];
  const checkInItems = Array.isArray(quickCheckIn?.items) ? quickCheckIn.items : [];

  // Only show a metrics skeleton when we're loading AND have nothing real
  // to show yet — once any metric data exists, render it even if still
  // technically "loading" (e.g. a background refresh).
  const showMetricsSkeleton = loading && safeMetrics.length === 0;

  return (
    <div className="status-page">
      <AICoachCard
        message={aiCoach?.headline}
        tone={aiCoach?.tone}
        stateLabel={aiCoach?.stateLabel}
        stateColor={aiCoach?.stateColor}
        confidence={aiCoach?.confidence}
        signals={aiCoach?.signals}
        onAskNora={aiCoach?.onAskNora}
        loading={loading || Boolean(aiCoach?.loading)}
      />

      <QuickCheckIn items={checkInItems} sleep={quickCheckIn?.sleep} />

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
