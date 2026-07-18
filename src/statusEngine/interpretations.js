// ── Micro-starts ───────────────────────────────────────────────────────────
// Canonical, single source of truth for "what's the smallest possible first
// step" copy. Previously duplicated in two places (App.js's old mostAvoided
// ladder and FocusSession.js's getMicroStart) — this is FocusSession.js's
// version verbatim (it's the superset: it has the clean/tidy/organise
// category the App.js copy was missing).
export function getMicroStart(title = "") {
  const tl = title.toLowerCase();
  if (/read|study|learn|review/.test(tl))       return ["Open it and read the first page only.", "Set a 5-min timer and start anywhere.", "Write 3 things you need to understand."];
  if (/write|essay|report|draft/.test(tl))       return ["Open a doc and type one sentence.", "Bullet your 3 main ideas — nothing else.", "Write only the title and first paragraph."];
  if (/code|build|implement|fix|debug/.test(tl)) return ["Open the file and read it once.", "Write a comment describing what needs to happen.", "Make one tiny change and run it."];
  if (/email|message|call|reply/.test(tl))       return ["Open it and read — don't respond yet.", "Type just the first line of a reply.", "Draft 2 sentences and save."];
  if (/clean|tidy|organis|organiz/.test(tl))     return ["Set a 5-min timer and pick one corner.", "Remove 5 things from one surface.", "Put away 10 items — that's it."];
  return [`Spend 5 minutes on "${title}" — that's it.`, "Set a timer. Anything counts.", "Do the smallest possible piece right now."];
}

// ── Banned language guard ───────────────────────────────────────────────────
const BANNED_WORDS = ["failed", "missed", "should have", "didn't", "you didn't"];

export function containsBannedLanguage(text) {
  const lower = (text ?? "").toLowerCase();
  return BANNED_WORDS.some((w) => lower.includes(w));
}

// ── Deterministic variant picker ────────────────────────────────────────────
// No Math.random() — the same inputs must always produce the same copy so the
// UI doesn't feel like it's flickering between re-renders.
function pick(list, seed) {
  if (list.length <= 1) return list[0];
  const n = Math.abs(Math.round(seed ?? 0));
  return list[n % list.length];
}

// ── Interpretation banks ─────────────────────────────────────────────────────
// Each bucket maps to an array of variants. A variant is either a plain
// { sentence, action, improvement } object or a function of the call context
// (used where the copy needs to react to topFactor/trend, e.g. Mental Battery).

const MENTAL_BATTERY_BANK = {
  charged: [
    { sentence: "Your battery is fully charged — this is a strong window for demanding work.", action: "Tackle your hardest task now while capacity is high.", improvement: "+15% focus" },
    { sentence: "Energy reserves are high and recovery is on your side.", action: "Front-load the task that needs the most concentration.", improvement: "+10% output" },
    { sentence: "You're running at full capacity today.", action: "Use this window before the afternoon dip.", improvement: "+20% momentum" },
  ],
  adequate: [
    ({ topFactor }) => ({
      sentence: topFactor === "heavy_today"
        ? "Your battery is holding steady, though today's load is on the heavier side."
        : "Your battery is in a solid, workable range right now.",
      action: topFactor === "heavy_today" ? "Take a short break before your next task." : "Keep going — this is a sustainable pace.",
      improvement: "+10% by evening",
    }),
    { sentence: "There's enough charge left for focused work, just not unlimited reserves.", action: "Pick one meaningful task rather than several small ones.", improvement: "+8% clarity" },
    { sentence: "Battery levels are adequate — comfortable but worth pacing.", action: "Space out demanding tasks with short resets.", improvement: "+12% endurance" },
  ],
  low: [
    { sentence: "Your battery is running low — capacity for demanding work is limited right now.", action: "Shift to lighter, lower-stakes tasks for the next stretch.", improvement: "+15% by tomorrow with a proper break" },
    ({ topFactor }) => ({
      sentence: topFactor === "recovery_state"
        ? "Reserves are low, and recent recovery signals are part of why."
        : "Reserves are running low today.",
      action: "A 10-minute break now buys more focus later than pushing through.",
      improvement: "+10% after a short reset",
    }),
    { sentence: "Charge is low — this is a good moment to protect what's left.", action: "Defer anything that isn't essential today.", improvement: "+15% recovery overnight" },
  ],
  depleted: [
    { sentence: "Your battery is nearly empty — this isn't a capacity issue you can push through, it's a recovery one.", action: "Protect the next few hours for rest, not output.", improvement: "+25% by tomorrow with real rest" },
    ({ topFactor }) => ({
      sentence: topFactor === "recovery_state"
        ? "Reserves are depleted, and your recovery state is the main driver."
        : "Reserves are depleted after a demanding stretch.",
      action: "Step away from cognitive work entirely for a while.",
      improvement: "+20% tomorrow with genuine downtime",
    }),
    { sentence: "There's very little left in the tank right now.", action: "One essential task only — let everything else wait.", improvement: "+18% after rest" },
  ],
};

