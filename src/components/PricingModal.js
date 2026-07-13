import React, { useState } from "react";
import { createPortal } from "react-dom";
import { X, Check } from "lucide-react";
import "./PricingModal.css";

const PLANS = [
  {
    key: "plus",
    name: "Nora Plus",
    cardClass: "pm-card-plus",
    monthly: 5.99,
    yearly: 49,
    perMonthYearly: (49 / 12).toFixed(2),
    description: "The full planner. For students and personal users replacing simple todo apps.",
    features: [
      { text: "Unlimited groups & projects" },
      { text: "Unlimited notes & whiteboards" },
      { text: "Custom reminders" },
      { text: "Recurring tasks" },
      { text: "Themes & liquid glass customization" },
      { text: "Full task history" },
      { text: "Basic productivity insights" },
      { divider: "AI" },
      { text: "200 AI messages / month" },
      { text: "Morning check-up & daily review" },
      { text: "Calendar import (read-only sync)" },
    ],
  },
  {
    key: "pro",
    name: "Nora Pro",
    cardClass: "pm-card-pro",
    popular: true,
    monthly: 11.99,
    yearly: 99,
    perMonthYearly: (99 / 12).toFixed(2),
    description: "NORA becomes an intelligent planning companion, not just a todo app.",
    features: [
      { text: "Everything in Plus" },
      { divider: "AI Intelligence" },
      { text: "Unlimited NORA AI messages" },
      { text: "AI day planning & re-planning" },
      { text: "Energy-aware scheduling" },
      { text: "Proactive suggestions" },
      { text: "Gmail / Telegram intelligence" },
      { text: "Travel-time planning" },
      { text: "Long-term insights & AI memory" },
      { text: "Smart deferral & task recovery" },
      { divider: "Productivity" },
      { text: "Focus sessions" },
      { text: "Advanced widgets" },
      { text: "Priority support" },
    ],
  },
  {
    key: "team",
    name: "Nora Team",
    cardClass: "pm-card-team",
    monthly: 19.99,
    yearly: 159,
    perMonthYearly: (159 / 12).toFixed(2),
    description: "For couples, families, and small teams sharing projects and routines.",
    teamNote: "Up to 5 people · $7.99/user/month for extras",
    features: [
      { text: "Everything in Pro (per member)" },
      { divider: "Collaboration" },
      { text: "Shared tasks & projects" },
      { text: "Shared notes & whiteboards" },
      { text: "Collaboration invites & join codes" },
      { text: "Roles & permissions" },
      { text: "Shared routines & planning view" },
      { text: "Shared availability" },
      { text: "Higher shared AI pool" },
      { text: "Admin billing & management" },
    ],
  },
];

function PlanCard({ plan, yearly, onChoose, loading, currentPlan }) {
  const isCurrent = currentPlan === plan.key;
  const price = yearly ? plan.perMonthYearly : plan.monthly;
  const origPrice = plan.monthly;

  return (
    <div className={`pm-card ${plan.cardClass}`}>
      {plan.popular && <div className="pm-popular-badge">Most Popular</div>}

      <div className="pm-plan-name">{plan.name}</div>

      <div className="pm-price">
        <span className="pm-price-amount">${price}</span>
        <span className="pm-price-unit">/mo</span>
        {yearly && <span className="pm-price-orig">${origPrice}</span>}
      </div>
      {plan.teamNote && <div className="pm-price-team-note">{plan.teamNote}</div>}

      <p className="pm-description">{plan.description}</p>

      <ul className="pm-features">
        {plan.features.map((f, i) =>
          f.divider ? (
            <li key={i} className="pm-features-divider">{f.divider}</li>
          ) : (
            <li key={i} className="pm-feature">
              <Check size={13} className="pm-feature-check" />
              <span>{f.text}</span>
            </li>
          )
        )}
      </ul>

      <button
        className={`pm-cta${isCurrent ? " pm-cta-current" : ""}`}
        onClick={isCurrent ? undefined : onChoose}
        disabled={loading || isCurrent}
      >
        {loading ? "Redirecting…" : isCurrent ? "Current plan" : "Choose Plan"}
      </button>
    </div>
  );
}

