import React, { useMemo, useState } from "react";
import { Search, Plus, Pin, Archive, Trash2, Pencil, Check, X } from "lucide-react";
import "./ConversationList.css";

function timeLabel(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const days = Math.round((now - d) / 86400000);
  if (days < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function ConversationRow({ conv, active, onSelect, onRename, onPin, onArchive, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conv.title);

  const commit = () => {
    const t = draft.trim();
    setEditing(false);
    if (t && t !== conv.title) onRename(conv.id, t);
    else setDraft(conv.title);
  };

  if (editing) {
    return (
      <div className="conv-row conv-row-editing">
        <input
          autoFocus
          className="conv-row-edit-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(conv.title); setEditing(false); } }}
          onBlur={commit}
        />
        <button className="conv-row-icon-btn" onMouseDown={(e) => e.preventDefault()} onClick={commit}><Check size={14} /></button>
      </div>
    );
  }

  return (
    <div className={`conv-row${active ? " active" : ""}`} onClick={() => onSelect(conv.id)}>
      <div className="conv-row-main">
        <div className="conv-row-title-line">
          {conv.pinned && <Pin size={11} className="conv-row-pin-dot" />}
          <span className="conv-row-title">{conv.title || "New Chat"}</span>
        </div>
        <span className="conv-row-time">{timeLabel(conv.last_message_at)}</span>
      </div>
      <div className="conv-row-actions">
        <button className="conv-row-icon-btn" title="Rename" onClick={(e) => { e.stopPropagation(); setEditing(true); }}><Pencil size={13} /></button>
        <button className="conv-row-icon-btn" title={conv.pinned ? "Unpin" : "Pin"} onClick={(e) => { e.stopPropagation(); onPin(conv.id, !conv.pinned); }}><Pin size={13} /></button>
        <button className="conv-row-icon-btn" title="Archive" onClick={(e) => { e.stopPropagation(); onArchive(conv.id); }}><Archive size={13} /></button>
        <button className="conv-row-icon-btn conv-row-danger" title="Delete" onClick={(e) => { e.stopPropagation(); if (window.confirm("Delete this conversation? This can't be undone.")) onDelete(conv.id); }}><Trash2 size={13} /></button>
      </div>
    </div>
  );
}

// Layout-agnostic conversation list: search, new-chat button, grouped rows.
// Mounted inside either ConversationSidebar (desktop) or ConversationSheet
// (mobile) — both just supply the outer chrome/positioning.
export function ConversationList({ conversations, activeId, loading, onSelect, onNew, onRename, onPin, onArchive, onDelete }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => (c.title || "").toLowerCase().includes(q));
  }, [conversations, query]);

  return (
    <div className="conv-list-root">
      <div className="conv-list-toolbar">
        <div className="conv-search">
          <Search size={14} className="conv-search-icon" />
          <input
            className="conv-search-input"
            placeholder="Search conversations"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button className="conv-new-btn" onClick={onNew}><Plus size={15} /><span>New chat</span></button>
      </div>
      <div className="conv-list-scroll">
        {loading ? (
          <div className="conv-list-empty">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="conv-list-empty">{query ? "No matches" : "No conversations yet"}</div>
        ) : (
          filtered.map((c) => (
            <ConversationRow
              key={c.id}
              conv={c}
              active={c.id === activeId}
              onSelect={onSelect}
              onRename={onRename}
              onPin={onPin}
              onArchive={onArchive}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}

// Desktop: a fixed-width panel that slides in alongside the chat panel.
export default function ConversationSidebar({ open, onClose, ...listProps }) {
  return (
    <div className={`conv-sidebar${open ? " open" : ""}`}>
      <div className="conv-sidebar-header">
        <span>Conversations</span>
        <button className="conv-row-icon-btn" onClick={onClose}><X size={15} /></button>
      </div>
      <ConversationList {...listProps} />
    </div>
  );
}

// Mobile: a full-screen sheet, same list core.
export function ConversationSheet({ open, onClose, ...listProps }) {
  if (!open) return null;
  return (
    <div className="conv-sheet">
      <div className="conv-sheet-header">
        <span>Conversations</span>
        <button className="conv-row-icon-btn" onClick={onClose}><X size={17} /></button>
      </div>
      <ConversationList {...listProps} />
    </div>
  );
}
