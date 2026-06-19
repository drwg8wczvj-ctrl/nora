export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "API key not configured" });

  const { type, context = {} } = req.body ?? {};

  let systemPrompt = "";
  let userPrompt   = "";

  if (type === "morning") {
    const {
      readinessLabel, readinessPct,
      sleepQuality, sleepDuration,
      energyScore, restedScore, clarityScore,
      dayPressure, focusChoices = [],
      tasks = [],
    } = context;

    const taskSummary = tasks.length
      ? tasks.slice(0, 5).map((t, i) => `  ${i + 1}. ${t.title}${t.type === "deadline" ? " [deadline]" : ""}`).join("\n")
      : "  (none scheduled yet)";

    systemPrompt = `You are Nora, a concise, insightful personal productivity coach.
You give short, hyper-specific, actionable advice — never generic platitudes.
You know the user's actual data and reference it directly.`;

    userPrompt = `Morning check-in data:
- Readiness: ${readinessLabel ?? "Moderate"} (${readinessPct ?? 50}%)
- Sleep: ${sleepQuality ?? "unknown"}${sleepDuration != null ? `, ${sleepDuration.toFixed(1)}h` : ""}
- Energy: ${energyScore ?? "?"}/10, Rested: ${restedScore ?? "?"}/10, Clarity: ${clarityScore ?? "?"}/10
${dayPressure?.trim() ? `- Today's pressure: "${dayPressure.trim()}"` : ""}
${focusChoices.length ? `- Focus intent: ${focusChoices.join(", ")}` : ""}
- Tasks today:
${taskSummary}

Give exactly 3 short, specific tips for THIS person's day — not generic advice.
Reference their actual scores or tasks where relevant.
Each tip: max 12 words, imperative sentence, no bullet symbols, no numbering.
Return a JSON array of 3 strings. Nothing else.
Example: ["Start with task 2 — it fits your current clarity","Take a break before 14:00 to protect energy","Keep today's sessions under 45 minutes"]`;

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

  } else {
    return res.status(400).json({ error: "Unknown tip type" });
  }

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
        max_tokens: 200,
        temperature: 0.75,
      }),
    });

    if (!upstream.ok) {
      const err = await upstream.json().catch(() => ({}));
      return res.status(upstream.status).json({ error: err.error?.message ?? "Upstream error" });
    }

    const data = await upstream.json();
    const text = data.choices?.[0]?.message?.content?.trim() ?? "";

    if (type === "morning" || type === "chat_prompts") {
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
    } else {
      return res.status(200).json({ tip: text.replace(/^["']|["']$/g, "") });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message ?? "Failed to generate tips" });
  }
}