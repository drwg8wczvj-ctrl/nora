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

// ── Rich response blocks ─────────────────────────────────────────────────
// Every persona's text output can use these emoji-headed blocks to mark a
// callout (a key insight, a plan, a warning, ...) instead of plain prose.
// This vocabulary is the single source of truth shared between the prompt
// instructions (src/lib/aiConversationStyle.js tells the model exactly this
// list) and the renderer below — a header the model writes is guaranteed to
// match here, never silently fall back to literal emoji+text.
export const RICH_BLOCKS = [
  { key: "insight",      emoji: "💡", label: "Key Insight" },
  { key: "psychology",   emoji: "🧠", label: "Psychology" },
  { key: "plan",         emoji: "📋", label: "Plan" },
  { key: "next_step",    emoji: "⚡", label: "Next Step" },
  { key: "planner",      emoji: "📅", label: "Planner" },
  { key: "explanation",  emoji: "📖", label: "Explanation" },
  { key: "challenge",    emoji: "💪", label: "Challenge" },
  { key: "goal",         emoji: "🎯", label: "Goal" },
  { key: "keep_in_mind", emoji: "⚠️", label: "Keep in Mind" },
  { key: "completed",    emoji: "✅", label: "Completed" },
  { key: "research",     emoji: "🔬", label: "Research" },
  { key: "wellbeing",    emoji: "❤️", label: "Wellbeing" },
  { key: "progress",     emoji: "📈", label: "Progress" },
  { key: "reflection",   emoji: "📝", label: "Reflection" },
];

const BULLET_RE = /^[-•*]\s+/;
const NUMBERED_RE = /^\d+[.)]\s+/;

// A block header line is "<emoji> Label" — optionally **bold**, optionally
// colon-terminated, optionally followed by inline content on the same line
// ("💡 Key Insight: you've been improving steadily."). Matched by exact
// known label per emoji (not a generic capitalized-words guess) so this
// never misfires on the model's ordinary use of these emoji in prose.
function matchBlockHeader(line) {
  for (const block of RICH_BLOCKS) {
    if (!line.startsWith(block.emoji)) continue;
    let rest = line.slice(block.emoji.length).trim().replace(/^\*{1,2}/, "");
    const labelRe = new RegExp("^" + block.label.replace(/ /g, "\\s+"), "i");
    if (!labelRe.test(rest)) continue;
    rest = rest.replace(labelRe, "").replace(/^\*{1,2}/, "").replace(/^:\s*/, "").trim();
    return { block, inlineBody: rest };
  }
  return null;
}

// Classifies one blank-line-delimited chunk of text as a callout, a bullet
// list, a numbered list, or a plain paragraph. Recursive on purpose — a
// callout's body is itself classified this way, so "📋 Plan\n1. ...\n2. ..."
// renders as a real callout wrapping a real numbered list, not raw text.
function classifyChunk(raw) {
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  const header = matchBlockHeader(lines[0]);
  if (header) {
    const bodyLines = header.inlineBody ? [header.inlineBody, ...lines.slice(1)] : lines.slice(1);
    return {
      type: "callout",
      blockKey: header.block.key,
      emoji: header.block.emoji,
      label: header.block.label,
      body: bodyLines.length ? classifyChunk(bodyLines.join("\n")) : null,
    };
  }
  if (lines.every((l) => BULLET_RE.test(l))) {
    return { type: "bullet_list", items: lines.map((l) => l.replace(BULLET_RE, "")) };
  }
  if (lines.every((l) => NUMBERED_RE.test(l))) {
    return { type: "numbered_list", items: lines.map((l) => l.replace(NUMBERED_RE, "")) };
  }
  return { type: "paragraph", text: lines.join("\n") };
}

// Splits a whole message's text on blank lines and classifies each chunk —
// the one entry point the renderer needs. Pure and synchronous; safe to call
// on every render since messages are short (a few KB at most).
export function parseRichBlocks(text = "") {
  return text
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map(classifyChunk)
    .filter(Boolean);
}

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