const RECOVERY_INDEX_BANK = {
  stable: [
    { sentence: "Your Recovery Index is in a healthy range — output and rest are balanced.", action: "Keep the current rhythm going.", improvement: "+5% resilience if this holds" },
    { sentence: "Recovery looks strong right now.", action: "This is a good stretch to take on something ambitious.", improvement: "+10% capacity available" },
  ],
  mild: [
    { sentence: "Your Recovery Index shows early signs of strain.", action: "Trim a task or two and protect one longer break this week.", improvement: "+10 min recovery per protected break" },
    { sentence: "Recovery is slightly below your usual baseline.", action: "A lighter afternoon would bring it back up quickly.", improvement: "+12% by end of week" },
  ],
  high: [
    { sentence: "Your Recovery Index has been under real pressure lately.", action: "Cut daily load by about 30% and keep only what genuinely matters.", improvement: "+20% recovery within a few days" },
    { sentence: "Recovery has consistently run below a sustainable level.", action: "Prioritize fewer, higher-value tasks for the next couple of days.", improvement: "+15% by mid-week" },
  ],
  recovery: [
    { sentence: "Your Recovery Index is signalling that rest will do more for you than more output right now.", action: "Treat tomorrow as close to a rest day — one essential task at most.", improvement: "+25% recovery with one lighter day" },
    { sentence: "This is a recovery window, not a push window.", action: "Protect the next day and let the backlog wait.", improvement: "+20% by the day after" },
  ],
  burnout: [
    { sentence: "Your Recovery Index is showing sustained, significant strain.", action: "Pause non-essential work entirely and rest today.", improvement: "+30% capacity after real rest" },
    { sentence: "Cumulative load has pushed recovery into the red.", action: "Rebuild from a lighter baseline starting tomorrow.", improvement: "+25% within a few rested days" },
  ],
};

const MOMENTUM_BANK = {
  new: [
    { sentence: "Nora is still learning your rhythm — a few more days will sharpen this picture.", action: "Keep logging completions; patterns emerge quickly.", improvement: "clearer signal within a few days" },
  ],
  overloaded: [
    { sentence: "Momentum is being crowded out by sheer volume right now.", action: "Remove or defer tasks rather than trying to do more.", improvement: "+15% completion once load drops" },
    { sentence: "The current load is outpacing what's sustainable.", action: "Consistency beats volume — cut the list down.", improvement: "+20% follow-through with a lighter list" },
  ],
  rising: [
    { sentence: "You're becoming someone who follows through — momentum is genuinely building.", action: "Protect this energy and keep sessions predictable.", improvement: "+10% completion if the pattern holds" },
    { sentence: "You're building a track record of finishing what you start.", action: "Keep the load steady rather than adding more on top.", improvement: "+15% by next week" },
  ],
  stable: [
    { sentence: "You're someone who shows up consistently — this rhythm is working.", action: "Protect what's working rather than adding to it.", improvement: "+5% resilience by staying steady" },
    { sentence: "Steady momentum is carrying you reliably day to day.", action: "Keep the current pace — no need to push harder.", improvement: "+8% margin for the unexpected" },
  ],
  recovery: [
    { sentence: "A strong stretch was followed by a natural dip — that's part of the pattern, not a break from it.", action: "A lighter day resets the system faster than pushing through.", improvement: "+15% rebound within a couple of days" },
  ],
  unstable: [
    { sentence: "The pattern has been inconsistent lately.", action: "Fewer, smaller, well-timed tasks work better than an ambitious list.", improvement: "+12% completion with a shorter list" },
    { sentence: "Momentum hasn't found a steady footing yet.", action: "Pick one anchor task per day and build from there.", improvement: "+10% consistency this week" },
  ],
};

