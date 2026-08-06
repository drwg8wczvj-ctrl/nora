import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import BrandStar from "./BrandStar";
import {
  NativeButton,
  NativeIconButton,
  NativeSwitch,
} from "./ui/NativeUI";
import { apiFetch } from "../lib/apiBase";
import "./PricingModal.css";

const PLANS = [
  {
    key: "plus",
    name: "Nora Plus",
    cardClass: "pricing-card-plus",
    monthly: 5.99,
    yearly: 49,
    perMonthYearly: (49 / 12).toFixed(2),
    description: "The full planner. For students and personal users replacing simple todo apps.",
    features: [
      { text: "Unlimited groups & projects" },
      { text: "Unlimited notes & whiteboards" },
      { text: "Custom reminders" },
      { text: "Recurring tasks" },
      { text: "Nora appearance controls" },
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
    cardClass: "pricing-card-pro",
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
    cardClass: "pricing-card-team",
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
    <div className={`pricing-card ${plan.cardClass}`}>
      {plan.popular && <div className="pricing-popular-badge">Most Popular</div>}

      <div className="pricing-plan-name">{plan.name}</div>

      <div className="pricing-price">
        <span className="pricing-price-amount">${price}</span>
        <span className="pricing-price-unit">/mo</span>
        {yearly && <span className="pricing-price-orig">${origPrice}</span>}
      </div>
      {plan.teamNote && <div className="pricing-price-team-note">{plan.teamNote}</div>}

      <p className="pricing-description">{plan.description}</p>

      <ul className="pricing-features">
        {plan.features.map((f, i) =>
          f.divider ? (
            <li key={i} className="pricing-features-divider">{f.divider}</li>
          ) : (
            <li key={i} className="pricing-feature">
              <Check size={13} className="pricing-feature-check" />
              <span>{f.text}</span>
            </li>
          )
        )}
      </ul>

      <NativeButton
        className={`pricing-cta${isCurrent ? " pricing-cta-current" : ""}`}
        variant={plan.popular ? "primary" : "secondary"}
        onClick={isCurrent ? undefined : onChoose}
        disabled={loading || isCurrent}
        loading={loading}
      >
        {isCurrent ? "Current plan" : "Choose plan"}
      </NativeButton>
    </div>
  );
}

export default function PricingModal({ onClose, currentPlan }) {
  const [yearly,  setYearly]  = useState(false);
  const [loading, setLoading] = useState(null);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const handleChoose = async (planKey) => {
    setLoading(planKey);
    setError(null);
    try {
      const res = await apiFetch("/api/stripe-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey, yearly }),
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
    <div className="pricing-overlay native-ui" role="dialog" aria-modal="true" aria-labelledby="pricing-title">
      <NativeIconButton
        label="Close pricing"
        variant="tertiary"
        className="pricing-close-btn"
        onClick={onClose}
      >
        <X size={19} />
      </NativeIconButton>

      <div className="pricing-content">
        <div className="pricing-header">
          <div className="pricing-brand" aria-hidden="true">
            <BrandStar size={32} tone="white" />
            <span>NORA</span>
          </div>
          <div className="pricing-eyebrow">Plans &amp; Pricing</div>
          <h1 id="pricing-title" className="pricing-title">Choose the Nora that fits your routine.</h1>
          <p className="pricing-subtitle">Start free. Upgrade when NORA's intelligence becomes part of your routine.</p>
        </div>

        {/* Billing toggle */}
        <div className="pricing-toggle-wrap">
          <span className={`pricing-toggle-label${!yearly ? " active" : ""}`}>Monthly</span>
          <NativeSwitch
            checked={yearly}
            onChange={setYearly}
            label="Use yearly billing"
          />
          <span className={`pricing-toggle-label${yearly ? " active" : ""}`}>
            Yearly&nbsp;<span className="pricing-save-badge">Save ~30%</span>
          </span>
        </div>

        {/* Cards */}
        <div className="pricing-cards">
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

        {error && <p className="pricing-error" role="alert">{error}</p>}

        <div className="pricing-footer">
          <p>Cancel anytime · All plans include a 7-day free trial · No hidden fees</p>
          <a href="mailto:support@nora.app">support@nora.app</a>
          <div className="pricing-stripe-badge">
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
