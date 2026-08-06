import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BatteryCharging,
  Brain,
  CalendarCheck,
  Clock3,
  Compass,
  Heart,
  Leaf,
  MessageSquare,
  Moon,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react";
import BrandStar from "./components/BrandStar";
import CloseButton from "./components/CloseButton";
import {
  buildNoraObservations,
  markObservationsSeen,
  observationSignature,
  readFocusSessions,
  readSeenObservations,
  selectObservationDeck,
} from "./lib/noraObservations";
import "./NoraObservations.css";

const CATEGORY_ICONS = {
  Productivity: Target,
  Time: Clock3,
  Focus: Brain,
  Sleep: Moon,
  Health: Heart,
  Mood: Heart,
  Planning: CalendarCheck,
  Energy: BatteryCharging,
  Recovery: Leaf,
  Habits: Compass,
  Goals: Trophy,
  "Personal growth": Sparkles,
  "Decision making": Compass,
  "Work-life balance": Leaf,
};

function ObservationIcon({ category, size = 18 }) {
  const Icon = CATEGORY_ICONS[category] ?? Heart;
  return <Icon size={size} strokeWidth={1.8} />;
}

function ObservationCard({ item, isNew, index, onDiscuss }) {
  return (
    <article
      className={`nora-observation-card tone-${item.tone}${isNew ? " is-new" : ""}`}
      style={{ "--observation-index": index }}
    >
      <div className="nora-observation-card-top">
        <span className="nora-observation-icon" aria-hidden="true">
          <ObservationIcon category={item.category} />
        </span>
        <div className="nora-observation-meta">
          <span>{item.category}</span>
          <span aria-hidden="true">·</span>
          <span>{item.cadence}</span>
        </div>
        {isNew && <span className="nora-observation-new">New</span>}
      </div>
      <h2>{item.title}</h2>
      <p>{item.body}</p>
      {typeof onDiscuss === "function" && (
        <button type="button" className="nora-observation-discuss" onClick={() => onDiscuss(item.prompt)}>
          <MessageSquare size={14} />
          Talk about this with Nora
          <ArrowRight size={13} />
        </button>
      )}
    </article>
  );
}

export default function NoraObservations({
  metrics = {},
  tasks = [],
  healthSummary = null,
  onClose,
  onAskNora,
}) {
  const [seenAtOpen] = useState(() => readSeenObservations(globalThis.localStorage));
  const [revealed, setRevealed] = useState(false);
  const focusSessions = useMemo(() => readFocusSessions(globalThis.localStorage), []);
  const observations = useMemo(
    () => buildNoraObservations({ metrics, tasks, focusSessions, healthSummary }),
    [metrics, tasks, focusSessions, healthSummary],
  );
  const deck = useMemo(
    () => selectObservationDeck(observations, { seen: seenAtOpen, limit: 6 }),
    [observations, seenAtOpen],
  );
  const seenSet = useMemo(() => new Set(seenAtOpen), [seenAtOpen]);
  const newItems = deck.filter((item) => !seenSet.has(observationSignature(item)));
  const hero = deck[0] ?? null;
  const rest = deck.slice(1);
  const newRestCount = rest.filter((item) => !seenSet.has(observationSignature(item))).length;

  useEffect(() => {
    const frame = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!deck.length) return undefined;
    const timer = window.setTimeout(() => {
      markObservationsSeen(globalThis.localStorage, deck);
      window.dispatchEvent(new CustomEvent("nora:observations-seen"));
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [deck]);

  const discuss = (prompt) => {
    if (typeof onAskNora !== "function") return;
    onAskNora(prompt);
  };

  return (
    <div className={`nora-observations-overlay${revealed ? " is-revealed" : ""}`}>
      <div className="nora-observations-ambient" aria-hidden="true" />
      <main className="nora-observations-page">
        <header className="nora-observations-header">
          <div className="nora-observations-heading">
            <span className="nora-observations-mark" aria-hidden="true">
              <BrandStar size={30} tone="current" />
            </span>
            <div>
              <p className="nora-observations-kicker">Nora’s observations</p>
              <h1>Things Nora Noticed</h1>
              <p className="nora-observations-subtitle">
                Quiet patterns from the way you plan, focus, recover, and follow through.
              </p>
            </div>
          </div>
          <CloseButton onClick={onClose} label="Close observations" />
        </header>

        {hero ? (
          <>
            <section className={`nora-discovery-moment tone-${hero.tone}`}>
              <div className="nora-discovery-orbit" aria-hidden="true">
                <BrandStar size={38} tone="current" />
              </div>
              <div className="nora-discovery-copy">
                <div className="nora-discovery-label">
                  <Sparkles size={14} />
                  {newItems.length > 0 ? "Nora discovered something" : "A pattern worth remembering"}
                </div>
                <h2>{hero.title}</h2>
                <p>{hero.body}</p>
                <div className="nora-discovery-footer">
                  <span>
                    <ObservationIcon category={hero.category} size={14} />
                    {hero.category}
                  </span>
                  {typeof onAskNora === "function" && (
                    <button type="button" onClick={() => discuss(hero.prompt)}>
                      Reflect with Nora <ArrowRight size={14} />
                    </button>
                  )}
                </div>
              </div>
            </section>

            {rest.length > 0 && (
              <section className="nora-observations-feed" aria-label="More observations">
                <div className="nora-observations-section-heading">
                  <div>
                    <p>{newRestCount > 0 ? `${newRestCount} more new` : "From your recent patterns"}</p>
                    <h2>What else is becoming visible</h2>
                  </div>
                  <span>Refreshed as your patterns change</span>
                </div>
                <div className="nora-observations-grid">
                  {rest.map((item, index) => (
                    <ObservationCard
                      key={observationSignature(item)}
                      item={item}
                      index={index}
                      isNew={!seenSet.has(observationSignature(item))}
                      onDiscuss={onAskNora ? discuss : null}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        ) : (
          <section className="nora-observations-learning">
            <div className="nora-observations-learning-mark" aria-hidden="true">
              <BrandStar size={46} tone="current" />
            </div>
            <p className="nora-discovery-label">Nora is still learning your rhythm</p>
            <h2>The most useful observations need a little history.</h2>
            <p>
              Complete daily check-ins, plan a few days, and use Focus Sessions. Nora will connect
              the patterns quietly and tell you when something becomes worth noticing.
            </p>
          </section>
        )}

        <footer className="nora-observations-footer">
          <BrandStar size={18} tone="current" />
          <p>
            Nora creates these observations from your own plans, check-ins, and Focus Sessions.
            They evolve as your life does.
          </p>
        </footer>
      </main>
    </div>
  );
}
