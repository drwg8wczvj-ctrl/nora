// ── Message parts — the rich-content type system shared by every AI persona ──
// A message is never a plain string; it's an ordered array of typed "parts".
// `text` is one part type among several, not a special case — this is what
// lets a single assistant turn carry prose *and* a confirmation card *and* a
// file attachment together, in the order they were produced.
//
// Adding a future part type means: one entry in PART_TYPES, one factory here,
// one case in MessagePart.js's switch. Nothing else in the conversation
// engine (persistence, loading, the tool-calling loop) needs to know the
// type union exists — it only ever moves `parts` arrays around opaquely.

export const PART_TYPES = {
  TEXT: "text",
  TASK_CARD: "task_card",
  CALENDAR_PREVIEW: "calendar_preview",
  CONFIRMATION_CARD: "confirmation_card",
  CHECKLIST: "checklist",
  TABLE: "table",
  FILE_ATTACHMENT: "file_attachment",
  EXPANDABLE_SECTION: "expandable_section",
  WARNING: "warning",
  SUCCESS: "success",
  ERROR: "error",
  PROGRESS_UPDATE: "progress_update",
};

// `text` covers the brief's "text"/"markdown"/"streaming response" as one
// type — all three are the same rendered output (markdown-formatted prose),
// just at different moments in time. `streaming: true` marks a part whose
// text is still arriving; the renderer treats that as a state, not a type.
export const textPart = (text, { streaming = false } = {}) => ({ type: PART_TYPES.TEXT, text, streaming });

export const taskCardPart = (task) => ({ type: PART_TYPES.TASK_CARD, task });

export const calendarPreviewPart = (tasks, label) => ({ type: PART_TYPES.CALENDAR_PREVIEW, tasks, label: label ?? null });

// `action` drives both the icon and the phrasing in the renderer.
export const confirmationCardPart = ({ action, summary, task = null, before = null, after = null }) => ({
  type: PART_TYPES.CONFIRMATION_CARD, action, summary, task, before, after,
});

export const checklistPart = (items) => ({ type: PART_TYPES.CHECKLIST, items });

export const tablePart = (headers, rows) => ({ type: PART_TYPES.TABLE, headers, rows });

// `format` is one of 'docx'|'xlsx'|'pdf'|'pptx'|'csv'|'md'|'txt' — covers the
// brief's "document attachment"/"spreadsheet attachment" as one part type,
// since they render identically (a download chip with a format-specific
// icon); only the icon/label changes per format, not the component.
export const fileAttachmentPart = ({ filename, format, url, sizeLabel = null }) => ({
  type: PART_TYPES.FILE_ATTACHMENT, filename, format, url, sizeLabel,
});

export const expandableSectionPart = (label, parts) => ({ type: PART_TYPES.EXPANDABLE_SECTION, label, parts });

export const warningPart = (text) => ({ type: PART_TYPES.WARNING, text });
export const successPart = (text) => ({ type: PART_TYPES.SUCCESS, text });
export const errorPart = (text) => ({ type: PART_TYPES.ERROR, text });

export const progressUpdatePart = (stats) => ({ type: PART_TYPES.PROGRESS_UPDATE, stats });

// Flattens a parts array down to a plain string — used for the conversation
// list preview line and as the seed text for auto-title generation. Never
// persisted, only derived at render/request time.
export function partsToPreviewText(parts = []) {
  return parts
    .map((p) => {
      switch (p.type) {
        case PART_TYPES.TEXT: return p.text;
        case PART_TYPES.CONFIRMATION_CARD: return p.summary;
        case PART_TYPES.WARNING:
        case PART_TYPES.SUCCESS:
        case PART_TYPES.ERROR: return p.text;
        case PART_TYPES.TASK_CARD: return p.task?.title ?? "";
        case PART_TYPES.FILE_ATTACHMENT: return p.filename;
        default: return "";
      }
    })
    .filter(Boolean)
    .join(" ")
    .trim();
}
