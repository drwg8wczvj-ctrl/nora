const pad = (n) => String(n).padStart(2, "0");
const fmtTime = (h, m) => `${pad(h)}:${pad(m)}`;

// Pure prompt-text builder shared by Planner's and Atlas's system prompts —
// extracted verbatim from the single "CURRENT WELLNESS" + "SLEEP
// INTELLIGENCE" block that used to live inline in App.js's buildSystem(),
// so both personas read the exact same wellness snapshot.
export function buildWellbeingStateBlock({
  energy, relaxation, focus, motivation, metricHistory, userConfidence, sleepState, todaySleepQuality,
}) {
  return `━━━ CURRENT WELLNESS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Energy ${energy}/10 · Stress relief ${relaxation}/10 · Focus ${focus}/10 · Motivation ${motivation}/10
(Values shown are live. A value is only "recorded" after holding steady for 25 minutes.)
${(() => {
  const LABELS = { energy: "Energy", stress: "Stress relief", focus: "Focus", motivation: "Motivation" };
  const recent = metricHistory.filter(e => Date.now() - new Date(e.at).getTime() < 6 * 60 * 60 * 1000);
  if (!recent.length) return "";
  const lines = recent.map(e => {
    const min = Math.round((Date.now() - new Date(e.at).getTime()) / 60000);
    const ago = min < 60 ? `${min}m ago` : `${Math.round(min / 60)}h ago`;
    return `  • ${LABELS[e.key] ?? e.key}: ${e.from} → ${e.to} ${e.to > e.from ? "↑" : "↓"}  (committed ${ago})`;
  }).join("\n");
  return `\nConfirmed status shifts today (each held ≥25 min):\n${lines}`;
})()}
Confidence: ${userConfidence.label}
→ ${
    relaxation <= 2 && energy <= 2
      ? "Severely stressed and exhausted. Lead with empathy — 1 sentence. Don't add tasks. Offer to lighten the day."
    : relaxation <= 3 && energy <= 3
      ? "Very low. Keep it to one essential task. No pressure, no lists."
    : relaxation <= 3
      ? "Stressed. Suggest the single smallest next step. Nothing more."
    : energy <= 3
      ? "Low energy. Defer anything non-critical. One task, then rest."
    : relaxation >= 8 && energy >= 8
      ? "Peak state. Ideal moment for the hardest, most important work."
    : relaxation >= 6 && energy >= 6
      ? "Good state. Steady blocks. No need for extra encouragement."
    : "Moderate. One task at a time. Don't overload."
  }

━━━ SLEEP INTELLIGENCE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Sleep Pressure: ${sleepState.pressure} · Tonight's Risk: ${sleepState.tonightRisk}
Late tasks tonight (after 20:00): ${sleepState.tonightTasks.length > 0 ? sleepState.tonightTasks.map((t) => `"${t.title}" at ${fmtTime(t.startHour, t.startMinute ?? 0)}`).join(", ") : "none"}
Late-work pattern: ${sleepState.hasLatePattern ? `Yes — ${sleepState.lateNights}/7 recent nights had late tasks.` : "No concerning pattern"}
Sleep quality today: ${todaySleepQuality ?? "not reported"}

Sleep-aware planning rules:
• Avoid heavy cognitive tasks after 21:00 unless a deadline urgently requires it.
• Sleep Pressure = High → actively suggest moving evening tasks to tomorrow before adding more.
• Tonight's Risk = Late Work Risk → warn once and offer to trim/reschedule.
• Late-work pattern detected → mention it once, calmly. Never repeat it in the same conversation.
• Tone: "Tonight may need protecting" / "This could affect recovery" / "Let's reduce late pressure." Never: "You should sleep earlier" / "This is unhealthy."
• When real obligations exist (exam, deadline): respect them — suggest the minimum viable late workload only.`;
}
