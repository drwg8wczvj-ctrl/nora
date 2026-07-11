import { Sparkles, MessageSquare, Lightbulb } from "lucide-react";

export const AI_HUB_TOOLS = [
  {
    id: "assistant",
    icon: Sparkles,
    titleKey: "aiHub.assistantTitle",
    descKey: "aiHub.assistantDesc",
    status: "available",
  },
  {
    id: "insights",
    icon: Lightbulb,
    titleKey: "aiHub.insightsTitle",
    descKey: "aiHub.insightsDesc",
    status: "available",
  },
  {
    id: "messenger",
    icon: MessageSquare,
    titleKey: "aiHub.messengerTitle",
    descKey: "aiHub.messengerDesc",
    status: "comingSoon",
  },
];
