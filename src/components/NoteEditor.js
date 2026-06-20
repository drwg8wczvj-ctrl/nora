import React, { useState, useEffect, useRef } from "react";
import {
  X, Trash2, Pin, Star, Check, Plus,
  FileText, CheckSquare, ShoppingCart, Lightbulb, Zap,
} from "lucide-react";
import "./NoteEditor.css";

// ─── Shared constants ─────────────────────────────────────────────────────────

export const NOTE_COLORS = [
  { key: "default", label: "Default" },
  { key: "cream",   label: "Cream"   },
  { key: "rose",    label: "Rose"    },
  { key: "blue",    label: "Blue"    },
  { key: "mint",    label: "Mint"    },
  { key: "purple",  label: "Purple"  },
];

export const NOTE_TYPE_DEFS = [
  { key: "note",      label: "New Note",      icon: FileText,     desc: "Plain text"     },
  { key: "checklist", label: "Checklist",     icon: CheckSquare,  desc: "To-do items"    },
  { key: "shopping",  label: "Shopping List", icon: ShoppingCart, desc: "With checkboxes" },
  { key: "idea",      label: "Idea",          icon: Lightbulb,    desc: "Capture an idea" },
  { key: "capture",   label: "Quick Capture", icon: Zap,          desc: "Fast note"      },
];

const TYPE_OPTIONS_EDITOR = [
  { key: "note",      icon: FileText,    label: "Note"       },
  { key: "checklist", icon: CheckSquare, label: "Checklist"  },
  { key: "shopping",  icon: ShoppingCart,label: "Shopping"   },
];

// Color migration map (old → new palette)
const COLOR_MIGRATE = { yellow: "cream", pink: "rose", green: "mint" };

export function migrateNote(n) {
  return {
    type:      "note",
    items:     [],
    pinned:    false,
    starred:   false,
    updatedAt: n.createdAt ?? Date.now(),
    ...n,
    color: COLOR_MIGRATE[n.color] ?? (n.color || "default"),
  };
}

// ─── AI pattern detection ─────────────────────────────────────────────────────

const SHOPPING_WORDS = [
  "milk","bread","eggs","rice","coffee","pasta","meat","chicken","vegetables",
  "fruit","butter","cheese","sugar","flour","soap","shampoo","detergent",
  "juice","water","beer","wine","yogurt","tomato","potato","onion","garlic",
];

function detectListSuggestion(content, type) {
  if (type === "checklist" || type === "shopping") return null;
  if (!content?.trim()) return null;
  const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length < 3) return null;
  const avgLen = lines.reduce((s, l) => s + l.length, 0) / lines.length;
  if (avgLen > 65) return null;
  const hasShoppingHint = lines.some(l =>
    SHOPPING_WORDS.some(w => l.toLowerCase().includes(w))
  );
  return hasShoppingHint ? "shopping" : "checklist";
}

// ─── NoteEditor ───────────────────────────────────────────────────────────────

