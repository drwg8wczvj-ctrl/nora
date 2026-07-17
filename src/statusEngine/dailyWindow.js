// ── Date helpers ─────────────────────────────────────────────────────────────
// src/App.js defines fmtDate/addDays as local (non-exported) consts, so the
// engine reproduces the exact same implementations here as the single
// source of truth for every file in statusEngine/. Signatures match App.js's:
//   fmtDate(date: Date) -> "YYYY-MM-DD"
//   addDays(dateStr: "YYYY-MM-DD", n: number) -> Date
const pad = (n) => String(n).padStart(2, "0");

export const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const addDays = (dateStr, n) => {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d;
};

// ── Shared daily-rate window builder ──────────────────────────────────────────
// Extracted from the 5 near-identical loops that used to live inline in
// App.js (userLoadBaseline, momentum, recoveryState's last7, behaviorProfile's
// days14). Same math, same output shape, computed once.
//
// `days` = how many calendar days the window spans.
// `offsetStart` = how many days back from `today` the window begins
//   (defaults to days-1, i.e. "last N days including today").
//   e.g. days=7,  offsetStart=6  -> today-6 .. today   (weekData/last7 style)
//        days=14, offsetStart=13 -> today-13 .. today  (userLoadBaseline/momentum/days14 style)
//        days=7,  offsetStart=0  -> today .. today+6   (workloadForecast style)
export function buildDailyWeightedWindow(tasks, taskWeights, today, days, offsetStart = days - 1) {
  return Array.from({ length: days }, (_, i) => {
    const date = fmtDate(addDays(today, i - offsetStart));
    const dayT = tasks.filter((t) => t.date === date && t.type !== "break");
    const totalW = dayT.reduce((s, t) => s + (taskWeights[t.id] ?? 3), 0);
    const doneW = dayT.filter((t) => t.completed).reduce((s, t) => s + (taskWeights[t.id] ?? 3), 0);
    return { date, totalW, doneW, rate: totalW > 0 ? doneW / totalW : null };
  });
}
