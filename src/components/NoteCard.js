import React from "react";
import { Pin, Star, Trash2, CheckSquare, ShoppingCart, Lightbulb, Zap, FileText } from "lucide-react";
import "./NoteCard.css";

const fmtRelTime = (ts) => {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const min  = Math.floor(diff / 60000);
  if (min < 1)  return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24)  return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7)    return `${d}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const TYPE_ICON = {
  checklist: CheckSquare,
  shopping:  ShoppingCart,
  idea:      Lightbulb,
  capture:   Zap,
  note:      null,
};

const TYPE_LABEL = {
  checklist: "Checklist",
  shopping:  "Shopping",
  idea:      "Idea",
  capture:   "Quick note",
};

export default function NoteCard({ note, onClick, onDelete, onPin, onStar, deleting }) {
  const { type = "note", title, content, items = [], color = "default", pinned, starred, updatedAt, createdAt } = note;
  const checkedCount = items.filter(i => i.checked).length;
  const totalCount   = items.length;
  const isListType   = type === "checklist" || type === "shopping";
  const Icon         = TYPE_ICON[type];
  const hasItems     = isListType && totalCount > 0;
  const hasContent   = !isListType && content?.trim();
  const hasTitle     = title?.trim();

  const stopPropAndRun = (fn) => (e) => { e.stopPropagation(); fn?.(); };

  return (
    <div
      className={`nc${deleting ? " nc-deleting" : ""}`}
      data-color={color}
      onClick={onClick}
    >
      {/* Hover actions — desktop only (CSS hides on touch) */}
      <div className="nc-hover-actions">
        <button
          className={`nc-hbtn${pinned ? " nc-hbtn-on" : ""}`}
          onClick={stopPropAndRun(onPin)}
          title={pinned ? "Unpin" : "Pin"}
        >
          <Pin size={11} />
        </button>
        <button
          className={`nc-hbtn nc-hbtn-star${starred ? " nc-hbtn-on" : ""}`}
          onClick={stopPropAndRun(onStar)}
          title={starred ? "Unstar" : "Star"}
        >
          <Star size={11} />
        </button>
        <button
          className="nc-hbtn nc-hbtn-del"
          onClick={stopPropAndRun(onDelete)}
          title="Delete"
        >
          <Trash2 size={11} />
        </button>
      </div>

      {/* Top row: type label + badges */}
      {(type !== "note" || pinned || starred) && (
        <div className="nc-meta-row">
          {type !== "note" && (
            <div className="nc-type-tag">
              {Icon && <Icon size={10} />}
              {TYPE_LABEL[type]}
            </div>
          )}
          <div className="nc-badges">
            {pinned  && <span className="nc-badge nc-badge-pin"><Pin  size={9} /></span>}
            {starred && <span className="nc-badge nc-badge-star"><Star size={9} /></span>}
          </div>
        </div>
      )}

      {/* Title */}
      {hasTitle ? (
        <div className="nc-title">{title}</div>
      ) : !hasContent && !hasItems ? (
        <div className="nc-title nc-empty-title">
          <FileText size={14} />
          Empty note
        </div>
      ) : null}

      {/* Items preview for checklist / shopping */}
      {hasItems && (
        <div className="nc-items-preview">
          {items.slice(0, 6).map((item, i) => (
            <div key={item.id ?? i} className={`nc-item-row${item.checked ? " nc-item-done" : ""}`}>
              <div className="nc-item-chk" />
              <span className="nc-item-txt">{item.text}</span>
            </div>
          ))}
          {totalCount > 6 && (
            <div className="nc-items-overflow">+{totalCount - 6} more</div>
          )}
          {totalCount > 0 && (
            <div className="nc-items-progress-wrap">
              <div
                className="nc-items-progress-fill"
                style={{ width: `${(checkedCount / totalCount) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* Text content preview */}
      {hasContent && (
        <div className="nc-content-preview">
          {content.split("\n").slice(0, 5).map((line, i) => (
            <div key={i} className="nc-preview-line">{line || " "}</div>
          ))}
          {content.split("\n").length > 5 && (
            <div className="nc-preview-fade">…</div>
          )}
        </div>
      )}

      {/* Timestamp */}
      <div className="nc-footer">
        <span className="nc-ts">{fmtRelTime(updatedAt ?? createdAt)}</span>
      </div>
    </div>
  );
}