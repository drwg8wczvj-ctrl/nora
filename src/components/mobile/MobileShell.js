import React from "react";
import {
  Activity,
  CalendarDays,
  CheckSquare,
  FileText,
  Settings,
} from "lucide-react";
import BrandStar from "../BrandStar";

export const MOBILE_SHELL_TABS = [
  { id: "plan", icon: CalendarDays },
  { id: "tasks", icon: CheckSquare },
  { id: "notes", icon: FileText },
  { id: "status", icon: Activity },
  { id: "settings", icon: Settings },
];

const FALLBACK_LABELS = {
  plan: "Plan",
  tasks: "Tasks",
  notes: "Notes",
  status: "Status",
  settings: "Settings",
};

export function MobileShellHeader({
  today,
  activeView,
  labels = FALLBACK_LABELS,
  isOnline = true,
  onLogoClick,
}) {
  const date = new Date(`${today}T00:00:00`);
  const dateText = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  }).format(date);
  const activeLabel = labels[activeView] || FALLBACK_LABELS[activeView] || "Nora";

  return (
    <header className="mob-header">
      <button
        type="button"
        className="mob-brand-btn"
        onClick={onLogoClick}
        aria-label="Go to today's plan"
      >
        <BrandStar size={25} tone="white" />
        <span className="mob-brand-wordmark">NORA</span>
      </button>

      <div className="mob-header-context" aria-label={`${activeLabel}, ${dateText}`}>
        <span className="mob-header-view">{activeLabel}</span>
        <span className="mob-header-date">{dateText}</span>
      </div>

      <div className="mob-header-status" aria-live="polite">
        {!isOnline && <span className="mob-offline-pill">Offline</span>}
      </div>
    </header>
  );
}

export function MobileShellTabBar({
  activeView,
  labels = FALLBACK_LABELS,
  onViewChange,
}) {
  return (
    <nav className="mob-bottom-nav" aria-label="Main navigation">
      {MOBILE_SHELL_TABS.map(({ id, icon: Icon }) => {
        const active = activeView === id;
        const label = labels[id] || FALLBACK_LABELS[id];
        return (
          <button
            key={id}
            type="button"
            className={`mob-nav-btn${active ? " mob-nav-active" : ""}`}
            onClick={() => onViewChange(id)}
            aria-current={active ? "page" : undefined}
            aria-label={label}
          >
            <span className="mob-nav-icon" aria-hidden="true">
              <Icon size={21} strokeWidth={active ? 2.35 : 2} />
            </span>
            <span className="mob-nav-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
