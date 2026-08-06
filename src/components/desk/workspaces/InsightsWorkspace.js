import React from "react";
import { ArrowUpRight, Brain, Sparkles, TrendingUp } from "lucide-react";

export default function InsightsWorkspace({ insights = [], observation }) {
  const items = [...new Set([observation, ...insights].filter(Boolean))];
  return (
    <section className="desk-workspace desk-insights-workspace" aria-labelledby="desk-insights-title">
      <header className="desk-workspace-intro">
        <span className="desk-eyebrow"><Brain size={13} /> From your real behaviour</span>
        <h1 id="desk-insights-title">What Nora is noticing.</h1>
        <p>Only patterns supported by your tasks, focus sessions, and connected health data appear here.</p>
      </header>
      <div className="desk-insights-grid">
        {items.length ? items.map((insight, index) => (
          <article key={insight} className={`desk-insight-card desk-insight-tone-${index % 4}`}>
            <span>{index === 0 ? <Sparkles /> : <TrendingUp />}</span>
            <p>{insight}</p>
            <small>{index === 0 ? "Relevant now" : "Observed pattern"}</small>
          </article>
        )) : (
          <div className="desk-empty-state">
            <Sparkles />
            <strong>Patterns are still forming.</strong>
            <p>Complete tasks and focus sessions; Nora will only show an insight when the evidence is meaningful.</p>
          </div>
        )}
        <article className="desk-insight-card desk-insight-method">
          <ArrowUpRight />
          <p>No generic AI filler.</p>
          <small>Every card is derived locally from existing Nora data.</small>
        </article>
      </div>
    </section>
  );
}
