import React, { useEffect, useId, useRef } from "react";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import BrandStar from "../BrandStar";
import "./NativeUI.css";

const joinClassNames = (...names) => names.filter(Boolean).join(" ");

let activeOverlayCount = 0;
let savedBodyOverflow = "";

function useNativeOverlay(open, onClose) {
  const layerRef = useRef(null);
  const panelRef = useRef(null);
  const restoreFocusRef = useRef(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;

    restoreFocusRef.current = document.activeElement;
    if (activeOverlayCount === 0) {
      savedBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    activeOverlayCount += 1;

    const focusTimer = window.setTimeout(() => {
      const preferred = panelRef.current?.querySelector(
        "[data-native-autofocus], [autofocus], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])",
      );
      preferred?.focus();
    }, 0);

    const handleKeyDown = (event) => {
      const layers = document.querySelectorAll("[data-native-overlay='true']");
      if (layers[layers.length - 1] !== layerRef.current) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current?.();
        return;
      }

      if (event.key !== "Tab") return;
      const focusable = Array.from(panelRef.current?.querySelectorAll(
        "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ) ?? []).filter((element) => !element.hasAttribute("hidden"));
      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", handleKeyDown);
      activeOverlayCount = Math.max(0, activeOverlayCount - 1);
      if (activeOverlayCount === 0) document.body.style.overflow = savedBodyOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

  return { layerRef, panelRef };
}

export function NativeButton({
  variant = "primary",
  size = "regular",
  leading,
  trailing,
  loading = false,
  className = "",
  children,
  disabled,
  type = "button",
  ...props
}) {
  return (
    <button
      type={type}
      className={joinClassNames(
        "native-button",
        `native-button--${variant}`,
        `native-button--${size}`,
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <span className="native-spinner" aria-hidden="true" /> : leading}
      <span className="native-button__label">{children}</span>
      {!loading && trailing}
    </button>
  );
}

export function NativeIconButton({
  label,
  children,
  variant = "plain",
  size = "regular",
  className = "",
  type = "button",
  ...props
}) {
  return (
    <button
      type={type}
      className={joinClassNames(
        "native-icon-button",
        `native-icon-button--${variant}`,
        `native-icon-button--${size}`,
        className,
      )}
      aria-label={label}
      title={props.title || label}
      {...props}
    >
      {children}
    </button>
  );
}

export function NativeNavButton({
  direction = "back",
  label = direction === "back" ? "Back" : "Close",
  children,
  ...props
}) {
  const icon = direction === "close"
    ? <X size={18} />
    : <ChevronLeft size={21} />;

  return (
    <NativeIconButton
      {...props}
      label={label}
      variant="tertiary"
      className={joinClassNames("native-nav-button", props.className)}
    >
      {children || icon}
    </NativeIconButton>
  );
}

export function NativeSegmentedControl({
  options,
  value,
  onChange,
  label = "View",
  className = "",
}) {
  return (
    <div
      className={joinClassNames("native-segmented", className)}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((option) => {
        const normalized = typeof option === "string"
          ? { value: option, label: option }
          : option;
        const selected = normalized.value === value;
        return (
          <button
            key={normalized.value}
            type="button"
            className={joinClassNames("native-segmented__item", selected && "is-selected")}
            role="radio"
            aria-checked={selected}
            onClick={() => onChange?.(normalized.value)}
          >
            {normalized.icon}
            <span>{normalized.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function NativeSwitch({
  checked = false,
  onChange,
  disabled = false,
  label,
  className = "",
  ...props
}) {
  return (
    <button
      type="button"
      className={joinClassNames(
        "native-switch",
        checked && "is-on",
        className,
      )}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      {...props}
    >
      <span className="native-switch__knob" aria-hidden="true" />
    </button>
  );
}

export function NativeListRow({
  leading,
  title,
  subtitle,
  meta,
  trailing,
  onClick,
  selected = false,
  destructive = false,
  className = "",
  children,
  ...props
}) {
  const Component = onClick ? "button" : "div";
  return (
    <Component
      type={onClick ? "button" : undefined}
      className={joinClassNames(
        "native-list-row",
        onClick && "native-list-row--interactive",
        selected && "is-selected",
        destructive && "is-destructive",
        className,
      )}
      onClick={onClick}
      {...props}
    >
      {leading && <span className="native-list-row__leading">{leading}</span>}
      <span className="native-list-row__content">
        <span className="native-list-row__title">{title}</span>
        {subtitle && <span className="native-list-row__subtitle">{subtitle}</span>}
        {children}
      </span>
      {meta && <span className="native-list-row__meta">{meta}</span>}
      {trailing || (onClick && <ChevronRight className="native-list-row__chevron" size={17} />)}
    </Component>
  );
}

export function NativeSection({
  title,
  description,
  action,
  footer,
  children,
  grouped = true,
  className = "",
}) {
  return (
    <section className={joinClassNames("native-section", className)}>
      {(title || description || action) && (
        <header className="native-section__header">
          <div>
            {title && <h2>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={joinClassNames("native-section__body", grouped && "is-grouped")}>
        {children}
      </div>
      {footer && <p className="native-section__footer">{footer}</p>}
    </section>
  );
}

export function NativeSheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  className = "",
}) {
  const titleId = useId();
  const { layerRef, panelRef } = useNativeOverlay(open, onClose);
  if (!open) return null;

  return (
    <div ref={layerRef} className="native-sheet-layer native-ui" data-native-overlay="true">
      <button
        type="button"
        className="native-sheet-backdrop"
        onClick={onClose}
        aria-label="Close sheet"
      />
      <section
        ref={panelRef}
        className={joinClassNames("native-sheet", className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={!title ? "Options" : undefined}
        tabIndex={-1}
      >
        <div className="native-sheet__grabber" aria-hidden="true" />
        <header className="native-sheet__header">
          <div>
            {title && <h2 id={titleId}>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {onClose && <NativeNavButton direction="close" onClick={onClose} />}
        </header>
        <div className="native-sheet__content">{children}</div>
        {footer && <footer className="native-sheet__footer">{footer}</footer>}
      </section>
    </div>
  );
}

export function NativeDialog({
  open = true,
  onClose,
  title,
  subtitle,
  header,
  children,
  footer,
  className = "",
  contentClassName = "",
  label,
}) {
  const titleId = useId();
  const { layerRef, panelRef } = useNativeOverlay(open, onClose);
  if (!open) return null;

  return (
    <div
      ref={layerRef}
      className="native-dialog-layer native-ui"
      data-native-overlay="true"
    >
      <button
        type="button"
        className="native-dialog-backdrop"
        onClick={onClose}
        aria-label="Close dialog"
      />
      <section
        ref={panelRef}
        className={joinClassNames("native-dialog", className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={!title ? (label || "Dialog") : undefined}
        tabIndex={-1}
      >
        {(title || subtitle || header || onClose) && (
          <header className="native-dialog__header">
            <div className="native-dialog__heading">
              {header || (
                <>
                  {title && <h2 id={titleId}>{title}</h2>}
                  {subtitle && <p>{subtitle}</p>}
                </>
              )}
            </div>
            {onClose && <NativeNavButton direction="close" onClick={onClose} />}
          </header>
        )}
        <div className={joinClassNames("native-dialog__content", contentClassName)}>
          {children}
        </div>
        {footer && <footer className="native-dialog__footer">{footer}</footer>}
      </section>
    </div>
  );
}

export function NativeAlert({
  tone = "neutral",
  title,
  children,
  actions,
  className = "",
}) {
  return (
    <div
      className={joinClassNames("native-alert", `native-alert--${tone}`, className)}
      role={tone === "danger" ? "alert" : "status"}
    >
      {title && <strong>{title}</strong>}
      {children && <div className="native-alert__body">{children}</div>}
      {actions && <div className="native-alert__actions">{actions}</div>}
    </div>
  );
}

export function NativeEmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}) {
  return (
    <div className={joinClassNames("native-empty-state", className)}>
      <div className="native-empty-state__icon">
        {icon || <BrandStar size={28} tone="current" />}
      </div>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action && <div className="native-empty-state__action">{action}</div>}
    </div>
  );
}

export function NativeField({
  label,
  hint,
  error,
  leading,
  trailing,
  className = "",
  id,
  ...inputProps
}) {
  const generatedId = useId();
  const fieldId = id || generatedId;
  const messageId = `${fieldId}-message`;

  return (
    <div className={joinClassNames("native-field", error && "has-error", className)}>
      {label && <label className="native-field__label" htmlFor={fieldId}>{label}</label>}
      <span className="native-field__control">
        {leading && <span className="native-field__leading">{leading}</span>}
        <input
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={(error || hint) ? messageId : undefined}
          {...inputProps}
        />
        {trailing && <span className="native-field__trailing">{trailing}</span>}
      </span>
      {(error || hint) && (
        <span id={messageId} className="native-field__message">
          {error || hint}
        </span>
      )}
    </div>
  );
}

export function NativeToolbar({ children, className = "", label = "Actions" }) {
  return (
    <div className={joinClassNames("native-toolbar", className)} role="toolbar" aria-label={label}>
      {children}
    </div>
  );
}

export function NativeSelectionMark({ selected, label = "Selected" }) {
  return (
    <span className={joinClassNames("native-selection-mark", selected && "is-selected")}>
      {selected && <Check size={14} aria-label={label} />}
    </span>
  );
}
