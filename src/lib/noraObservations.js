const DAY_MS = 24 * 60 * 60 * 1000;

const ADMIN_WORDS = [
  "admin", "email", "e-mail", "reply", "invoice", "form", "register",
  "application", "paperwork", "document", "call", "book", "schedule",
];

const CREATIVE_WORDS = [
  "build", "create", "design", "draft", "write", "research", "strategy",
  "prototype", "project", "nora", "brand", "plan", "develop",
];

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function average(values) {
  const clean = values.map(finite).filter((value) => value != null);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDate(value) {
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function daysAgo(date, now) {
  const from = new Date(date);
  const to = new Date(now);
  from.setHours(12, 0, 0, 0);
  to.setHours(12, 0, 0, 0);
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

function percent(value) {
  return `${Math.round(value * 100)}%`;
}

function roundTo(value, step) {
  return Math.max(step, Math.floor(value / step) * step);
}

function formatHours(minutes) {
  const hours = minutes / 60;
  if (hours < 2) return `${Math.round(minutes)} minutes`;
  return Number.isInteger(hours) ? `${hours} hours` : `${hours.toFixed(1)} hours`;
}

function bedtimeMinutes(value) {
  if (typeof value !== "string" || !/^\d{1,2}:\d{2}$/.test(value)) return null;
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return (hour < 12 ? hour + 24 : hour) * 60 + minute;
}

function taskMinutes(task) {
  const duration = finite(task?.duration);
  return clamp(duration ?? 60, 5, 12 * 60);
}

function containsAny(value, words) {
  const text = String(value ?? "").toLowerCase();
  return words.some((word) => text.includes(word));
}

function observation({
  id,
  category,
  cadence,
  tone = "calm",
  priority = 50,
  title,
  body,
  fingerprint,
  prompt,
}) {
  return {
    id,
    category,
    cadence,
    tone,
    priority,
    title,
    body,
    fingerprint: String(fingerprint ?? title),
    prompt: prompt ?? `Help me reflect on this observation: ${title} ${body}`,
  };
}

function metricEntries(metrics, now) {
  const today = dateKey(now);
  return Object.entries(metrics ?? {})
    .map(([date, value]) => ({ date, day: parseDate(date), ...(value ?? {}) }))
    .filter((entry) => entry.day && entry.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function historicalTasks(tasks, now) {
  const today = dateKey(now);
  return (Array.isArray(tasks) ? tasks : [])
    .filter((task) => task && task.type !== "break" && task.date && task.date <= today);
}

function rateFor(items) {
  return items.length ? items.filter((item) => item.completed).length / items.length : null;
}

function weekdayName(day) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day];
}

function buildTodayObservation(tasks, now) {
  const today = dateKey(now);
  const completed = tasks.filter((task) => task.date === today && task.completed);
  const minutes = completed.reduce((sum, task) => sum + taskMinutes(task), 0);
  if (completed.length < 2 || minutes < 210) return null;

  const fullDay = minutes >= 7 * 60;
  return observation({
    id: "today-workday",
    category: "Time",
    cadence: "daily",
    tone: fullDay ? "milestone" : "positive",
    priority: fullDay ? 96 : 76,
    title: `You completed about ${formatHours(minutes)} of planned work today.`,
    body: fullDay
      ? "That is essentially a full workday. Even if the list is not empty, the day has already earned a real stopping point."
      : "That is substantial progress—the unfinished part of the list should not erase what the day already contained.",
    fingerprint: `${today}:${Math.round(minutes / 30)}`,
  });
}

function buildPerfectWeekObservation(entries, now) {
  const recent = entries.filter((entry) => daysAgo(entry.day, now) >= 0 && daysAgo(entry.day, now) < 7);
  if (recent.length < 7) return null;
  const planned = recent.filter((entry) => finite(entry.tasksTotal) > 0);
  if (planned.length < 7 || !planned.every((entry) => finite(entry.tasksCompleted) >= finite(entry.tasksTotal))) return null;

  return observation({
    id: "perfect-week",
    category: "Habits",
    cadence: "milestone",
    tone: "discovery",
    priority: 100,
    title: "For an entire week, every planned task became a finished task.",
    body: "This is not one unusually productive day. It is the point where follow-through begins to look like a habit.",
    fingerprint: recent.at(-1)?.date,
  });
}

function buildCompletionObservation(entries, now) {
  const recent = entries.filter((entry) => {
    const age = daysAgo(entry.day, now);
    return age >= 0 && age < 30 && finite(entry.tasksTotal) > 0;
  });
  const completed = recent.reduce((sum, entry) => sum + (finite(entry.tasksCompleted) ?? 0), 0);
  const total = recent.reduce((sum, entry) => sum + (finite(entry.tasksTotal) ?? 0), 0);
  if (recent.length < 5 || total < 12) return null;

  const rate = completed / total;
  const earlier = recent.slice(0, Math.ceil(recent.length / 2));
  const later = recent.slice(Math.ceil(recent.length / 2));
  const earlierTotal = earlier.reduce((sum, entry) => sum + (finite(entry.tasksTotal) ?? 0), 0);
  const laterTotal = later.reduce((sum, entry) => sum + (finite(entry.tasksTotal) ?? 0), 0);
  const earlierRate = earlierTotal
    ? earlier.reduce((sum, entry) => sum + (finite(entry.tasksCompleted) ?? 0), 0) / earlierTotal
    : null;
  const laterRate = laterTotal
    ? later.reduce((sum, entry) => sum + (finite(entry.tasksCompleted) ?? 0), 0) / laterTotal
    : null;
  const improving = earlierRate != null && laterRate != null && laterRate >= earlierRate + 0.1;

  if (rate >= 0.9) {
    return observation({
      id: "monthly-follow-through",
      category: "Goals",
      cadence: "monthly",
      tone: "milestone",
      priority: 92,
      title: "You follow through on almost everything you decide is important.",
      body: `${completed} of ${total} planned tasks were completed this month. That looks less like a lucky week and more like a reliable system.`,
      fingerprint: `${dateKey(now).slice(0, 7)}:${completed}:${total}`,
    });
  }

  if (rate >= 0.68) {
    return observation({
      id: "monthly-output",
      category: "Productivity",
      cadence: "monthly",
      tone: "positive",
      priority: 78,
      title: "You accomplish more than the unfinished part of your list makes it feel.",
      body: `${completed} meaningful tasks were finished this month. The remaining ${total - completed} are visible; the ${completed} completed ones deserve to be visible too.`,
      fingerprint: `${dateKey(now).slice(0, 7)}:${completed}:${total}`,
    });
  }

  return observation({
    id: "planning-capacity",
    category: "Planning",
    cadence: "weekly",
    tone: "candid",
    priority: improving ? 86 : 72,
    title: improving
      ? "Your plans are still ambitious—but they are becoming more realistic."
      : "Your calendar regularly assumes more capacity than your days actually have.",
    body: improving
      ? `Your follow-through improved from ${percent(earlierRate)} to ${percent(laterRate)} across the month. You are learning your real capacity.`
      : `About ${percent(rate)} of planned work is being completed. A smaller daily promise would make your plan more trustworthy, not less ambitious.`,
    fingerprint: `${dateKey(now).slice(0, 7)}:${Math.round(rate * 20)}`,
  });
}

function buildPeakWindowObservation(tasks) {
  const scheduled = tasks.filter((task) => finite(task.startHour) != null);
  const windows = [
    { id: "early", label: "before 9:00", items: scheduled.filter((task) => task.startHour >= 5 && task.startHour < 9) },
    { id: "morning", label: "between 9:00 and 12:00", items: scheduled.filter((task) => task.startHour >= 9 && task.startHour < 12) },
    { id: "afternoon", label: "between 12:00 and 18:00", items: scheduled.filter((task) => task.startHour >= 12 && task.startHour < 18) },
    { id: "evening", label: "between 18:00 and 21:00", items: scheduled.filter((task) => task.startHour >= 18 && task.startHour < 21) },
  ]
    .filter((window) => window.items.length >= 4)
    .map((window) => ({ ...window, rate: rateFor(window.items) }))
    .sort((a, b) => b.rate - a.rate);

  if (windows.length < 2 || windows[0].rate < 0.65 || windows[0].rate < windows.at(-1).rate + 0.12) return null;
  const best = windows[0];

  return observation({
    id: "peak-window",
    category: "Focus",
    cadence: "weekly",
    tone: "discovery",
    priority: 88,
    title: `Your most reliable work happens ${best.label}.`,
    body: `${percent(best.rate)} of tasks placed there get finished. Protecting that window will do more than trying to force productivity across the whole day.`,
    fingerprint: `${best.id}:${Math.round(best.rate * 20)}:${best.items.length}`,
  });
}

function buildLateEveningObservation(tasks) {
  const late = tasks.filter((task) => finite(task.startHour) >= 21);
  if (late.length < 4) return null;
  const rate = rateFor(late);
  if (rate == null || rate >= 0.55) return null;

  return observation({
    id: "late-evening",
    category: "Work-life balance",
    cadence: "weekly",
    tone: "candid",
    priority: 87,
    title: "Tasks placed after 21:00 rarely become real work.",
    body: `Only ${percent(rate)} are completed. Your calendar treats late evening as available time; your behaviour treats it as recovery time.`,
    fingerprint: `${late.length}:${Math.round(rate * 20)}`,
  });
}

function buildWeekdayObservation(tasks) {
  const groups = Array.from({ length: 7 }, () => []);
  tasks.forEach((task) => {
    const day = parseDate(task.date);
    if (day) groups[day.getDay()].push(task);
  });
  const ranked = groups
    .map((items, day) => ({ day, items, rate: rateFor(items) }))
    .filter((item) => item.items.length >= 4 && item.rate != null)
    .sort((a, b) => b.rate - a.rate);
  if (ranked.length < 2 || ranked[0].rate < ranked[1].rate + 0.1) return null;
  const best = ranked[0];

  return observation({
    id: "strongest-weekday",
    category: "Habits",
    cadence: "monthly",
    tone: "discovery",
    priority: 73,
    title: `${weekdayName(best.day)} has quietly become your strongest day.`,
    body: `${percent(best.rate)} of work planned there gets finished. That day may be the best home for the week’s most important task.`,
    fingerprint: `${best.day}:${Math.round(best.rate * 20)}:${best.items.length}`,
  });
}

function buildHardTaskObservation(tasks) {
  const hard = tasks.filter((task) => task.complexity === "hard" && finite(task.startHour) != null);
  const beforeLunch = hard.filter((task) => task.startHour < 12);
  const afterLunch = hard.filter((task) => task.startHour >= 12);
  if (beforeLunch.length < 3 || afterLunch.length < 3) return null;
  const morningRate = rateFor(beforeLunch);
  const laterRate = rateFor(afterLunch);
  if (morningRate < laterRate + 0.2) return null;

  return observation({
    id: "hard-before-lunch",
    category: "Decision making",
    cadence: "monthly",
    tone: "discovery",
    priority: 84,
    title: "Your difficult work has a clear deadline: lunch.",
    body: `Hard tasks are completed ${Math.max(1.1, morningRate / Math.max(laterRate, 0.1)).toFixed(1)}× more reliably before midday. Your mornings should hold decisions; your afternoons can hold execution.`,
    fingerprint: `${beforeLunch.length}:${afterLunch.length}:${Math.round(morningRate * 10)}:${Math.round(laterRate * 10)}`,
  });
}

function buildWorkTypeObservation(tasks) {
  const admin = tasks.filter((task) => containsAny(task.title, ADMIN_WORDS));
  const creative = tasks.filter((task) => containsAny(task.title, CREATIVE_WORDS));
  if (admin.length < 4 || creative.length < 4) return null;
  const adminRate = rateFor(admin);
  const creativeRate = rateFor(creative);
  if (creativeRate < adminRate + 0.2) return null;

  return observation({
    id: "admin-friction",
    category: "Decision making",
    cadence: "monthly",
    tone: "candid",
    priority: 82,
    title: "You do not avoid work—you avoid administrative friction.",
    body: `Creative work is completed far more reliably than emails, forms, and scheduling tasks. Bundling the small administrative jobs may stop them from occupying so much mental space.`,
    fingerprint: `${admin.length}:${creative.length}:${Math.round(adminRate * 10)}:${Math.round(creativeRate * 10)}`,
  });
}

function buildSleepFocusObservation(entries) {
  const good = entries.filter((entry) => ["good", "great"].includes(entry.sleepQuality) && finite(entry.focus) != null);
  const mixed = entries.filter((entry) => ["poor", "okay"].includes(entry.sleepQuality) && finite(entry.focus) != null);
  if (good.length < 3 || mixed.length < 3) return null;
  const goodFocus = average(good.map((entry) => entry.focus));
  const mixedFocus = average(mixed.map((entry) => entry.focus));
  if (goodFocus == null || mixedFocus == null || goodFocus < mixedFocus + 0.6) return null;
  const lift = Math.round(((goodFocus - mixedFocus) / Math.max(mixedFocus, 1)) * 100);

  return observation({
    id: "sleep-focus",
    category: "Sleep",
    cadence: "monthly",
    tone: "discovery",
    priority: 89,
    title: "Good sleep changes more than your energy.",
    body: `Your focus is about ${lift}% stronger after a good night. Sleep is not time taken away from your goals—it is part of how you reach them.`,
    fingerprint: `${good.length}:${mixed.length}:${Math.round(goodFocus * 10)}:${Math.round(mixedFocus * 10)}`,
  });
}

function buildMoodObservation(entries, now) {
  const recent = entries.filter((entry) => {
    const age = daysAgo(entry.day, now);
    return age >= 0 && age < 7 && finite(entry.motivation) != null;
  });
  const previous = entries.filter((entry) => {
    const age = daysAgo(entry.day, now);
    return age >= 7 && age < 14 && finite(entry.motivation) != null;
  });
  if (recent.length < 4 || previous.length < 4) return null;
  const recentAverage = average(recent.map((entry) => entry.motivation));
  const previousAverage = average(previous.map((entry) => entry.motivation));
  const change = recentAverage - previousAverage;
  if (Math.abs(change) < 0.8) return null;
  const lifting = change > 0;

  return observation({
    id: "motivation-shift",
    category: "Mood",
    cadence: "weekly",
    tone: lifting ? "positive" : "candid",
    priority: 77,
    title: lifting
      ? "Your motivation has been quietly returning."
      : "Your motivation has softened this week.",
    body: lifting
      ? "The shift is showing up across several days, not one good mood. Something in your recent rhythm is making it easier to begin."
      : "This does not look like a character problem. It looks like a signal that the current rhythm may need less friction or more recovery.",
    fingerprint: `${dateKey(now)}:${Math.round(change * 2)}`,
  });
}

function buildHealthObservations(healthSummary) {
  if (!healthSummary) return [];
  const insights = [];
  const lastSleep = finite(healthSummary.sleepLastNightMinutes);
  const sleepBaseline = finite(healthSummary.sleepBaselineMinutes);
  const recovery = finite(healthSummary.recoveryScore);
  const stepsToday = finite(healthSummary.activityStepsToday);
  const stepsBaseline = finite(healthSummary.activityBaselineSteps);

  if (lastSleep != null && sleepBaseline != null && lastSleep <= sleepBaseline - 60) {
    const shortBy = Math.round((sleepBaseline - lastSleep) / 15) * 15;
    insights.push(observation({
      id: "health-short-sleep",
      category: "Health",
      cadence: "daily",
      tone: "candid",
      priority: 91,
      title: "Last night gave you less recovery than your usual night.",
      body: `You slept about ${shortBy} minutes below your personal baseline. Today may need a smaller promise, not a harder push.`,
      fingerprint: `${Math.round(lastSleep / 15)}:${Math.round(sleepBaseline / 15)}`,
    }));
  } else if (recovery != null && recovery >= 80) {
    insights.push(observation({
      id: "health-high-recovery",
      category: "Health",
      cadence: "daily",
      tone: "positive",
      priority: 79,
      title: "Your recovery signals are unusually strong today.",
      body: "This is one of the better days for demanding work—but it is still useful to finish with some energy left.",
      fingerprint: Math.round(recovery / 5),
    }));
  }

  if (stepsToday != null && stepsBaseline != null && stepsBaseline > 0
      && stepsToday >= Math.max(5000, stepsBaseline * 1.3)) {
    const above = Math.round(((stepsToday - stepsBaseline) / stepsBaseline) * 100);
    insights.push(observation({
      id: "health-active-day",
      category: "Health",
      cadence: "daily",
      tone: "discovery",
      priority: 75,
      title: "Your body has already done more than an average day.",
      body: `You have moved about ${above}% more than your personal baseline. Your evening can support recovery instead of asking for another peak.`,
      fingerprint: `${Math.round(stepsToday / 1000)}:${Math.round(stepsBaseline / 1000)}`,
    }));
  }

  return insights;
}

function buildBedtimeObservation(entries, now) {
  const withBedtime = entries
    .filter((entry) => daysAgo(entry.day, now) >= 0 && daysAgo(entry.day, now) < 28)
    .map((entry) => ({ ...entry, bedtimeValue: bedtimeMinutes(entry.bedtime) }))
    .filter((entry) => entry.bedtimeValue != null);
  if (withBedtime.length < 8) return null;
  const split = Math.ceil(withBedtime.length / 2);
  const earlier = average(withBedtime.slice(0, split).map((entry) => entry.bedtimeValue));
  const recent = average(withBedtime.slice(split).map((entry) => entry.bedtimeValue));
  const delta = recent - earlier;
  if (Math.abs(delta) < 25) return null;
  const earlierShift = delta < 0;

  return observation({
    id: "bedtime-shift",
    category: "Sleep",
    cadence: "monthly",
    tone: earlierShift ? "positive" : "candid",
    priority: 74,
    title: earlierShift ? "Your nights are moving earlier." : "Your bedtime is quietly drifting later.",
    body: `Your average bedtime shifted ${Math.round(Math.abs(delta))} minutes ${earlierShift ? "earlier" : "later"} this month. Small movements like this often matter more than one perfect night.`,
    fingerprint: `${dateKey(now).slice(0, 7)}:${Math.round(delta / 10)}`,
  });
}

function buildRecoveryObservation(entries) {
  const weekend = entries.filter((entry) => [0, 6].includes(entry.day.getDay()) && finite(entry.recoveryScore) != null);
  const weekday = entries.filter((entry) => ![0, 6].includes(entry.day.getDay()) && finite(entry.recoveryScore) != null);
  if (weekend.length < 3 || weekday.length < 5) return null;
  const weekendAverage = average(weekend.map((entry) => entry.recoveryScore));
  const weekdayAverage = average(weekday.map((entry) => entry.recoveryScore));
  if (weekendAverage < weekdayAverage + 8) return null;

  return observation({
    id: "weekend-recovery",
    category: "Recovery",
    cadence: "monthly",
    tone: "positive",
    priority: 70,
    title: "Your weekends recover more energy than you think.",
    body: `Recovery is about ${Math.round(weekendAverage - weekdayAverage)} points stronger on weekends. Protecting one weekday evening may bring some of that reset into the middle of the week.`,
    fingerprint: `${weekend.length}:${weekday.length}:${Math.round(weekendAverage)}:${Math.round(weekdayAverage)}`,
  });
}

function buildHeavyDayObservation(entries) {
  const nextDayEnergy = [];
  for (let index = 0; index < entries.length - 1; index += 1) {
    const current = entries[index];
    const next = entries[index + 1];
    if (current.loadLevel === "heavy" && daysAgo(current.day, next.day) === 1 && finite(next.energy) != null) {
      nextDayEnergy.push(next.energy);
    }
  }
  const baseline = average(entries.map((entry) => entry.energy));
  const afterHeavy = average(nextDayEnergy);
  if (nextDayEnergy.length < 3 || baseline == null || afterHeavy == null || afterHeavy > baseline - 0.7) return null;

  return observation({
    id: "heavy-day-cost",
    category: "Energy",
    cadence: "monthly",
    tone: "candid",
    priority: 83,
    title: "Intense days keep charging interest the next morning.",
    body: `Your energy is usually ${Math.abs(afterHeavy - baseline).toFixed(1)} points lower after a heavy day. A demanding schedule needs recovery built into the following morning, not added only when exhaustion arrives.`,
    fingerprint: `${nextDayEnergy.length}:${Math.round(afterHeavy * 10)}:${Math.round(baseline * 10)}`,
  });
}

function buildFocusSessionObservations(focusSessions) {
  const completed = (Array.isArray(focusSessions) ? focusSessions : [])
    .filter((session) => session?.type === "completed" && finite(session.actual) > 0);
  const observations = [];
  if (completed.length < 3) return observations;

  const totalMinutes = completed.reduce((sum, session) => sum + finite(session.actual), 0);
  if (totalMinutes >= 600) {
    const roundedHours = roundTo(totalMinutes / 60, 5);
    const workWeeks = roundedHours / 40;
    observations.push(observation({
      id: "focus-investment",
      category: "Goals",
      cadence: "milestone",
      tone: "milestone",
      priority: 90,
      title: `You have already invested more than ${roundedHours} focused hours into your future.`,
      body: workWeeks >= 1
        ? `That is roughly ${workWeeks.toFixed(1)} full-time workweeks of deliberate attention—progress that is easy to miss when it arrives one session at a time.`
        : "Progress that arrives one session at a time is easy to underestimate. Together, those sessions have become something substantial.",
      fingerprint: `${roundTo(totalMinutes, 300)}`,
    }));
  }

  const long = completed.filter((session) => finite(session.actual) >= 90);
  const shorter = completed.filter((session) => finite(session.actual) >= 25 && finite(session.actual) < 90);
  if (long.length >= 3 && shorter.length >= 3) {
    const longDistractions = average(long.map((session) => finite(session.distractionCount) ?? 0));
    const shortDistractions = average(shorter.map((session) => finite(session.distractionCount) ?? 0));
    if (longDistractions >= shortDistractions + 0.7) {
      observations.push(observation({
        id: "focus-limit",
        category: "Focus",
        cadence: "monthly",
        tone: "candid",
        priority: 85,
        title: "Your focus starts to fray after about 90 uninterrupted minutes.",
        body: "Long sessions produce noticeably more distraction than shorter ones. A deliberate break is likely to protect momentum better than pushing through.",
        fingerprint: `${long.length}:${shorter.length}:${Math.round(longDistractions * 10)}:${Math.round(shortDistractions * 10)}`,
      }));
    }
  }
  return observations;
}

function buildTaskMilestoneObservation(tasks) {
  const completed = tasks.filter((task) => task.completed);
  if (completed.length < 50) return null;
  const milestone = roundTo(completed.length, completed.length >= 500 ? 100 : 50);

  return observation({
    id: "task-milestone",
    category: "Personal growth",
    cadence: "milestone",
    tone: "milestone",
    priority: 80,
    title: `You have turned more than ${milestone} intentions into finished work.`,
    body: "Most progress does not feel dramatic while it is happening. Seen together, those ordinary completions tell a much bigger story.",
    fingerprint: milestone,
  });
}

export function buildNoraObservations({
  metrics = {},
  tasks = [],
  focusSessions = [],
  healthSummary = null,
  now = new Date(),
} = {}) {
  const entries = metricEntries(metrics, now);
  const history = historicalTasks(tasks, now);
  const candidates = [
    buildPerfectWeekObservation(entries, now),
    buildTodayObservation(history, now),
    buildCompletionObservation(entries, now),
    buildPeakWindowObservation(history),
    buildLateEveningObservation(history),
    buildWeekdayObservation(history),
    buildHardTaskObservation(history),
    buildWorkTypeObservation(history),
    buildSleepFocusObservation(entries),
    buildMoodObservation(entries, now),
    buildBedtimeObservation(entries, now),
    buildRecoveryObservation(entries),
    buildHeavyDayObservation(entries),
    buildTaskMilestoneObservation(history),
    ...buildHealthObservations(healthSummary),
    ...buildFocusSessionObservations(focusSessions),
  ].filter(Boolean);

  const unique = new Map();
  candidates.forEach((item) => {
    if (!unique.has(item.id) || unique.get(item.id).priority < item.priority) {
      unique.set(item.id, item);
    }
  });
  return [...unique.values()].sort((a, b) => b.priority - a.priority);
}

export function observationSignature(item) {
  return `${item.id}:${item.fingerprint}`;
}

function dailyOrder(item, day) {
  const source = `${day}:${item.id}`;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash << 5) - hash + source.charCodeAt(index)) | 0;
  }
  return Math.abs(hash % 17);
}

