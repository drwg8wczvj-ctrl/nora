import React, { useState } from "react";
import {
  CheckCircle2, Circle, ChevronDown, AlertTriangle, XCircle,
  TrendingUp, CalendarDays, FileText, FileSpreadsheet, FileImage,
  Plus, ArrowRight, Trash2, CheckCheck, Download,
  Brain, ClipboardList, Zap, BookOpen, Flame, Target, FlaskConical, Heart, NotebookPen, Lightbulb,
} from "lucide-react";
import { PART_TYPES, parseRichBlocks } from "./messageParts";
import "./MessagePart.css";

// Dumb text formatter — bold/italic/inline-code/line-breaks only. A full
// markdown library is more than a chat bubble needs; this covers everything
// the models in this app actually produce today without a new dependency.
function formatInlineMarkdown(text = "") {
  const escaped = text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const withInline = escaped
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(?<!\*)\*(?!\*)(.+?)\*(?!\*)/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>");
  return withInline.split("\n").map((line) => line || "&nbsp;").join("<br/>");
}

const BLOCK_ICONS = {
  insight: Lightbulb, psychology: Brain, plan: ClipboardList, next_step: Zap,
  planner: CalendarDays, explanation: BookOpen, challenge: Flame, goal: Target,
  keep_in_mind: AlertTriangle, completed: CheckCircle2, research: FlaskConical,
  wellbeing: Heart, progress: TrendingUp, reflection: NotebookPen,
};

// Renders one classified chunk from parseRichBlocks — a callout, a list, or
// a plain paragraph. Recursive: a callout's `body` is itself one of these.
function RichBlock({ block }) {
  if (!block) return null;
  if (block.type === "bullet_list") {
    return (
      <ul className="mp-rich-list mp-rich-bullets">
        {block.items.map((item, i) => <li key={i} dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(item) }} />)}
      </ul>
    );
  }
  if (block.type === "numbered_list") {
    return (
      <ol className="mp-rich-list mp-rich-numbered">
        {block.items.map((item, i) => <li key={i} dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(item) }} />)}
      </ol>
    );
  }
  if (block.type === "callout") {
    const Icon = BLOCK_ICONS[block.blockKey] ?? Lightbulb;
    return (
      <div className={`mp-callout mp-callout-${block.blockKey}`}>
        <div className="mp-callout-head"><Icon size={13} /><span>{block.label}</span></div>
        <RichBlock block={block.body} />
      </div>
    );
  }
  return <p className="mp-text" dangerouslySetInnerHTML={{ __html: formatInlineMarkdown(block.text) }} />;
}

function TextPart({ text, streaming }) {
  const blocks = parseRichBlocks(text);
  return (
    <div className="mp-rich-text">
      {blocks.map((block, i) => <RichBlock key={i} block={block} />)}
      {streaming && <span className="mp-stream-cursor" />}
    </div>
  );
}

const ACTION_META = {
  create:   { icon: Plus,        label: "Created" },
  move:     { icon: ArrowRight,  label: "Moved" },
  complete: { icon: CheckCheck,  label: "Completed" },
  delete:   { icon: Trash2,      label: "Deleted" },
  update:   { icon: CheckCircle2,label: "Updated" },
};

