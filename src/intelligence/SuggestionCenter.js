import React, { useState, useRef } from "react";
import { X, RefreshCw, Sparkles, Plus, CheckCircle } from "lucide-react";
import SuggestionCard from "./SuggestionCard";

export default function SuggestionCenter({
  suggestions,
  accounts,
  syncing,
  extracting,
  onClose,
  onAccept,
  onReject,
  onRejectAll,
  onSync,
  onExtractText,
  onOpenOnboarding,
}) {
  const [text, setText]           = useState("");
  const [extractResult, setExtractResult] = useState(null); // { count, success }
  const textareaRef = useRef(null);

  const handleExtract = async () => {
    if (!text.trim()) return;
    const count = await onExtractText(text);
    setExtractResult({ count, success: count > 0 });
    if (count > 0) setText("");
    setTimeout(() => setExtractResult(null), 4000);
  };

  return (
    <>
      <div className="intel-overlay-mask" onClick={onClose} />
      <aside className="intel-center-panel" aria-label="NORA Intelligence">

        {/* ── Header ─────────────────────────────────────────── */}
        <div className="intel-panel-head">
          <div className="intel-panel-head-icon">
            <Sparkles size={16} />
          </div>
          <div className="intel-panel-title">
            <h2>Intelligence</h2>
            <p>
              {suggestions.length > 0
                ? `${suggestions.length} pending suggestion${suggestions.length !== 1 ? "s" : ""}`
                : "All clear"}
            </p>
          </div>
          <div className="intel-panel-head-actions">
            <button
              className={`intel-icon-btn${syncing ? " syncing" : ""}`}
              onClick={onSync}
              title="Sync now"
              disabled={syncing}
            >
              <RefreshCw size={15} />
            </button>
            <button className="intel-icon-btn" onClick={onClose} title="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Connected accounts ─────────────────────────────── */}
        <div className="intel-accounts">
          {accounts.map((a) => (
            <div key={a.id} className="intel-account-chip">
              <span className={`intel-account-chip-dot ${a.provider}`} />
              {a.display_name ?? a.account_email ?? a.provider}
            </div>
          ))}
          <button className="intel-add-account-btn" onClick={onOpenOnboarding}>
            <Plus size={12} />
            Add source
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────── */}
        <div className="intel-panel-body">

          {/* Paste-text extractor */}
          <div className="intel-section-hdr">
            <h3>Analyze a message</h3>
          </div>
          <div className="intel-extract-box">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste an email, message, or any text… NORA will extract appointments, deadlines, and reservations automatically."
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  handleExtract();
                }
              }}
            />
            <div className="intel-extract-footer">
              <span className="intel-extract-hint">⌘↵ to analyze</span>
              <button
                className="intel-extract-btn"
                onClick={handleExtract}
                disabled={extracting || !text.trim()}
              >
                {extracting ? (
                  <><RefreshCw size={13} style={{ animation: "intel-spin 1s linear infinite" }} /> Analyzing…</>
                ) : (
                  <><Sparkles size={13} /> Analyze</>
                )}
              </button>
            </div>
          </div>

          {extractResult && (
            <div className={`intel-extract-result ${extractResult.success ? "success" : "none"}`}>
              {extractResult.success ? (
                <><CheckCircle size={14} /> Found {extractResult.count} new suggestion{extractResult.count !== 1 ? "s" : ""}</>
              ) : (
                <>Nothing actionable found in this text.</>
              )}
            </div>
          )}

          {/* Suggestions list */}
          {suggestions.length > 0 ? (
            <>
              <div className="intel-section-hdr">
                <h3>Pending ({suggestions.length})</h3>
                {suggestions.length > 1 && (
                  <button onClick={onRejectAll}>Dismiss all</button>
                )}
              </div>
              {suggestions.map((s) => (
                <SuggestionCard
                  key={s.id}
                  suggestion={s}
                  onAccept={onAccept}
                  onReject={onReject}
                />
              ))}
            </>
          ) : (
            <div className="intel-empty">
              <div className="intel-empty-icon">✨</div>
              <h3>You're all caught up</h3>
              <p>
                {accounts.length > 0
                  ? "No new suggestions right now. I'll notify you when I find something worth your attention."
                  : "Connect Gmail or Telegram to let NORA automatically detect appointments, reservations, and deadlines."}
              </p>
              {accounts.length === 0 && (
                <button
                  onClick={onOpenOnboarding}
                  style={{
                    marginTop: 12,
                    padding: "9px 18px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "var(--surface-2)",
                    color: "var(--text)",
                    fontSize: 13,
                    fontFamily: "inherit",
                    cursor: "pointer",
                  }}
                >
                  Connect a source
                </button>
              )}
            </div>
          )}
        </div>

      </aside>
    </>
  );
}