export function selectObservationDeck(observations, {
  seen = [],
  now = new Date(),
  limit = 6,
} = {}) {
  const seenSet = new Set(seen);
  const day = dateKey(now);
  return [...(observations ?? [])]
    .sort((a, b) => {
      const aNew = seenSet.has(observationSignature(a)) ? 0 : 1;
      const bNew = seenSet.has(observationSignature(b)) ? 0 : 1;
      if (aNew !== bNew) return bNew - aNew;
      const priorityDelta = b.priority - a.priority;
      if (Math.abs(priorityDelta) >= 8) return priorityDelta;
      return dailyOrder(a, day) - dailyOrder(b, day);
    })
    .slice(0, limit);
}

export function readSeenObservations(storage) {
  try {
    const value = JSON.parse(storage?.getItem("nora_observations_seen_v1") ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function markObservationsSeen(storage, observations) {
  if (!storage) return [];
  const next = [
    ...new Set([
      ...readSeenObservations(storage),
      ...(observations ?? []).map(observationSignature),
    ]),
  ].slice(-250);
  try { storage.setItem("nora_observations_seen_v1", JSON.stringify(next)); } catch {}
  return next;
}

export function readFocusSessions(storage) {
  try {
    const value = JSON.parse(storage?.getItem("nora_focus_log") ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}
