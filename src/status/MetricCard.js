import React, { useState } from "react";
import { ChevronDown, Lock, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { useCountUp } from "./useCountUp";

// Does `value`'s leading characters parse as a number? If so, return the
// numeric part (for animation), any trailing text (e.g. a unit baked into
// the string like "72%"), and how many decimal places to preserve.
function parseLeadingNumber(value) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const decimals = Number.isInteger(value) ? 0 : (String(value).split(".")[1] || "").length;
    return { number: value, suffix: "", decimals };
  }
  if (typeof value === "string") {
    const m = value.match(/^-?\d+(\.\d+)?/);
    if (!m) return null;
    const decimals = (m[0].split(".")[1] || "").length;
    return { number: parseFloat(m[0]), suffix: value.slice(m[0].length), decimals };
  }
  return null;
}

function formatAnimated(n, decimals) {
  if (n == null || Number.isNaN(n)) return "";
  return decimals > 0 ? n.toFixed(decimals) : String(Math.round(n));
}

export default function MetricCard({
  label,
  value,
  unit,
  trend,
  oneLinerExplanation,
  aiInterpretation,
  recommendedAction,
  estimatedImprovement,
  accentColor,
  expanded,
  defaultExpanded = false,
  onToggleExpand,
  animateValue = true,
  gated = false,
  gatedMessage,
}) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isControlled = expanded !== undefined;
  const isExpanded = isControlled ? expanded : internalExpanded;

  const parsed = gated ? null : parseLeadingNumber(value);
  const isNumeric = parsed != null;
  const shouldAnimate = animateValue && isNumeric;
  // Always call the hook with a real number when there's one to show, even
  // if we don't want it animated — duration 0 makes it resolve instantly.
  const animatedNumber = useCountUp(isNumeric ? parsed.number : null, { duration: shouldAnimate ? 650 : 0 });

  const hasExpandContent = !gated && Boolean(aiInterpretation || recommendedAction || estimatedImprovement);

  const handleToggle = () => {
    const next = !isExpanded;
    if (!isControlled) setInternalExpanded(next);
    onToggleExpand?.(next);
  };

  if (gated) {
    return (
      <div className="status-card status-metric-card is-gated">
        <div className="status-metric-top">
          <span className="status-metric-label">{label}</span>
          <Lock size={14} className="status-metric-lock" aria-hidden="true" />
        </div>
        <p className="status-metric-gated-message">{gatedMessage || "Not enough data yet."}</p>
      </div>
    );
  }

  const displayValue = isNumeric
    ? `${formatAnimated(animatedNumber, parsed.decimals)}${parsed.suffix}`
    : (value ?? "—");

  const trendDirection = typeof trend === "string" ? trend : trend?.direction;

  const content = (
    <>
      <div className="status-metric-top">
        <span className="status-metric-label">{label}</span>
        {hasExpandContent && (
          <ChevronDown size={16} className="status-metric-chevron" aria-hidden="true" />
        )}
      </div>
      <div className="status-metric-value-row">
        <span className="status-metric-value" style={accentColor ? { color: accentColor } : undefined}>
          {displayValue}
        </span>
        {unit && isNumeric && <span className="status-metric-unit">{unit}</span>}
        {trendDirection && (
          <span className={`status-metric-trend status-trend-${trendDirection}`}>
            {trendDirection === "up" && <ArrowUp size={12} />}
            {trendDirection === "down" && <ArrowDown size={12} />}
            {trendDirection !== "up" && trendDirection !== "down" && <Minus size={12} />}
          </span>
        )}
      </div>
      {oneLinerExplanation && <p className="status-metric-explain">{oneLinerExplanation}</p>}
      {hasExpandContent && (
        <div className="status-detail-wrap">
          <div>
            {aiInterpretation && <p className="status-metric-interpretation">{aiInterpretation}</p>}
            {recommendedAction && (
              <p className="status-metric-detail-line">
                <span className="status-detail-label">Try this:</span> {recommendedAction}
              </p>
            )}
            {estimatedImprovement && (
              <p className="status-metric-detail-line">
                <span className="status-detail-label">Expected:</span> {estimatedImprovement}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );

  if (hasExpandContent) {
    return (
      <button
        type="button"
        className="status-card status-metric-card"
        data-expanded={isExpanded}
        aria-expanded={isExpanded}
        onClick={handleToggle}
      >
        {content}
      </button>
    );
  }

  return (
    <div className="status-card status-metric-card" data-expanded="false">
      {content}
    </div>
  );
}
