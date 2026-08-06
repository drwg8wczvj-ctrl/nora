import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Info, PanelLeft, Plus, Send, X, Zap } from "lucide-react";
import BrandStar from "../BrandStar";
import { NativeIconButton } from "../ui/NativeUI";
import { buildTaskMentionParts } from "../../lib/taskMentions";
import "./AssistantChatUI.css";

const joinClassNames = (...names) => names.filter(Boolean).join(" ");

export function AssistantChatHeader({
  title,
  subtitle,
  brandIcon,
  onHistory,
  onClose,
  accessory,
  className = "",
}) {
  return (
    <header className={joinClassNames("assistant-chat-header", className)}>
      <div className="assistant-chat-header__leading">
        {onHistory && (
          <NativeIconButton
            className="assistant-chat-header__control"
            label="Open conversations"
            variant="plain"
            onClick={onHistory}
          >
            <PanelLeft size={20} />
          </NativeIconButton>
        )}
        <div className="assistant-chat-identity">
          <span className="assistant-chat-identity__mark">
            {brandIcon || <BrandStar size={17} tone="current" />}
          </span>
          <span className="assistant-chat-identity__copy">
            <strong>{title}</strong>
            {subtitle && <span>{subtitle}</span>}
          </span>
        </div>
      </div>

      <div className="assistant-chat-header__actions">
        {accessory}
        {onClose && (
          <NativeIconButton
            className="assistant-chat-header__control"
            label={`Close ${title}`}
            variant="plain"
            onClick={onClose}
          >
            <X size={20} />
          </NativeIconButton>
        )}
      </div>
    </header>
  );
}

export function AssistantChatComposer({
  value,
  onChange,
  onKeyDown,
  onSend,
  loading = false,
  placeholder,
  inputRef,
  rows = 1,
  maxHeight = 160,
  highlightTerms = [],
  leading,
  ghostSuffix = "",
  className = "",
}) {
  const disabled = loading || !value.trim();
  const localInputRef = useRef(null);
  const textareaRef = inputRef ?? localInputRef;
  const backdropRef = useRef(null);
  const mentionParts = useMemo(
    () => buildTaskMentionParts(value, highlightTerms),
    [highlightTerms, value],
  );
  const hasTaskMentions = mentionParts.some((part) => part.taskTitle);
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
  }, [maxHeight, textareaRef, value]);

  return (
    <footer className={joinClassNames("assistant-composer", className)}>
      {leading && <div className="assistant-composer__tools">{leading}</div>}
      <div className="assistant-composer__field">
        {(ghostSuffix || hasTaskMentions) && (
          <div
            ref={backdropRef}
            className={joinClassNames("assistant-composer__ghost", hasTaskMentions && "has-task-mentions")}
            aria-hidden="true"
          >
            {hasTaskMentions
              ? mentionParts.map((part, index) => part.taskTitle
                ? <mark className="assistant-composer__task-mention" key={`${part.taskTitle}-${index}`}>{part.text}</mark>
                : <React.Fragment key={index}>{part.text}</React.Fragment>)
              : value}
            {ghostSuffix && <span className="assistant-composer__ghost-suffix">{ghostSuffix}</span>}
          </div>
        )}
        <textarea
          ref={textareaRef}
          className={joinClassNames("assistant-composer__input", hasTaskMentions && "has-task-mentions")}
          value={value}
          rows={rows}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onScroll={(event) => {
            if (!backdropRef.current) return;
            backdropRef.current.scrollTop = event.currentTarget.scrollTop;
            backdropRef.current.scrollLeft = event.currentTarget.scrollLeft;
          }}
          placeholder={placeholder}
          aria-label={placeholder}
          style={{ "--assistant-composer-max-height": `${maxHeight}px` }}
        />
      </div>
      <NativeIconButton
        className="assistant-composer__send"
        label={loading ? "Assistant is responding" : "Send message"}
        variant="accent"
        disabled={disabled}
        onClick={onSend}
      >
        {loading
          ? <span className="native-spinner" aria-hidden="true" />
          : <Send size={18} />}
      </NativeIconButton>
    </footer>
  );
}

export function AssistantComposerMenu({
  suggestionsVisible,
  onToggleSuggestions,
  microStartMode,
  onToggleMicroStart,
}) {
  const [open, setOpen] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className="assistant-composer-menu">
      <NativeIconButton
        label={open ? "Close chat tools" : "Open chat tools"}
        variant="plain"
        aria-expanded={open}
        onClick={() => { setOpen((current) => !current); setShowInfo(false); }}
      >
        {open ? <X size={17} /> : <Plus size={18} />}
      </NativeIconButton>
      {open && (
        <div className="assistant-composer-menu__panel" role="menu">
          <button type="button" role="menuitemcheckbox" aria-checked={suggestionsVisible} onClick={onToggleSuggestions}>
            <BrandStar size={16} tone="current" />
            <span>{suggestionsVisible ? "Hide Nora tips" : "Show Nora tips"}</span>
          </button>
          <div className="assistant-composer-menu__row">
            <button type="button" role="menuitemcheckbox" aria-checked={microStartMode} onClick={onToggleMicroStart}>
              <Zap size={16} />
              <span>{microStartMode ? "Micro Start is on" : "Use Micro Start"}</span>
            </button>
            <button
              type="button"
              className="assistant-composer-menu__info"
              aria-label="What is Micro Start?"
              aria-expanded={showInfo}
              onClick={() => setShowInfo((current) => !current)}
            >
              <Info size={15} />
            </button>
          </div>
          {showInfo && (
            <p className="assistant-composer-menu__explanation">
              Micro Start asks Nora to turn a difficult task into one tiny first action you can begin now.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
