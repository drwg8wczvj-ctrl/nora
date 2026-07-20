// Client-side file generation for the generate_file tool. Each generator
// takes the tool's already-parsed arguments and returns a Blob — nothing
// here touches Supabase; uploading/URLs are the caller's job (see
// dispatchToolCall in App.js), keeping this module a pure format layer that
// new formats can be added to independently.

const MIME = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf:  "application/pdf",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  csv:  "text/csv",
  md:   "text/markdown",
  txt:  "text/plain",
};

// "**bold**" -> plain text (docx/pdf renderers below handle bold as real
// runs where practical; this strip is the txt/md/csv fallback path).
const paragraphsOf = (text = "") => text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

async function generateDocx() {
  // docx@9's CJS build is a rolldown bundle with its own internal
  // require/module runtime — nested inside webpack's own CJS wrapper, its
  // named exports come through as an array-like object instead of the real
  // module (Document/Paragraph/etc. all undefined), and its ESM build hits
  // a separate babel/classes transform bug. Both are bundler-interop issues
  // in the library, not this app's usage of it — disabled until resolved
  // (e.g. by switching to a different generator or an isolated worker
  // bundle) rather than silently shipping a broken format.
  throw new Error("Word document generation isn't available yet — try docx as a Markdown (.md) or PDF file instead.");
}

async function generateXlsx({ title, tableHeaders = [], tableRows = [] }) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet((title || "Sheet1").slice(0, 31));
  if (tableHeaders.length) {
    const headerRow = ws.addRow(tableHeaders);
    headerRow.font = { bold: true };
  }
  tableRows.forEach((row) => ws.addRow(row));
  ws.columns.forEach((col) => { col.width = 20; });
  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: MIME.xlsx });
}

async function generatePdf({ title, textContent = "" }) {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 56;
  const pageWidth = 612, pageHeight = 792; // US Letter
  const maxWidth = pageWidth - margin * 2;
  let page = pdf.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const wrap = (text, useFont, size) => {
    const words = text.split(/\s+/);
    const lines = [];
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (useFont.widthOfTextAtSize(test, size) > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  };
  const ensureRoom = (lineHeight) => {
    if (y - lineHeight < margin) { page = pdf.addPage([pageWidth, pageHeight]); y = pageHeight - margin; }
  };
  const drawLine = (text, useFont, size, gapAfter = 6) => {
    ensureRoom(size + gapAfter);
    page.drawText(text, { x: margin, y, size, font: useFont, color: rgb(0.1, 0.1, 0.12) });
    y -= size + gapAfter;
  };

  if (title) { wrap(title, boldFont, 20).forEach((l) => drawLine(l, boldFont, 20, 8)); y -= 10; }
  for (const para of paragraphsOf(textContent)) {
    for (const chunk of para.split(/(\*\*[^*]+\*\*)/g).filter(Boolean)) {
      const bold = chunk.startsWith("**") && chunk.endsWith("**");
      const clean = bold ? chunk.slice(2, -2) : chunk;
      wrap(clean, bold ? boldFont : font, 11).forEach((l) => drawLine(l, bold ? boldFont : font, 11, 4));
    }
    y -= 8;
  }
  const bytes = await pdf.save();
  return new Blob([bytes], { type: MIME.pdf });
}

async function generatePptx({ title, slides = [] }) {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pres = new PptxGenJS();
  if (title) {
    const titleSlide = pres.addSlide();
    titleSlide.addText(title, { x: 0.5, y: 2.2, w: 9, h: 1.5, fontSize: 32, bold: true, align: "center" });
  }
  for (const s of slides) {
    const slide = pres.addSlide();
    slide.addText(s.heading ?? "", { x: 0.5, y: 0.4, w: 9, h: 1, fontSize: 24, bold: true });
    if (s.body) slide.addText(s.body, { x: 0.5, y: 1.5, w: 9, h: 4.5, fontSize: 16 });
  }
  return pres.write({ outputType: "blob" });
}

function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function generateCsv({ tableHeaders = [], tableRows = [] }) {
  const lines = [];
  if (tableHeaders.length) lines.push(tableHeaders.map(csvEscape).join(","));
  tableRows.forEach((row) => lines.push(row.map(csvEscape).join(",")));
  return new Blob([lines.join("\n")], { type: MIME.csv });
}

function generateMarkdown({ title, textContent = "" }) {
  const body = title ? `# ${title}\n\n${textContent}` : textContent;
  return new Blob([body], { type: MIME.md });
}

function generateTxt({ title, textContent = "" }) {
  const body = title ? `${title}\n${"=".repeat(title.length)}\n\n${textContent}` : textContent;
  return new Blob([body], { type: MIME.txt });
}

// Dispatches by format — one new case here (plus one in the switch in
// MessagePart.js's FORMAT_META, already in place for all seven) is the
// entire cost of adding a future format.
export async function generateFileBlob(format, args) {
  switch (format) {
    case "docx": return generateDocx(args);
    case "xlsx": return generateXlsx(args);
    case "pdf":  return generatePdf(args);
    case "pptx": return generatePptx(args);
    case "csv":  return generateCsv(args);
    case "md":   return generateMarkdown(args);
    case "txt":  return generateTxt(args);
    default: throw new Error(`Unsupported file format: ${format}`);
  }
}

export function sizeLabel(blob) {
  const kb = blob.size / 1024;
  return kb < 1024 ? `${Math.max(1, Math.round(kb))} KB` : `${(kb / 1024).toFixed(1)} MB`;
}