export default function PricingModal({ onClose, currentPlan, userId, userEmail }) {
  const [yearly,  setYearly]  = useState(false);
  const [loading, setLoading] = useState(null);
  const [error,   setError]   = useState(null);

  const handleChoose = async (planKey) => {
    setLoading(planKey);
    setError(null);
    try {
      const res = await fetch("/api/stripe-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey, yearly, userId, email: userEmail }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      } else {
        setError(data.error ?? "Something went wrong. Please try again.");
      }
    } catch {
      setError("Could not reach payment server. Check your connection.");
    } finally {
      setLoading(null);
    }
  };

  return createPortal(
    <div className="pm-overlay">
      {/* Background */}
      <div className="pm-bg">
        <div className="pm-blob pm-blob-1" />
        <div className="pm-blob pm-blob-2" />
        <div className="pm-blob pm-blob-3" />
        <div className="pm-grain" />
      </div>
      <div className="pm-watermark">Pricing</div>

      <button className="pm-close" onClick={onClose} aria-label="Close">
        <X size={16} />
      </button>

      <div className="pm-content">
        <div className="pm-header">
          <div className="pm-eyebrow">Plans &amp; Pricing</div>
          <h1 className="pm-title">Your planning companion,<br />at the right level.</h1>
          <p className="pm-subtitle">Start free. Upgrade when NORA's intelligence becomes part of your routine.</p>
        </div>

        {/* Billing toggle */}
        <div className="pm-toggle-wrap">
          <span className={`pm-toggle-label${!yearly ? " active" : ""}`}>Monthly</span>
          <button
            className={`pm-toggle${yearly ? " on" : ""}`}
            onClick={() => setYearly(v => !v)}
            aria-label="Toggle yearly billing"
          >
            <div className="pm-toggle-thumb" />
          </button>
          <span className={`pm-toggle-label${yearly ? " active" : ""}`}>
            Yearly&nbsp;<span className="pm-save-badge">Save ~30%</span>
          </span>
        </div>

        {/* Cards */}
        <div className="pm-cards">
          {PLANS.map(plan => (
            <PlanCard
              key={plan.key}
              plan={plan}
              yearly={yearly}
              loading={loading === plan.key}
              currentPlan={currentPlan}
              onChoose={() => handleChoose(plan.key)}
            />
          ))}
        </div>

        {error && (
          <p style={{ color: "#f87171", marginTop: 20, fontSize: 14 }}>{error}</p>
        )}

        <div className="pm-footer">
          <p>Cancel anytime · All plans include a 7-day free trial · No hidden fees</p>
          <a href="mailto:support@nora.app">support@nora.app</a>
          <div className="pm-stripe-badge">
            <svg width="38" height="16" viewBox="0 0 38 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M5.476 6.056c0-.496.41-.688.996-.688 1.176 0 2.48.357 3.657 1.048V3.24C8.902 2.752 7.69 2.56 6.472 2.56 3.56 2.56 1.6 4.072 1.6 6.23c0 3.32 4.572 2.792 4.572 4.223 0 .584-.508.776-1.136.776-1.237 0-2.82-.508-4.07-1.192v3.192c1.384.6 2.784.848 4.07.848 2.984 0 5.04-1.472 5.04-3.656-.008-3.584-4.6-2.952-4.6-4.365zM14.67 0l-3.04.648v2.46L9.55 3.76v2.576h2.08v4.4c0 1.985 1.328 2.744 3.224 2.744 1.064 0 1.944-.2 2.512-.464V10.23a7.21 7.21 0 01-1.464.152c-.584 0-1.232-.168-1.232-1V6.336h2.696V3.76h-2.696V0zm7.896 3.56l-.2-.8h-3.04V13h3.368V7.232c.792-1.032 2.136-.832 2.552-.688V3.312c-.424-.152-1.96-.432-2.68.248zM28.2 2.56c-3.544 0-5.672 2.904-5.672 5.576 0 3.352 2.384 5.344 6.008 5.344 1.568 0 3.096-.376 4.152-1.144V9.104c-.992.72-2.312 1.064-3.544 1.064-1.52 0-2.896-.632-3.088-2.128h7.392c.016-.208.032-.504.032-.688 0-2.992-1.664-4.792-5.28-4.792zm-2.128 4.368c.136-1.232.944-1.888 2.1-1.888 1.136 0 1.88.664 1.88 1.888h-3.98zM36.4 1.44a1.84 1.84 0 100-3.68 1.84 1.84 0 000 3.68zm1.6 1.32h-3.2V13H38V2.76z" fill="rgba(255,255,255,0.3)"/></svg>
            Payments secured by Stripe
          </div>
        </div>
      </div>
    </div>,
    // Portal into the themed root (.app carries the dark/glass CSS custom
    // properties) rather than document.body directly — a plain document.body
    // portal escapes that theme context entirely and silently falls back to
    // light-mode variable defaults, which is exactly what caused the "white
    // background in dark mode" bug in IntelligenceOnboarding.js.
    document.querySelector(".app") ?? document.body
  );
}