export default function NoteEditor({ note, onPatch, onDelete, onClose, isMobile }) {
  const [title,    setTitle]    = useState(note.title   ?? "");
  const [content,  setContent]  = useState(note.content ?? "");
  const [items,    setItems]    = useState(note.items   ?? []);
  const [kbOffset, setKbOffset] = useState(0);
  const [aiSugg,   setAiSugg]   = useState(null);
  const [dismissed,setDismissed]= useState(false);

  const titleRef   = useRef(null);
  const contentRef = useRef(null);

  const isListType  = note.type === "checklist" || note.type === "shopping";

  // Sync parent immediately (localStorage is fast — no debounce needed)
  const handleTitle = (v) => { setTitle(v);   onPatch({ title: v }); };
  const handleContent = (v) => { setContent(v); onPatch({ content: v }); };

  // Sync items to parent whenever items change
  useEffect(() => { onPatch({ items }); }, [items]); // eslint-disable-line

  // AI suggestion
  useEffect(() => {
    if (dismissed) return;
    const s = detectListSuggestion(content, note.type);
    setAiSugg(s);
  }, [content, note.type, dismissed]);

  // Mobile keyboard awareness via visualViewport
  useEffect(() => {
    if (!isMobile) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      setKbOffset(Math.max(0, window.innerHeight - vv.height - Math.max(0, vv.offsetTop)));
    };
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [isMobile]);

  // Auto-focus
  useEffect(() => {
    const delay = isMobile ? 60 : 10;
    const t = setTimeout(() => {
      if (!title && titleRef.current) titleRef.current.focus();
      else if (contentRef.current) contentRef.current.focus();
    }, delay);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line

  // ── Item helpers ──────────────────────────────────────────────────────────
  const rndId = () => Math.random().toString(36).slice(2);

  const addItem = (afterIndex) => {
    const idx = afterIndex ?? items.length - 1;
    const newItem = { id: rndId(), text: "", checked: false };
    setItems(prev => {
      const next = [...prev];
      next.splice(idx + 1, 0, newItem);
      return next;
    });
    setTimeout(() => {
      const inputs = document.querySelectorAll(".ne-item-input");
      inputs[idx + 1]?.focus();
    }, 30);
  };

  const removeItem = (index) => {
    setItems(prev => prev.filter((_, i) => i !== index));
    setTimeout(() => {
      const inputs = document.querySelectorAll(".ne-item-input");
      inputs[Math.max(0, index - 1)]?.focus();
    }, 20);
  };

  const patchItem = (index, fields) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, ...fields } : item));
  };

  const handleItemKeyDown = (e, index) => {
    if (e.key === "Enter") { e.preventDefault(); addItem(index); }
    else if (e.key === "Backspace" && items[index]?.text === "" && items.length > 1) {
      e.preventDefault(); removeItem(index);
    }
  };

  // ── Type switching ────────────────────────────────────────────────────────
  const switchType = (newType) => {
    if (newType === note.type) return;
    const toList    = newType === "checklist" || newType === "shopping";
    const fromList  = note.type === "checklist" || note.type === "shopping";

    if (toList && !fromList) {
      const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
      if (lines.length > 0) {
        const newItems = lines.map(text => ({ id: rndId(), text, checked: false }));
        setItems(newItems);
        setContent("");
        onPatch({ type: newType, items: newItems, content: "" });
      } else {
        onPatch({ type: newType });
      }
    } else if (!toList && fromList) {
      const newContent = items.map(i => i.text).filter(Boolean).join("\n");
      setContent(newContent);
      setItems([]);
      onPatch({ type: newType, content: newContent, items: [] });
    } else {
      onPatch({ type: newType });
    }
  };

  const convertToList = (type) => {
    const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
    const newItems = lines.map(text => ({ id: rndId(), text, checked: false }));
    setItems(newItems);
    setContent("");
    onPatch({ type, items: newItems, content: "" });
    setAiSugg(null);
    setDismissed(true);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  const sheetStyle = isMobile && kbOffset > 0 ? { bottom: kbOffset } : undefined;

  return (
    <div
      className="ne-overlay"
      onClick={onClose}
    >
      <div
        className={`ne-panel${isMobile ? " ne-panel-sheet" : " ne-panel-modal"}`}
        data-color={note.color ?? "default"}
        style={sheetStyle}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle — mobile only */}
        {isMobile && <div className="ne-handle" />}

        {/* Header */}
        <div className="ne-header">
          <input
            ref={titleRef}
            className="ne-title-input"
            value={title}
            onChange={e => handleTitle(e.target.value)}
            placeholder={
              note.type === "idea"    ? "Your idea…" :
              note.type === "capture" ? "Quick thought…" :
              "Title"
            }
          />
          <div className="ne-header-actions">
            <button
              className={`ne-icon-btn ne-pin-btn${note.pinned ? " ne-icon-on" : ""}`}
              onClick={() => onPatch({ pinned: !note.pinned })}
              title={note.pinned ? "Unpin" : "Pin"}
            >
              <Pin size={15} />
            </button>
            <button
              className={`ne-icon-btn ne-star-btn${note.starred ? " ne-icon-on" : ""}`}
              onClick={() => onPatch({ starred: !note.starred })}
              title={note.starred ? "Unstar" : "Star"}
            >
              <Star size={15} />
            </button>
            <button
              className="ne-icon-btn ne-del-btn"
              onClick={onDelete}
              title="Delete note"
            >
              <Trash2 size={15} />
            </button>
            <button className="ne-icon-btn ne-close-btn" onClick={onClose} title="Close">
              <X size={15} />
            </button>
          </div>
        </div>

        {/* AI suggestion banner */}
        {aiSugg && !dismissed && (
          <div className="ne-ai-banner">
            <span className="ne-ai-label">
              Nora: Looks like a {aiSugg === "shopping" ? "shopping list" : "checklist"} →
            </span>
            <button className="ne-ai-convert" onClick={() => convertToList(aiSugg)}>
              Convert
            </button>
            <button className="ne-ai-dismiss" onClick={() => setDismissed(true)}>
              <X size={11} />
            </button>
          </div>
        )}

        {/* Body */}
        <div className="ne-body">
          {isListType ? (
            <div className="ne-items-list">
              {items.map((item, i) => (
                <div key={item.id} className="ne-item">
                  <button
                    className={`ne-item-chk${item.checked ? " ne-item-chk-done" : ""}`}
                    onClick={() => patchItem(i, { checked: !item.checked })}
                  >
                    {item.checked && <Check size={10} />}
                  </button>
                  <input
                    className={`ne-item-input${item.checked ? " ne-item-input-done" : ""}`}
                    value={item.text}
                    onChange={e => patchItem(i, { text: e.target.value })}
                    onKeyDown={e => handleItemKeyDown(e, i)}
                    placeholder="Add item…"
                  />
                  <button
                    className="ne-item-remove"
                    onClick={() => removeItem(i)}
                    tabIndex={-1}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
              <button className="ne-add-item-btn" onClick={() => addItem()}>
                <Plus size={13} />
                Add item
              </button>
            </div>
          ) : (
            <textarea
              ref={contentRef}
              className="ne-content"
              value={content}
              onChange={e => handleContent(e.target.value)}
              placeholder={
                note.type === "idea"    ? "Write your idea…"       :
                note.type === "capture" ? "Capture your thought…"  :
                "Write your note…"
              }
            />
          )}
        </div>

        {/* Footer toolbar */}
        <div className="ne-footer">
          {/* Color pills */}
          <div className="ne-color-row">
            {NOTE_COLORS.map(c => (
              <button
                key={c.key}
                className={`ne-color-swatch${(note.color ?? "default") === c.key ? " active" : ""}`}
                data-color={c.key}
                onClick={() => onPatch({ color: c.key })}
                title={c.label}
              />
            ))}
          </div>

          {/* Type switcher */}
          <div className="ne-type-row">
            {TYPE_OPTIONS_EDITOR.map(t => {
              const Icon = t.icon;
              return (
                <button
                  key={t.key}
                  className={`ne-type-btn${note.type === t.key ? " active" : ""}`}
                  onClick={() => switchType(t.key)}
                  title={t.label}
                >
                  <Icon size={13} />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}