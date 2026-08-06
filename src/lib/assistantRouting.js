export const ASSISTANT_DOMAINS = {
  NORA: "nora",
  ATLAS: "atlas",
  SHARED: "shared",
};

export const ATLAS_SESSION_TYPES = {
  MOTORSPORT: "motorsport",
  CAREER: "career",
  COMMUNICATION: "communication",
  LEARNING: "learning",
  WELLBEING: "wellbeing",
  GENERAL: "general",
};

export const ATLAS_SESSION_TEMPLATES = {
  motorsport: "Clarify the role and race context → assess current knowledge → teach one practical framework → rehearse observations/questions → produce preparation actions.",
  career: "Clarify the opportunity → identify the value the user wants to build → assess gaps → practise the next real interaction → produce career actions.",
  communication: "Define the audience and desired outcome → review the current message or approach → practise/refine it → produce communication actions.",
  learning: "Define the performance target → assess starting knowledge → teach the smallest useful concept → practise retrieval/application → produce study actions.",
  wellbeing: "Understand what is happening → use available personal context → identify one helpful adjustment → agree on a small next action.",
  general: "Clarify the desired outcome → assess the current situation → work through the most useful exercise → produce concrete next actions.",
};

const ATLAS_PATTERNS = [
  /\b(motorsport|karting|race engineer|driver coach(?:ing)?|telemetry|chassis setup)\b/i,
  /\b(career advice|career strategy|mentor(?:ing)?|networking practice|interview practice)\b/i,
  /\b(train me|coach me|teach me|help me learn|prepare me for)\b/i,
  /\b(confidence|motivation|discipline|personal development|reflect(?:ion)?|stress|burn(?:ed|t)? out|overwhelm(?:ed)?)\b/i,
];

const NORA_PATTERNS = [
  /\b(schedule|calendar|planner|time block|reschedule|move .* to|deadline)\b/i,
  /\b(add|create|complete|delete)\b.{0,24}\btask\b/i,
  /\b(plan my (?:day|week|month)|what should i do (?:today|tomorrow))\b/i,
];

export function classifyAssistantDomain(text = "") {
  const atlas = ATLAS_PATTERNS.some((pattern) => pattern.test(text));
  const nora = NORA_PATTERNS.some((pattern) => pattern.test(text));
  if (atlas && nora) return ASSISTANT_DOMAINS.SHARED;
  if (atlas) return ASSISTANT_DOMAINS.ATLAS;
  return ASSISTANT_DOMAINS.NORA;
}

export function buildAtlasHandoffContext({
  title,
  objective,
  context,
  goals = [],
  deadline = null,
  suggestedMinutes = 30,
  proposedSlot = null,
  sessionType = ATLAS_SESSION_TYPES.GENERAL,
  sourceConversationId = null,
} = {}) {
  const normalizedSessionType = Object.values(ATLAS_SESSION_TYPES).includes(sessionType)
    ? sessionType
    : ATLAS_SESSION_TYPES.GENERAL;
  return {
    version: 1,
    source: "nora",
    destination: "atlas",
    title: title?.trim() || "Focused training session",
    objective: objective?.trim() || "Help the user prepare effectively.",
    context: context?.trim() || "",
    goals: goals.map((goal) => String(goal).trim()).filter(Boolean).slice(0, 6),
    deadline: deadline || null,
    suggestedMinutes: Math.max(10, Math.min(Number(suggestedMinutes) || 30, 120)),
    proposedSlot: proposedSlot || null,
    sessionType: normalizedSessionType,
    sourceConversationId: sourceConversationId || null,
  };
}

export function atlasHandoffToPrompt(handoff) {
  const lines = [
    `[Nora handoff: ${handoff.title}]`,
    `Session type: ${handoff.sessionType ?? ATLAS_SESSION_TYPES.GENERAL}`,
    `Objective: ${handoff.objective}`,
  ];
  if (handoff.context) lines.push(`Context: ${handoff.context}`);
  if (handoff.goals?.length) lines.push(`Goals:\n${handoff.goals.map((goal) => `- ${goal}`).join("\n")}`);
  if (handoff.deadline) lines.push(`Relevant date or deadline: ${handoff.deadline}`);
  if (handoff.sourceConversationId) lines.push(`Return-to-Nora conversation: ${handoff.sourceConversationId}`);
  lines.push(
    `Run this as a focused ${handoff.suggestedMinutes}-minute Atlas session.`,
    `Session structure: ${ATLAS_SESSION_TEMPLATES[handoff.sessionType] ?? ATLAS_SESSION_TEMPLATES.general}`,
    "Start by acknowledging the context from Nora, then ask the single most useful first question. Do not repeat the whole brief.",
    "When the session produces concrete next actions, use return_plan_to_nora so the user can send them back for scheduling.",
  );
  return lines.join("\n\n");
}

export function buildRoutingPromptHint(text = "") {
  const domain = classifyAssistantDomain(text);
  if (domain === ASSISTANT_DOMAINS.ATLAS) {
    return "Routing signal: this request is primarily specialist coaching/training. Nora should organize only the calendar implications and offer a focused Atlas handoff for the expertise.";
  }
  if (domain === ASSISTANT_DOMAINS.SHARED) {
    return "Routing signal: this request combines scheduling with specialist coaching. Nora owns dates, dependencies, and workload; Atlas owns how the user should train, learn, prepare, or develop.";
  }
  return "Routing signal: this request is primarily planning/execution and belongs with Nora.";
}

export function atlasPlanToNoraPrompt(plan = {}) {
  const actions = (plan.actionItems ?? []).map((item, index) => [
    `${index + 1}. ${item.title}`,
    `Suggested duration: ${item.duration} minutes`,
    item.preferredTiming ? `Timing: ${item.preferredTiming}` : null,
    item.deadline ? `Deadline: ${item.deadline}` : null,
    `Purpose: ${item.notes}`,
  ].filter(Boolean).join(" · ")).join("\n");

  return `[Atlas returned an action plan: ${plan.title ?? "Focused session"}]
${plan.summary ?? ""}

Actions:
${actions}

Turn these actions into realistic calendar blocks. Use the user's current schedule, workload, dependencies, and any stated deadlines. Create the task tool calls now so they appear as a proposal Planboard; do not claim they are scheduled until the user approves the proposal.`;
}
