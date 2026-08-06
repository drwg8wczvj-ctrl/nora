import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const files = [
  "src/App.css",
  "src/MobileApp.css",
  "src/glass.css",
  "src/theme.css",
  "src/AtlasChat.css",
  "src/conversation/MessagePart.css",
  "src/conversation/ConversationMessage.css",
  "src/conversation/SchedulePlanboard.css",
];

const metrics = files.map((file) => {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  return {
    file,
    lines: source.split("\n").length,
    bytes: Buffer.byteLength(source),
    important: (source.match(/!important/g) ?? []).length,
    backdropFilters: (source.match(/backdrop-filter/g) ?? []).length,
    gradients: (source.match(/(?:linear|radial)-gradient/g) ?? []).length,
    animations: (source.match(/\banimation\s*:/g) ?? []).length,
  };
});

const totals = metrics.reduce((sum, item) => ({
  lines: sum.lines + item.lines,
  bytes: sum.bytes + item.bytes,
  important: sum.important + item.important,
  backdropFilters: sum.backdropFilters + item.backdropFilters,
  gradients: sum.gradients + item.gradients,
  animations: sum.animations + item.animations,
}), { lines: 0, bytes: 0, important: 0, backdropFilters: 0, gradients: 0, animations: 0 });

console.table(metrics);
console.log("Style baseline", totals);
