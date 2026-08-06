import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import BrandStar from "../components/BrandStar";
import {
  buildNoraObservations,
  observationSignature,
  readFocusSessions,
  readSeenObservations,
  selectObservationDeck,
} from "../lib/noraObservations";

export default function InsightEntryCard({
  metrics = {},
  tasks = [],
  healthSummary = null,
  onOpen,
}) {
  const [seen, setSeen] = useState(() => readSeenObservations(globalThis.localStorage));
  const focusSessions = useMemo(() => readFocusSessions(globalThis.localStorage), []);
  const observations = useMemo(
    () => buildNoraObservations({ metrics, tasks, focusSessions, healthSummary }),
    [metrics, tasks, focusSessions, healthSummary],
  );
  const deck = useMemo(
    () => selectObservationDeck(observations, { seen, limit: 6 }),
    [observations, seen],
  );
  const unseenCount = observations.filter((item) => !seen.includes(observationSignature(item))).length;
  const preview = deck[0] ?? null;

  const refreshSeen = useCallback(() => {
    setSeen(readSeenObservations(globalThis.localStorage));
  }, []);

  useEffect(() => {
    window.addEventListener("nora:observations-seen", refreshSeen);
    window.addEventListener("storage", refreshSeen);
    return () => {
      window.removeEventListener("nora:observations-seen", refreshSeen);
      window.removeEventListener("storage", refreshSeen);
    };
  }, [refreshSeen]);

  return (
    <button type="button" className="status-insights-entry" onClick={onOpen}>
      <span className="status-insights-entry-mark" aria-hidden="true">
        <BrandStar size={30} tone="current" />
      </span>
      <span className="status-insights-entry-copy">
        <span className="status-insights-entry-kicker">
          {unseenCount > 0
            ? `${unseenCount} new observation${unseenCount === 1 ? "" : "s"}`
            : "Things Nora Noticed"}
        </span>
        <strong>
          {preview
            ? "Nora has discovered new patterns about you."
            : "Nora is quietly learning your rhythm."}
        </strong>
        <span className="status-insights-entry-preview">
          {preview
            ? `“${preview.title}”`
            : "As your days build history, Nora will show you the patterns that are easy to miss."}
        </span>
      </span>
      <span className="status-insights-entry-action">
        Open observations <ArrowUpRight size={15} />
      </span>
    </button>
  );
}
