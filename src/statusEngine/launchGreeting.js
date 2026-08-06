// Nora's cold-launch welcome has two layers:
//
// 1. An instant, local composer grounded in data already cached on-device.
// 2. A short AI-written welcome, prepared through /api/tips when the network
//    is available. A fast response can be used on the current launch; a later
//    response is saved for the next one.
//
// Launch must never wait for the network. The local layer is therefore a
// complete experience in its own right, not placeholder copy.

const LAST_OPENED_KEY = "nora_last_opened_at";
const RECENT_GREETINGS_KEY = "nora_recent_launch_greetings_v2";
const PREPARED_GREETING_KEY = "nora_prepared_launch_greeting_v2";
const PREPARED_GREETING_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const RECENT_GREETING_LIMIT = 8;

function storage() {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

function daysBetween(a, b) {
  return Math.max(0, Math.floor((a - b) / 86400000));
}

function firstNameOf(name) {
  return String(name ?? "").trim().split(/\s+/)[0].slice(0, 28);
}

function readRecentGreetings() {
  try {
    const parsed = JSON.parse(storage()?.getItem(RECENT_GREETINGS_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item?.id).slice(-RECENT_GREETING_LIMIT) : [];
  } catch {
    return [];
  }
}

function rememberGreeting(greeting) {
  const next = [
    ...readRecentGreetings().filter((item) => item.id !== greeting.id),
    { id: greeting.id, text: `${greeting.line1} ${greeting.line2}`.trim() },
  ].slice(-RECENT_GREETING_LIMIT);
  try {
    storage()?.setItem(RECENT_GREETINGS_KEY, JSON.stringify(next));
  } catch {
    // A launch greeting should never fail because private storage is blocked.
  }
}

function cleanLine(value, maxLength = 110) {
  const line = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!line || line.length > maxLength || /[\r\n<>]/.test(line)) return "";
  return line;
}

export function getLaunchReadingMs(greeting) {
  const words = `${greeting?.line1 ?? ""} ${greeting?.line2 ?? ""}`
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(2400, Math.min(4000, 2050 + words * 82));
}

function finishGreeting(greeting) {
  const finished = {
    ...greeting,
    readingMs: getLaunchReadingMs(greeting),
  };
  rememberGreeting(finished);
  return finished;
}

// Call once per cold launch, before writing the new timestamp. The returned
// value describes the previous visit and can safely be used in the greeting.
export function recordAppOpen(now = Date.now()) {
  let previous = null;
  try {
    const raw = storage()?.getItem(LAST_OPENED_KEY);
    previous = raw ? Number(raw) : null;
  } catch {
    previous = null;
  }
  try {
    storage()?.setItem(LAST_OPENED_KEY, String(now));
  } catch {
    // Best effort only.
  }
  return Number.isFinite(previous) ? previous : null;
}

export function takePreparedLaunchGreeting(now = Date.now()) {
  let prepared = null;
  try {
    const store = storage();
    const raw = store?.getItem(PREPARED_GREETING_KEY);
    store?.removeItem(PREPARED_GREETING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const line1 = cleanLine(parsed?.line1);
    const line2 = cleanLine(parsed?.line2);
    const createdAt = Number(parsed?.createdAt);
    if (!line1 || !line2 || !Number.isFinite(createdAt)) return null;
    if (now - createdAt > PREPARED_GREETING_MAX_AGE_MS || createdAt > now + 60000) return null;
    prepared = {
      id: `ai-${createdAt}`,
      category: cleanLine(parsed?.category, 28) || "personal",
      line1,
      line2,
      source: "ai",
    };
  } catch {
    return null;
  }
  return prepared;
}

export function storePreparedLaunchGreeting(greeting, now = Date.now()) {
  const line1 = cleanLine(greeting?.line1);
  const line2 = cleanLine(greeting?.line2);
  if (!line1 || !line2) return false;
  try {
    storage()?.setItem(PREPARED_GREETING_KEY, JSON.stringify({
      line1,
      line2,
      category: cleanLine(greeting?.category, 28) || "personal",
      createdAt: now,
    }));
    return true;
  } catch {
    return false;
  }
}

export function getRecentLaunchGreetingTexts() {
  return readRecentGreetings().map((item) => item.text).filter(Boolean);
}

function selectCandidate(candidates, random) {
  const recentIds = new Set(readRecentGreetings().map((item) => item.id));
  const fresh = candidates.filter((candidate) => !recentIds.has(candidate.id));
  const pool = fresh.length ? fresh : candidates;
  const index = Math.min(pool.length - 1, Math.floor(Math.max(0, Math.min(0.999999, random())) * pool.length));
  return pool[index];
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
  momentum = null,
  healthSummary = null,
  todaySleepQuality = null,
  preparedGreeting = null,
  random = Math.random,
} = {}) {
  if (preparedGreeting?.line1 && preparedGreeting?.line2) {
    return finishGreeting({
      id: preparedGreeting.id ?? `ai-${now ?? Date.now()}`,
      category: preparedGreeting.category ?? "personal",
      line1: cleanLine(preparedGreeting.line1),
      line2: cleanLine(preparedGreeting.line2),
      source: "ai",
    });
  }

  const clock = now ?? Date.now();
  const h = hour ?? new Date(clock).getHours();
  const firstName = firstNameOf(name);
  const named = (text) => firstName ? `${text}, ${firstName}.` : `${text}.`;
  const timeGreeting = h < 5
    ? named("Still awake")
    : h < 12
      ? named("Good morning")
      : h < 17
        ? named("Good afternoon")
        : named("Good evening");
  const welcome = firstName ? `Welcome back, ${firstName}.` : "Welcome back.";

  const daysSinceLastOpen = lastOpenedAt != null ? daysBetween(clock, lastOpenedAt) : null;
  const todaysLevel = workloadForecast?.[0]?.level ?? null;
  const todaysTaskCount = Number(workloadForecast?.[0]?.load ?? 0);
  const isBusyToday = todaysLevel === "heavy" || todaysTaskCount >= 6;
  const isQuietToday = todaysLevel === "free" || todaysLevel === "light";

  let yesterdayCompletionPct = null;
  if (today) {
    const date = new Date(`${today}T00:00:00`);
    date.setDate(date.getDate() - 1);
    const yesterday = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const metric = dailyMetrics?.[yesterday];
    if (metric?.tasksTotal > 0) {
      yesterdayCompletionPct = Math.round((metric.tasksCompleted / metric.tasksTotal) * 100);
    }
  }

  let candidates = [];
  let category = "classic";

  if (daysSinceLastOpen != null && daysSinceLastOpen >= 7) {
    category = "return";
    candidates = [
      { id: "return-place", line1: welcome, line2: "I kept your place exactly as you left it." },
      { id: "return-ready", line1: named("It is good to see you again"), line2: "Everything is ready whenever you are." },
      { id: "return-thread", line1: welcome, line2: "I still have the thread. We can continue gently." },
    ];
  } else if (recoveryState?.level === "burnout" || recoveryState?.level === "recovery") {
    category = "recovery";
    candidates = [
      { id: "recovery-room", line1: timeGreeting, line2: "There is room to move gently today." },
      { id: "recovery-pace", line1: welcome, line2: "I have kept the pace considered, not crowded." },
      { id: "recovery-calm", line1: named("You are here"), line2: "That is enough to begin. We will keep today calm." },
    ];
  } else if (
    todaySleepQuality === "good"
    || (healthSummary?.sleepLastNightMinutes >= 420
      && healthSummary?.sleepBaselineMinutes
      && healthSummary.sleepLastNightMinutes >= healthSummary.sleepBaselineMinutes - 20)
  ) {
    category = "observational";
    candidates = [
      { id: "sleep-energy", line1: timeGreeting, line2: "You gave yourself a proper night. Let us use that energy well." },
      { id: "sleep-clear", line1: welcome, line2: "You are arriving with a little more capacity today." },
      { id: "sleep-ready", line1: named("You seem well prepared for today"), line2: "I have kept the important things within reach." },
    ];
  } else if (momentum?.state === "rising") {
    category = "observational";
    candidates = [
      { id: "rising-protect", line1: "You have built real momentum.", line2: "I am ready to help you protect it." },
      { id: "rising-visible", line1: welcome, line2: "The consistency is becoming difficult to miss." },
      { id: "rising-next", line1: timeGreeting, line2: "You have been moving well lately. Let us choose the next move carefully." },
    ];
  } else if (yesterdayCompletionPct != null && yesterdayCompletionPct >= 90) {
    category = "observational";
    candidates = [
      { id: "strong-yesterday", line1: "Yesterday ended with purpose.", line2: "Everything is ready for the next move." },
      { id: "follow-through", line1: welcome, line2: "Your follow-through yesterday did not go unnoticed." },
      { id: "earned-start", line1: timeGreeting, line2: "You earned a clean start. I have kept it that way." },
    ];
  } else if (isBusyToday) {
    category = "prepared";
    candidates = [
      { id: "busy-edges", line1: timeGreeting, line2: "Today has some weight. I have already found the edges." },
      { id: "busy-order", line1: welcome, line2: "There is plenty ahead, but it already has an order." },
      { id: "busy-one-thing", line1: named("Everything is in place"), line2: "We only need to begin with the right thing." },
    ];
  } else if (isQuietToday) {
    category = "reflective";
    candidates = [
      { id: "quiet-space", line1: timeGreeting, line2: "There is space today. We can use it well." },
      { id: "quiet-unhurried", line1: welcome, line2: "Nothing needs to feel rushed. The important work is ready." },
      { id: "quiet-shape", line1: named("A quieter day is waiting"), line2: "We can give it exactly the shape it needs." },
    ];
  } else {
    const defaultPools = [
      [
        { id: "classic-ready", line1: welcome, line2: "Everything is ready when you are." },
        { id: "classic-thread", line1: timeGreeting, line2: "Shall we continue where we left off?" },
        { id: "classic-order", line1: named("I have kept everything in order"), line2: "The next move is yours." },
      ],
      [
        { id: "reflect-future", line1: timeGreeting, line2: "The future is usually built in moments this quiet." },
        { id: "reflect-progress", line1: welcome, line2: "You have come further than the unfinished work suggests." },
        { id: "reflect-attention", line1: named("You have my full attention"), line2: "Let us make the next hour matter." },
      ],
      [
        { id: "playful-behaved", line1: welcome, line2: "Your plans behaved while you were away. Mostly." },
        { id: "playful-permission", line1: timeGreeting, line2: "I promise I did not reorganize your life without permission." },
        { id: "playful-opinions", line1: named("Everything is still in its place"), line2: "Even the tasks with opinions." },
      ],
    ];
    const poolIndex = Math.floor(Math.max(0, Math.min(0.999999, random())) * defaultPools.length);
    candidates = defaultPools[poolIndex];
    category = ["classic", "reflective", "playful"][poolIndex];
  }

  const selected = selectCandidate(candidates, random);
  return finishGreeting({ ...selected, category, source: "local" });
}
