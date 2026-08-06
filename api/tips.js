const { applyCors } = require("./_cors");
const { requireUser } = require("./_auth");
const { enforceRateLimit } = require("./_rateLimit");
const { internalError } = require("./_errors");
const { parseBody, schemas } = require("./_validation");

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== "POST") return res.status(405).end();
  const auth = await requireUser(req, res);
  if (!auth) return;
  if (!await enforceRateLimit(req, res, auth.user.id, "tips")) return;

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  const parsedBody = parseBody(res, schemas.tips, req.body ?? {});
  if (!parsedBody.ok) return;
  const { type, context = {} } = parsedBody.data;

  let systemPrompt = "";
  let userPrompt   = "";

  if (type === "morning") {
    const {
      subScores = {}, sleepDebtHours, sleepDurationHours,
      adaptiveQuestion = null,
      candidateRecommendations = [],
      dayPressure, focusChoices = [],
      tasks = [],
    } = context;

    const taskSummary = tasks.length
      ? tasks.slice(0, 5).map((t, i) => `  ${i + 1}. ${t.title}${t.type === "deadline" ? " [deadline]" : ""}`).join("\n")
      : "  (none scheduled yet)";

    const subScoreSummary = Object.entries(subScores).length
      ? Object.entries(subScores).map(([k, v]) => `  - ${k}: ${v?.value ?? "n/a"}/100`).join("\n")
      : "  (none)";

    const candidateSummary = candidateRecommendations.length
      ? candidateRecommendations.map((c) => `  - [${c.id}] (${c.factor}): "${c.text}"`).join("\n")
      : "  (none)";

    systemPrompt = `You are Nora, a calm, evidence-based cognitive-performance coach speaking at the start of someone's day. Explain and recommend using ONLY the factors given — never invent facts, scores, or recommendations not present in the data. Warm, patient, never guilt-based language (no "failed", "missed", "should have"). Using ONLY the candidate recommendations given, select the 2-3 most relevant to today's specific numbers and rephrase each in Nora's calm, evidence-based voice, weaving in the actual number/factor. Never invent a recommendation not in the candidate list.`;

    userPrompt = `Morning readiness sub-scores (0-100):
${subScoreSummary}
Sleep debt: ${sleepDebtHours != null ? `${sleepDebtHours}h` : "unknown"}, sleep duration: ${sleepDurationHours != null ? `${sleepDurationHours}h` : "unknown"}
${adaptiveQuestion ? `Today's reflective question: "${adaptiveQuestion.prompt}"\nTheir answer: "${adaptiveQuestion.answer || "(no answer given)"}"` : ""}
${dayPressure?.trim() ? `Today's pressure: "${dayPressure.trim()}"` : ""}
${focusChoices.length ? `Focus intent: ${focusChoices.join(", ")}` : ""}
Tasks today:
${taskSummary}

Candidate recommendations (choose from these only):
${candidateSummary}

Select the 2-3 most relevant candidates for today's specific numbers, and rephrase each in Nora's calm voice, citing the actual number/factor that makes it relevant. Max 20 words each.
Return a JSON array: [{ "id": <candidate id>, "text": <rephrased recommendation> }]. Nothing else.
Example: [{"id":"delay_deep_work","text":"You're carrying about 90 minutes of sleep debt — delay deep work until 10am."}]`;

  } else if (type === "launch_greeting") {
    const {
      firstName = "", timeOfDay = "day", daysSinceLastOpen = null,
      workloadLevel = null, todayTaskCount = 0, yesterdayCompletionPct = null,
      momentumState = null, recoveryLevel = null, sleepContext = null,
      recentGreetings = [],
    } = context;

    const realSignals = [
      daysSinceLastOpen != null ? `- Days since previous visit: ${daysSinceLastOpen}` : null,
      workloadLevel ? `- Today's workload: ${workloadLevel} (${todayTaskCount} scheduled items)` : null,
      yesterdayCompletionPct != null ? `- Yesterday's completion: ${yesterdayCompletionPct}%` : null,
      momentumState && momentumState !== "new" ? `- Recent momentum: ${momentumState}` : null,
      recoveryLevel ? `- Current recovery state: ${recoveryLevel}` : null,
      sleepContext ? `- Sleep context: ${sleepContext}` : null,
    ].filter(Boolean);

    systemPrompt = `You are Nora, a highly capable private AI companion welcoming her owner into the app. Write a calm, elegant two-line arrival greeting. It should feel handcrafted: intelligent, warm, observant, confident, and occasionally dryly witty. Never theatrical, corporate, clingy, or overly motivational. Never use a cliché. Never mention surveillance, tracking, data, scores, or that you are an AI. Use a supplied personal signal only when it makes the welcome more meaningful, and never invent a fact.`;

    userPrompt = `Arrival context:
- First name: ${String(firstName).slice(0, 28) || "(unknown)"}
- Time of day: ${timeOfDay}
${realSignals.length ? realSignals.join("\n") : "- No strong personal signal is available; write an elegant general welcome."}

Recently used greetings to avoid:
${recentGreetings.length ? recentGreetings.slice(-8).map((g) => `- ${String(g).slice(0, 180)}`).join("\n") : "- None"}

Return JSON only:
{"line1":"3-9 words, may naturally use the first name","line2":"5-14 words, adds the interesting thought","category":"classic|observational|reflective|playful|prepared"}

Both lines must work together as one welcome. Do not write only "Hello" or "Welcome back." Do not put quotation marks inside the lines.`;

  } else if (type === "focus_start") {
    const { taskTitle, blockReason, daysDeferred, duration } = context;

    systemPrompt = `You are Nora, a focused productivity coach. One sharp sentence only.`;

    userPrompt = `User is about to start a ${duration ?? 25}-min focus session on: "${taskTitle}".
${blockReason ? `They feel: ${blockReason}` : ""}
${daysDeferred >= 2 ? `This task has been deferred ${daysDeferred} days.` : ""}

Give one short, specific motivational tip for starting THIS task right now.
Max 15 words. No quotes. No explanation. Just the tip.`;

  } else if (type === "focus_complete") {
    const { taskTitle, distractCount, duration } = context;

    systemPrompt = `You are Nora. One sharp, genuine sentence. Never generic.`;

    userPrompt = `User just finished ${duration ?? 25} min on "${taskTitle}" with ${distractCount ?? 0} distraction${distractCount !== 1 ? "s" : ""}.
Give one short, specific, genuine reaction to their performance.
Max 18 words. No quotes. No explanation. Be real, not cheerful-corporate.`;

  } else if (type === "chat_prompts") {
    const { todayTaskCount, todayTasks = [], deferredCount, dayOfWeek, energy, focus } = context;

    const taskList = todayTasks.length
      ? todayTasks.slice(0, 4).map((t) => `"${t.title}"`).join(", ")
      : "no tasks scheduled";

    systemPrompt = `You are Nora, a productivity assistant. Generate 3 short, personalized conversation starters a user would genuinely want to ask their AI planner right now. Make them feel specific and relevant — never generic.`;

    userPrompt = `User's situation right now:
- Today is ${dayOfWeek ?? "today"}
- Tasks today: ${todayTaskCount ?? 0} (${taskList})
- Deferred/pending tasks: ${deferredCount ?? 0}
${energy != null ? `- Energy: ${energy}/10` : ""}
${focus != null ? `- Focus: ${focus}/10` : ""}

Write exactly 3 short questions or requests this user would naturally type to their productivity assistant.
Max 7 words each. Vary the topics: one about planning, one about priorities, one about energy or next steps.
Be specific to their actual task count / task names where helpful.
Return a JSON array of 3 strings only. No explanation.
Example: ["What should I tackle first today?","Help me fit in the math homework","I'm low on energy, what's realistic?"]`;

  } else if (type === "status_coach") {
    const { items = [], noraStateKey, workloadToday, deferredCount, focusPeak, sleepQuality, dayOfWeek, health = null } = context;

    const itemSummary = items.length
      ? items.map((it) => `  - ${it.key}: value=${it.value ?? "n/a"}, prevValue=${it.prevValue ?? "n/a"}, bucket=${it.bucket ?? "n/a"}, topFactor="${it.topFactor ?? "none"}"`).join("\n")
      : "  (none)";

    // Apple Health context is optional (only present once the user connects
    // it) — when present, this is what turns "why is this the value" into a
    // real causal explanation instead of a bucket-keyed template, and lets
    // sentences compare against THIS person's own history, not a generic rule.
    const healthSummary = health ? [
      health.sleepLastNightMinutes != null ? `  - Slept ${health.sleepLastNightMinutes} min last night${health.sleepBaselineMinutes != null ? ` (their own normal is ${health.sleepBaselineMinutes} min)` : ""}, trend: ${health.sleepTrend ?? "unknown"}` : null,
      health.recoveryScore != null ? `  - Recovery: ${health.recoveryLabel ?? ""} (${health.recoveryScore}/100) from HRV/resting heart rate` : null,
      health.activityStepsToday != null ? `  - Activity: ${health.activityStepsToday} steps today${health.activityBaselineSteps != null ? ` (their own normal is ${health.activityBaselineSteps})` : ""}, trend: ${health.activityTrend ?? "unknown"}` : null,
      health.energyScore != null ? `  - Combined Energy Score: ${health.energyScore}/100` : null,
      health.deepWorkBaselinePerDay != null ? `  - Normally completes ${health.deepWorkBaselinePerDay} Deep Work block(s)/day` : null,
      health.bestSleepRangeForFeeling ? `  - Their own history shows they feel best after ${health.bestSleepRangeForFeeling} of sleep` : null,
    ].filter(Boolean).join("\n") : null;

    systemPrompt = `You are Nora, a calm, evidence-based cognitive-performance coach. Explain WHY each number is what it is using ONLY the factors given — never invent facts not present in the data. When multiple factors point the same direction (e.g. short sleep + a high-activity day + several intense Deep Work sessions), weave them into ONE causal explanation instead of listing them separately — say "combined with X and Y, Z makes sense" rather than three disconnected facts. Always compare against the person's OWN baseline/history when given, never a generic population number. Give one recommended action and one realistic estimated improvement per item. Never generic, never guilt-based language (no "failed", "missed", "should have"); always reframe positively. Max 32 words for the explanation, 14 for the action, 10 for the improvement.`;

    userPrompt = `Status page context:
- Day: ${dayOfWeek ?? "today"}
- Overall state: ${noraStateKey ?? "unknown"}
- Workload today: ${workloadToday ?? "unknown"}
- Deferred tasks: ${deferredCount ?? 0}
- Focus peak: ${focusPeak ?? "unknown"}
- Sleep quality: ${sleepQuality ?? "unknown"}
${healthSummary ? `\nApple Health context (this person's real data):\n${healthSummary}\n` : ""}
Items to explain (use item.key as the JSON key in your response):
${itemSummary}

For each item, return { "key": <same key>, "sentence": <why, grounded only in the given factors — synthesize Health + planner factors into one causal read when both are relevant>, "action": <one recommended action>, "improvement": <one realistic estimated improvement, phrased as a positive delta> }.
Return a JSON array of these objects, one per item, same order as given. Nothing else.
Example: [{"key":"mental_battery","sentence":"You walked well beyond your usual step count yesterday on a shorter night than normal, with three intense Deep Work sessions on top — today's lower battery tracks with that.","action":"Take a 12-minute walk before your next focus block.","improvement":"+15% focus"}]`;

  } else if (type === "morning_briefing") {
    // Fires when the Morning Briefing's first screen mounts — BEFORE the user
    // has answered anything, so (unlike "morning" above) this only ever sees
    // real ambient data (HealthKit/recovery/planner), never self-report
    // answers. Enhances (never replaces) morningBriefing.js's heuristic
    // greeting/facts, which already render instantly with zero network wait.
    const {
      healthSummary = null, recoveryState = null, recoveryTrendDeclining3d = false,
      facts = [], dayOfWeek, deferredCount = 0, workloadToday,
    } = context;

    const healthLines = healthSummary ? [
      healthSummary.sleepLastNightMinutes != null ? `  - Slept ${healthSummary.sleepLastNightMinutes} min last night${healthSummary.sleepBaselineMinutes != null ? ` (their own normal is ${healthSummary.sleepBaselineMinutes} min)` : ""}, trend: ${healthSummary.sleepTrend ?? "unknown"}` : null,
      healthSummary.recoveryScore != null ? `  - Recovery: ${healthSummary.recoveryLabel ?? ""} (${healthSummary.recoveryScore}/100)` : null,
      healthSummary.activityStepsToday != null ? `  - Steps yesterday: ${healthSummary.activityStepsToday}${healthSummary.activityBaselineSteps != null ? ` (their own normal is ${healthSummary.activityBaselineSteps})` : ""}` : null,
      healthSummary.energyScore != null ? `  - Combined Energy Score: ${healthSummary.energyScore}/100` : null,
    ].filter(Boolean).join("\n") : null;

    systemPrompt = `You are Atlas, speaking at the very start of someone's day, before they've answered anything. Using ONLY the real data given, write two things — never invent a number or fact not present. Warm, calm, direct, never generic, never guilt-based language (no "failed", "missed", "should have"). Never diagnose, never give medical advice.`;

    userPrompt = `Real data for this morning:
${healthLines ?? "  (Apple Health not connected)"}
Recovery state: ${recoveryState?.level ?? "unknown"}${recoveryState?.desc ? ` — ${recoveryState.desc}` : ""}
Recovery declining 3+ days in a row: ${recoveryTrendDeclining3d ? "yes" : "no"}
Day: ${dayOfWeek ?? "today"}
Deferred tasks: ${deferredCount}
Today's workload: ${workloadToday ?? "unknown"}
Already-computed real facts about this morning:
${facts.length ? facts.map((f) => `  - ${f}`).join("\n") : "  (none)"}

Return JSON: { "greeting": <one warm, specific second line to follow "Good morning." — grounded in the single most notable real signal above, max 16 words>, "analysis": <2-3 sentences explaining WHY the user's body/mind likely feels the way the data suggests today, connecting at least two real factors together when possible, max 45 words> }
Return nothing but that JSON object — no markdown fences, no extra text.`;

  } else {
    return res.status(400).json({ error: "Unknown tip type" });
  }

  // No per-branch override existed before "morning" needed one — number-citing
  // sentences run longer than the other branches' short single-string tips.
  const MAX_TOKENS = { morning: 260, morning_briefing: 180, launch_greeting: 140 }[type] ?? 200;

  try {
    const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userPrompt   },
        ],
        max_tokens: MAX_TOKENS,
        temperature: 0.75,
      }),
    });

    if (!upstream.ok) {
      const err = await upstream.json().catch(() => ({}));
      return res.status(upstream.status).json({ error: err.error?.message ?? "Upstream error" });
    }

    const data = await upstream.json();
    const text = data.choices?.[0]?.message?.content?.trim() ?? "";

    if (type === "chat_prompts") {
      let tips;
      try {
        // Model should return a JSON array; be robust if it wraps in markdown fences
        const cleaned = text.replace(/^```json?\s*/i, "").replace(/```$/, "").trim();
        tips = JSON.parse(cleaned);
        if (!Array.isArray(tips)) throw new Error("not array");
      } catch {
        // Fallback: split by newlines, strip any numbering/bullets
        tips = text
          .split("\n")
          .map(l => l.replace(/^[\d.\-*•]+\s*/, "").replace(/^["']|["']$/g, "").trim())
          .filter(Boolean)
          .slice(0, 3);
      }
      return res.status(200).json({ tips });
    } else if (type === "status_coach") {
      // Structured objects, not plain strings — if parsing fails there's no sensible
      // text-splitting fallback, so return an empty array and let the client's own
      // local heuristic interpretations (already rendered before this call resolves) stand.
      let items = [];
      try {
        const cleaned = text.replace(/^```json?\s*/i, "").replace(/```$/, "").trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) items = parsed.filter((it) => it && typeof it.key === "string");
      } catch {}
      return res.status(200).json({ items });
    } else if (type === "morning") {
      // Structured { id, text } objects — same "no text-splitting fallback"
      // convention as status_coach: an id-keyed object can't be recovered
      // from mangled prose, so a parse failure returns an empty array and
      // the client falls back to its own static candidate recommendations.
      let items = [];
      try {
        const cleaned = text.replace(/^```json?\s*/i, "").replace(/```$/, "").trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed)) items = parsed.filter((it) => it && typeof it.id === "string" && typeof it.text === "string");
      } catch {}
      return res.status(200).json({ items });
    } else if (type === "morning_briefing") {
      // { greeting, analysis } — a parse failure returns both null and the
      // client keeps its own heuristic greeting/analysis (morningBriefing.js),
      // which already rendered before this call resolves.
      let result = { greeting: null, analysis: null };
      try {
        const cleaned = text.replace(/^```json?\s*/i, "").replace(/```$/, "").trim();
        const parsed = JSON.parse(cleaned);
        if (parsed && typeof parsed === "object") {
          result = {
            greeting: typeof parsed.greeting === "string" ? parsed.greeting : null,
            analysis: typeof parsed.analysis === "string" ? parsed.analysis : null,
          };
        }
      } catch {}
      return res.status(200).json(result);
    } else if (type === "launch_greeting") {
      let result = { line1: null, line2: null, category: null };
      try {
        const cleaned = text.replace(/^```json?\s*/i, "").replace(/```$/, "").trim();
        const parsed = JSON.parse(cleaned);
        if (parsed && typeof parsed === "object") {
          result = {
            line1: typeof parsed.line1 === "string" ? parsed.line1 : null,
            line2: typeof parsed.line2 === "string" ? parsed.line2 : null,
            category: typeof parsed.category === "string" ? parsed.category : null,
          };
        }
      } catch {}
      return res.status(200).json(result);
    } else {
      return res.status(200).json({ tip: text.replace(/^["']|["']$/g, "") });
    }
  } catch (err) {
    return internalError(res, err, "tips");
  }
}
