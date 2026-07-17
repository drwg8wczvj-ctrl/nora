import React from "react";

// "Patterns Nora Found" — every card must earn its place, so this section
// simply doesn't render when there's nothing to say yet.
export default function PatternsSection({ patterns = [], title = "Patterns Nora Found", onAskAboutPattern }) {
  const safePatterns = Array.isArray(patterns) ? patterns : [];
  if (safePatterns.length === 0) return null;

  const tappable = typeof onAskAboutPattern === "function";

  return (
    <div className="status-card status-patterns-card">
      <div className="status-card-title-row">
        <h3 className="status-section-title">{title}</h3>
      </div>
      <ul className="status-patterns-list">
        {safePatterns.map((pattern, i) => {
          const Row = tappable ? "button" : "div";
          return (
            <li key={i} className="status-pattern-item">
              <Row
                type={tappable ? "button" : undefined}
                className={`status-pattern-row${tappable ? " is-tappable" : ""}`}
                onClick={tappable ? () => onAskAboutPattern(pattern) : undefined}
              >
                <span className="status-pattern-bullet" aria-hidden="true" />
                <span className="status-pattern-text">{pattern}</span>
              </Row>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