function ConfirmationCardPart({ action, summary, task }) {
  const meta = ACTION_META[action] ?? ACTION_META.update;
  const Icon = meta.icon;
  return (
    <div className="mp-card mp-confirmation">
      <div className="mp-confirmation-icon"><Icon size={15} /></div>
      <div className="mp-confirmation-body">
        <span className="mp-confirmation-label">{meta.label}</span>
        <span className="mp-confirmation-summary">{summary}</span>
        {task?.date && (
          <span className="mp-confirmation-meta">
            {task.date}{task.startHour != null ? ` · ${String(task.startHour).padStart(2, "0")}:${String(task.startMinute ?? 0).padStart(2, "0")}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}

function TaskCardPart({ task }) {
  return (
    <div className="mp-card mp-task-card">
      <span className={`mp-task-dot${task.completed ? " done" : ""}`} />
      <div className="mp-task-body">
        <span className="mp-task-title">{task.title}</span>
        {task.date && (
          <span className="mp-task-meta">
            {task.date}{task.startHour != null ? ` · ${String(task.startHour).padStart(2, "0")}:${String(task.startMinute ?? 0).padStart(2, "0")}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}

function CalendarPreviewPart({ tasks = [], label }) {
  return (
    <div className="mp-card mp-calendar-preview">
      <div className="mp-calendar-head"><CalendarDays size={14} /><span>{label ?? "Preview"}</span></div>
      <div className="mp-calendar-list">
        {tasks.map((t, i) => (
          <div key={t.id ?? i} className="mp-calendar-row">
            <span className="mp-calendar-time">{t.startHour != null ? `${String(t.startHour).padStart(2, "0")}:${String(t.startMinute ?? 0).padStart(2, "0")}` : "—"}</span>
            <span className="mp-calendar-title">{t.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChecklistPart({ items = [] }) {
  return (
    <div className="mp-card mp-checklist">
      {items.map((item, i) => (
        <div key={i} className="mp-checklist-row">
          {item.done ? <CheckCircle2 size={15} className="mp-check-on" /> : <Circle size={15} className="mp-check-off" />}
          <span className={item.done ? "mp-checklist-done" : ""}>{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function TablePart({ headers = [], rows = [] }) {
  return (
    <div className="mp-card mp-table-wrap">
      <table className="mp-table">
        <thead><tr>{headers.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const FORMAT_META = {
  docx: { icon: FileText,       label: "Word Document" },
  txt:  { icon: FileText,       label: "Text File" },
  md:   { icon: FileText,       label: "Markdown" },
  xlsx: { icon: FileSpreadsheet,label: "Spreadsheet" },
  csv:  { icon: FileSpreadsheet,label: "CSV" },
  pdf:  { icon: FileImage,      label: "PDF" },
  pptx: { icon: FileImage,      label: "Presentation" },
};

function FileAttachmentPart({ filename, format, url, sizeLabel }) {
  const meta = FORMAT_META[format] ?? FORMAT_META.txt;
  const Icon = meta.icon;
  return (
    <a className="mp-card mp-file" href={url} download={filename} target="_blank" rel="noreferrer">
      <div className="mp-file-icon"><Icon size={18} /></div>
      <div className="mp-file-body">
        <span className="mp-file-name">{filename}</span>
        <span className="mp-file-meta">{meta.label}{sizeLabel ? ` · ${sizeLabel}` : ""}</span>
      </div>
      <Download size={15} className="mp-file-download" />
    </a>
  );
}

function ExpandableSectionPart({ label, parts = [] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mp-card mp-expandable" data-open={open}>
      <button type="button" className="mp-expandable-head" onClick={() => setOpen((o) => !o)}>
        <span>{label}</span>
        <ChevronDown size={14} className="mp-expandable-chevron" />
      </button>
      {open && (
        <div className="mp-expandable-body">
          {parts.map((p, i) => <MessagePart key={i} part={p} />)}
        </div>
      )}
    </div>
  );
}

function BannerPart({ tone, text }) {
  const Icon = tone === "warning" ? AlertTriangle : tone === "error" ? XCircle : CheckCircle2;
  return (
    <div className={`mp-banner mp-banner-${tone}`}>
      <Icon size={15} />
      <span>{text}</span>
    </div>
  );
}

function ProgressUpdatePart({ stats = [] }) {
  return (
    <div className="mp-card mp-progress">
      <TrendingUp size={14} className="mp-progress-icon" />
      <div className="mp-progress-stats">
        {stats.map((s, i) => (
          <span key={i} className="mp-progress-stat"><strong>{s.value}</strong> {s.label}</span>
        ))}
      </div>
    </div>
  );
}

// Dispatch by `part.type` — this is the entire "modular renderer" contract.
// A future part type is one new case here plus one factory in
// messageParts.js; nothing about the conversation engine or persistence
// layer needs to change.
export default function MessagePart({ part }) {
  if (!part) return null;
  switch (part.type) {
    case PART_TYPES.TEXT: return <TextPart text={part.text} streaming={part.streaming} />;
    case PART_TYPES.TASK_CARD: return <TaskCardPart task={part.task} />;
    case PART_TYPES.CALENDAR_PREVIEW: return <CalendarPreviewPart tasks={part.tasks} label={part.label} />;
    case PART_TYPES.CONFIRMATION_CARD: return <ConfirmationCardPart {...part} />;
    case PART_TYPES.CHECKLIST: return <ChecklistPart items={part.items} />;
    case PART_TYPES.TABLE: return <TablePart headers={part.headers} rows={part.rows} />;
    case PART_TYPES.FILE_ATTACHMENT: return <FileAttachmentPart {...part} />;
    case PART_TYPES.EXPANDABLE_SECTION: return <ExpandableSectionPart label={part.label} parts={part.parts} />;
    case PART_TYPES.WARNING: return <BannerPart tone="warning" text={part.text} />;
    case PART_TYPES.SUCCESS: return <BannerPart tone="success" text={part.text} />;
    case PART_TYPES.ERROR: return <BannerPart tone="error" text={part.text} />;
    case PART_TYPES.PROGRESS_UPDATE: return <ProgressUpdatePart stats={part.stats} />;
    default: return null;
  }
}

// Renders a whole parts array in order, each part on its own line/block.
export function MessagePartsList({ parts = [] }) {
  return (
    <div className="mp-list">
      {parts.map((p, i) => <MessagePart key={i} part={p} />)}
    </div>
  );
}
