const OpenAI = require("openai");
const { createClient } = require("@supabase/supabase-js");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const supabase = createClient(
  process.env.REACT_APP_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const today = () => new Date().toISOString().split("T")[0];

const SYSTEM_PROMPT = `You are NORA's intelligence extraction engine. Analyze the provided text and extract all actionable items a user would want to add to their personal planner.

The text may be in ANY language (English, German, Russian, Ukrainian, French, Spanish, etc.). Understand it fully, then return the JSON fields ALWAYS in English regardless of the input language.

Look for:
- Restaurant / dinner reservations
- Flight or train bookings and travel plans
- Doctor, dentist, or appointment confirmations
- Meetings, calls, or video conferences
- Deadlines, due dates, or submission dates
- Package deliveries and tracking updates
- Event tickets (concerts, sports, shows)
- Hotel or accommodation bookings
- Reminders and follow-up requests
- Tasks or to-dos mentioned by the sender

For each item return a JSON object with exactly these fields:
{
  "type": "event" | "task" | "travel" | "reservation" | "deadline" | "delivery" | "reminder",
  "title": "Clear concise title in English, under 60 chars",
  "ai_summary": "I found a [description] — first-person, warm, specific, in English. Max 110 chars.",
  "date": "YYYY-MM-DD or null",
  "time": "HH:MM 24h or null",
  "end_time": "HH:MM 24h or null",
  "location": "place name / address or null",
  "urgency": "low" | "normal" | "high" | "urgent",
  "confidence": 0.0–1.0,
  "extra": {}
}

Put any bonus info (flight numbers, booking refs, confirmation codes, attendees) in "extra".

Return ONLY a raw JSON array — no markdown, no wrapper object. Example: [{"type":"event",...}]
Include only items where confidence >= 0.65.
If nothing actionable: return []

Today is ${today()}.`;

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const {
    message,
    userId,
    sourceType = "manual",
    sourceId = null,
    senderName = null,
    sourceAccountId = null,
  } = req.body ?? {};

  if (!message?.trim()) return res.status(400).json({ error: "message required" });
  if (!userId) return res.status(400).json({ error: "userId required" });

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: message.slice(0, 8000) },
      ],
      temperature: 0.1,
      max_tokens: 1200,
    });

    let extracted = [];
    try {
      const raw = completion.choices[0].message.content.trim();
      const cleaned = raw.startsWith("```") ? raw.replace(/```json?\n?/g, "").replace(/```/g, "").trim() : raw;
      extracted = JSON.parse(cleaned);
      if (!Array.isArray(extracted)) extracted = extracted.suggestions ?? extracted.items ?? [];
    } catch {
      extracted = [];
    }

    const rows = extracted
      .filter((s) => s && typeof s === "object" && s.confidence >= 0.65 && s.title && s.ai_summary)
      .map((s) => ({
        user_id: userId,
        source_type: sourceType,
        source_account_id: sourceAccountId,
        source_id: sourceId,
        raw_excerpt: message.slice(0, 500),
        sender_name: senderName ?? null,
        ai_summary: String(s.ai_summary).slice(0, 200),
        suggestion_type: s.type ?? "event",
        title: String(s.title).slice(0, 120),
        description: s.description ?? null,
        date: s.date ?? null,
        time: s.time ?? null,
        end_time: s.end_time ?? null,
        location: s.location ?? null,
        urgency: s.urgency ?? "normal",
        confidence: Math.min(1, Math.max(0, Number(s.confidence) || 0.8)),
        extra: s.extra ?? {},
        status: "pending",
      }));

    if (rows.length > 0) {
      // Supabase can't use a partial unique index with onConflict — do manual dedup instead.
      const idsToCheck = rows.filter(r => r.source_id != null).map(r => r.source_id);
      let alreadySaved = new Set();
      if (idsToCheck.length > 0) {
        const { data: existing } = await supabase
          .from("nora_suggestions")
          .select("source_id")
          .eq("user_id", userId)
          .eq("source_type", sourceType)
          .in("source_id", idsToCheck);
        if (existing) existing.forEach(r => alreadySaved.add(r.source_id));
      }
      const fresh = rows.filter(r => r.source_id == null || !alreadySaved.has(r.source_id));
      if (fresh.length > 0) {
        const { error: dbErr } = await supabase.from("nora_suggestions").insert(fresh);
        if (dbErr) throw new Error(`DB insert failed: ${dbErr.message}`);
      }
    }

    return res.status(200).json({ suggestions: rows, count: rows.length });
  } catch (err) {
    console.error("[intelligence-extract]", err);
    return res.status(500).json({ error: "Extraction failed", detail: err.message });
  }
};
