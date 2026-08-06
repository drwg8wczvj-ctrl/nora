import React, { useState, useEffect } from "react";
import AICoachCard from "./AICoachCard";
import InsightEntryCard from "./InsightEntryCard";
import QuickCheckIn from "./QuickCheckIn";
import MetricCard from "./MetricCard";
import PatternsSection from "./PatternsSection";
import ActionCenter from "./ActionCenter";
import SleepScienceCard from "./SleepScienceCard";
import WorkMindToggle from "./WorkMindToggle";
import HealthSection from "./HealthSection";
import GuidedJourneysCard from "./GuidedJourneysCard";
import StatusModesGuide from "./StatusModesGuide";

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
export default function StatusPage({ work, mind, loading = false, health = null, healthSummary = null, onOpenHealthSettings = null, tasks = [], dailyMetrics = {}, journeys = [], onOpenInsights = null, onAskAtlas = null, onMindModeChange = null }) {
  const [tab, setTab] = useState("work");
  const [showModesGuide, setShowModesGuide] = useState(false);
  const active = tab === "mind" ? mind : work;

  // Mind is Atlas's world, not just this page's own cards — let the app SHELL
  // (header/nav/FAB, above this component) know so it can go black+gold too.
  // Cleanup covers both a tab switch back to Work and unmounting entirely
  // (navigating away from Status while still on Mind).
  useEffect(() => {
    onMindModeChange?.(tab === "mind");
    return () => onMindModeChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const safeMetrics = Array.isArray(active?.metrics) ? active.metrics : [];
  const safePatterns = Array.isArray(active?.patterns) ? active.patterns : [];
  const safeActions = Array.isArray(active?.actions) ? active.actions : [];
  const checkInItems = Array.isArray(active?.quickCheckIn?.items) ? active.quickCheckIn.items : [];

  // Only show a metrics skeleton when we're loading AND have nothing real
  // to show yet — once any metric data exists, render it even if still
  // technically "loading" (e.g. a background refresh).
  const showMetricsSkeleton = loading && safeMetrics.length === 0;

  if (showModesGuide) {
    return (
      <div className="status-page native-ui" data-persona="nora">
        <StatusModesGuide
          activeMode={work?.aiCoach?.stateLabel}
          onBack={() => setShowModesGuide(false)}
        />
      </div>
    );
  }

  return (
    <div
      className={`status-page native-ui${tab === "mind" ? " status-mind-view atlas-mode" : ""}`}
      data-persona={tab === "mind" ? "atlas" : "nora"}
    >
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
        onExplainModes={tab === "work" ? () => setShowModesGuide(true) : undefined}
      />

      {tab === "work" && (
        <InsightEntryCard
          metrics={dailyMetrics}
          tasks={tasks}
          healthSummary={healthSummary}
          onOpen={onOpenInsights}
        />
      )}

      {tab === "mind" && <GuidedJourneysCard journeys={journeys} onAskAtlas={onAskAtlas} />}

      {/* Sleep Science (self-reported estimate) only shows once there's no
          real HealthKit sleep data to show instead — see HealthSection,
          which takes over this slot the moment Health is connected. */}
      {tab === "mind" && !health?.context?.sleep?.stats?.hasData && (
        <SleepScienceCard sleepAnalysis={active?.sleepAnalysis} />
      )}
      {tab === "mind" && <HealthSection health={health} onOpenHealthSettings={onOpenHealthSettings} tasks={tasks} dailyMetrics={dailyMetrics} />}

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
