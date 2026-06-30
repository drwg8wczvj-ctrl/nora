import React from "react";
import { X, RefreshCw, Sparkles, Plus, AlertCircle } from "lucide-react";
import SuggestionCard from "./SuggestionCard";

function formatRelative(ts) {
  if (!ts) return null;
  const diff = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 10)   return "just now";
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  return `${Math.round(diff / 3600)}h ago`;
}

const PROVIDER_COLOR = { gmail: "#ea4335", telegram: "#2aabee", outlook: "#0078d4" };
const PROVIDER_ICON  = { gmail: "✉", telegram: "✈", outlook: "✉" };

export default function SuggestionCenter({
  suggestions,
  accounts,
  syncing,
  syncError,
  lastSyncAt,
  onClose,
  onAccept,
  onReject,
  onRejectAll,
  onSync,
  onOpenOnboarding,
}) {
  const syncLabel = syncing ? "Scanning…"
    : syncError   ? null
    : lastSyncAt  ? `Updated ${formatRelative(lastSyncAt)}`
    : accounts.length > 0 ? "Ready to scan" : null;

  return (
    <>
      <div className="intel-overlay-mask" onClick={onClose} />
      <div className="intel-center-panel">

        {/* ── Header ──────────────────────────────────────── */}
        <div className="intel-panel-head">
          <div className="intel-panel-head-left">
            <div className="intel-head-orb">
              <Sparkles size={15} />
            </div>
            <div>
              <div className="intel-head-title">Intelligence</div>
              {syncLabel && (
                <div className={`intel-head-sub${syncing ? " syncing" : ""}`}>
                  {syncing && <RefreshCw size={10} className="intel-spin-icon" />}
                  {syncLabel}
                </div>
              )}
            </div>
          </div>
          <div className="intel-panel-head-actions">
            <button
              className={`intel-icon-btn${syncing ? " syncing" : ""}`}
              onClick={onSync}
              disabled={syncing}
              title="Sync now"
            >
              <RefreshCw size={15} />
            </button>
            <button className="intel-icon-btn" onClick={onClose} title="Close">
              <X size={17} />
            </button>
          </div>
        </div>

        {/* ── Accounts strip ──────────────────────────────── */}
        <div className="intel-accounts">
          {accounts.map((a) => (
            <div
              key={a.id}
              className="intel-account-chip"
              style={{ "--chip-color": PROVIDER_COLOR[a.provider] ?? "var(--accent)" }}
            >
              <span className="intel-account-chip-dot" />
              {PROVIDER_ICON[a.provider] && (
                <span className="intel-account-chip-icon">{PROVIDER_ICON[a.provider]}</span>
              )}
              {a.display_name ?? a.account_email ?? a.provider}
            </div>
          ))}
          <button className="intel-add-account-btn" onClick={onOpenOnboarding}>
            <Plus size={11} />
            Add
          </button>
        </div>

        {/* ── Sync error banner ───────────────────────────── */}
        {syncError && (
          <div className="intel-sync-error">
            <AlertCircle size={14} />
            <span>{syncError}</span>
            <button onClick={onSync}>Retry</button>
          </div>
        )}

        {/* ── Body ────────────────────────────────────────── */}
        <div className="intel-panel-body">

          {/* Scanning state */}
          {syncing && suggestions.length === 0 && (
            <div className="intel-scanning">
              <div className="intel-scanning-orb">
                <Sparkles size={22} />
              </div>
              <p>Scanning your messages…</p>
            </div>
          )}

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <>
              <div className="intel-section-hdr">
                <h3>{suggestions.length} suggestion{suggestions.length !== 1 ? "s" : ""}</h3>
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
          )}

          {/* Empty state */}
          {!syncing && suggestions.length === 0 && !syncError && (
            <div className="intel-empty">
              <div className="intel-empty-orb">✨</div>
              <h3>All caught up</h3>
              <p>
                {accounts.length > 0
                  ? "No new suggestions. NORA scans every time you open this panel."
                  : "Connect Telegram or Gmail so NORA can automatically detect events, deadlines, and reservations."}
              </p>
              {accounts.length === 0 && (
                <button className="intel-empty-cta" onClick={onOpenOnboarding}>
                  Connect a source
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Swipe handle (mobile) ───────────────────────── */}
        <div className="intel-swipe-handle" onClick={onClose} />
      </div>
    </>
  );
}
