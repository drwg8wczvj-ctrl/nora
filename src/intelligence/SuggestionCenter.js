import React from "react";
import { X, RefreshCw, Sparkles, Plus, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
  const syncLabel = syncing ? t("intel.scanning")
    : syncError   ? null
    : lastSyncAt  ? t("intel.updatedAt", { time: formatRelative(lastSyncAt) })
    : accounts.length > 0 ? t("intel.readyToScan") : null;

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
              <div className="intel-head-title">{t("intel.title")}</div>
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
              title={t("intel.syncNow")}
            >
              <RefreshCw size={15} />
            </button>
            <button className="intel-icon-btn" onClick={onClose} title={t("intel.close")}>
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
            {t("intel.add")}
          </button>
        </div>

        {/* ── Sync error banner ───────────────────────────── */}
        {syncError && (
          <div className="intel-sync-error">
            <AlertCircle size={14} />
            <span>{syncError}</span>
            <button onClick={onSync}>{t("intel.retry")}</button>
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
              <p>{t("intel.scanningMessages")}</p>
            </div>
          )}

          {/* Suggestions */}
          {suggestions.length > 0 && (
            <>
              <div className="intel-section-hdr">
                <h3>{t("intel.suggestionsCount", { count: suggestions.length })}</h3>
                {suggestions.length > 1 && (
                  <button onClick={onRejectAll}>{t("intel.dismissAll")}</button>
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
              <h3>{t("intel.allCaughtUp")}</h3>
              <p>
                {accounts.length > 0
                  ? t("intel.noNewSuggestions")
                  : t("intel.connectPrompt")}
              </p>
              {accounts.length === 0 && (
                <button className="intel-empty-cta" onClick={onOpenOnboarding}>
                  {t("intel.connectSource")}
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
