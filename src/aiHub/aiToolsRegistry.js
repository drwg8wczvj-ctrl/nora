import { MessageSquare, Lightbulb, HeartHandshake } from "lucide-react";
import BrandStar from "../components/BrandStar";

const NoraToolIcon = ({ size = 20 }) => <BrandStar size={size} tone="current" />;

export const AI_HUB_TOOLS = [
  {
    id: "assistant",
    icon: NoraToolIcon,
    titleKey: "aiHub.assistantTitle",
    descKey: "aiHub.assistantDesc",
    status: "available",
  },
  {
    id: "atlas",
    icon: HeartHandshake,
    titleKey: "aiHub.atlasTitle",
    descKey: "aiHub.atlasDesc",
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
