// Nora's cold-launch greeting — the one line shown as the splash logo settles
// in, before the app is even visible. Has to resolve INSTANTLY (no network
// wait), so it only ever reads from what's already synchronously available
// on first render: tasks/dailyMetrics are useLocalStorage-cached, so even on
// a true cold launch (before this session's own Supabase fetch resolves)
// there's a real, un-fabricated snapshot from last time the app ran.
//
// Deliberately deterministic, never random — same inputs always produce the
// same line, so it reads as "Nora already knows", never as a rotating tip.
// "Mood" and "Calendar" (named in the brief as future inputs) aren't used
// here: neither has a value that exists before the user does anything today
// (mood comes from the Morning Checkup, calendar sync is a separate async
// integration) — inventing a placeholder for either would be exactly the
// kind of fabrication this whole engine avoids elsewhere. Real AI-generated
// greetings (weather, HealthKit, recent conversations) are the explicitly-
// named future layer; this is the instant, always-available heuristic floor
// underneath it, same relationship buildMorningGreeting has to /api/tips.

const LAST_OPENED_KEY = "nora_last_opened_at";

function daysBetween(a, b) {
  return Math.round((a - b) / 86400000);
}

// Call once per cold launch, after reading the previous value for THIS
// greeting decision — updates the stored timestamp for next time.
export function recordAppOpen(now = Date.now()) {
  let previous = null;
  try {
    const raw = localStorage.getItem(LAST_OPENED_KEY);
    previous = raw ? Number(raw) : null;
  } catch {
    previous = null;
  }
  try { localStorage.setItem(LAST_OPENED_KEY, String(now)); } catch { /* best effort */ }
  return previous;
}

export function buildLaunchGreeting({
  hour,
  name = "",
  recoveryState = null,
  workloadForecast = [],
  dailyMetrics = {},
  today = null,
  lastOpenedAt = null,
  now = null,
} = {}) {
  const h = hour ?? new Date().getHours();
  const timeGreeting = h < 5 ? "Good evening." : h < 12 ? "Good morning." : h < 17 ? "Good afternoon." : "Good evening.";
  const firstName = String(name ?? "").trim().split(/\s+/)[0].slice(0, 28);
  const salutation = firstName
    ? `${timeGreeting.slice(0, -1)}, ${firstName}.`
    : timeGreeting;

  // Days since the app was last opened — a real, cheap, deterministic signal
  // for "has it been a while" vs. "same-day return", using the SAME clock
  // the rest of this function already has (never Date.now() mid-render).
  const nowMs = now ?? Date.now();
  const daysSinceLastOpen = lastOpenedAt != null ? daysBetween(nowMs, lastOpenedAt) : null;

  const todaysLevel = workloadForecast?.[0]?.level ?? null; // "heavy" | "moderate" | "light" | "free"
  const todaysTaskCount = workloadForecast?.[0]?.load ?? 0;
  const isBusyToday = todaysLevel === "heavy" || todaysTaskCount >= 6;
  const isQuietToday = todaysLevel === "free" || todaysLevel === "light";

  let yesterdayCompletionPct = null;
  if (today) {
    // Local-only date arithmetic — subtracting ms then round-tripping through
    // toISOString() (UTC) can shift the calendar date backward whenever the
    // local zone is ahead of UTC (e.g. local midnight in UTC+2 is already
    // 22:00 the PREVIOUS day in UTC). setDate()/getFullYear() etc. all
    // operate in local time consistently, so this never crosses that seam.
    const d = new Date(today + "T00:00:00");
    d.setDate(d.getDate() - 1);
    const yesterday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const y = dailyMetrics?.[yesterday];
    if (y?.tasksTotal > 0) yesterdayCompletionPct = Math.round((y.tasksCompleted / y.tasksTotal) * 100);
  }

  // Priority order: a long absence is the most distinctive thing Nora can
  // notice, then recovery (the user's wellbeing outranks scheduling), then
  // yesterday's follow-through, then today's shape, then a confident default.
  if (daysSinceLastOpen != null && daysSinceLastOpen >= 7) {
    return { line1: salutation, line2: "Good to see you again." };
  }
  if (daysSinceLastOpen != null && daysSinceLastOpen >= 2) {
    return { line1: salutation, line2: "Welcome back." };
  }

  if (recoveryState?.level === "burnout" || recoveryState?.level === "recovery") {
    return { line1: salutation, line2: "I've kept today light." };
  }

  if (yesterdayCompletionPct != null && yesterdayCompletionPct >= 90) {
    return { line1: salutation, line2: "Everything is ready." };
  }

  if (isBusyToday) {
    return { line1: salutation, line2: "I've prepared today's plan." };
  }
  if (isQuietToday) {
    return { line1: salutation, line2: "Your day is ready." };
  }

  return { line1: salutation, line2: h < 12 ? "Ready when you are." : "Let's make today count." };
}