const CONSISTENCY_BANK = {
  building: [
    { sentence: "There isn't quite enough history yet to read your consistency pattern.", action: "Keep completing tasks — the picture sharpens with a few more days.", improvement: "a clear reading within a few days" },
  ],
  steady: [
    { sentence: "You're becoming someone whose output barely swings day to day — that's real consistency.", action: "Keep the routine as-is; it's doing the work for you.", improvement: "+5% predictability if maintained" },
    { sentence: "You're settling into a reliably steady rhythm.", action: "Resist the urge to add extra tasks on already-good days.", improvement: "+8% reliability" },
  ],
  variable: [
    { sentence: "Your day-to-day output swings more than it settles.", action: "Try anchoring one consistent task at the same time daily.", improvement: "+10% steadiness within a week" },
    { sentence: "Some days are strong, others much quieter — the pattern isn't locked in yet.", action: "A fixed daily minimum can smooth out the swings.", improvement: "+12% predictability" },
  ],
  erratic: [
    { sentence: "Output has been swinging widely from one day to the next.", action: "Shrink the daily task list until a steadier pattern forms.", improvement: "+15% steadiness with a lighter, fixed list" },
    { sentence: "There's a lot of variance in how each day goes right now.", action: "One small, repeatable task per day rebuilds a baseline fast.", improvement: "+18% consistency within two weeks" },
  ],
};

const DEEP_WORK_BANK = {
  high: [
    { sentence: "Conditions line up for real deep work right now — energy is up and load is manageable.", action: "Block out an uninterrupted session for your hardest task.", improvement: "+20% output in a focused block" },
    { sentence: "This is a strong window for sustained concentration.", action: "Save the shallow tasks for later and go deep now.", improvement: "+15% quality of work" },
  ],
  moderate: [
    { sentence: "There's a reasonable window for focused work, though not an ideal one.", action: "Keep the session shorter and single-task.", improvement: "+10% focus with a tighter scope" },
    { sentence: "Deep work is possible right now, just not effortless.", action: "Clear one distraction before you start — it matters more than usual today.", improvement: "+12% follow-through" },
  ],
  low: [
    { sentence: "Conditions aren't lined up for extended deep work right now.", action: "Stick to short, low-stakes tasks instead of a long session.", improvement: "+15% capacity after some recovery" },
    { sentence: "Sustained focus will be an uphill climb at the moment.", action: "A 15-minute block beats forcing a long one.", improvement: "+10% by later today" },
  ],
};

const ATTENTION_STABILITY_BANK = {
  gated: [
    { sentence: "Attention Stability needs a bit more focus-session history before it's reliable.", action: "Complete a few more focus sessions to unlock this reading.", improvement: "unlocks after a few more sessions" },
  ],
  high: [
    { sentence: "Your recent focus sessions show strong, stable attention.", action: "This is a good time for your longest or hardest task.", improvement: "+10% session completion" },
  ],
  moderate: [
    { sentence: "Attention has been reasonably steady across recent sessions, with some drift.", action: "Silence notifications before your next session to tighten this up.", improvement: "+12% fewer distractions" },
  ],
  low: [
    { sentence: "Recent sessions show attention breaking more often than it holds.", action: "Try a shorter session length until stability rebuilds.", improvement: "+15% completion with shorter sessions" },
  ],
};

const BANKS = {
  mental_battery: MENTAL_BATTERY_BANK,
  recovery_index: RECOVERY_INDEX_BANK,
  momentum: MOMENTUM_BANK,
  consistency: CONSISTENCY_BANK,
  deep_work_capacity: DEEP_WORK_BANK,
  attention_stability: ATTENTION_STABILITY_BANK,
};

const FALLBACK = { sentence: "Nora is still building a read on this metric.", action: "Keep logging your day — the picture sharpens quickly.", improvement: "clearer signal soon" };

export function generateInterpretation(metricKey, { value, prevValue, bucket, topFactor, trend } = {}) {
  const bucketBank = BANKS[metricKey]?.[bucket];
  if (!bucketBank || bucketBank.length === 0) return { ...FALLBACK };

  const seed = value ?? (trend != null ? Math.round(trend * 100) : 0) ?? 0;
  const variant = pick(bucketBank, seed);
  const resolved = typeof variant === "function" ? variant({ value, prevValue, topFactor, trend }) : variant;

  return { sentence: resolved.sentence, action: resolved.action, improvement: resolved.improvement };
}

// ── AI Coach headline ────────────────────────────────────────────────────────
const NORA_STATE_DEFAULTS = {
  recovery_day: [
    "Today looks like a Recovery Day. Keep the list light and protect your energy.",
    "Signals point to Recovery Day — one essential task is plenty for now.",
  ],
  high_load: [
    "Load is high right now. Trimming a task or two would ease the pressure.",
    "You're carrying a heavy load today — moving something to tomorrow would help.",
  ],
  peak_focus: [
    "You're in Peak Focus — this is the window for your hardest task.",
    "Conditions are ideal right now. Use this Peak Focus window well.",
  ],
  building_momentum: [
    "Momentum is building. Keep the pace steady rather than adding more.",
    "You're on an upswing — protect it by keeping the load predictable.",
  ],
  steady_flow: [
    "You're in a Steady Flow — reliable and sustainable.",
    "Steady Flow detected. This rhythm is worth protecting as-is.",
  ],
  focus_mode: [
    "Focus Mode is active — pick one task and give it your full attention.",
    "This is a good moment to narrow in on a single priority.",
  ],
};

export function generateCoachHeadline({ noraState, recoveryTrendDeclining3d, attentionFragmentedSinceDay, metrics }) {
  if (recoveryTrendDeclining3d === true) {
    return "Your Recovery Index has declined for three consecutive days. Reduce workload after 15:00.";
  }

  if (attentionFragmentedSinceDay) {
    return `Your attention has been fragmented since ${attentionFragmentedSinceDay}. Let's protect one uninterrupted 45-minute session.`;
  }

  if (metrics?.mentalBattery?.bucket === "charged" && noraState?.key === "peak_focus") {
    return "Good morning. Your Mental Battery recovered overnight. Today is ideal for creative work.";
  }

  const variants = NORA_STATE_DEFAULTS[noraState?.key] ?? NORA_STATE_DEFAULTS.focus_mode;
  const seed = metrics?.mentalBattery?.value ?? 0;
  return pick(variants, seed);
}

// ── Atlas Coach headline (Mind tab) ──────────────────────────────────────────
function yesterdayOf(dateStr) {
  return new Date(new Date(dateStr + "T00:00:00").getTime() - 86400000).toISOString().slice(0, 10);
}

const ATLAS_CALM_DEFAULTS = [
  "No particular flags today — a good moment to check in with yourself if you'd like.",
  "Things look steady. Atlas is here anytime, no issue needs to prompt it.",
  "Nothing urgent today. Worth a moment of reflection if it's useful.",
];

// Deliberately no parallel "state machine" here (no stateLabel/color/confidence
// like Nora's coach card) — Atlas's card only ever needs one honest sentence,
// grounded in a real signal, never a fabricated taxonomy to match Nora's.
export function generateAtlasHeadline({ userPrefs, today, sleepAnalysis, metrics }) {
  const signal = userPrefs?.wellbeing_signal;
  const signalFresh = signal && !signal.acknowledged && (signal.date === today || signal.date === yesterdayOf(today));
  if (signalFresh) {
    return signal.note
      ? `You mentioned something was weighing on you — "${signal.note}" — Atlas is here if you want to talk it through.`
      : "You mentioned something was weighing on you — Atlas is here if you want to talk it through.";
  }

  if (sleepAnalysis?.mentalFatigueRisk?.bucket === "high") {
    return "Fatigue risk is elevated today — a short pause now may help more than pushing through.";
  }

  if (["depleted", "low"].includes(metrics?.mentalBattery?.bucket)) {
    return "Your reserves are running low — this might be a good moment to check in with yourself, not just your tasks.";
  }

  const seed = metrics?.mentalBattery?.value ?? 0;
  return pick(ATLAS_CALM_DEFAULTS, seed);
}
