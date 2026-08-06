import React, { lazy, Suspense, useState, useMemo, useRef, useEffect } from "react";
import { App as CapacitorApp } from "@capacitor/app";
import { supabase } from "./lib/supabase";
import {
  loadUserData, saveUserData,
  getUserPreferences, saveUserPreferences,
  saveMorningCheckup, loadTodayCheckup, testServerPush,
  uploadGeneratedFile,
} from "./lib/noraApi";
import { useConversationEngine } from "./conversation/useConversationEngine";
import { MessagePartsList } from "./conversation/MessagePart";
import ConversationMessage from "./conversation/ConversationMessage";
import {
  textPart,
  fileAttachmentPart,
  assistantHandoffPart,
  scheduleProposalPart,
  atlasReturnPlanPart,
  partsToPreviewText,
} from "./conversation/messageParts";
import { buildToolConfirmationPart } from "./conversation/toolConfirmation";
import { generateFileBlob, sizeLabel } from "./conversation/fileGeneration";
import ConversationSidebar from "./conversation/ConversationList";
import {
  AssistantChatComposer,
  AssistantComposerMenu,
  AssistantChatHeader,
} from "./components/mobile/AssistantChatUI";
import {
  NativeButton,
  NativeDialog,
  NativeIconButton,
  NativeSegmentedControl,
  NativeSwitch,
} from "./components/ui/NativeUI";
import AuthScreen from "./AuthScreen";
const MobileApp = lazy(() => import("./MobileApp"));
import MorningCheckup, { computeReadiness } from "./MorningCheckup";
const NoraObservations = lazy(() => import("./NoraObservations"));
const FocusSession = lazy(() => import("./FocusSession"));
const Whiteboard = lazy(() => import("./Whiteboard"));
import PWABanners from "./PWABanners";
import { useMobile } from "./hooks/useMobile";
import { useAuthSession } from "./hooks/useAuthSession";
import { usePersistentState } from "./hooks/usePersistentState";
import { AppLoadingScreen } from "./app/AppLoadingScreen";
import { useNotifications } from "./hooks/useNotifications";
import { useAssistantMode } from "./hooks/useAssistantMode";
import { useHealthKit } from "./hooks/useHealthKit";
import HealthSettings from "./components/HealthSettings";
import { buildHealthPromptContext } from "./lib/healthPromptContext";
import { apiFetch } from "./lib/apiBase";
import { buildWellbeingStateBlock } from "./lib/wellbeingPromptBlock";
import { createJourney, applyJourneyUpdate, applyMilestoneUpdate } from "./lib/journeys";
import { CONVERSATION_STYLE_GUIDE } from "./lib/aiConversationStyle";
import {
  atlasHandoffToPrompt,
  atlasPlanToNoraPrompt,
  buildAtlasHandoffContext,
  buildRoutingPromptHint,
} from "./lib/assistantRouting";
import { shouldPreviewPlannerOperations } from "./lib/plannerTransactions";
import { DesktopAtlasChat } from "./aiHub/AtlasChat";
import "./AtlasChat.css";
import NotificationPermissionBanner from "./components/NotificationPermissionBanner";
import NotificationSettings from "./components/NotificationSettings";
import ShareModal from "./components/ShareModal";
import { syncWidgetData, getPendingWidgetActions } from "./lib/noraWidgetBridge";
import JoinCodeModal from "./components/JoinCodeModal";
import UsernameOnboarding from "./components/UsernameOnboarding";
import UsernameNudgeBanner from "./components/UsernameNudgeBanner";
import ProfileModal from "./components/ProfileModal";
import AvatarDisplay, { profileToAvatar } from "./components/AvatarDisplay";
import {
  getMySharedObjects, updateSharedObject,
  subscribeToSharedObject, subscribeToCollaboratorInvites,
  getCollaborators, getMyProfile, joinByCode, getSharedObject,
  deleteSharedObject, removeCollaborator,
} from "./lib/sharingApi";
import {
  Plus, Check, ChevronLeft, ChevronRight, CalendarDays,
  Clock, MessageSquare, X, FileText, Trash2,
  Menu, Settings, User, ChevronDown, RotateCcw, List, Layers,
  Flag, Coffee, Bell,
  Activity, Zap,
  ZoomIn, ZoomOut,
  Brain, Target,
  Pencil, SkipForward,
  Share2, Users, Search, Filter, ArrowUpDown, KeyRound,
  MapPin, Navigation, Car, Bus, Bike, PersonStanding,
} from "lucide-react";
import { computeTravelBlocks, describeTravelBlock, estimateTravelMinutes, fetchTravelMinutes, getModeLabel, findNearbyPlace } from "./location";
import LocationField from "./components/LocationField";
import SavedPlacesManager from "./components/SavedPlacesManager";
import BrandStar, { BrandLockup } from "./components/BrandStar";
import { extractJoinInviteCode } from "./utils/sharingIntent";
import NoteCard from "./components/NoteCard";
import NoteEditor, { NOTE_TYPE_DEFS, migrateNote } from "./components/NoteEditor";
const PricingModal = lazy(() => import("./components/PricingModal"));
import "./App.css";
import "./glass.css";
import "./theme.css";
import { useTranslation } from "react-i18next";
import { useIntelligence } from "./intelligence/useIntelligence";
import ProactiveOverlay from "./intelligence/ProactiveOverlay";
import SuggestionCenter from "./intelligence/SuggestionCenter";
import IntelligenceOnboarding from "./intelligence/IntelligenceOnboarding";
import "./intelligence/intelligence.css";
import AIHub from "./aiHub/AIHub";
import { DesktopToolComingSoon } from "./aiHub/AIToolComingSoon";
import { AI_HUB_TOOLS } from "./aiHub/aiToolsRegistry";
import "./aiHub/AIHub.css";
import { useStatusEngine } from "./statusEngine/useStatusEngine";
import StatusPage from "./status/StatusPage";
import { buildWorkMindProps } from "./status/buildStatusProps";
import "./status/StatusPage.css";
import LaunchSplash from "./LaunchSplash";
import {
  buildLaunchGreeting,
  getRecentLaunchGreetingTexts,
  recordAppOpen,
  storePreparedLaunchGreeting,
  takePreparedLaunchGreeting,
} from "./statusEngine/launchGreeting";
import { useTaskDomain } from "./domain/tasks/useTaskDomain";
import { isRepeatMatch } from "./domain/tasks/taskRecurrence";
import { buildOccupiedBlocksContext } from "./domain/tasks/taskSelectors";
import { executeTaskTool } from "./domain/tasks/taskAiTools";

// Cold-launch signature moment plays exactly once per real app process —
// a plain module-level flag, not React state persisted anywhere, so it
// resets only on an actual reload/relaunch (this module re-evaluates from
// scratch) and never on backgrounding/foregrounding (which reuses the same
// already-loaded JS engine and never re-imports this file).
let hasShownLaunchSplashThisProcess = false;

// ── Constants ──────────────────────────────────────────
const COMPLEXITY = {
  easy:   { label: "Easy",   color: "#22c55e" },
  medium: { label: "Medium", color: "#f59e0b" },
  hard:   { label: "Hard",   color: "#ef4444" },
};

const REMINDER_PRESETS = [3, 5, 10, 15];

const DEFAULT_GROUPS = [
  { id: "private", name: "Private", color: "#8b5cf6" },
  { id: "work",    name: "Work",    color: "#3b82f6" },
];

const WEEKDAY_SHORT = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const HOURS  = Array.from({ length: 24 }, (_, i) => i);
const HOUR_H = 56; // px per hour in Apple-calendar style grid
const LABEL_W = 60; // px for time label column

const calcTop = (hour, minute, hh = HOUR_H) => (hour - HOURS[0]) * hh + (minute / 60) * hh;

// ── Chat inline autocomplete ──────────────────────────
const CHAT_SUGGESTIONS = [
  "Plan my day for today",
  "Plan my week ahead",
  "Plan my morning routine",
  "Plan my study sessions for",
  "Plan a productive evening",
  "What should I focus on right now?",
  "What should I work on next?",
  "What's my most important task today?",
  "What can I do with 30 minutes?",
  "What can I do with 1 hour?",
  "What's the best time for deep work?",
  "What's keeping me from being productive?",
  "How's my week looking?",
  "How is my workload this week?",
  "How am I doing this week?",
  "How many tasks do I have today?",
  "Help me prioritize today",
  "Help me reschedule my tasks this week",
  "Help me rebalance my schedule",
  "Help me break down this task into steps",
  "Help me find time for",
  "Help me start this task",
  "Help me plan for next week",
  "I'm feeling overwhelmed, can you help?",
  "I'm feeling stressed today",
  "I'm having trouble focusing",
  "I have no energy today, what should I do?",
  "I don't know where to start",
  "I need to prepare for",
  "I want to be more productive",
  "Add a task for tomorrow",
  "Add a break to my afternoon",
  "Move my tasks to a lighter day",
  "Reschedule my tasks for this week",
  "Schedule my most important task for today",
  "Schedule a study session for",
  "Rebalance my schedule this week",
  "Show me my workload for the week",
  "Can you prioritize my tasks for today?",
  "Can you help me plan today?",
];

// Returns a single inline completion (ghost text)
const getChatGhost = (input) => {
  if (!input || input.length < 2) return "";
  const lc = input.toLowerCase();
  // 1. Exact prefix match
  for (const s of CHAT_SUGGESTIONS) {
    if (s.toLowerCase().startsWith(lc) && s.length > input.length) {
      return s.slice(input.length);
    }
  }
  // 2. Mid-word match: typed word appears as the start of a word inside a suggestion
  const words = lc.trim().split(/\s+/);
  if (words.length >= 2) {
    const lastWord = words[words.length - 1];
    if (lastWord.length >= 2) {
      for (const s of CHAT_SUGGESTIONS) {
        const slc = s.toLowerCase();
        const idx = slc.indexOf(" " + lastWord);
        if (idx !== -1) {
          // User has typed up to a word mid-sentence — suggest the rest
          const fullStart = slc.lastIndexOf(lc.slice(0, lc.lastIndexOf(lastWord)).trim());
          if (fullStart !== -1) return s.slice(input.length);
        }
      }
    }
  }
  return "";
};

// Returns alternative suggestions (chips) — excludes the ghost suggestion
// Default suggestions shown when the chat input is empty / very short
const DEFAULT_CHAT_CHIPS = [
  "How's my week looking?",
  "Plan my day for today",
  "What should I focus on?",
  "Help me prioritize today",
  "Rebalance my schedule",
  "I'm feeling overwhelmed",
  "Add a break this afternoon",
  "What can I do in 30 min?",
];

const getChatAlternatives = (input, ghost) => {
  if (!input || input.trim().length < 2) return DEFAULT_CHAT_CHIPS;
  const lc = input.toLowerCase();
  const ghostFull = input + ghost;
  return CHAT_SUGGESTIONS
    .filter((s) => s.toLowerCase().startsWith(lc) && s !== ghostFull && s.length > input.length)
    .slice(0, 6);
};

// Note palette moved to NoteEditor.js (migrateNote, NOTE_TYPE_DEFS, NOTE_COLORS)

// ── Helpers ────────────────────────────────────────────
const uid      = () => Math.random().toString(36).slice(2);
const pad      = (n) => String(n).padStart(2, "0");
const fmtDate  = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const todayStr = () => fmtDate(new Date());

const addDays = (dateStr, n) => {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d;
};

const fmtTime      = (h, m) => `${pad(h)}:${pad(m)}`;
const fmtTimeShort = (h, m) => m === 0 ? `${pad(h)}:00` : `${pad(h)}:${pad(m)}`;
const fmtHourLabel = (h)    => `${pad(h)}:00`;

const fmtDur = (min) => {
  if (!min) return "";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60), m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${m}m`;
};

const shortTitle = (title) => {
  if (!title) return "";
  const words = title.trim().split(/\s+/);
  return words.length <= 3 ? title : words.slice(0, 3).join(" ") + "…";
};

const prettyDate = (dateStr) => {
  const today = todayStr();
  if (dateStr === today)                        return "Today";
  if (dateStr === fmtDate(addDays(today, -1))) return "Yesterday";
  if (dateStr === fmtDate(addDays(today,  1))) return "Tomorrow";
  const d = new Date(dateStr + "T00:00:00");
  return `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

const getMonthDays = (dateStr) => {
  const d     = new Date(dateStr + "T00:00:00");
  const y     = d.getFullYear(), m = d.getMonth();
  const first = new Date(y, m, 1);
  const last  = new Date(y, m + 1, 0);
  const startPad = first.getDay() === 0 ? 6 : first.getDay() - 1;
  const days = [];
  for (let i = startPad - 1; i >= 0; i--)
    days.push({ date: fmtDate(new Date(y, m, -i)), inMonth: false });
  for (let i = 1; i <= last.getDate(); i++)
    days.push({ date: fmtDate(new Date(y, m, i)), inMonth: true });
  const end = days.length % 7 === 0 ? 0 : 7 - (days.length % 7);
  for (let i = 1; i <= end; i++)
    days.push({ date: fmtDate(new Date(y, m + 1, i)), inMonth: false });
  return days;
};

const shiftMonth = (dateStr, n) => {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + n, 1);
  return fmtDate(d);
};

// Shared by both personas — generates a real downloadable file (attached to
// the conversation as a file_attachment part) instead of just describing
// one. Kept outside AI_TOOLS/ATLAS_TOOLS's own literals so it isn't
// duplicated between them.
const GENERATE_FILE_TOOL = {
  type: "function",
  function: {
    name: "generate_file",
    description: "Generate a real, downloadable file and attach it to this conversation. Use when the user asks for a document, spreadsheet, PDF, presentation, checklist export, or plain-text/markdown/CSV file — never just describe file contents in the chat when the user actually wants a file.",
    parameters: {
      type: "object",
      properties: {
        format:   { type: "string", enum: ["xlsx","pdf","pptx","csv","md","txt"], description: "xlsx=spreadsheet, pdf=PDF, pptx=presentation, csv=comma-separated table, md=Markdown, txt=plain text. Use md or pdf for a Word-document-style request — real .docx export isn't available yet." },
        filename: { type: "string", description: "Filename without extension, e.g. 'Weekly Study Plan'." },
        title:    { type: "string", description: "Document/sheet/presentation title (shown inside the file)." },
        textContent: { type: "string", description: "For pdf/md/txt — the body content. Separate paragraphs with a blank line. Use **bold** where useful." },
        tableHeaders: { type: "array", items: { type: "string" }, description: "For xlsx/csv — column headers." },
        tableRows:    { type: "array", items: { type: "array", items: { type: "string" } }, description: "For xlsx/csv — one array of cell values per row, same length/order as tableHeaders." },
        slides: {
          type: "array",
          description: "For pptx — one entry per slide.",
          items: { type: "object", properties: { heading: { type: "string" }, body: { type: "string" } }, required: ["heading"] },
        },
      },
      required: ["format", "filename"],
    },
  },
};

const HANDOFF_TO_ATLAS_TOOL = {
  type: "function",
  function: {
    name: "handoff_to_atlas",
    description: "Offer a focused Atlas session when a request needs specialist coaching, training, learning, career development, reflection, or wellbeing support. Nora keeps ownership of scheduling. Call once per genuinely distinct specialist topic, never for ordinary calendar work.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short session title, e.g. 'ROK race preparation'." },
        objective: { type: "string", description: "One sentence describing what the user should leave the Atlas session able to do." },
        context: { type: "string", description: "Compact factual brief Atlas needs. Do not include the entire conversation." },
        goals: { type: "array", items: { type: "string" }, description: "Up to six concrete outcomes or questions for Atlas." },
        deadline: { type: "string", description: "Relevant YYYY-MM-DD date, when known." },
        suggestedMinutes: { type: "number", description: "Suggested focused-session duration, normally 20-45 minutes." },
        sessionType: { type: "string", enum: ["motorsport","career","communication","learning","wellbeing","general"], description: "The focused Atlas session template to use." },
      },
      required: ["title", "objective", "context"],
    },
  },
};

const AI_TOOLS = [
  {
    type: "function",
    function: {
      name: "add_task",
      description: "Create one calendar item. For plans, call this once per item — tasks, breaks, AND the deadline itself. Never group everything into one call.",
      parameters: {
        type: "object",
        properties: {
          title:       { type: "string" },
          date:        { type: "string",  description: "YYYY-MM-DD" },
          type:        { type: "string",  enum: ["task","deadline","break"], description: "REQUIRED: 'task' for work/study items, 'deadline' for fixed external events (exam day, submission), 'break' for rest/recovery blocks." },
          startHour:   { type: "number",  description: "0-23, omit for unscheduled" },
          startMinute: { type: "number",  description: "0-55 in 5-min steps" },
          duration:    { type: "number",  description: "Duration in minutes, e.g. 30, 60" },
          repeat:      { type: "string",  enum: ["daily","weekly","monthly"], description: "Repeat frequency" },
          complexity:  { type: "string",  enum: ["easy","medium","hard"] },
          groupId:     { type: "string",  description: "private | work | custom id" },
          notes:          { type: "string" },
          reminderOffset: { type: "number", enum: [3, 5, 10, 15], description: "Minutes before start to send reminder." },
        },
        required: ["title","date","type"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_task",
      description: "Move or reschedule an existing task to a different date and/or time. Use this — not add_task — whenever the user wants to move, reschedule, or postpone a task that already exists.",
      parameters: {
        type: "object",
        properties: {
          taskId:      { type: "string" },
          date:        { type: "string", description: "YYYY-MM-DD" },
          startHour:   { type: "number" },
          startMinute: { type: "number" },
        },
        required: ["taskId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "complete_task",
      description: "Mark a task complete or incomplete.",
      parameters: {
        type: "object",
        properties: {
          taskId:    { type: "string" },
          completed: { type: "boolean", description: "Default true" },
        },
        required: ["taskId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_task",
      description: "Permanently delete a task.",
      parameters: {
        type: "object",
        properties: { taskId: { type: "string" } },
        required: ["taskId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_insight",
      description: "Save a coaching insight about the user that should persist across sessions to improve future planning. Call this when you learn something meaningful about how the user works, their recurring goals, preferred times, stress patterns, or important commitments.",
      parameters: {
        type: "object",
        properties: {
          key:   { type: "string", description: "Insight category — e.g. 'preferred_study_time', 'recurring_goal', 'stress_trigger', 'training_schedule', 'focus_window', 'typical_session_length', 'avoidance_pattern'" },
          value: { type: "string", description: "The insight value — be specific and useful for future planning" },
          note:  { type: "string", description: "Brief reason why this matters for future planning (optional)" },
        },
        required: ["key", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_whiteboard",
      description: "Create a new project whiteboard with blocks and connections. Use when the user asks to plan, map out, visually organise, or brainstorm a project. Auto-layout positions if not specified.",
      parameters: {
        type: "object",
        properties: {
          title:   { type: "string", description: "Board name" },
          blocks: {
            type: "array",
            description: "Blocks to add. Positions are auto-calculated if omitted.",
            items: {
              type: "object",
              properties: {
                type:    { type: "string", enum: ["goal","idea","task_group","deadline","milestone","note","decision"] },
                title:   { type: "string" },
                content: { type: "string", description: "Optional notes/description" },
                dueDate: { type: "string", description: "YYYY-MM-DD, only for deadline blocks" },
              },
              required: ["type","title"],
            },
          },
          connections: {
            type: "array",
            description: "Connections between blocks using 0-based indices into the blocks array",
            items: {
              type: "object",
              properties: {
                from: { type: "number" },
                to:   { type: "number" },
              },
            },
          },
        },
        required: ["title","blocks"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_nearby_place",
      description: "Search for the nearest real-world location of a given type (grocery store, pharmacy, cafe, gym, bakery, etc.) near one of the user's saved places. Returns the actual name, address, distance, and walking/travel time. ALWAYS call this before scheduling a task that requires travelling to a type of place (not a specific saved place). Do NOT guess travel time — call this tool, get the real distance, then schedule accordingly.",
      parameters: {
        type: "object",
        properties: {
          category:      { type: "string", description: "What to find, in plain English: 'grocery store', 'pharmacy', 'cafe', 'gym', 'bakery', 'bank', 'restaurant', 'park', 'library', etc." },
          nearSavedPlace:{ type: "string", description: "Name of the user's saved place to search from (e.g. 'Home', 'Work'). Must match a saved place name." },
          radiusMeters:  { type: "number", description: "Search radius in metres (default 2000, max 5000)" },
        },
        required: ["category","nearSavedPlace"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_note",
      description: "Create a new note in the user's Notes section. Use for capturing ideas, shopping lists, checklists, or any text the user wants to save. Prefer 'checklist' or 'shopping' type when the content is a list of items.",
      parameters: {
        type: "object",
        properties: {
          title:   { type: "string", description: "Note title (optional but recommended)" },
          content: { type: "string", description: "Note body text. For checklist/shopping, use one item per line — they'll be split into list items automatically." },
          type:    { type: "string", enum: ["note","checklist","shopping","idea","capture"], description: "note=plain text, checklist=to-do items, shopping=shopping list with checkboxes, idea=idea capture, capture=quick capture" },
          color:   { type: "string", enum: ["cream","yellow","orange","rose","teal","blue","mint","lavender","purple"], description: "Card color (optional, default cream)" },
          pinned:  { type: "boolean", description: "Pin to top (optional)" },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_note",
      description: "Update an existing note's title, content, or type. Use the note's id from the notes context. Can append text to content or fully replace it.",
      parameters: {
        type: "object",
        properties: {
          noteId:  { type: "string", description: "The note's id" },
          title:   { type: "string" },
          content: { type: "string", description: "New full content, or use appendContent to add to existing." },
          appendContent: { type: "string", description: "Text to append to existing content instead of replacing it." },
          type:    { type: "string", enum: ["note","checklist","shopping","idea","capture"] },
          color:   { type: "string", enum: ["cream","yellow","orange","rose","teal","blue","mint","lavender","purple"] },
          pinned:  { type: "boolean" },
          starred: { type: "boolean" },
        },
        required: ["noteId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_note",
      description: "Permanently delete a note. Only do this if the user explicitly asks to delete or remove a note.",
      parameters: {
        type: "object",
        properties: {
          noteId: { type: "string", description: "The note's id" },
        },
        required: ["noteId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_whiteboard",
      description: "Add, update, or delete a block on an existing whiteboard. Use when the user wants to modify a board they already have.",
      parameters: {
        type: "object",
        properties: {
          boardTitle: { type: "string", description: "Exact title of the board to modify" },
          action:     { type: "string", enum: ["add_block","update_block","delete_block","add_connection"] },
          blockTitle: { type: "string", description: "For update/delete: exact title of the block to change" },
          block: {
            type: "object",
            description: "For add_block/update_block: the new block data",
            properties: {
              type:    { type: "string", enum: ["goal","idea","task_group","deadline","milestone","note","decision"] },
              title:   { type: "string" },
              content: { type: "string" },
              dueDate: { type: "string" },
            },
          },
          connectFrom: { type: "string", description: "For add_connection: title of source block" },
          connectTo:   { type: "string", description: "For add_connection: title of target block" },
        },
        required: ["boardTitle","action"],
      },
    },
  },
  HANDOFF_TO_ATLAS_TOOL,
  GENERATE_FILE_TOOL,
];

// ── Atlas (personal development persona) tools. Calendar mutation stays
// exclusively with Nora; Atlas returns action plans through a typed handoff. ──
const FLAG_WELLBEING_SIGNAL_TOOL = {
  type: "function",
  function: {
    name: "flag_wellbeing_signal",
    description: "Flag the user's current wellbeing state for Planner to see. Call this when the conversation reveals meaningful exhaustion, stress, overwhelm, or burnout risk that should influence today's schedule. Do not call this for routine or mild check-ins — only when it should actually change how Planner plans the day.",
    parameters: {
      type: "object",
      properties: {
        level: { type: "string", enum: ["mild", "moderate", "high", "severe"], description: "How strongly this should affect today's plan." },
        note:  { type: "string", description: "One short sentence, in third person, for Planner's prompt — e.g. 'User is mentally exhausted after a difficult week and needs a lighter day.'" },
        suggestedAction: { type: "string", enum: ["lighten_today", "add_recovery_block", "none"], description: "What Planner should consider doing." },
      },
      required: ["level", "note", "suggestedAction"],
    },
  },
};
const RETURN_PLAN_TO_NORA_TOOL = {
  type: "function",
  function: {
    name: "return_plan_to_nora",
    description: "Package the concrete actions produced in this Atlas session and offer to send them back to Nora for calendar placement. Use when the user has reached a useful action plan. Do not schedule the actions yourself.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short plan title." },
        summary: { type: "string", description: "One sentence describing the outcome of the Atlas session." },
        sourceConversationId: { type: "string", description: "The Return-to-Nora conversation id from the handoff, if one was provided." },
        actionItems: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              duration: { type: "number", description: "Suggested minutes." },
              notes: { type: "string", description: "What to do during the session and why it matters." },
              preferredTiming: { type: "string", description: "Plain-language timing preference, e.g. 'before the race' or 'morning'." },
              deadline: { type: "string", description: "YYYY-MM-DD when known." },
            },
            required: ["title", "duration", "notes"],
          },
        },
      },
      required: ["title", "summary", "actionItems"],
    },
  },
};
// Guided Journeys — a persistent, cross-conversation project (see
// src/lib/journeys.js for the lifecycle/shape). These 3 tools are Atlas-only;
// Planner never creates or edits a Journey, it only sees a short read-only
// mention of active ones (see buildPlannerSystem/buildAtlasSystem context).
const CREATE_JOURNEY_TOOL = {
  type: "function",
  function: {
    name: "create_journey",
    description: "Create a new Guided Journey — a persistent, long-term project Atlas keeps tracking across future conversations (e.g. 'Home Fitness', 'Learn German', 'Prepare for Exams'). Call this once the user has confirmed they want ongoing structured support toward a meaningful goal, after Understand + Research + Plan — never for a one-off question or a task that fits in today's schedule.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short, human name for the journey, e.g. 'Home Fitness'." },
        objective: { type: "string", description: "One sentence describing what success looks like." },
        domain: { type: "string", enum: ["fitness","language","career","study","finance","coding","habit","creative","relationships","mental_health","productivity","travel","other"] },
        estimatedDuration: { type: "string", description: "Plain-language estimate, e.g. '8-12 weeks'." },
        milestones: {
          type: "array",
          items: {
            type: "object",
            properties: { title: { type: "string" }, effort: { type: "string", description: "Optional plain-language estimate, e.g. '2 weeks' or '3 sessions'." } },
            required: ["title"],
          },
          description: "2-6 concrete milestones breaking the goal into ordered stages.",
        },
      },
      required: ["title", "objective", "domain"],
    },
  },
};
const UPDATE_JOURNEY_TOOL = {
  type: "function",
  function: {
    name: "update_journey",
    description: "Update an existing Guided Journey — advance its stage, change its status, log an AI observation, or remember a named resource. Call as the journey genuinely evolves (research finished, plan adjusted, weekly review done, goal completed or archived) — not just because it came up in conversation.",
    parameters: {
      type: "object",
      properties: {
        journeyId: { type: "string", description: "The journey's id." },
        stage: { type: "string", enum: ["discover","understand","research","plan","execute","review","adapt","complete"] },
        status: { type: "string", enum: ["active","completed","archived"] },
        progress: { type: "number", description: "0-100 estimate. Only takes effect if this journey has no milestones yet — otherwise progress is computed from milestone completion and this is ignored." },
        observation: { type: "string", description: "One short, third-person AI observation to log permanently, e.g. 'User missed 2 of 3 planned workouts this week — energy has been low.'" },
        addResource: {
          type: "object",
          properties: {
            label: { type: "string", description: "Name of a real, well-known resource — a book, course, tool, or app by name. Never a fabricated URL." },
            note: { type: "string" },
          },
          description: "A resource worth remembering for this journey.",
        },
      },
      required: ["journeyId"],
    },
  },
};
const UPDATE_JOURNEY_MILESTONE_TOOL = {
  type: "function",
  function: {
    name: "update_journey_milestone",
    description: "Mark one Guided Journey milestone complete or incomplete. Overall progress recalculates automatically from milestone completion.",
    parameters: {
      type: "object",
      properties: {
        journeyId: { type: "string" },
        milestoneTitle: { type: "string", description: "Exact title of the milestone to update." },
        done: { type: "boolean" },
      },
      required: ["journeyId", "milestoneTitle", "done"],
    },
  },
};
const ATLAS_TOOLS = [
  AI_TOOLS.find((t) => t.function.name === "save_insight"),
  FLAG_WELLBEING_SIGNAL_TOOL,
  CREATE_JOURNEY_TOOL,
  UPDATE_JOURNEY_TOOL,
  UPDATE_JOURNEY_MILESTONE_TOOL,
  RETURN_PLAN_TO_NORA_TOOL,
  GENERATE_FILE_TOOL,
];

const DELETED_TASK_IDS_KEY = "nora_deleted_task_ids_v1";
const DELETED_SHARED_IDS_KEY = "nora_deleted_shared_ids_v1";
const PENDING_SHARED_DELETIONS_KEY = "nora_pending_shared_deletions_v1";

function loadStoredArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch { return []; }
}

function storeArray(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// ── App ────────────────────────────────────────────────
export default function App() {
  const {
    session,
    loading: authLoading,
    isResettingPassword: isResettingPw,
    finishPasswordReset,
  } = useAuthSession();
  const [morningCheckup,      setMorningCheckup]      = useState(null);
  const [showMorningCheckup,  setShowMorningCheckup]  = useState(false);
  const [reviewCheckupMode,   setReviewCheckupMode]   = useState(false);
  const [showObservations, setShowObservations] = useState(false);
  const [dailyMetrics,        setDailyMetrics]         = useState(() => {
    try { return JSON.parse(localStorage.getItem("nora_daily_metrics") || "{}"); } catch { return {}; }
  });
  const [metricHistory, setMetricHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem("nora_metric_history") || "[]"); } catch { return []; }
  });
  const isMobile = useMobile();

  // Load all app data from Supabase when user logs in
  useEffect(() => {
    if (!session) return;
    loadUserData().then((data) => {
      if (!data) return;
      if (Array.isArray(data.tasks) && data.tasks.length) {
        const cutoff = fmtDate(addDays(todayStr(), -30));
        setTasks((prev) => {
          const remoteFiltered = data.tasks.filter((t) =>
            !deletedTaskIdsRef.current.has(t.id)
            && !deletedSharedIdsRef.current.has(t.sharedObjectId)
            && (t.repeat || t.date >= cutoff)
          );
          // Keep local tasks that haven't synced to Supabase yet (e.g. added
          // just before the app was suspended and the 1-s debounce didn't fire).
          const remoteIds = new Set(remoteFiltered.map((t) => t.id));
          const localOnly = prev.filter((t) =>
            !remoteIds.has(t.id)
            && !deletedTaskIdsRef.current.has(t.id)
            && !deletedSharedIdsRef.current.has(t.sharedObjectId)
            && (t.repeat || t.date >= cutoff)
          );
          return [...remoteFiltered, ...localOnly];
        });
      }
      if (Array.isArray(data.groups) && data.groups.length) setGroups(data.groups);
      if (Array.isArray(data.notes)  && data.notes.length)  setNotes(data.notes);
      const p = data.preferences ?? {};
      if (Array.isArray(p.boards) && p.boards.length) setBoards(p.boards);
      if (Array.isArray(p.journeys) && p.journeys.length) setJourneys(p.journeys);
      if (p.accountName  != null) setAccountName(p.accountName);
      if (p.dark         != null) setDark(p.dark);
      if (p.reminderMins != null) setReminderMins(p.reminderMins);
      if (p.relaxation   != null) setRelaxation(p.relaxation);
      if (p.energy       != null) setEnergy(p.energy);
      if (p.theme        != null) setTheme(p.theme);
      if (Array.isArray(p.savedPlaces) && p.savedPlaces.length) setSavedPlaces(p.savedPlaces);
      if (p.transportProfile) setTransportProfile(p.transportProfile);
      if (p.subscription) setSubscription(p.subscription);
    }).catch(console.error);
  }, [session]); // eslint-disable-line

  // Handle Stripe checkout redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    if (checkout === "success") {
      setPricingOpen(false);
      window.history.replaceState({}, "", window.location.pathname);
    } else if (checkout === "canceled") {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []); // eslint-disable-line

  // Load persistent preferences on login. Chat history is no longer loaded
  // here — each persona's useConversationEngine owns loading its own
  // conversations/messages from Supabase directly.
  useEffect(() => {
    if (!session) return;
    getUserPreferences().then(setUserPrefs).catch(console.error);
  }, [session]); // eslint-disable-line

  // Normalize checkup data (Supabase returns snake_case, component expects camelCase)
  const normalizeCheckup = (raw) => {
    if (!raw) return null;
    return {
      ...raw,
      sleepQuality:   raw.sleepQuality   ?? raw.sleep_quality   ?? null,
      bedtime:        raw.bedtime        ?? null,
      wakeTime:       raw.wakeTime       ?? raw.wake_time        ?? "",
      sleepDuration:  raw.sleepDuration  ?? raw.sleep_duration   ?? null,
      restedScore:    raw.restedScore    ?? raw.rested_score     ?? null,
      energyScore:    raw.energyScore    ?? raw.energy_score     ?? null,
      clarityScore:   raw.clarityScore   ?? raw.clarity_score    ?? null,
      dayPressure:    raw.dayPressure    ?? raw.day_pressure     ?? "",
      focusChoices:   raw.focusChoices   ?? [],
      readinessScore: raw.readinessScore ?? raw.readiness_score  ?? null,
      readinessLabel: raw.readinessLabel ?? raw.readiness_label  ?? null,
      noraSummary:    raw.noraSummary    ?? raw.nora_summary     ?? null,
      noraTips:       Array.isArray(raw.noraTips) ? raw.noraTips : (raw.nora_tips ?? []),
      // New (Phase 2) fields — absent on legacy checkups, rendered defensively.
      subScores:                raw.subScores                ?? raw.readiness_subscores ?? null,
      sleepAnalysis:            raw.sleepAnalysis             ?? raw.sleep_analysis      ?? null,
      candidateRecommendations: raw.candidateRecommendations  ?? [],
      adaptiveQuestion:         raw.adaptiveQuestion           ?? raw.adaptive_question   ?? null,
    };
  };

  // Load today's morning check-up
  useEffect(() => {
    if (!session) return;
    loadTodayCheckup(todayStr())
      .then(data => { if (data) setMorningCheckup(normalizeCheckup(data)); })
      .catch(console.warn);
  }, [session]); // eslint-disable-line

  // Load user profile from Supabase on login (name, birthday, avatar, username, etc.)
  // Also syncs auth.user_metadata → user_profile table so it appears in the dashboard
  useEffect(() => {
    if (!session) return;
    const meta = session.user?.user_metadata ?? {};
    const upsertData = { user_id: session.user.id };
    if (meta.name)     upsertData.name     = meta.name;
    if (meta.birthday) upsertData.birthday = meta.birthday;
    // Note: do NOT include updated_at — that column may not exist in the table.
    // If the upsert fails (e.g. missing column), still load the profile below.

    // Use .then(ok, err) instead of .catch() — Supabase builder is thenable but lacks .catch()
    supabase.from("user_profile")
      .upsert(upsertData, { onConflict: "user_id" })
      .then(
        () => getMyProfile(),
        (e) => { console.warn("[Profile sync]", e?.message); return getMyProfile(); }
      )
      .then((data) => {
        if (!data) return;
        setUserProfile(data);
        if (data.name && !accountName) setAccountName(data.name);
        if (!data.username) setShowUsernameBanner(true);
      })
      .catch(console.error);
  }, [session]); // eslint-disable-line

  const taskDomain = useTaskDomain(session?.user?.id);
  const { tasks, setTasks, actions: taskActions, getTasksForDate } = taskDomain;
  const [groups,       setGroups]       = usePersistentState("nora_groups", DEFAULT_GROUPS);
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [view,         setView]         = useState("day");
  const [boards, setBoards] = useState(() => {
    try { return JSON.parse(localStorage.getItem("nora_whiteboards") ?? "[]") || []; } catch { return []; }
  });
  useEffect(() => { try { localStorage.setItem("nora_whiteboards", JSON.stringify(boards)); } catch {} }, [boards]);
  // Guided Journeys — Atlas's persistent, cross-conversation project tracker.
  // Stored the same way as boards: local-first, synced inside `preferences`
  // (see noraApi.js's saveUserData) so no schema change is needed.
  const [journeys, setJourneys] = useState(() => {
    try { return JSON.parse(localStorage.getItem("nora_journeys") ?? "[]") || []; } catch { return []; }
  });
  useEffect(() => { try { localStorage.setItem("nora_journeys", JSON.stringify(journeys)); } catch {} }, [journeys]);
  const [dark,         setDark]         = usePersistentState("nora_dark", false);
  const { t, i18n } = useTranslation();
  const [dragOver,     setDragOver]     = useState(null);
  const [zoomLevel,    setZoomLevel]    = useState(1);
  const [filterGroup,      setFilterGroup]      = useState(null);
  const [filterComplexity, setFilterComplexity] = useState(null);
  const [filterType,       setFilterType]       = useState(null); // null | "task" | "deadline" | "break"
  const [addingAt,    setAddingAt]    = useState(null);
  const [addingTitle, setAddingTitle] = useState("");
  const addInputRef  = useRef(null);
  const timelineRef      = useRef(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const pendingViewRef   = useRef(null);
  const [editingTask, setEditingTask] = useState(null);
  const [draft,       setDraft]       = useState(null);
  const [savedPlaces,      setSavedPlaces]      = useState([]);
  const [transportProfile, setTransportProfile] = useState({ defaultMode: "mixed", routeOverrides: {} });
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName,   setNewGroupName]   = useState("");
  const [newGroupColor,  setNewGroupColor]  = useState("#10b981");
  const [chatOpen,       setChatOpen]       = useState(false);
  const [aiHubOpen,      setAiHubOpen]      = useState(false);
  const [messengerOpen,  setMessengerOpen]  = useState(false);
  const [chatInput,      setChatInput]      = useState("");
  const [microStartMode,  setMicroStartMode]  = useState(false);
  const [chatSuggestions, setChatSuggestions] = useState(DEFAULT_CHAT_CHIPS);
  const [desktopSuggestionsVisible, setDesktopSuggestionsVisible] = useState(() => {
    try { return localStorage.getItem("nora_desktop_chat_suggestions") !== "hidden"; }
    catch { return true; }
  });
  const [chatGhost,       setChatGhost]       = useState("");
  const [aiChatSuggestions, setAiChatSuggestions] = useState(null);
  const [aiChatSugLoading,  setAiChatSugLoading]  = useState(false);
  const aiChatSugFetchedRef = useRef(false);
  const [rescheduleTask,  setRescheduleTask]  = useState(null);
  const [inAppAlert,      setInAppAlert]      = useState(null);
  // Collaboration
  const [sharingTask,     setSharingTask]     = useState(null); // task being shared
  const [showJoinCode,    setShowJoinCode]    = useState(false);
  const [sharedObjects,   setSharedObjects]   = useState([]);   // [{id, type, data, collaborators}]
  const sharedRealtimeSubs = useRef({});                        // objectId → unsubscribe fn
  const deletedTaskIdsRef = useRef(new Set(loadStoredArray(DELETED_TASK_IDS_KEY)));
  const deletedSharedIdsRef = useRef(new Set(loadStoredArray(DELETED_SHARED_IDS_KEY)));
  const pendingSharedDeletionsRef = useRef(loadStoredArray(PENDING_SHARED_DELETIONS_KEY));
  const deletionFlushInProgressRef = useRef(false);
  // Tracks the timestamp of the last remote realtime update per sharedObjectId.
  // The sync effect skips objects updated remotely within the last 3 s so that
  // receiving a remote write does not immediately echo it back to the DB.
  const lastRemoteUpdateMsRef = useRef({});

  // Remove anything already tombstoned before cloud hydration can restore it.
  useEffect(() => {
    setTasks((prev) => prev.filter((task) =>
      !deletedTaskIdsRef.current.has(task.id)
      && !deletedSharedIdsRef.current.has(task.sharedObjectId)
    ));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Chat — persistence/history now lives entirely in each persona's
  // useConversationEngine (Supabase-backed, multi-conversation). These
  // greeting strings are purely cosmetic empty-state copy, never persisted.
  const NORA_GREETING = "Hi! I'm Nora, your productivity coach. I can manage your tasks, spot patterns in your schedule, and give you evidence-based advice to get more done. What are you working on today?";
  const ATLAS_GREETING = "Hi, I'm Atlas. We can train for an opportunity, improve a skill, practise a conversation, or work through something that's holding you back. What do you want to focus on?";

  const [userPrefs,   setUserPrefs]   = useState({});
  const chatEndRef   = useRef(null);
  const chatMsgRef   = useRef(null);
  const chatInputRef = useRef(null);
  const [chatAtBottom, setChatAtBottom] = useState(true);
  const [chatSidebarOpen, setChatSidebarOpen] = useState(false);

  const [atlasOpen,        setAtlasOpen]        = useState(false);
  const [atlasChatInput,   setAtlasChatInput]   = useState("");
  // Status page's Mind tab is Atlas's world too — not just Atlas Chat itself.
  // Mirrors StatusPage's own local `tab` state up here (via onMindModeChange)
  // purely so the app SHELL (header/nav/FAB, both desktop and mobile) can
  // react via the same .atlas-active class already used for Atlas Chat.
  const [statusMindActive, setStatusMindActive] = useState(false);
  const atlasShellActive = atlasOpen || (statusMindActive && !chatOpen && !aiHubOpen);
  // Bridges a deep-link's destination view into MobileApp.js's own internal
  // `mobileView` state (App.js has no direct access to it) — set here, read
  // and cleared by MobileApp.js's own effect. No-op on desktop.
  const [pendingMobileView, setPendingMobileView] = useState(null);

  // ── Assistant mode (Planner/Atlas feature flag, OFF by default) ───────
  const { settings: assistantSettings, updateSettings: updateAssistantSettings } = useAssistantMode();
  // Atlas tile is entirely hidden from the AI Hub until a user opts in.
  const visibleAiTools = AI_HUB_TOOLS.filter((t) => t.id !== "atlas" || assistantSettings.twoAssistantMode);

  const [showLanding,    setShowLanding]    = useState(() => !localStorage.getItem("nora_visited"));
  const [notes,          setNotes]          = usePersistentState("nora_notes", []);
  // eslint-disable-next-line no-unused-vars
  const [newNote, setNewNote] = useState("");
  // eslint-disable-next-line no-unused-vars
  const newNoteRef = useRef(null);

  // View-tabs drag/dial — DOM-direct to avoid re-renders on every pointermove
  const tabsRef    = useRef(null);
  const sliderRef  = useRef(null);
  const tabDragRef = useRef({ active: false, startX: 0, startIdx: 0, moved: false });
  const [isDraggingTabs, setIsDraggingTabs] = useState(false);

  const [sidebarOpen,    setSidebarOpen]    = useState(false);
  const [activeSettings, setActiveSettings] = useState(null);
  const [accountName,    setAccountName]    = usePersistentState("nora_account_name", "");
  const [reminderMins,   setReminderMins]   = usePersistentState("nora_reminder_mins", 5);
  const [theme,          setTheme]          = usePersistentState("nora_theme", "default");
  const [relaxation,     setRelaxation]     = usePersistentState("nora_relaxation", 5);
  const [energy,         setEnergy]         = usePersistentState("nora_energy", 5);
  const [focus,          setFocus]          = usePersistentState("nora_focus", 5);
  const [motivation,     setMotivation]     = usePersistentState("nora_motivation", 5);
  const [sleepCheckIn, setSleepCheckIn]    = usePersistentState("nora_sleep_checkin", { date: null, quality: null });
  const [userProfile,    setUserProfile]    = useState({});
  const [showOnboarding,  setShowOnboarding]  = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showUsernameBanner, setShowUsernameBanner] = useState(false);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [subscription, setSubscription] = useState({ plan: "free", status: "active" });
  const notifTimers       = useRef({});
  const syncTimer         = useRef(null);
  // Always-current snapshot of data to save — used by the emergency flush below.
  const latestSyncDataRef = useRef(null);
  // True when a save failed while offline — flushed automatically on reconnect.
  const pendingSyncRef    = useRef(false);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  // ── Notification system ────────────────────────────────
  const {
    permission:        notifPermission,
    settings:          notifSettings,
    updateSettings:    updateNotifSettings,
    requestPermission: requestNotifPermission,
    showNotification,
    scheduleAlarm,
    cancelAlarm,
    sendTestNotification,
    bannerVisible:     notifBannerVisible,
    dismissBanner:     dismissNotifBanner,
    health:            notifHealth,
    subscribeToPush,
    forceResubscribe:  forceResubscribePush,
  } = useNotifications();

  // ── Apple Health (HealthKit) ────────────────────────────
  const health = useHealthKit();

  // ── Intelligence Layer ─────────────────────────────────────────────────────
  const intel = useIntelligence({
    session,
    onAddTask: (task) => {
      const newTask = {
        id:          Math.random().toString(36).slice(2),
        title:       task.title ?? "New task",
        date:        task.date ?? today,
        startHour:   task.startHour   ?? null,
        startMinute: task.startMinute ?? null,
        completed:   false,
        type:        "task",
        note:        task.note ?? null,
        repeat:      null,
      };
      setTasks((prev) => [...prev, newTask]);
    },
  });

  // Re-sync push subscription to server whenever auth session is confirmed.
  // Belt-and-suspenders: covers the race where SW fired before Supabase session was ready.
  useEffect(() => {
    if (session && notifPermission === "granted") {
      subscribeToPush().catch(() => {});
    }
  }, [session?.access_token]); // eslint-disable-line react-hooks/exhaustive-deps
  const [showFilters,    setShowFilters]    = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);
  const [smartView,      setSmartView]      = useState(true);
  const [focusTask,      setFocusTask]      = useState(null);

  // Live clock — re-renders every 30 s so the now-line and "Today" label stay current
  const [tick, setTick] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTick(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const nowObj      = tick;
  const today       = fmtDate(tick);
  const currentHour = tick.getHours();
  const nowMins     = tick.getHours() * 60 + tick.getMinutes();

  // Auto-advance selectedDate at midnight — if the user was viewing "today" advance it to the new day
  const prevTodayRef = useRef(today);
  useEffect(() => {
    if (today !== prevTodayRef.current) {
      if (selectedDate === prevTodayRef.current) setSelectedDate(today);
      prevTodayRef.current = today;
    }
  }, [today]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-remove expired breaks (past days' breaks + today's breaks whose end time has passed)
  useEffect(() => {
    setTasks((prev) => {
      const next = prev.filter((t) => {
        if ((t.type ?? "task") !== "break") return true;
        if (t.date < today) return false; // past-day break
        if (t.date === today && t.startHour != null) {
          const endMins = t.startHour * 60 + (t.startMinute ?? 0) + (t.duration ?? 30);
          if (endMins <= nowMins) return false; // today's break has ended
        }
        return true;
      });
      return next.length !== prev.length ? next : prev; // avoid re-render if nothing changed
    });
  }, [today, nowMins]); // eslint-disable-line

  // Sleep check-in — depends on today
  const todaySleepQuality = sleepCheckIn.date === today ? sleepCheckIn.quality : null;
  const setSleepQuality   = (q) => setSleepCheckIn({ date: today, quality: q });

  // Keep a live snapshot so the background-flush handler below can always read
  // the most recent values without depending on stale closures.
  useEffect(() => {
    latestSyncDataRef.current = {
      tasks, groups, notes, boards, journeys,
      preferences: { accountName, dark, reminderMins, relaxation, energy, theme, savedPlaces, transportProfile },
    };
  }, [tasks, groups, notes, boards, journeys, accountName, dark, reminderMins, relaxation, energy, theme, savedPlaces, transportProfile]); // eslint-disable-line

  // Sync all app data to Supabase 1 s after the last change
  useEffect(() => {
    if (!session) return;
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      if (latestSyncDataRef.current) {
        if (!navigator.onLine) { pendingSyncRef.current = true; return; }
        saveUserData(latestSyncDataRef.current).catch(() => { pendingSyncRef.current = true; });
      }
    }, 1000);
  }, [tasks, groups, notes, boards, journeys, accountName, dark, reminderMins, relaxation, energy, theme, savedPlaces, transportProfile]); // eslint-disable-line

  // Flush immediately when the PWA goes to background (iOS swipe-away, tab switch).
  // Without this, the 1-second debounce above is killed before it fires and the
  // user's new tasks are never persisted to Supabase.  On reload, loadUserData()
  // would then overwrite localStorage with the stale Supabase snapshot.
  useEffect(() => {
    if (!session) return;
    const flushNow = () => {
      clearTimeout(syncTimer.current);
      if (latestSyncDataRef.current) {
        if (!navigator.onLine) { pendingSyncRef.current = true; return; }
        saveUserData(latestSyncDataRef.current).catch(() => { pendingSyncRef.current = true; });
      }
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") flushNow(); };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flushNow);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flushNow);
    };
  }, [session]); // eslint-disable-line

  // Reconcile actions an interactive widget button performed while the app
  // wasn't running (currently just "Complete Task") — the widget's own copy
  // already shows this optimistically; this is where it becomes real. Runs
  // on cold launch and every time the app comes back to the foreground.
  useEffect(() => {
    const applyPendingWidgetActions = async () => {
      const actions = await getPendingWidgetActions();
      if (!actions.length) return;
      setTasks((prev) => {
        let next = prev;
        for (const action of actions) {
          if (action.type !== "complete_task") continue;
          next = next.map((t) => (t.id === action.taskId ? { ...t, completed: true } : t));
        }
        return next;
      });
    };
    applyPendingWidgetActions();
    const onVisible = () => { if (document.visibilityState === "visible") applyPendingWidgetActions(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []); // eslint-disable-line

  // Track online/offline state and flush any pending save when reconnected.
  useEffect(() => {
    const goOnline  = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener('online',  goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online',  goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  useEffect(() => {
    if (!isOnline || !session || !pendingSyncRef.current) return;
    pendingSyncRef.current = false;
    if (latestSyncDataRef.current) {
      saveUserData(latestSyncDataRef.current).catch(() => { pendingSyncRef.current = true; });
    }
  }, [isOnline, session]); // eslint-disable-line

  // Widget deep links (nora://...) — registered once; works identically on
  // desktop and mobile since atlasOpen/showMorningCheckup are shared
  // top-level state. `view` (desktop) has no mobile equivalent reachable
  // from here, so mobile routes go through pendingMobileView instead (see
  // MobileApp.js's own effect that consumes and clears it).
  const applyDeepLinkRoute = (route) => {
    if (route === "atlas") {
      setAtlasOpen(true);
    } else if (route === "journey") {
      setAtlasChatInput("Tell me about my current journey.");
      setAtlasOpen(true);
    } else if (route === "checkup") {
      setShowMorningCheckup(true);
    } else if (route === "status") {
      setView("status");
      setPendingMobileView("status");
    } else if (route === "planner" || route === "open") {
      setView("day");
      setPendingMobileView("plan");
    }
  };

  useEffect(() => {
    const sub = CapacitorApp.addListener("appUrlOpen", ({ url }) => {
      let route = "";
      try { route = new URL(url).hostname; } catch { return; }
      applyDeepLinkRoute(route);
    });
    return () => { sub.then((handle) => handle.remove()); };
  }, []); // eslint-disable-line

  // Web has no custom URL scheme to receive nora://... links, so mirror the
  // same routes via a ?route= query param — lets QA/Playwright reach
  // native-deep-link-only screens (e.g. the Morning Briefing) in a browser.
  useEffect(() => {
    const route = new URLSearchParams(window.location.search).get("route");
    if (route) {
      applyDeepLinkRoute(route);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []); // eslint-disable-line

  const todayTasks = useMemo(() => getTasksForDate(selectedDate), [tasks, selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps
  const filteredTodayTasks = todayTasks.filter((t) => {
    const itemType = t.type ?? "task";
    if (filterType       && itemType        !== filterType)       return false;
    if (filterGroup      && t.groupId       !== filterGroup)      return false;
    if (filterComplexity && t.complexity    !== filterComplexity) return false;
    return true;
  });
  const progressTasks = todayTasks.filter((t) => (t.type ?? "task") !== "break");
  const totalToday = progressTasks.length;
  const doneToday  = progressTasks.filter((t) => t.completed).length;
  const pct        = totalToday > 0 ? Math.round((doneToday / totalToday) * 100) : 0;

  // ── Status engine — metrics, momentum, recovery, patterns, AI coach ────
  // All of the Status page's computed intelligence (previously ~480 lines of
  // inline useMemo chains) now lives in one shared hook, consumed identically
  // by this component and MobileApp.js's status view.
  const statusEngine = useStatusEngine({
    tasks, today, session,
    energy, relaxation, focus, motivation,
    morningCheckup, dailyMetrics, userPrefs,
    todaySleepQuality,
    health,
  });
  const {
    userLoadBaseline, momentum, recoveryState, workloadForecast,
    focusPatterns, mostAvoided, adaptiveRecs, deferredTasks, weeklyReflection,
    sleepState, userConfidence, assessmentSummary, keySignals, noraState,
    behaviorProfile, predictiveSignals, adaptivePlanData, weekData, weekTrend,
    metrics, interpretations, patterns, workPatterns, mindPatterns, emotionalDrift, flowPrediction,
    aiCoach, atlasCoach, actionCenter, implementationIntention, taskWeights, recoveryTrendDeclining3d,
    sleepAnalysis, healthSummary,
  } = statusEngine;
  const contextMode = noraState; // UI alias — keeps all existing JSX working

  // Cold-launch splash — see hasShownLaunchSplashThisProcess's own comment.
  // The greeting is decided ONCE, right here, from whatever's already
  // synchronously available (tasks/dailyMetrics are useLocalStorage-cached,
  // so real recovery/workload/yesterday data exists even before this
  // session's own network fetch resolves) — never recomputed mid-animation,
  // so it can't flicker to a different line partway through.
  const [showLaunchSplash, setShowLaunchSplash] = useState(() => {
    if (hasShownLaunchSplashThisProcess) return false;
    hasShownLaunchSplashThisProcess = true;
    return true;
  });
  const [launchRevealing, setLaunchRevealing] = useState(false);
  const [previousLaunchAt] = useState(() => recordAppOpen());
  const launchGreetingLockedRef = useRef(false);
  const launchGreetingRequestRef = useRef(false);
  const [launchGreeting, setLaunchGreeting] = useState(() => buildLaunchGreeting({
    hour: new Date().getHours(),
    name: accountName || session?.user?.user_metadata?.name || "",
    recoveryState, workloadForecast, dailyMetrics, today,
    lastOpenedAt: previousLaunchAt,
    momentum, healthSummary, todaySleepQuality,
    preparedGreeting: takePreparedLaunchGreeting(),
  }));

  // Ask Nora for a freshly written welcome without ever holding up launch.
  // If it arrives before the words appear it is used now; otherwise it is
  // cached for the next cold launch. Only compact derived signals are sent.
  useEffect(() => {
    if (!showLaunchSplash || !session?.user?.id || launchGreetingRequestRef.current) return;
    launchGreetingRequestRef.current = true;
    const controller = new AbortController();
    const now = Date.now();
    const firstName = String(accountName || session.user.user_metadata?.name || "")
      .trim().split(/\s+/)[0].slice(0, 28);
    const hour = new Date(now).getHours();
    const timeOfDay = hour < 5 ? "late night" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
    const sleepContext = todaySleepQuality === "good"
      ? "the user reported good sleep"
      : todaySleepQuality === "poor"
        ? "the user reported poor sleep"
        : healthSummary?.sleepLastNightMinutes != null
          ? `${healthSummary.sleepLastNightMinutes} minutes last night`
          : null;

    apiFetch("/api/tips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        type: "launch_greeting",
        context: {
          firstName,
          timeOfDay,
          daysSinceLastOpen: previousLaunchAt != null
            ? Math.max(0, Math.floor((now - previousLaunchAt) / 86400000))
            : null,
          workloadLevel: workloadForecast?.[0]?.level ?? null,
          todayTaskCount: workloadForecast?.[0]?.load ?? 0,
          momentumState: momentum?.state ?? null,
          recoveryLevel: recoveryState?.level ?? null,
          sleepContext,
          recentGreetings: getRecentLaunchGreetingTexts(),
        },
      }),
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Greeting unavailable")))
      .then((generated) => {
        if (!generated?.line1 || !generated?.line2) return;
        if (!launchGreetingLockedRef.current) {
          storePreparedLaunchGreeting(generated, now);
          const prepared = takePreparedLaunchGreeting(now);
          if (prepared) {
            setLaunchGreeting(buildLaunchGreeting({ preparedGreeting: prepared, now }));
          }
        } else {
          storePreparedLaunchGreeting(generated, now);
        }
      })
      .catch(() => {/* The instant local greeting is already complete. */});

    return () => controller.abort();
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Push a widget-friendly snapshot to the iOS WidgetKit extension whenever
  // tasks, wellbeing dials, metrics, health, or journeys change. No-op on
  // web/PWA. Every optional section (metrics/health/checkup/journey/insight)
  // degrades to undefined rather than a fabricated value — the widget itself
  // renders an honest empty/connect state for whatever's missing.
  useEffect(() => {
    const dayTasks = tasks.filter((t) => t.date === today || isRepeatMatch(t, today));
    const completedToday = dayTasks.filter((t) => t.completed).length;
    const readiness = computeReadiness(morningCheckup ?? undefined) ?? { label: "—", pct: 0 };
    const dateLabel = new Intl.DateTimeFormat("en-US", {
      weekday: "long", month: "short", day: "numeric",
    }).format(new Date());

    const metricEntry = (m) => (m?.value != null ? { value: m.value, label: m.bucket ?? "" } : null);
    const ratedDays14 = (behaviorProfile?.days14 ?? []).filter((d) => d.rate !== null);
    let consistencyStreakDays = 0;
    for (let i = ratedDays14.length - 1; i >= 0; i--) {
      if (ratedDays14[i].rate >= 0.5) consistencyStreakDays++; else break;
    }

    const activeJourney = [...journeys]
      .filter((j) => j.status === "active")
      .sort((a, b) => b.updatedAt - a.updatedAt)[0] ?? null;

    const insightHeadline = atlasCoach?.headline || aiCoach?.headline || null;

    syncWidgetData({
      date: dateLabel,
      lastUpdated: new Date().toISOString(),
      totalToday: dayTasks.length,
      completedToday,
      todayTasks: dayTasks.slice(0, 10).map((t) => ({
        id: t.id,
        title: t.title,
        completed: !!t.completed,
        startHour:   t.startHour   ?? null,
        startMinute: t.startMinute ?? null,
        type: t.type ?? "task",
        complexity: t.complexity ?? null,
      })),
      energy,
      focus,
      relaxation,
      readinessLabel: readiness.label,
      readinessPct:   readiness.pct ?? 0,
      metrics: {
        recoveryIndex:    metricEntry(metrics?.recoveryIndex),
        mentalBattery:    metricEntry(metrics?.mentalBattery),
        momentum:         metricEntry(metrics?.momentum),
        deepWorkCapacity: metricEntry(metrics?.deepWorkCapacity),
        consistencyStreakDays,
      },
      health: healthSummary ? {
        sleepLastNightMinutes: healthSummary.sleepLastNightMinutes,
        sleepBaselineMinutes:  healthSummary.sleepBaselineMinutes,
        recoveryScore:         healthSummary.recoveryScore,
        stepsToday:            healthSummary.activityStepsToday,
        stepsBaseline:         healthSummary.activityBaselineSteps,
      } : null,
      checkup: {
        completedToday: morningCheckup?.date === today,
        readinessLabel: readiness.label,
        readinessPct:   readiness.pct ?? 0,
      },
      journey: activeJourney ? {
        id: activeJourney.id,
        title: activeJourney.title,
        domain: activeJourney.domain,
        stage: activeJourney.stage,
        progress: activeJourney.progress,
        milestones: activeJourney.milestones.map((m) => ({ id: m.id, title: m.title, done: m.done })),
        estimatedDuration: activeJourney.estimatedDuration ?? null,
      } : null,
      insight: insightHeadline ? { headline: insightHeadline, detail: assessmentSummary ?? null } : null,
      weeklyCompletionPct: weekData.map((d) => Math.round((d.rate ?? 0) * 100)),
    });
  }, [tasks, today, energy, focus, relaxation, morningCheckup, metrics, healthSummary, journeys, behaviorProfile, atlasCoach, aiCoach, assessmentSummary, weekData]); // eslint-disable-line

  // Auto-save inferred preferences when behavioral data is ready
  useEffect(() => {
    if (!session) return;
    const inferred = {};
    if (focusPatterns?.peak?.key) inferred.peak_hours = focusPatterns.peak.key;
    if (adaptivePlanData?.avgDur) inferred.preferred_session_mins = adaptivePlanData.avgDur;
    if (Object.keys(inferred).length === 0) return;
    setUserPrefs(prev => {
      const changed = Object.entries(inferred).some(([k, v]) => prev[k] !== v);
      if (!changed) return prev;
      const updated = { ...prev, ...inferred };
      saveUserPreferences(updated).catch(console.warn);
      return updated;
    });
  }, [session, focusPatterns, adaptivePlanData]); // eslint-disable-line

  // Auto-save behavior profile snapshot to persistent preferences
  useEffect(() => {
    if (!session) return;
    setUserPrefs((prev) => {
      const bp = prev.behavior_profile;
      const changed = !bp
        || bp.work_style              !== behaviorProfile.work_style
        || bp.confidence              !== behaviorProfile.confidence
        || bp.stress_response_pattern !== behaviorProfile.stress_response_pattern;
      if (!changed) return prev;
      const updated = { ...prev, behavior_profile: behaviorProfile };
      saveUserPreferences(updated).catch(console.warn);
      return updated;
    });
  }, [session, behaviorProfile]); // eslint-disable-line

  // Auto-save load baseline when it shifts meaningfully
  useEffect(() => {
    if (!session) return;
    setUserPrefs((prev) => {
      const saved = prev.load_baseline;
      if (saved
        && saved.avgDailyWeight     === userLoadBaseline.avgDailyWeight
        && saved.overloadThreshold  === userLoadBaseline.overloadThreshold) return prev;
      const updated = { ...prev, load_baseline: userLoadBaseline };
      saveUserPreferences(updated).catch(console.warn);
      return updated;
    });
  }, [session, userLoadBaseline]); // eslint-disable-line


  const aiFocus = useMemo(() => {
    const incomplete = todayTasks.filter((t) => !t.completed && t.type !== "break");
    const priorityTask = [...incomplete].sort((a, b) => {
      if (a.startHour != null && b.startHour != null)
        return a.startHour * 60 + (a.startMinute ?? 0) - (b.startHour * 60 + (b.startMinute ?? 0));
      if (a.startHour != null) return -1;
      if (b.startHour != null) return  1;
      return 0;
    })[0] ?? null;

    const remaining = incomplete.length;
    let insight;
    if (remaining === 0 && doneToday > 0)
      insight = `All ${doneToday} task${doneToday > 1 ? "s" : ""} done — great work today.`;
    else if (remaining === 0)
      insight = "Nothing scheduled yet. Ask Nora to plan your day.";
    else if (energy <= 3)
      insight = `Energy is low — focus on "${priorityTask?.title ?? "one task"}" and rest after.`;
    else if (recoveryState.level !== "stable")
      insight = "One task at a time — keep today light.";
    else if (remaining === 1)
      insight = "One task left — finish strong.";
    else
      insight = `${remaining} tasks ahead. Start with "${priorityTask?.title ?? "the first one"}".`;

    let nudge = null;
    if (deferredTasks.length > 0)
      nudge = `${deferredTasks.length} task${deferredTasks.length > 1 ? "s are" : " is"} still pending — want Nora to find the right time?`;
    else if (totalToday === 0)
      nudge = "Today's schedule is empty. Let Nora plan your day.";

    return { priorityTask, insight, nudge };
  }, [todayTasks, doneToday, energy, recoveryState, deferredTasks, totalToday]); // eslint-disable-line

  const userAge = useMemo(() => {
    if (!userProfile?.birthday) return null;
    const bday = new Date(userProfile.birthday + "T00:00:00");
    const now  = new Date();
    let age = now.getFullYear() - bday.getFullYear();
    if (now.getMonth() < bday.getMonth() ||
        (now.getMonth() === bday.getMonth() && now.getDate() < bday.getDate())) age--;
    return age >= 0 ? age : null;
  }, [userProfile]);


  const zoomedH = Math.round(HOUR_H * zoomLevel);
  const cTop    = (h, m) => calcTop(h, m, zoomedH);

  // Scroll to current time on day view
  useEffect(() => {
    if (view === "day" && selectedDate === today) {
      setTimeout(() => {
        const top = (currentHour - HOURS[0]) * zoomedH + (nowObj.getMinutes() / 60) * zoomedH;
        if (timelineRef.current) {
          timelineRef.current.scrollTop = Math.max(0, top - 200);
        }
      }, 120);
    }
  }, [view, selectedDate, zoomedH]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (addingAt !== null) addInputRef.current?.focus(); }, [addingAt]);
  useEffect(() => { if (chatOpen) chatInputRef.current?.focus(); }, [chatOpen]);
  // ── Collaboration: load shared objects + realtime ─────────────
  function ensureSharedSubscription(object) {
    if (sharedRealtimeSubs.current[object.id]) return;
    sharedRealtimeSubs.current[object.id] = subscribeToSharedObject(object.id, async (event) => {
      if (event.type === "object_updated") {
        setSharedObjects((prev) => prev.map((item) =>
          item.id === object.id ? { ...item, data: event.data.data } : item
        ));
        if (object.type === "task" || object.type === "deadline") {
          // Record that this object was just updated from a remote source so the
          // syncSharedTask debounce does not echo the write back to the DB.
          lastRemoteUpdateMsRef.current[object.id] = Date.now();
          setTasks((prev) => prev.map((task) =>
            task.sharedObjectId === object.id ? { ...task, ...event.data.data, sharedObjectId: object.id } : task
          ));
        }
      } else if (event.type === "collaborator_added") {
        try {
          const collaborators = await getCollaborators(object.id);
          setSharedObjects((prev) => prev.map((item) =>
            item.id === object.id ? { ...item, collaborators } : item
          ));
        } catch (error) {
          console.warn("[Sharing] Could not refresh collaborators", error?.message);
        }
      } else if (event.type === "object_deleted") {
        deletedSharedIdsRef.current.add(object.id);
        storeArray(DELETED_SHARED_IDS_KEY, [...deletedSharedIdsRef.current]);
        setSharedObjects((prev) => prev.filter((item) => item.id !== object.id));
        setTasks((prev) => prev.filter((task) => task.sharedObjectId !== object.id));
      }
    });
  }

  useEffect(() => {
    if (!session) return;
    let cancelled = false;

    async function loadShared() {
      const objs = (await getMySharedObjects()).filter((object) => !deletedSharedIdsRef.current.has(object.id));
      if (cancelled) return;

      // Attach collaborators to each object
      const withCollabs = (await Promise.all(
        objs.map(async (o) => {
          const collabs = await getCollaborators(o.id);
          return { ...o, collaborators: collabs };
        })
      )).filter((object) => !deletedSharedIdsRef.current.has(object.id));
      setSharedObjects(withCollabs);

      // Subscribe to realtime updates for each object
      withCollabs.forEach(ensureSharedSubscription);

      // Merge shared tasks and deadlines into the planner (add if not present)
      const sharedTasks = withCollabs.filter((o) => o.type === "task" || o.type === "deadline");
      setTasks((prev) => {
        let updated = [...prev];
        sharedTasks.forEach((so) => {
          const exists = updated.some((t) => t.sharedObjectId === so.id);
          if (!exists) {
            updated.push({ ...so.data, sharedObjectId: so.id, collaborators: so.collaborators });
          }
        });
        return updated;
      });
    }

    loadShared();

    // Subscribe to new invites
    const unsubInvites = subscribeToCollaboratorInvites(async (newObj) => {
      if (deletedSharedIdsRef.current.has(newObj.id)) return;
      let collaborators = [];
      try { collaborators = await getCollaborators(newObj.id); } catch {}
      cacheSharedObject(newObj, collaborators);
      if (newObj.type === "task" || newObj.type === "deadline") {
        setTasks((prev) => prev.some((task) => task.sharedObjectId === newObj.id)
          ? prev
          : [...prev, { ...newObj.data, type: newObj.type, sharedObjectId: newObj.id, collaborators }]);
      }
    });

    return () => {
      cancelled = true;
      unsubInvites();
      Object.values(sharedRealtimeSubs.current).forEach((fn) => fn());
      sharedRealtimeSubs.current = {};
    };
  }, [session]); // eslint-disable-line react-hooks/exhaustive-deps

  // Objects created or joined after the initial login load also need realtime.
  useEffect(() => {
    if (!session) return;
    sharedObjects.forEach(ensureSharedSubscription);
  }, [session, sharedObjects]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync local task changes back to shared_objects ─────────────
  const syncSharedTask = useRef(null);
  useEffect(() => {
    clearTimeout(syncSharedTask.current);
    syncSharedTask.current = setTimeout(() => {
      const now = Date.now();
      tasks.forEach((t) => {
        if (!t.sharedObjectId) return;
        // Skip objects whose last change came from a remote realtime event within
        // the past 3 s — otherwise we'd echo the remote write back to the DB,
        // which would trigger another realtime event, creating an infinite loop.
        const lastRemote = lastRemoteUpdateMsRef.current[t.sharedObjectId] ?? 0;
        if (now - lastRemote < 3000) return;
        updateSharedObject(t.sharedObjectId, t, "updated");
      });
    }, 2000);
  }, [tasks]); // eslint-disable-line react-hooks/exhaustive-deps

  function cacheSharedObject(object, collaborators = []) {
    if (deletedSharedIdsRef.current.has(object.id)) return;
    setSharedObjects((prev) => {
      const next = { ...object, collaborators };
      return prev.some((item) => item.id === object.id)
        ? prev.map((item) => item.id === object.id ? { ...item, ...next } : item)
        : [...prev, next];
    });
  }

  async function handleJoinCode(code) {
    const object = await joinByCode(code);
    if (!object) throw new Error("This invite code could not be joined.");
    // An explicit re-join reverses any old local tombstone for this object.
    deletedSharedIdsRef.current.delete(object.id);
    if (object.data?.id) deletedTaskIdsRef.current.delete(object.data.id);
    storeArray(DELETED_SHARED_IDS_KEY, [...deletedSharedIdsRef.current]);
    storeArray(DELETED_TASK_IDS_KEY, [...deletedTaskIdsRef.current]);
    pendingSharedDeletionsRef.current = pendingSharedDeletionsRef.current.filter(
      (item) => item.sharedObjectId !== object.id
    );
    persistDeletionQueue();
    const collaborators = await getCollaborators(object.id);
    cacheSharedObject(object, collaborators);
    if (object.type === "task" || object.type === "deadline") {
      setTasks((prev) => prev.some((task) => task.sharedObjectId === object.id)
        ? prev
        : [...prev, { ...object.data, type: object.type, sharedObjectId: object.id, collaborators }]);
    }
    return object;
  }

  function persistDeletionQueue() {
    storeArray(PENDING_SHARED_DELETIONS_KEY, pendingSharedDeletionsRef.current);
  }

  async function flushPendingSharedDeletions() {
    if (!session?.user?.id || deletionFlushInProgressRef.current) return;
    deletionFlushInProgressRef.current = true;
    try {
      const pending = [...pendingSharedDeletionsRef.current];
      for (const deletion of pending) {
        try {
          const object = await getSharedObject(deletion.sharedObjectId);
          if (object?.owner_id === session.user.id) {
            await deleteSharedObject(deletion.sharedObjectId);
          } else if (object) {
            await removeCollaborator(deletion.sharedObjectId, session.user.id);
          }
          pendingSharedDeletionsRef.current = pendingSharedDeletionsRef.current.filter(
            (item) => item.sharedObjectId !== deletion.sharedObjectId
          );
          persistDeletionQueue();
        } catch (error) {
          // Offline/PWA fetch failures remain queued and retry on the next
          // online event or app launch. The task stays hidden via tombstones.
          console.warn("[Delete task] Cloud cleanup queued:", error?.message ?? error);
        }
      }
    } finally {
      deletionFlushInProgressRef.current = false;
    }
  }

  useEffect(() => {
    if (!session) return;
    flushPendingSharedDeletions();
    const retry = () => flushPendingSharedDeletions();
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [session?.user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!chatOpen || !desktopSuggestionsVisible || aiChatSugFetchedRef.current) return;
    aiChatSugFetchedRef.current = true;
    setAiChatSugLoading(true);
    apiFetch("/api/tips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "chat_prompts",
        context: {
          todayTaskCount: todayTasks.length,
          todayTasks: todayTasks.slice(0, 4).map((t) => ({ title: t.title })),
          deferredCount: deferredTasks.length,
          dayOfWeek: new Date().toLocaleDateString("en-US", { weekday: "long" }),
          energy,
          focus,
        },
      }),
    })
      .then((r) => r.json())
      .then((d) => { if (d.tips?.length) setAiChatSuggestions(d.tips.slice(0, 3)); })
      .catch(() => {})
      .finally(() => setAiChatSugLoading(false));
  }, [chatOpen, desktopSuggestionsVisible]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 25-minute debounced metric commits ─────────────────────────
  // Wellness sliders only "count" after being stable for 25 min.
  // Nora tracks the shift history to notice changes over time.
  const metricTimers = useRef({});
  const committed    = useRef({ energy, stress: relaxation, focus, motivation });
  const todayRef     = useRef(today);
  useEffect(() => { todayRef.current = today; }, [today]);

  function startCommitTimer(key, newVal) {
    clearTimeout(metricTimers.current[key]);
    metricTimers.current[key] = setTimeout(() => {
      const prev = committed.current[key];
      committed.current[key] = newVal;
      if (prev !== newVal) {
        const entry = { key, from: prev, to: newVal, at: new Date().toISOString() };
        setMetricHistory(h => {
          const next = [...h.slice(-9), entry];
          localStorage.setItem("nora_metric_history", JSON.stringify(next));
          return next;
        });
      }
      const d = todayRef.current;
      if (!d) return;
      setDailyMetrics(p => {
        const n = { ...p, [d]: { ...p[d], [key]: newVal, updatedAt: Date.now() } };
        localStorage.setItem("nora_daily_metrics", JSON.stringify(n));
        return n;
      });
    }, 25 * 60 * 1000);
  }

  useEffect(() => { startCommitTimer("energy",     energy);     return () => clearTimeout(metricTimers.current.energy); },     [energy]);     // eslint-disable-line
  useEffect(() => { startCommitTimer("stress",     relaxation); return () => clearTimeout(metricTimers.current.stress); },     [relaxation]); // eslint-disable-line
  useEffect(() => { startCommitTimer("focus",      focus);      return () => clearTimeout(metricTimers.current.focus); },      [focus]);      // eslint-disable-line
  useEffect(() => { startCommitTimer("motivation", motivation); return () => clearTimeout(metricTimers.current.motivation); }, [motivation]); // eslint-disable-line

  // Auto-save daily metrics snapshot — task/sleep fields update immediately;
  // energy/stress/focus/motivation are written by the commit timers above.
  useEffect(() => {
    if (!session || !today) return;
    const snapshot = {
      energy:         committed.current.energy,
      stress:         committed.current.stress,
      focus:          committed.current.focus,
      motivation:     committed.current.motivation,
      sleepQuality:   todaySleepQuality,
      loadLevel:      workloadForecast[0]?.level ?? "light",
      readinessScore: morningCheckup?.readinessScore ?? null,
      recoveryScore:  recoveryState.score ?? null,
      tasksCompleted: doneToday, tasksTotal: totalToday,
      updatedAt: Date.now(),
    };
    setDailyMetrics(prev => {
      const merged = { ...prev, [today]: { ...prev[today], ...snapshot } };
      // Unbounded retention risk — cap to the trailing 365 days, same
      // convention already used for nora_focus_log (.slice(-500)) and
      // nora_metric_history (.slice(-9)). Emotional Drift / burnout-trend
      // detection depend on this history existing, so prune rather than
      // let it grow forever in localStorage.
      const dates = Object.keys(merged).sort();
      const next = dates.length > 365
        ? Object.fromEntries(dates.slice(-365).map((d) => [d, merged[d]]))
        : merged;
      localStorage.setItem("nora_daily_metrics", JSON.stringify(next));
      return next;
    });
  }, [doneToday, totalToday, todaySleepQuality, today, session, recoveryState]); // eslint-disable-line

  useEffect(() => {
    const el = chatInputRef.current;
    if (!el) return;
    if (!chatInput) {
      el.style.height = "";   // remove inline height → CSS min-height takes over
    } else {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 160) + "px";
    }
  }, [chatInput]);
  useEffect(() => { setDraft(editingTask ? { ...editingTask } : null); }, [editingTask]);

  // ── Task / deadline notification scheduling ────────────────────────────────
  useEffect(() => {
    // Clear React timers (used only for in-app toast — doesn't survive app close)
    Object.values(notifTimers.current).forEach(clearTimeout);
    notifTimers.current = {};
    // Cancel any previously queued SW alarms for today's tasks
    tasks.forEach((task) => cancelAlarm(`task-reminder-${task.id}`));

    const now = Date.now();
    tasks.forEach((task) => {
      if (task.completed || task.startHour == null || task.date !== todayStr()) return;
      const type = task.type ?? "task";
      if (type === "break") return;
      const categoryEnabled = type === "deadline"
        ? notifSettings.deadlineReminders
        : notifSettings.taskReminders;
      const offset = task.reminderOffset === "none" ? null
        : task.reminderOffset != null ? task.reminderOffset
        : reminderMins;
      if (offset == null) return;
      const start = new Date();
      start.setHours(task.startHour, task.startMinute ?? 0, 0, 0);
      const fireAt = start.getTime() - offset * 60000;
      const delay  = fireAt - now;
      if (delay <= 0) return;

      // In-app toast — React timer only (UI, doesn't need to survive close)
      notifTimers.current[task.id] = setTimeout(() => {
        const timeStr = fmtTime(task.startHour, task.startMinute ?? 0);
        setInAppAlert({ id: uid(), title: task.title, offset, timeStr });
      }, delay);

      // OS notification — persisted in SW IndexedDB, fires even when app is closed
      if (categoryEnabled && notifSettings.enabled && notifPermission === "granted") {
        const isDeadline = type === "deadline";
        const title = isDeadline ? "🔴 Deadline" : "⏰ Reminder";
        const body  = offset === 0
          ? `${task.title} is starting`
          : `${task.title} in ${offset} min`;
        scheduleAlarm(
          `task-reminder-${task.id}`,
          fireAt,
          title,
          body,
          { action: "open_task", taskId: task.id, url: "/" },
          `task-${task.id}`
        );
      }
    });
  }, [tasks, reminderMins, notifPermission, notifSettings.enabled, notifSettings.taskReminders, notifSettings.deadlineReminders]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Morning check-up reminder ───────────────────────────────────────────────
  // Uses scheduleAlarm() which persists to SW IndexedDB — survives app close.
  useEffect(() => {
    const ALARM_ID = `morning-checkup-${today}`;
    cancelAlarm(ALARM_ID);
    if (!notifSettings.enabled || !notifSettings.morningCheckup || notifPermission !== "granted") return;
    if (morningCheckup) return; // Already completed today
    const [hStr = "8", mStr = "0"] = (notifSettings.morningTime || "08:00").split(":");
    const h = parseInt(hStr, 10);
    const m = parseInt(mStr, 10);
    const trigger = new Date();
    trigger.setHours(h, m, 0, 0);
    if (trigger.getTime() <= Date.now()) return; // Already past
    scheduleAlarm(
      ALARM_ID,
      trigger.getTime(),
      "☀️ Morning check-in",
      "Ready to plan today?",
      { action: "open_checkup", url: "/" },
      "morning-checkup"
    );
    return () => cancelAlarm(ALARM_ID);
  }, [notifSettings.enabled, notifSettings.morningCheckup, notifSettings.morningTime, notifPermission, morningCheckup, today]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── AI coaching — once per day at 10:00 AM, stored in alarm queue ──────────
  useEffect(() => {
    const ALARM_ID = `ai-coaching-${today}`;
    if (!notifSettings.enabled || !notifSettings.aiCoaching || notifPermission !== "granted") return;
    const alreadyFired = localStorage.getItem("nora_coaching_date") === today;
    if (alreadyFired) return;
    const trigger = new Date();
    trigger.setHours(10, 0, 0, 0);
    if (trigger.getTime() <= Date.now()) return;
    const message = adaptiveRecs[0] || predictiveSignals[0]?.message;
    if (!message) return;
    localStorage.setItem("nora_coaching_date", today); // prevent re-scheduling
    scheduleAlarm(ALARM_ID, trigger.getTime(), "💡 Today's insight", message, {
      action: "open_status", url: "/",
    }, "ai-coaching");
    return () => cancelAlarm(ALARM_ID);
  }, [notifSettings.enabled, notifSettings.aiCoaching, notifPermission, today, adaptiveRecs, predictiveSignals]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Deadline day-before reminder — stored in alarm queue ────────────────────
  useEffect(() => {
    if (!notifSettings.enabled || !notifSettings.deadlineReminders || notifPermission !== "granted") return;
    const tomorrow = fmtDate(addDays(today, 1));
    const tomorrowDeadlines = tasks.filter((t) => !t.completed && t.type === "deadline" && t.date === tomorrow);
    if (!tomorrowDeadlines.length) return;
    const trigger = new Date();
    trigger.setHours(9, 0, 0, 0);
    if (trigger.getTime() <= Date.now()) return;
    const alarmId = `deadline-tomorrow-${today}`;
    scheduleAlarm(
      alarmId,
      trigger.getTime(),
      "⚠️ Due tomorrow",
      tomorrowDeadlines.length === 1
        ? `${tomorrowDeadlines[0].title} is due tomorrow`
        : `${tomorrowDeadlines.length} deadlines due tomorrow`,
      { action: "open_task", taskId: tomorrowDeadlines[0].id, url: "/" },
      "deadline-tomorrow"
    );
    return () => cancelAlarm(alarmId);
  }, [notifSettings.enabled, notifSettings.deadlineReminders, notifPermission, tasks, today]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Notification click — navigate to relevant screen ───────────────────────
  useEffect(() => {
    const handleNotifClick = (e) => {
      const { action, taskId } = e.detail || {};
      if (action === "open_checkup") setShowMorningCheckup(true);
      else if (action === "open_task" && taskId) {
        const task = tasks.find((t) => t.id === taskId);
        if (task) setEditingTask(task);
      }
      else if (action === "open_status" && !isMobile) setView("status");
    };
    window.addEventListener("nora:notification-click", handleNotifClick);
    return () => window.removeEventListener("nora:notification-click", handleNotifClick);
  }, [tasks, isMobile]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!inAppAlert) return;
    const t = setTimeout(() => setInAppAlert(null), 8000);
    return () => clearTimeout(t);
  }, [inAppAlert]);

  const monthDays  = useMemo(() => getMonthDays(selectedDate), [selectedDate]);
  const dateObj    = new Date(selectedDate + "T00:00:00");
  const monthLabel = `${MONTH_NAMES[dateObj.getMonth()]} ${dateObj.getFullYear()}`;
  const getGroup   = (id) => groups.find((g) => g.id === id);

  const commitAdd = (slot) => {
    if (addingTitle.trim()) {
      const isObj = slot !== null && slot !== undefined && typeof slot === "object";
      setTasks((p) => [...p, {
        id: uid(), title: addingTitle.trim(), date: selectedDate,
        startHour:   isObj ? slot.hour   : null,
        startMinute: isObj ? slot.minute : null,
        duration: null, repeat: null, repeatEnd: null,
        completed: false, notes: "", complexity: null, groupId: null, reminderOffset: null,
      }]);
    }
    setAddingTitle(""); setAddingAt(null);
  };

  const handleSlotKey = (e, slot) => {
    if (e.key === "Enter")  { e.preventDefault(); commitAdd(slot); }
    if (e.key === "Escape") { setAddingTitle(""); setAddingAt(null); }
  };

  const saveTask = () => {
    if (!draft) return;
    taskActions.upsert(draft);
    setEditingTask(null);
  };
  const deleteTask = (id) => {
    const task = tasks.find((item) => item.id === id) ?? (draft?.id === id ? draft : null);
    if (!task) return;

    // Deletion is local-first and cannot be blocked by a flaky mobile/PWA
    // connection. Persistent tombstones prevent both cloud stores from
    // resurrecting the item while remote cleanup retries in the background.
    deletedTaskIdsRef.current.add(id);
    storeArray(DELETED_TASK_IDS_KEY, [...deletedTaskIdsRef.current]);

    if (task.sharedObjectId) {
      deletedSharedIdsRef.current.add(task.sharedObjectId);
      storeArray(DELETED_SHARED_IDS_KEY, [...deletedSharedIdsRef.current]);
      if (!pendingSharedDeletionsRef.current.some((item) => item.sharedObjectId === task.sharedObjectId)) {
        pendingSharedDeletionsRef.current.push({ taskId: id, sharedObjectId: task.sharedObjectId });
        persistDeletionQueue();
      }
      setSharedObjects((prev) => prev.filter((item) => item.id !== task.sharedObjectId));
      sharedRealtimeSubs.current[task.sharedObjectId]?.();
      delete sharedRealtimeSubs.current[task.sharedObjectId];
    }

    // Cancel any scheduled reminder — the scheduling effect only iterates
    // tasks that still exist, so without this the alarm is never cleared.
    cancelAlarm(`task-reminder-${id}`);
    clearTimeout(notifTimers.current[id]);
    delete notifTimers.current[id];

    const remainingTasks = tasks.filter((item) => item.id !== id);
    setTasks(remainingTasks);
    setEditingTask(null);
    setDraft(null);

    // Best-effort immediate cloud save; the normal autosave retries this too.
    saveUserData({
      tasks: remainingTasks, groups, notes, boards, journeys,
      preferences: { accountName, dark, reminderMins, relaxation, energy, theme, savedPlaces, transportProfile },
    }).catch((error) => console.warn("[Delete task] App-data sync queued:", error?.message ?? error));
    flushPendingSharedDeletions();
  };
  const toggleTask = taskActions.toggle;
  const saveReschedule = (updated) => { taskActions.reschedule(updated); setRescheduleTask(null); };

  const handleCheckupComplete = async (checkup) => {
    setMorningCheckup(normalizeCheckup(checkup));
    // Sync Daily Check-In dials from checkup answers
    if (checkup.energyScore  != null) setEnergy(checkup.energyScore);
    if (checkup.restedScore  != null) setRelaxation(checkup.restedScore); // rested ↔ low stress
    if (checkup.clarityScore != null) setFocus(checkup.clarityScore);     // clarity ↔ focus
    // Sync Sleep & Recovery
    if (checkup.sleepQuality) setSleepQuality(checkup.sleepQuality === "great" ? "good" : checkup.sleepQuality);
    // Save coaching insights
    if (checkup.bedtime)  setUserPrefs(p => ({ ...p, typical_bedtime: checkup.bedtime }));
    if (checkup.wakeTime) setUserPrefs(p => ({ ...p, typical_wake_time: checkup.wakeTime }));
    // Snapshot into dailyMetrics[today] so tomorrow's sleep-science estimates
    // (consistency/regularity/circadian/debt) have real day-over-day history to read.
    setDailyMetrics(prev => {
      const next = {
        ...prev,
        [checkup.date]: {
          ...(prev[checkup.date] ?? {}),
          bedtime: checkup.bedtime || null,
          wakeTime: checkup.wakeTime || null,
          sleepDurationHours: checkup.sleepDuration ?? null,
          sleepDebtHours: checkup.sleepAnalysis?.debt?.value ?? null,
          restedScore: checkup.restedScore ?? null,
          readinessSubScores: checkup.subScores ?? null,
        },
      };
      localStorage.setItem("nora_daily_metrics", JSON.stringify(next));
      return next;
    });
    // Persist to Supabase (fails gracefully if table doesn't exist)
    saveMorningCheckup({
      date: checkup.date, sleep_quality: checkup.sleepQuality,
      bedtime: checkup.bedtime || null, wake_time: checkup.wakeTime || null,
      sleep_duration: checkup.sleepDuration, rested_score: checkup.restedScore,
      energy_score: checkup.energyScore, clarity_score: checkup.clarityScore,
      day_pressure: checkup.dayPressure || null,
      readiness_score: checkup.readinessScore, readiness_label: checkup.readinessLabel,
      nora_summary: checkup.noraSummary, nora_tips: checkup.noraTips,
      sleep_analysis: checkup.sleepAnalysis ?? null,
      readiness_subscores: checkup.subScores ?? null,
      adaptive_question: checkup.adaptiveQuestion ?? null,
    }).catch(console.warn);
    // Also cache locally
    localStorage.setItem(`nora_checkup_${checkup.date}`, JSON.stringify(checkup));
  };
  const skipTask   = (id) => {
    const tomorrow = fmtDate(addDays(today, 1));
    taskActions.skip(id, tomorrow);
  };
  const moveToSlot = taskActions.moveToSlot;

  const navigateTo = (v) => {
    if (v === view) return;
    pendingViewRef.current = v;
    setIsTransitioning(true);
    setTimeout(() => {
      setView(pendingViewRef.current);
      setIsTransitioning(false);
    }, 130);
  };

  const VIEWS_DIAL = ["day", "month", "list"];

  const onTabPointerDown = (e) => {
    tabDragRef.current = { active: true, startX: e.clientX, startIdx: VIEWS_DIAL.indexOf(view), moved: false };
    tabsRef.current?.setPointerCapture(e.pointerId);
  };

  const onTabPointerMove = (e) => {
    if (!tabDragRef.current.active || !tabsRef.current || !sliderRef.current) return;
    const dx = e.clientX - tabDragRef.current.startX;
    if (Math.abs(dx) <= 5) return;

    if (!tabDragRef.current.moved) {
      tabDragRef.current.moved = true;
      setIsDraggingTabs(true); // one React update to add dragging classes
    }

    const tabW = (tabsRef.current.clientWidth - 8) / 3;
    const clampedIdx = Math.max(0, Math.min(2, tabDragRef.current.startIdx + dx / tabW));

    // Direct DOM — no React re-render every frame
    sliderRef.current.style.left       = `${4 + clampedIdx * tabW}px`;
    sliderRef.current.style.width      = `${tabW}px`;
    sliderRef.current.style.transition = "none";

    // Highlight nearest tab label live
    const snapIdx = Math.round(clampedIdx);
    tabsRef.current.querySelectorAll(".tab-btn").forEach((btn, i) => {
      btn.style.color = i === snapIdx ? "#fff" : "";
    });
  };

  const onTabPointerUp = (e) => {
    if (!tabDragRef.current.active) return;
    const { moved, startX, startIdx } = tabDragRef.current;
    tabDragRef.current.active = false;

    if (moved) {
      // Restore slider to CSS-controlled position with spring transition
      if (sliderRef.current) {
        sliderRef.current.style.left       = "";
        sliderRef.current.style.width      = "";
        sliderRef.current.style.transition = "";
      }
      // Restore button label colours
      tabsRef.current?.querySelectorAll(".tab-btn").forEach((btn) => { btn.style.color = ""; });

      setIsDraggingTabs(false);

      if (tabsRef.current) {
        const tabW = (tabsRef.current.clientWidth - 8) / 3;
        const snapped = Math.max(0, Math.min(2, Math.round(startIdx + (e.clientX - startX) / tabW)));
        navigateTo(VIEWS_DIAL[snapped]);
      }
      setTimeout(() => { tabDragRef.current.moved = false; }, 0);
    } else {
      // Tap — pointer capture may have swallowed the click; navigate directly from position
      tabDragRef.current.moved = false;
      if (tabsRef.current) {
        const btns   = tabsRef.current.querySelectorAll(".tab-btn");
        const tabW   = btns[0] ? btns[0].getBoundingClientRect().width : tabsRef.current.clientWidth / 3;
        const firstX = btns[0] ? btns[0].getBoundingClientRect().left : tabsRef.current.getBoundingClientRect().left;
        const tapped = Math.max(0, Math.min(2, Math.floor((e.clientX - firstX) / tabW)));
        navigateTo(VIEWS_DIAL[tapped]);
      }
    }
  };

  const onTabPointerCancel = () => {
    if (sliderRef.current) {
      sliderRef.current.style.left       = "";
      sliderRef.current.style.width      = "";
      sliderRef.current.style.transition = "";
    }
    tabsRef.current?.querySelectorAll(".tab-btn").forEach((btn) => { btn.style.color = ""; });
    tabDragRef.current = { active: false, startX: 0, startIdx: 0, moved: false };
    setIsDraggingTabs(false);
  };

  const askNORAtoReschedule = (task) => {
    const daysDeferred = Math.round(
      (new Date(today + "T00:00:00") - new Date(task.date + "T00:00:00")) / 86400000
    );
    setChatInput(
      `"${task.title}" has been pending for ${daysDeferred} day${daysDeferred !== 1 ? "s" : ""}. Can you find the best spot for it this week and schedule it there? Consider my current workload and energy.`
    );
    setChatOpen(true);
  };

  const shiftDate  = (n) => setSelectedDate(fmtDate(addDays(selectedDate, n)));
  const shiftMo    = (n) => setSelectedDate(shiftMonth(selectedDate, n));

  const [openNoteId,     setOpenNoteId]     = useState(null);
  const [deletingNoteId, setDeletingNoteId] = useState(null);
  const [newNoteId,      setNewNoteId]      = useState(null);
  const [noteSearch,     setNoteSearch]     = useState("");
  const [noteMenuOpen,   setNoteMenuOpen]   = useState(null); // "type"|"sort"|"filter"|null
  const [noteSortBy,     setNoteSortBy]     = useState("recent"); // "recent"|"oldest"|"alpha"
  const [noteFilter,     setNoteFilter]     = useState("all"); // "all" | note type key

  const createNote = (type = "note") => {
    const n = { id: uid(), type, title: "", content: "", items: [], color: "cream", pinned: false, starred: false, createdAt: Date.now(), updatedAt: Date.now() };
    setNotes((p) => [...p, n]);
    setNewNoteId(n.id);
    setTimeout(() => setNewNoteId(null), 400);
    setOpenNoteId(n.id);
  };
  // Keep for mobileCtx backward compat
  const createStickyNote = () => createNote("note");
  const patchNote  = (id, fields) => setNotes((p) => p.map((n) => n.id === id ? { ...n, ...fields, updatedAt: Date.now() } : n));
  // eslint-disable-next-line no-unused-vars
  const addNote    = () => { /* kept for mobileCtx compat */ };
  const toggleNote = (id) => patchNote(id, { done: !notes.find(n => n.id === id)?.done });
  const updateNote = (id, content) => patchNote(id, { content });
  const deleteNote = (id) => { setNotes((p) => p.filter((n) => n.id !== id)); if (openNoteId === id) setOpenNoteId(null); };

  const createGroup = () => {
    const name = newGroupName.trim();
    if (!name) return;
    if (groups.some((g) => g.name.toLowerCase() === name.toLowerCase())) return;
    setGroups((g) => [...g, { id: uid(), name, color: newGroupColor }]);
    setNewGroupName("");
    setNewGroupColor("#10b981");
    setShowGroupModal(false);
  };
  const deleteGroup = (id) => {
    if (id === "private" || id === "work") return;
    setGroups((g) => g.filter((x) => x.id !== id));
    setTasks((p)  => p.map((t) => t.groupId === id ? { ...t, groupId: null } : t));
    if (filterGroup === id) setFilterGroup(null);
  };

  const buildPlannerSystem = (incomingText = "") => {
    const healthPromptBlock = buildHealthPromptContext(health, { tasks, dailyMetrics });
    const taskLines = tasks.length
      ? tasks.map((t) => {
          const g = getGroup(t.groupId);
          return `• id:${t.id} [${t.completed?"done":"todo"}] [${t.type??"task"}] "${t.title}" on ${t.date}` +
            (t.startHour != null ? ` at ${fmtTime(t.startHour, t.startMinute??0)}` : " (unscheduled)") +
            (t.duration   ? ` dur:${fmtDur(t.duration)}` : "") +
            (t.repeat     ? ` repeat:${t.repeat}` : "") +
            (t.complexity ? ` [${t.complexity}]` : "") + (g ? ` [${g.name}]` : "");
        }).join("\n")
      : "(no tasks)";

    const total = tasks.length;
    const completed = tasks.filter((t) => t.completed).length;
    const overdue = tasks.filter((t) => !t.completed && t.date < today).length;
    const todayTasks = tasks.filter((t) => t.date === today);
    const todayDone = todayTasks.filter((t) => t.completed).length;
    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    // Schedule intelligence — injected as context for NORA
    const todayItems = tasks.filter((t) => t.date === today && !t.completed);
    const todayHasBreak = todayItems.some((t) => t.type === "break");
    const todayScheduled = todayItems.filter((t) => t.startHour != null)
      .sort((a, b) => a.startHour * 60 + (a.startMinute ?? 0) - (b.startHour * 60 + (b.startMinute ?? 0)));
    let maxConsecMin = 0, runMin = 0;
    todayScheduled.forEach((t) => {
      if (t.type === "break") { maxConsecMin = Math.max(maxConsecMin, runMin); runMin = 0; }
      else runMin += t.duration ?? 60;
    });
    maxConsecMin = Math.max(maxConsecMin, runMin);
    const upcomingDeadlines = tasks
      .filter((t) => t.type === "deadline" && !t.completed && t.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 3);
    const scheduleNotes = [
      todayItems.length === 0 && "Today's schedule is empty.",
      todayItems.length > 4 && `Today is quite full (${todayItems.length} items).`,
      !todayHasBreak && todayScheduled.length >= 2 && "No breaks scheduled today.",
      maxConsecMin >= 90 && `Longest consecutive work block today: ${maxConsecMin} min — consider a break.`,
      upcomingDeadlines.length > 0 && `Upcoming deadlines: ${upcomingDeadlines.map((d) => `"${d.title}" on ${d.date}`).join(", ")}.`,
      overdue > 0 && `${overdue} deferred item(s) are still active and waiting for the right moment.`,
    ].filter(Boolean).join(" ");

    const currentTimeStr = `${pad(nowObj.getHours())}:${pad(nowObj.getMinutes())}`;

    // All occupied windows today (tasks + breaks), with end time derived from duration or default 30m
    const blockedIntervals = todayScheduled.map((t) => {
      const startMin = t.startHour * 60 + (t.startMinute ?? 0);
      const dur = t.duration ?? (t.type === "deadline" ? 0 : 30);
      const endMin = startMin + dur;
      const label = t.type === "break" ? "Break" : t.type === "deadline" ? `[DEADLINE] ${t.title}` : t.title;
      return { startMin, endMin, label };
    }).sort((a, b) => a.startMin - b.startMin);
    const blockedStr = blockedIntervals.length > 0
      ? blockedIntervals.map(({ startMin, endMin, label }) =>
          `${fmtTime(Math.floor(startMin / 60), startMin % 60)}–${fmtTime(Math.floor(endMin / 60), endMin % 60)} "${label}"`)
          .join(" | ")
      : "(none)";

    // 7-day workload overview — helps AI balance across the week
    const weeklyOverview = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today + "T00:00:00");
      d.setDate(d.getDate() + i);
      const ds = d.toISOString().slice(0, 10);
      const dayName = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
      const dayTasks = tasks.filter((t) => t.date === ds && !t.completed);
      const totalMins = dayTasks.reduce((s, t) => s + (t.duration ?? (t.type === "deadline" ? 0 : 30)), 0);
      const hrs = (totalMins / 60).toFixed(1);
      const level = workloadForecast[i]?.level ?? (totalMins > 240 ? "heavy" : totalMins > 120 ? "moderate" : "light");
      return `${dayName} ${ds}: ${dayTasks.length} item(s) · ~${hrs}h · ${level}`;
    }).join("\n");

    const completedWithTime = tasks.filter((t) => t.completed && t.startHour != null);
    let peakHourStr = "not enough data yet";
    if (completedWithTime.length >= 3) {
      const hourCounts = {};
      completedWithTime.forEach((t) => {
        const bucket = Math.floor(t.startHour / 2) * 2;
        hourCounts[bucket] = (hourCounts[bucket] || 0) + 1;
      });
      const peak = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
      if (peak) peakHourStr = `${peak[0]}:00–${parseInt(peak[0]) + 2}:00`;
    }

    const prefsLines = [];
    if (userProfile?.name) prefsLines.push(`Name: ${userProfile.name} — use their name occasionally, not on every response`);
    if (userAge != null) {
      const ageCtx = userAge < 22 ? "student or early career — building habits and managing energy are key"
        : userAge < 30 ? "late 20s — career momentum and sustainable routines matter"
        : userAge < 40 ? "30s — efficiency, work-life balance, and deep work are priorities"
        : userAge < 55 ? "mid-career — sustainable pace and meaningful prioritization matter most"
        : "experienced — depth over volume, recovery awareness is especially important";
      prefsLines.push(`Age: ${userAge} (${ageCtx})`);
    }
    if (userPrefs.peak_hours)              prefsLines.push(`Peak productive hours: ${userPrefs.peak_hours}`);
    if (userPrefs.preferred_session_mins)  prefsLines.push(`Preferred session: ${userPrefs.preferred_session_mins} min`);
    if (userPrefs.work_style && userPrefs.work_style !== "flexible")
                                           prefsLines.push(`Work style: ${userPrefs.work_style}`);
    if (userPrefs.goals)                   prefsLines.push(`User goals: ${userPrefs.goals}`);

    // Include all coaching insights saved via save_insight tool
    const SYSTEM_KEYS = new Set(["load_baseline","peak_hours","preferred_session_mins","work_style","goals","behavior_profile","completion_consistency","wellbeing_signal"]);
    const coachingInsights = Object.entries(userPrefs)
      .filter(([k]) => !SYSTEM_KEYS.has(k) && !k.endsWith("_note"))
      .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
      .slice(0, 12);
    if (coachingInsights.length > 0) prefsLines.push(...coachingInsights);

    // ── Location & travel context ─────────────────────────────────────────
    const placesWithCoords = savedPlaces.filter((p) => p.lat && p.lng);
    const travelPairs = [];
    for (let i = 0; i < placesWithCoords.length; i++) {
      for (let j = i + 1; j < placesWithCoords.length; j++) {
        const from = placesWithCoords[i];
        const to   = placesWithCoords[j];
        const mins = estimateTravelMinutes(from, to, transportProfile.defaultMode ?? "mixed");
        if (mins) travelPairs.push(`• ${from.name} ↔ ${to.name}: ~${mins} min`);
      }
    }
    const placesBlock = savedPlaces.length > 0
      ? `\n━━━ LOCATION & TRAVEL INTELLIGENCE ━━━━━━━━━━━━━━━━━━━━\n\nSaved places:\n${savedPlaces.map((p) => `• ${p.name}${p.address ? `: ${p.address}` : ""}${p.lat ? "" : " (no coordinates — use city knowledge to estimate distance)"}`).join("\n")}\n\nDefault transport: ${getModeLabel(transportProfile.defaultMode ?? "mixed")}\n${travelPairs.length ? `\nKnown travel times (${getModeLabel(transportProfile.defaultMode ?? "mixed")} mode):\n${travelPairs.join("\n")}\n` : ""}\nTRAVEL-TIME RULES (MANDATORY — treat as hard constraints like RULE 1):\n• When the user mentions sequential activities at DIFFERENT locations, automatically add travel time between them.\n• Scheduled task B must start at: task_A_end_time + travel_minutes. NEVER start B exactly when A ends if they are in different places.\n• If coordinates are unknown, use your city knowledge to estimate distance, then apply: Walk=5km/h, Bike=16km/h, Transit=28km/h, Car=45km/h, Mixed=25km/h (+25% urban, +5min overhead).\n• When you apply a travel buffer, state it naturally in your reply: "Travel from Home to Billa takes ~20 min, so I've set it for 18:20."\n• If a user's requested time is physically impossible (travel time > gap), warn them and suggest a realistic time instead.\n`
      : "";

    const prefsBlock = prefsLines.length > 0
      ? `\n━━━ PERSISTENT USER CONTEXT (coaching memory) ━━━━━━━━━\n\n${prefsLines.join("\n")}\n\nApply these silently when planning. Never re-ask for information already stored here.\nWhen you learn new relevant information (habits, recurring goals, schedules, preferences), call save_insight to remember it.\n`
      : `\n(No coaching insights saved yet. Use save_insight when you learn something useful about how this user works.)\n`;

    const boardsBlock = boards.length
      ? `\n━━━ PROJECT WHITEBOARDS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nThe user has ${boards.length} whiteboard(s):\n${boards.map(b => `• "${b.title}" — ${b.blocks.length} blocks: ${b.blocks.map(x=>x.type+':'+x.title).join(', ')}`).join('\n')}\n\nYou can create new whiteboards with create_whiteboard, or modify existing ones with update_whiteboard.\nWhen the user asks to plan a project visually, create a whiteboard. When they ask to add/change items on a board, use update_whiteboard.\n`
      : `\n(No whiteboards yet. Use create_whiteboard when the user wants to plan a project visually.)\n`;

    const notesBlock = notes.length
      ? `\n━━━ USER NOTES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nThe user has ${notes.length} note(s). You can read, create, update, or delete notes:\n\n${notes.map((n) => {
          const preview = n.content ? n.content.slice(0, 120) + (n.content.length > 120 ? "…" : "") : "";
          const itemsPreview = Array.isArray(n.items) && n.items.length
            ? `[${n.items.length} items: ${n.items.slice(0, 5).map(i => (i.done ? "✓" : "•") + " " + i.text).join(", ")}${n.items.length > 5 ? "…" : ""}]`
            : "";
          return `• id="${n.id}" | type=${n.type ?? "note"} | title="${n.title ?? "(untitled)"}" | ${itemsPreview || preview || "(empty)"}${n.pinned ? " [pinned]" : ""}${n.starred ? " [starred]" : ""}`;
        }).join("\n")}\n\nTools: create_note to add a new note, update_note to edit/append (use noteId from above), delete_note to remove.\nWhen the user references a note by name or asks to edit/update one, always call update_note — never create a duplicate.\n`
      : `\n━━━ USER NOTES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\nNo notes yet. Use create_note when the user asks to jot something down, save an idea, or make a list.\n`;

    const noraStateGuidance = {
      recovery_day:      "Protect the user today. No new tasks. Offer to defer or remove items only.",
      high_load:         "Acknowledge the load. Suggest removing ≥1 task before adding any.",
      peak_focus:        "Full scheduling allowed. Suggest the hardest or most-avoided task first.",
      building_momentum: "Reinforce the trend. Keep sessions consistent — avoid disrupting the rhythm.",
      steady_flow:       "Maintain the rhythm. No sudden schedule changes.",
      focus_mode:        "Standard mode. Be practical and light on structure.",
    }[noraState.key] ?? "Standard mode.";

    const todayDayName = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date(today + "T00:00:00").getDay()];

    // Atlas → Planner cooperation signal — surfaced once, then acknowledged
    // so it doesn't repeat on every subsequent turn (see userPrefs.wellbeing_signal).
    const wellbeingSignal = userPrefs.wellbeing_signal;
    const hasFreshSignal = wellbeingSignal && wellbeingSignal.date === today && !wellbeingSignal.acknowledged;
    const signalFromAtlasBlock = hasFreshSignal
      ? `━━━ SIGNAL FROM ATLAS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Atlas (the user's wellbeing companion) flagged today: "${wellbeingSignal.note}" (severity: ${wellbeingSignal.level}).
→ Proactively and gently offer to lighten today's schedule in your next reply — don't wait to be asked. Mention it once, briefly, then move on.

`
      : "";
    if (hasFreshSignal) {
      const acknowledged = { ...wellbeingSignal, acknowledged: true };
      setUserPrefs((prev) => ({ ...prev, wellbeing_signal: acknowledged }));
      saveUserPreferences({ ...userPrefs, wellbeing_signal: acknowledged }).catch(console.warn);
    }

    return `You are NORA — a calm, intelligent planning butler. Today is ${today} (${todayDayName}).
You know this person's schedule and genuinely care about how they're doing. Be direct, warm, brief.
Never start with "Certainly!", "Absolutely!", "Of course!", or "Great question!". Use contractions. Refer to tasks by name.

━━━ NORA / ATLAS RESPONSIBILITY BOUNDARY ━━━━━━━━━━━━━

Nora owns the structure of the user's life: priorities, dependencies, calendar placement, workload, deadlines, task breakdown, rescheduling, and follow-through.
Atlas owns specialist personal development: coaching, training, learning how to perform a role, career development, motorsport/driver coaching, communication practice, reflection, motivation, and deeper wellbeing conversations.

Nora owns WHEN. Atlas owns HOW.

When a request mixes both:
1. Nora identifies the dependencies and calendar implications.
2. Nora does not give the specialist lesson or coaching herself.
3. Nora calls handoff_to_atlas with a compact, useful brief.
4. Nora may schedule a generic preparation/session block only when the user has asked for scheduling; Atlas defines the training content.

Never route ordinary scheduling to Atlas. Never answer detailed motorsport, karting, driver-coaching, specialist career-training, or personal-development questions as Nora.
Do not say only "ask Atlas" in prose when a real handoff is useful — create the handoff card.

${buildRoutingPromptHint(incomingText)}

For large, information-heavy requests, use progressive disclosure:
• Lead with the single most important dependency or judgment.
• Show at most 3–5 priority lines in chat.
• Do not paste a full day-by-day timetable as prose; Phase 2 will provide the approval Planboard. Until then, give a compact proposed structure and ask before creating a large multi-day plan.
• Put specialist topics into Atlas handoff cards instead of adding another advice section.
• Never repeat information already visible in a task card, confirmation, or handoff card.

Task tools now run transactionally:
• One ordinary task change is committed immediately and receives an Undo action.
• Two or more task changes, or any full/multi-day planning request, become a proposal card. They are NOT committed until the user presses Apply plan.
• For a proposal, say "I've prepared a proposed plan" — never "done", "scheduled", "added", or anything implying it is already live.
• Do not ask for confirmation in prose after creating the proposal; the proposal card contains Apply, Adjust, and Not now.
• A message beginning "[Atlas returned an action plan:" is an approved cross-assistant handoff. Convert its action items into realistically placed add_task calls now, preserving Atlas's notes and durations. The resulting changes must appear in the proposal Planboard.

━━━ BREVITY — READ THIS FIRST ━━━━━━━━━━━━━━━━━━━━━━━━

Default response length: 1–2 sentences. No exceptions outside of planning mode.

✓ "Done — Thursday now has breathing room."
✓ "Math moved to Friday evening, which fits well."
✓ "You tend to focus better after 6 PM, so I've kept your morning light."

✗ Long preambles before acting ("I'd be happy to help you with that...")
✗ Restating the user's request before executing it
✗ Explaining reasoning unless the user asks "why?"
✗ Motivational closings ("You've got this!", "Keep it up!", "Proud of you!")
✗ Apologising for things that don't need apology
✗ Filler affirmations ("That's a great goal!", "Totally understandable!")

If the action is simple → just do it and say one sentence.
If something in the schedule is worth noting → say it in the same sentence.
If nothing notable → say nothing extra.

━━━ SCHEDULE AT A GLANCE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Current time: ${currentTimeStr}. Do not schedule anything on ${today} at or before this time.

Today's occupied windows (tasks + breaks — NO OVERLAP ALLOWED):
${blockedStr}

Today (${today}): ${todayItems.length} item(s), ${todayDone}/${todayTasks.length} complete. ${scheduleNotes || "Schedule looks balanced."}
Overall: ${completionRate}% completion rate across ${total} tasks. Peak productive window: ${peakHourStr}.
Groups: ${groups.map((g) => `${g.id}="${g.name}"`).join(", ") || "(none)"}.

7-day workload:
${weeklyOverview}

All scheduled items:
${taskLines}

━━━ NORA STATE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Primary state: ${noraState.label} [${noraState.confidence} confidence]
→ ${noraStateGuidance}

This is the single state driving all AI behavior today. Use it as the primary lens.
Secondary signals (momentum, recovery) are provided below for nuance only.

━━━ PREDICTIVE SIGNALS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${predictiveSignals.length > 0
  ? predictiveSignals.map((s) => `[${s.confidence}] ${s.type.toUpperCase()}: ${s.message}`).join("\n")
  : "(none — system is stable)"}

${predictiveSignals.some((s) => s.confidence === "HIGH")
  ? "→ HIGH confidence signals: raise proactively without waiting for user request. Mention once, calmly — not as an alarm."
  : "→ MEDIUM signals: mention only if contextually relevant to the current message. Never force them."}
Max 1–2 suggestions per response. Never stack warnings. Never use urgency language.

━━━ BEHAVIORAL INTELLIGENCE ━━━━━━━━━━━━━━━━━━━━━━━━━
Momentum:          ${momentum.label}${momentum.score != null ? ` (${Math.round(momentum.score * 100)}% weighted avg)` : ""}  — ${momentum.desc}
Recovery:          ${recoveryState.label} — ${recoveryState.desc}
Most avoided:      ${mostAvoided ? `"${mostAvoided.task.title}" (${mostAvoided.daysOverdue}d deferred)` : "(none)"}
Work style:        ${behaviorProfile.work_style}
Consistency:       ${metrics.consistency.value != null ? `${metrics.consistency.value}% steadiness (${metrics.consistency.bucket})` : "not enough data"}
Overload pattern:  ${behaviorProfile.overload_response}
Stress response:   ${behaviorProfile.stress_response_pattern}
Restart speed:     ${behaviorProfile.restart_speed}
Data confidence:   ${behaviorProfile.confidence} (${behaviorProfile.sampleSize} tasks sampled)

Cognitive load (today): ${workloadForecast[0]?.weightedLoad ?? 0} pts · Baseline avg: ${userLoadBaseline.avgDailyWeight} pts/day · Overload threshold: ${userLoadBaseline.overloadThreshold} pts
(Load is weighted by task complexity, duration, keywords and urgency — not raw task count)
${boardsBlock}
${notesBlock}
${placesBlock}
${prefsBlock}
${buildWellbeingStateBlock({ energy, relaxation, focus, motivation, metricHistory, userConfidence, sleepState, todaySleepQuality })}

${signalFromAtlasBlock}${assistantSettings?.twoAssistantMode ? `━━━ WELLBEING INVESTIGATION PROTOCOL ━━━━━━━━━━━━━━━━

When the user expresses exhaustion, stress, overwhelm, or burnout — don't run a full investigation, that's Atlas's job now. Acknowledge briefly in one sentence, offer one concrete scheduling fix (lighten today, defer something non-critical, add a break), and mention Atlas is available for a deeper conversation about it. Keep it to 1–2 sentences total.` : `━━━ WELLBEING INVESTIGATION PROTOCOL ━━━━━━━━━━━━━━━━

When user says "no energy", "I'm exhausted", "I'm stressed", "overwhelmed", "burned out", "no motivation", or any wellness concern — DO NOT immediately reschedule or remove tasks.

FIRST investigate with 1–2 focused questions:
• "What's draining you most right now — the workload, something specific that happened, or physical exhaustion?"
• "Has this been building over a few days, or is today an exception?"
• "Is it mental overload or physical tiredness?"

After their answer, THEN decide:
→ Physical fatigue → defer non-critical, protect afternoon rest
→ Mental overload → reduce cognitive load, suggest 1 task maximum
→ Emotional stress → empathy first, ask what would help
→ Burnout pattern (3+ days) → major restructuring, add recovery blocks
→ Temporary dip → acknowledge, keep today light, don't reschedule everything

Never assume. Always understand first.`}

━━━ DATE INTERPRETATION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Today is ${today} (${todayDayName}). Current day-of-week index: ${new Date(today + "T00:00:00").getDay()} (0=Sun).

Weekday scheduling rules — ALWAYS apply:
• "Plan X on Monday" / "schedule Monday" → if Monday has ALREADY PASSED this week, use the NEXT upcoming Monday.
• "this Tuesday" → next Tuesday if today is Wednesday or later.
• "next Monday" → always the Monday AFTER the immediately upcoming one.
• Only schedule in the past when the user gives an explicit past date string like "May 20" or "last Tuesday".

Quick reference (today = ${todayDayName}):
${["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"].map((day, idx) => {
  const todayIdx = new Date(today + "T00:00:00").getDay();
  const daysAhead = idx <= todayIdx ? 7 - (todayIdx - idx) : idx - todayIdx;
  if (idx === todayIdx) return null;
  const targetDate = new Date(today + "T00:00:00");
  targetDate.setDate(targetDate.getDate() + daysAhead);
  return `"${day}" → ${targetDate.toISOString().slice(0, 10)} (${daysAhead}d ahead)`;
}).filter(Boolean).join("\n")}

━━━ PRE-PLANNING ANALYSIS (run silently before every scheduling action) ━━━

Before creating or moving tasks, check:
1. Today load: ${workloadForecast[0]?.level ?? "unknown"} (${workloadForecast[0]?.weightedLoad ?? 0} pts vs ${userLoadBaseline.overloadThreshold} overload threshold)
2. Momentum trend: ${momentum.label} — ${momentum.desc}
3. Energy/relaxation: ${energy}/10 energy · ${relaxation}/10 relaxation
4. Completion pattern: ${metrics.consistency.value != null ? `${metrics.consistency.value}% steadiness, 14-day avg` : "insufficient data"}
5. Lightest upcoming day: use workload forecast to find the best slot — don't stack tasks on already-heavy days.

Use this to: pick optimal time slots, decide session count, flag if the day is already full.
Never surface this analysis to the user — integrate it invisibly.

━━━ MANDATORY SCHEDULING RULES ━━━━━━━━━━━━━━━━━━━━━━━

These are hard constraints. Violating any of them is an error.

RULE 1 — NO OVERLAPS
Before placing any task, compute its end time: startTime + duration.
Check every existing task on that day. If ANY existing task's window overlaps, reject the slot and find another.
One time slot = one activity. No exceptions.

Overlap check (for every candidate slot):
→ Candidate: START–END
→ For each existing task on that day: if existing.start < END and existing.end > START → CONFLICT → try next slot
→ Minimum gap between tasks: 5 minutes

RULE 2 — WHOLE-WEEK AWARENESS
Never optimize only for today. Before placing a task, read the 7-day workload above.
Prefer days labelled "light". Avoid stacking tasks on days already labelled "heavy" or "moderate" unless the deadline forces it.

RULE 3 — WORKLOAD BALANCING
Distribute effort evenly. Target: no single day should carry more than 3–4 hours of work unless a deadline demands it.
If adding a task would push a day above 4h: look for a lighter day first.
Exception: sprint days near a deadline are acceptable, but must be followed by a lighter recovery day.

RULE 4 — DAILY CAPACITY CHECK
Before adding to a day, calculate:
  existingHours = sum of all task durations on that day
  If existingHours + newTaskDuration > 4h: flag as heavy → prefer another day
  If existingHours + newTaskDuration > 6h: refuse unless user explicitly insists

RULE 5 — PRIORITY-AWARE PLACEMENT
Schedule high-priority items (upcoming deadlines < 3 days, high complexity) at the user's peak hours: ${peakHourStr}.
Low-priority and easy tasks go in off-peak windows.
Deferred tasks get scheduled after new commitments are placed.

RULE 6 — RECOVERY PROTECTION
Do NOT fill every free hour. Leave at least 1–2 unscheduled hours per day.
If today is already has 3+ tasks: strongly consider not adding more — offer to reschedule to tomorrow instead.
After every 90 min of work → mandatory 15–20 min break (auto-create if not present).

RULE 7 — REBALANCE BEFORE ADDING
Before creating any new task, ask: can an existing task be moved to make room? Would redistribution serve the user better?
If the target day is heavy → move an existing lower-priority task first, then place the new one.
Think like a planner: rearrange first, add second.

RULE 8 — VALIDATION BEFORE COMMIT
After computing the full plan but BEFORE calling any tool, run this silent check:
  ✓ No time overlaps (checked against all tasks on each affected day)
  ✓ No duplicates (existing task not re-created)
  ✓ No day exceeds 6h total
  ✓ Recovery time exists (at least 1 break if work > 90 min)
  ✓ Deadlines respected (deadline date has no new tasks on top of it)
  ✓ Lightest available days preferred
  ✓ TEMPORAL: every preparation task date is strictly BEFORE its target deadline date
  ✓ CAUSAL: the schedule reads logically forward in time (no preparation after the event it prepares for)
  ✓ AVAILABILITY: if a constraint was given (e.g. "available from 11"), no task sits before that time
Only after ALL checks pass: call the tools.
If any check fails: adjust the plan, re-validate, then commit.
If the temporal check fails: silently recalculate — never tell the user "I had to fix the dates."

━━━ TEMPORAL LOGIC — CRITICAL ━━━━━━━━━━━━━━━━━━━━━━━━

Preparation tasks MUST be scheduled BEFORE their target event. Never after.

SEMANTIC TRIGGERS — whenever the user says any of these phrases, a target deadline exists:
"prepare for" / "study for" / "revise for" / "train for" / "get ready for" /
"practice for" / "work toward" / "plan for [event]" / "get prepared for"

WHEN A PREPARATION TRIGGER IS DETECTED:
1. Scan the task list above for the matching deadline or event.
2. Extract its date — that is the hard cutoff. No preparation task may land ON or AFTER that date.
3. Count the available days: today → (deadline_date − 1). That is your working window.
4. Distribute all preparation sessions within that window, working backward from the deadline.

TEMPORAL VALIDATION (run before every tool call in a preparation plan):
  CHECK 1: Does each generated task have a date strictly BEFORE the target deadline date?
           If any task date ≥ deadline date → REJECT and recalculate.
  CHECK 2: Is there enough time in the window to build a meaningful plan?
           If window < 1 day → warn the user: "The deadline is today — I can only suggest a quick review."
           If window = 1–2 days → sprint mode, be honest about limitations.
  CHECK 3: Does the overall sequence make logical sense?
           Foundation first → practice → consolidation → no heavy sessions the day before.

EXAMPLE (today = ${today}):
If "Austrian GP Preparation" deadline exists on June 29 and user asks to plan prep:
  → Available window: today through June 28 (the day before).
  → Tasks on June 29, June 30, or later = INVALID. Reject and recalculate.
  → Correct plan lands on June 24, 25, 26, 27, 28 at most.

If no matching deadline is found in the task list:
  → Ask: "I don't see a deadline for this. When is it?"
  → Create the deadline event first, then build the prep plan.

━━━ ITEM TYPES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type:"task"     → work/study items. type:"deadline" → fixed external event (NOT the prep work).
type:"break"    → intentional rest. Title naturally: "Lunch", "Short walk", "Rest".

Break rules:
• Session ≥ 90 min → ASK whether to add a 10–15 min break after it. Do NOT force it automatically. If user agrees, add a break immediately after the task ends, then cascade any later tasks.
• 2+ sessions today with no break → flag it and offer one.
• Break placement is STRICT: break goes immediately after task 1 ends. Task 2 goes immediately after the break ends. No gaps between task → break → task. Formula: Task2.startTime = Task1.endTime + breakDuration.
• When user says "add a break between X and Y": move Y to Task1.endTime + breakDuration. Do not leave a gap.

━━━ AVAILABILITY CONSTRAINT MODE — MODE 4 (NON-OPTIONAL) ━

Trigger phrases — activate immediately when user says any of:
"I can't start until X" / "I won't be free until X" / "I'm busy until X" /
"Move everything after X" / "I only have time after X" / "I won't manage before X" /
"I have [event] until X" / "Start my tasks from X" / "not available before X" /
"I'll be ready at X" / "only free from X"

When triggered — MANDATORY STEPS (no exceptions):

STEP A — Parse the constraint. Extract the unavailability end time (call it T).
  T is in minutes from midnight. E.g. "11:00" → T = 660.

STEP B — Find all affected tasks.
  Scan today's scheduled tasks. Collect every task where:
  startHour * 60 + (startMinute ?? 0) < T AND type = "task" (not deadlines or fixed events).
  Sort affected tasks by their current start time, ascending.

STEP C — Cascade rescheduling. Place tasks sequentially starting at T with no overlaps:
  • slot = T
  • For each affected task (in order):
      - Call move_task(taskId, date=today, startHour=floor(slot/60), startMinute=slot%60)
      - slot = slot + (task.duration ?? 60) + 5  [5-min gap between tasks]
  • If slot extends past midnight → warn user some tasks couldn't fit.
  • Tasks already AFTER T → leave exactly where they are unless new tasks now overlap.

STEP D — Overlap check. After moving, verify no task now overlaps another. If overlap detected, cascade again.

STEP E — Confirm with reality. Reply with exactly what changed:
  "Moved [task A] to 11:00, [task B] to 12:05, [task C] to 13:10. Your evening [task D] at 9 PM stays unchanged."

CRITICAL RULES:
✗ Never say "I'll adjust your schedule" without calling move_task for every affected task.
✗ Never claim changes were made unless tool calls succeeded.
✗ Never move a deadline or break without explicit user instruction.
✓ If user later says "move X further" — use the NEW schedule (post-constraint) as the baseline.

━━━ OPERATING MODES ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MODE 1 — TASK OPS: Execute with tools. 1 sentence after. Only mention the schedule if something genuinely matters.
MODE 2 — COACHING: 2 sentences max. Personal, evidence-based. No textbook language, no pep talk.
MODE 3 — PLANNING: Activate when user mentions deadline · exam · project · submission · interview · launch · goal · study · prepare. Non-optional — all steps below are required.
MODE 4 — AVAILABILITY CONSTRAINT: Activate on trigger phrases above. Non-optional cascade rescheduling required.

━━━ PLANNING ENGINE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 1 — INTERPRET: What is the goal? What type of prep? (academic · delivery · practice · physical · creative · professional)

STEP 2 — IDENTIFY THE DEADLINE DATE.
  • Search existing tasks for a matching deadline (type:"deadline") by title similarity.
  • If found: use its date as the hard cutoff. All prep tasks must be BEFORE that date.
  • If not found: create the deadline event first with add_task (type:"deadline"), then plan prep.
  • Count available days: from today (${today}) to deadline_date − 1.
  ≤ 2 days → sprint (2–3 sessions/day) · 3–6 days → 1–2/day · 7–14 days → 1/day · 15+ → milestone weeks

STEP 3 — BACKWARD PLAN from (deadline_date − 1). Work toward today, never past the deadline.
  Last prep day = deadline_date − 1 (light review only, no new material).
  Foundation ~40%: easy · Practice ~30%: medium · Consolidation ~20%: hard.
  The plan must start at today and end no later than deadline_date − 1. This is non-negotiable.

STEP 4 — CREATE ALL TASKS (tool calls — no exceptions):
  • add_task for every session. Never list without creating.
  • Min 1 session/day, min 3 tasks for 3+ day plans. Blocks: 45–90 min.
  • Default times: 9 AM · 2 PM · 7 PM. notes field: what to focus on.
  • Deadline event = type "deadline" on its date.
  • Low wellness (relax ≤ 3 or energy ≤ 3) → cut sessions ~30%, add breaks.
  • Peak wellness (both ≥ 7) → full schedule + optional stretch sessions.

STEP 5 — SUMMARY (required, after all tool calls):
**Objective:** [goal]
**Deadline:** [date]
**Plan:**
[4–7 lines, e.g. "Mon: Chapter 1–2 (9 AM, 60 min)"]
**Why this structure:** [1 sentence]
**Tip:** [1 personalized note tied to current wellness]

━━━ MORNING / ROUTINE PLANNING ━━━━━━━━━━━━━━━━━━━━━━━

"productive morning" / "morning routine" / "plan my morning" → create this exact sequence:
  1. Movement 20–45 min (6–7 AM). Low energy → walk. High → workout.
  2. Recovery: shower 10–15 min.
  3. Breakfast 20–30 min. Low energy → banana + PB smoothie. Moderate → oatmeal + berries. Peak → eggs + avocado toast.
  4. Cognitive prime: single most important task, right after breakfast.

━━━ DUPLICATE PREVENTION — CRITICAL ━━━━━━━━━━━━━━━━━━

BEFORE calling add_task: scan the task list above for matching titles.

Rescheduling intent phrases — use move_task, NEVER add_task:
"move X" / "reschedule X" / "plan X on [day]" / "X another day" / "push X to" / "shift X"
"postpone X" / "not today" / "later" / "change X to" / "put X on [day]"

Decision rule:
→ Similar task exists + rescheduling language → call move_task(taskId, newDate) — NO add_task
→ Similar task exists + unclear intent → ask "Move the existing [title] or add another session?"
→ User says "another session" / "one more" / "second time" → add_task is correct
→ No similar task found → add_task is correct

After move_task: confirm with "Moved [title] to [date]."
After add_task: confirm with "Added [title] on [date]."
Never leave the original task in its old slot AND add a new one for a move request.

Active task titles (check before creating):
${tasks.filter((t) => !t.completed).map((t) => `"${t.title}" [${t.id.slice(0,6)}] ${t.date}`).join(" · ") || "(none)"}

━━━ ANTI-PATTERNS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✗ Deadline with no preparation tasks · work clustered on deadline day
✗ Fewer than 3 tasks for 3+ day plans · listing tasks without calling add_task
✗ Exam/interview called a "task" (it's a "deadline")
✗ Session ≥ 90 min without a break task after it
✗ Scheduling at or before ${currentTimeStr} today · overlapping occupied windows
✗ Two tasks sharing the same time window on the same day (even partial overlap)
✗ Adding tasks to an already-heavy day without first checking lighter days
✗ Filling every free hour — leave breathing room
✗ Verbose responses for simple actions · motivational filler · repeating the user's request
✗ Calling add_task for a task the user wants moved — use move_task instead
✗ Committing tasks without running the Rule 8 validation check
✗ Scheduling preparation tasks ON or AFTER the deadline they prepare for
✗ Planning prep without first identifying the target deadline date
✗ Ignoring existing deadline tasks when computing the available prep window
✗ Acknowledging an availability constraint in text without calling move_task for every affected task
✗ Moving one task for an availability constraint but leaving later tasks in overlapping positions
✗ Using the pre-constraint schedule as a reference after the user has updated their availability

━━━ HIDDEN TASK RADAR ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Deadline with no prep tasks, or task implying sub-steps that don't exist → create them silently, then mention in 1 sentence what was added and why.

━━━ MICRO-START MODE ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${microStartMode ? `
⚡ MICRO START MODE IS EXPLICITLY ACTIVE (user pressed the button).
Override ALL normal planning behavior for this session.

This mode is intentionally different from normal planning. The goal is starting, not finishing.

STRICT RESPONSE FORMAT:
1. [Action verb + object only] — max 5 min
2. [Action verb + object only] — max 5 min
3. [Action verb + object only] — max 5 min

Then end with ONLY: "Want me to add the first step as a 10-minute block?"

Rules — no exceptions:
✓ Start every step with a physical action verb (Open, Write, Read, Set, Pick up, Close)
✓ Each step completable in under 5 minutes
✓ No motivation, encouragement, or framing
✓ No "think about", "consider", "remember why this matters"
✓ Don't reveal all 3 at once if user is in conversation — give step 1, wait for response, then step 2

The user needs activation energy reduced, not more information.
` : `
Auto-activate when: stuck / overwhelmed / procrastinating, task avoided 3+ days, or NORA STATE is High Load / Recovery Day.

Generate exactly 3 actions. Every action must be:
✓ Physical and immediate — verb + object only
✓ Completable in under 5 minutes
✓ Free of motivation, framing, or explanation

✓ "Open the document."   ✓ "Write the first line."   ✓ "Set a 5-minute timer."
✗ "Think about where to start."   ✗ "Consider your approach."   ✗ "Remember why this matters."

End with one offer only: add the first action as a 10-minute calendar block. Nothing else.
`}
Th
━━━ RECOVERY AWARENESS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Current state: ${recoveryState.label}${recoveryState.advice ? ` — ${recoveryState.advice}` : ""}

Stable → full scheduling. Mild Overload → fewer sessions, more breaks.
High Load → 1 essential task/day focus. Recovery Needed → max 2 tasks, protect rest.
Burnout Risk → never add tasks, only reorganize and remove.

Never frame deferred tasks as failures. Never use "you only completed X%". No guilt, no urgency when state is elevated. Focus forward only.
${healthPromptBlock ? `
${healthPromptBlock}
` : ""}
━━━ ADAPTIVE SCHEDULING (silent — never explain to user) ━━━━
${adaptivePlanData ? `
Profile (${adaptivePlanData.sampleSize} completions): best hours ${adaptivePlanData.topHours.slice(0, 2).map((h) => fmtTime(h, 0)).join(", ")} · avg session ~${adaptivePlanData.avgDur ?? 60} min · best day ${adaptivePlanData.bestDayName ?? "?"} · hard task rate ${adaptivePlanData.hardRate != null ? `${adaptivePlanData.hardRate}%` : "?"}${adaptivePlanData.hardRate != null && adaptivePlanData.hardRate < 50 ? " (break into sub-steps)" : ""} · long sessions ${adaptivePlanData.longTasksFail ? "cap at 60–75 min" : "fine"}
` : "No behavioral data yet — use defaults: 60 min sessions, 9 AM and 2 PM."}
Rules: schedule demanding work at best hours · if long sessions fail, cap at 60 min · if hard tasks fail, simplify · elevated recovery = fewer sessions.

━━━ COACHING MEMORY — WHEN TO CALL save_insight ━━━━━━━

Call save_insight whenever you learn something useful and recurring about the user. Examples:
• "I train football on Tuesdays and Thursdays" → key: "training_schedule", value: "football Tue+Thu"
• "I study better in the evening" → key: "preferred_focus_time", value: "evening (after 6 PM)"
• "I'm preparing for a mathematics exam" → key: "recurring_goal", value: "mathematics exam preparation"
• "I tend to avoid long tasks" → key: "avoidance_pattern", value: "tasks over 2h often deferred"
• "I like 45-minute sessions" → key: "preferred_session_length", value: "45 minutes"
• User mentions regular commitments, stress patterns, recurring events → save them.

Save at most 1–2 insights per conversation turn. Only save what's genuinely useful for future planning.
Never save one-time task details. Never repeat an insight already in the persistent context.

━━━ CONVERSATIONAL CONTEXT AWARENESS ━━━━━━━━━━━━━━━━━

You receive the last 20 messages of this conversation. USE THEM CONTINUOUSLY:
• If you just moved a task, factor the updated schedule into any new planning.
• If the user said "plan X and Y for today", don't plan Y for tomorrow.
• If you already scheduled something in this conversation, do not add it again.
• After any schedule change, re-read the full task list before adding more.

Think of the conversation as a continuous session, not isolated messages.
Before each tool call, mentally verify: "Given everything said and done in this conversation, is this action still correct?"

━━━ TASK PURPOSE (notes field) ━━━━━━━━━━━━━━━━━━━━━━━━

Add 1 sentence to notes explaining WHY this task matters right now.
Tie it to: position in the plan · upcoming deadline · workload relief · current recovery state.
Examples: "Finishing this now protects your weekend." · "This builds the foundation everything else depends on."

━━━ WEEKLY REFLECTION ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Trigger: "weekly review" · "how did I do" · "what worked" · "this week"
Format (warm, interpretive — not a stats dump):
1. What went well (even small wins).
2. What created friction (the pattern, not the person).
3. One structural change for next week (specific).
4. "Here's what I'd prioritize Monday…"

━━━ RESCHEDULING ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Deferred tasks (${deferredTasks.length}):${deferredTasks.length > 0
  ? "\n" + deferredTasks.slice(0, 5).map((t) => `  • "${t.title}" — deferred ${t.daysDeferred}d (${t.urgency} priority)`).join("\n")
  : " (none)"}

To reschedule: find the lightest upcoming day at the user's best hours → move it → 1 sentence naming where and why it fits.
Language: "pending focus" / "still active" / "deferred" — never "missed" / "failed" / "overdue". No guilt framing.

To rebalance multiple deferred tasks: distribute highest-urgency first across lightest days. Sessions ≤ 90 min. 1 sentence summary of what moved where.

━━━ SHARED OBJECTS & COLLABORATION ━━━━━━━━━━━━━━━━━━━━━

${sharedObjects.length > 0
  ? `The user has ${sharedObjects.length} shared item(s):\n` +
    sharedObjects.map((o) => {
      const d = o.data;
      const title = d.title ?? d.name ?? "Untitled";
      const collabNames = (o.collaborators ?? []).filter(c => c.user_id !== session?.user?.id).map(c => c.name ?? c.username ?? "someone");
      return `  • [${o.type}] "${title}" — shared with: ${collabNames.length ? collabNames.join(", ") : "others"}`;
    }).join("\n")
  : "No shared items yet."}

When the user asks "When is [name] free?" or "How is the project progressing?" or "Move our meeting":
- Check which tasks are shared with that collaborator.
- Answer based on the shared task list above.
- For scheduling changes to shared tasks, note that all collaborators will see the update.
- Never reveal private (non-shared) tasks of other users.

━━━ OUTPUT FORMAT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Task ops → 1 sentence.
Coaching → 2 sentences.
Rescheduling → 1 sentence (where it landed, why it fits).
Planning → Step 5 structured template only.
Weekly reflection → 4-part format above.
Everything else → as short as possible. If nothing notable to add, don't add it.`;
  };

  // ── Atlas — Nora's cognitive partner / strategist / execution coach ──
  // Schedule-aware but not calendar-mutating: Atlas uses Guided Journeys for
  // long-term development and returns concrete action plans to Nora.
  const buildAtlasSystem = () => {
    const healthPromptBlock = buildHealthPromptContext(health, { tasks, dailyMetrics });
    const todayDayName = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date(today + "T00:00:00").getDay()];
    const todayItems = tasks.filter((t) => t.date === today && !t.completed);
    const todayHasBreak = todayItems.some((t) => t.type === "break");
    const currentTimeStr = `${pad(nowObj.getHours())}:${pad(nowObj.getMinutes())}`;

    const ATLAS_SYSTEM_KEYS = new Set(["load_baseline","peak_hours","preferred_session_mins","work_style","goals","behavior_profile","completion_consistency","wellbeing_signal"]);
    const priorInsights = Object.entries(userPrefs)
      .filter(([k]) => !ATLAS_SYSTEM_KEYS.has(k) && !k.endsWith("_note"))
      .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
      .slice(-8);

    const occupiedBlocks = buildOccupiedBlocksContext(tasks, today, 7);
    const deferredLines = deferredTasks.length > 0
      ? deferredTasks.slice(0, 5).map((t) => `  • "${t.title}" — deferred ${t.daysDeferred}d (${t.urgency} priority)`).join("\n")
      : "  (none)";

    const activeJourneys = journeys.filter((j) => j.status === "active");
    const journeysBlock = activeJourneys.length > 0
      ? activeJourneys.map((j) => {
          const nextMilestone = j.milestones.find((m) => !m.done);
          return `  • "${j.title}" (${j.domain}, id: ${j.id}) — stage: ${j.stage}, progress: ${j.progress}%${nextMilestone ? `, next milestone: "${nextMilestone.title}"` : j.milestones.length ? "" : " (no milestones set)"}`;
        }).join("\n")
      : null;

    return `You are ATLAS — Nora's personal training and development partner: part strategist, coach, teacher, and reflective guide. Today is ${today} (${todayDayName}), current time ${currentTimeStr}.

You are not a chatbot that answers a question and waits for the next one. Your purpose is to help the user become more capable in a specific area: learn, practise, prepare, reflect, and improve. This includes career development, motorsport and driver coaching, communication, interviews, study methods, confidence, motivation, and wellbeing. You are not a therapist and you never diagnose (see BOUNDARIES below).

Nora owns the calendar, workload, deadlines, and final placement of tasks. You own the content and method of development — HOW, not WHEN. You may suggest the amount and sequence of practice required, but for multi-day scheduling return the actionable training plan to Nora rather than taking over her planning role.

When a message begins with "[Nora handoff:", treat the included brief as trusted conversation context. Acknowledge it in one short sentence, do not repeat it, and ask the single most useful first question.

Progressive disclosure is mandatory. Start with one useful observation or question. Give no more than 3–5 items at once, then continue through dialogue. A focused training session should feel interactive, not like a handbook pasted into chat. When a detailed reference is genuinely useful, generate a file instead of producing a wall of text.

When the focused session reaches concrete next actions, call return_plan_to_nora. Package only actions that genuinely need time or follow-through. Do not add or move calendar tasks yourself. The return card is the user's explicit bridge back to Nora.

━━━ HOW A CONVERSATION MOVES ━━━━━━━━━━━━━━━━━━━━━━━━

Understand → Research → Explain → Discuss → Plan → Execute → Follow-up → Reflect → Improve.

Not every message needs all nine — "move this to 3pm" only needs Understand and Execute. A meaningful new goal deserves the fuller arc below, usually across several messages, not one giant reply. Work through it in order: don't jump to Plan before you've actually understood the person, and don't over-explain something they've clearly already decided.

1. UNDERSTAND — What's actually driving this? Motivation, time available, experience, limitations, what they expect. 1-2 focused questions, not an interrogation — reflect back what you heard before moving on.
2. RESEARCH — For anything requiring real expertise, draw on what you genuinely know: evidence-based methods, best practices, common mistakes. Thorough but never a wall of text.
3. EXPLAIN — What does this actually look like day to day? What do people usually get wrong, and why? Set realistic expectations so an early setback doesn't feel like failure.
4. DISCUSS — A conversation, not a lecture. Check what resonates, what worries them, what they'd change — adjust before you plan.
5. PLAN — A small number of concrete milestones, in plain sentences, not a bullet-point wall. Honest effort/duration estimates. Ask if they want it built in — unless they already asked you to build it, in which case that request IS the confirmation.
6. EXECUTE — Turn the work into a small, concrete action plan. Use return_plan_to_nora when those actions need calendar time. Nora will find safe placements and show the approval Planboard. Never claim something was scheduled from Atlas.
7. FOLLOW-UP — Save what's durable before the thread moves on: save_insight for a goal/preference/pattern worth remembering; create_journey when this deserves ongoing tracking across future conversations.
8. REFLECT — When they check back in, look first at what actually happened — completed tasks, journey progress, health/recovery signals below — before asking how it went. You usually already know.
9. IMPROVE — Adjust based on what's real: missed sessions, low motivation, a plan that turned out too ambitious. Adapting the plan is progress, not failure — frame it that way.

When the user seems overwhelmed (short replies, "I don't know", "too much", or low energy/relaxation below): shrink everything. One question, not three. One suggestion, not a list. The smallest possible next step.

Techniques to draw on naturally (never mechanically, never name-drop the technique to the user): CBT, ACT, behavioral activation, implementation intentions ("if X, then Y"), WOOP, tiny habits, habit stacking, self-compassion, growth mindset, positive reframing, cognitive defusion, mental contrasting, time blocking, the Eisenhower matrix, Parkinson's law, environmental design, decision-fatigue reduction.

━━━ MEANINGFUL GOALS → RESEARCH MODE → GUIDED JOURNEYS ━━━

Triggered by things like "I want to start working out," "I want to learn German," "I want to build a startup," "I want to become more disciplined," "I want to train for a marathon," "I want to prepare for university" — any real, non-trivial goal, in any domain (fitness, career, finance, coding, studying, creative work, relationships, habits, anything).

Walk Understand → Research → Explain → Discuss → Plan naturally across the conversation, not all in one reply:
- RESEARCH means drawing on what you genuinely know — evidence-based methods, best practices, common mistakes. Name real, well-known resources by name: books, creators, apps, official docs. Never invent a specific URL or link you can't be sure is real.
- Ground everything in THIS person: HEALTH CONTEXT, SCHEDULE & PATTERN CONTEXT, and THINGS YOU'VE LEARNED below (includes their own baseline, never a generic average) — "you already average 9,000 steps and sleep well, so 4 sessions a week is realistic" beats a textbook program.
- If a written reference genuinely helps (a program, a study plan, a reading list), generate_file it rather than pasting a wall of text into chat.

Once a real plan exists, offer a Guided Journey — a persistent project that survives across sessions and keeps evolving (discover → understand → research → plan → execute → review → adapt → complete), not just this one conversation. Use create_journey with a short human title (e.g. "Home Fitness"), the objective, domain, and 2-6 concrete milestones — check ACTIVE GUIDED JOURNEYS below first so you never create a second Journey for something already being tracked. In later conversations, use update_journey_milestone as milestones are actually completed, and update_journey to advance its stage, log an observation, or remember a resource worth keeping.

━━━ PERSONALITY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Intelligent, warm, calm, honest, thoughtful, curious. Never robotic, never patronizing, never overly enthusiastic. Challenge the user when it actually serves them ("I don't think that's the real problem — here's what I'm noticing instead") while staying supportive. You're allowed to disagree.

${CONVERSATION_STYLE_GUIDE}

━━━ WHEN THE USER DESCRIBES HOW THEY FEEL PHYSICALLY OR MENTALLY ━━━

For stress, fatigue, burnout, low motivation, anxiety, brain fog, sleepiness, overtraining, or trouble focusing: never answer generically. Check HEALTH CONTEXT and SCHEDULE & PATTERN CONTEXT below FIRST — if the data already explains it (poor sleep, low HRV, an unusually high-output day, several intense Deep Work sessions back to back, a long stretch with no real break), say so plainly and specifically before offering anything else. A real answer sounds like "you walked well beyond your usual step count yesterday, on a shorter night than normal, with four intensive Deep Work sessions on top — physical fatigue today makes complete sense" — not "that sounds tough, have you tried resting?" Explain WHY using their real data, THEN offer the one thing most likely to help — not a generic wellness tip. If nothing in the data explains it, say that honestly too, rather than inventing a cause.

━━━ BEFORE YOU FINISH A REPLY ━━━━━━━━━━━━━━━━━━━━━━━

Ask yourself: what's the next meaningful thing I can actually help with — creating a Journey, generating a document, scheduling the plan, tracking progress, preparing next week's review, adjusting something that isn't working? Don't force it into every reply, but don't let a conversation end at "that's interesting" when there's a real next step sitting right there.

━━━ BOUNDARIES — NON-NEGOTIABLE ━━━━━━━━━━━━━━━━━━━━━━

Never diagnose a mental health condition. Never claim to replace therapy or a licensed professional. Never give medical or clinical advice (medication, diagnosis, treatment plans).
If the user describes severe, persistent, or safety-relevant symptoms (ongoing hopelessness, self-harm, suicidal ideation, panic attacks, symptoms lasting weeks), gently and clearly encourage them to reach out to a licensed mental health professional or, for immediate safety concerns, local emergency services — do this once, without alarm, and keep supporting them in the conversation.

${buildWellbeingStateBlock({ energy, relaxation, focus, motivation, metricHistory, userConfidence, sleepState, todaySleepQuality })}

━━━ SCHEDULE & PATTERN CONTEXT ━━━━━━━━━━━━━━━━━━━━━━━

Today: ${todayItems.length} item(s) scheduled${todayHasBreak ? ", including a break" : ""}. Cognitive load: ${workloadForecast[0]?.level ?? "unknown"}.
Recovery: ${recoveryState.label} — ${recoveryState.desc}
Momentum: ${momentum.label} — ${momentum.desc}
${recoveryTrendDeclining3d ? "Recovery has been declining for 3+ days straight — weight Plan toward lightening load, not adding more, unless the user is asking for something small and protective.\n" : ""}${keySignals?.length ? `Signals Planner is tracking: ${keySignals.join("; ")}\n` : ""}
Most avoided: ${mostAvoided ? `"${mostAvoided.task.title}" (${mostAvoided.daysOverdue}d deferred) — often the most useful thing to name in Understand.` : "(none)"}
Other deferred tasks (${deferredTasks.length}):
${deferredLines}

Next 7 days, occupied time blocks (includes recurring items — never schedule over these):
${occupiedBlocks}

Use this to stay grounded and to avoid double-booking — you are not here to manage the schedule the way Planner does, but what you build together has to actually fit.
${journeysBlock ? `
━━━ ACTIVE GUIDED JOURNEYS ━━━━━━━━━━━━━━━━━━━━━━━━━━━

${journeysBlock}

If the conversation connects to one of these, refer back to it naturally — it's an ongoing project, not a new topic. Use update_journey / update_journey_milestone to keep it current; only use create_journey for a genuinely new goal not already listed here.
` : ""}
${healthPromptBlock ? `
${healthPromptBlock}
When the user describes how they're feeling (e.g. "I'm exhausted"), check this health context first — if it already explains why (poor sleep, low HRV, a high-output day), say so plainly instead of asking what's wrong.
` : ""}
${priorInsights.length > 0 ? `
━━━ THINGS YOU'VE LEARNED ABOUT THIS PERSON ━━━━━━━━━

${priorInsights.join("\n")}` : ""}

━━━ TOOLS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

return_plan_to_nora — package 1–8 concrete actions from this session and offer them back to Nora for scheduling. Use the source conversation id from Nora's handoff when available.
create_journey — start a persistent Guided Journey once Understand/Research/Plan have actually happened for a meaningful goal. See MEANINGFUL GOALS above.
update_journey / update_journey_milestone — keep an existing Journey current as it evolves. Check ACTIVE GUIDED JOURNEYS above before ever creating a new one.
generate_file — produce a real downloadable document (a program, a study plan, a reading list) when that's genuinely more useful than chat text. If it belongs to a Journey, remember it via update_journey's addResource.
save_insight — call whenever you and the user land on a goal, routine, commitment, or pattern worth remembering — use this generously in Follow-up, it's the only memory across sessions outside of Journeys.
flag_wellbeing_signal — call when the conversation reveals exhaustion, stress, or burnout risk that should actually change today's plan. Not for routine check-ins. Silent to the user.`;
  };

  // Shared by both personas' dispatchers — generates the file client-side,
  // uploads it, and returns a file_attachment part. Never claims success if
  // the upload actually failed (the model gets a real error to relay).
  const dispatchGenerateFile = async (input) => {
    const { format, filename, ...rest } = input;
    try {
      const blob = await generateFileBlob(format, rest);
      const fullFilename = filename.toLowerCase().endsWith(`.${format}`) ? filename : `${filename}.${format}`;
      const url = await uploadGeneratedFile(fullFilename, blob, blob.type);
      if (!url) {
        return { resultText: `File generation succeeded but upload failed — could not attach "${fullFilename}". Tell the user the file couldn't be saved right now.` };
      }
      return {
        resultText: `Generated and attached "${fullFilename}" (${sizeLabel(blob)}).`,
        parts: [fileAttachmentPart({ filename: fullFilename, format, url, sizeLabel: sizeLabel(blob) })],
      };
    } catch (e) {
      return { resultText: `File generation failed: ${e.message}. Tell the user this specific format isn't available right now.` };
    }
  };

  // Planner's tool dispatcher — called once per tool call from inside the
  // shared conversation engine's loop. workingTasksRef lets several task
  // tool calls compound within one turn (e.g. add_task then move_task
  // against the task it just created); onTurnStart resets it to the latest
  // committed `tasks` before each new send().
  const plannerWorkingTasksRef = useRef(tasks);
  const plannerOperationsRef = useRef([]);
  const plannerUndoRef = useRef(new Map());
  const dispatchPlannerToolCall = async (tc) => {
    const input = JSON.parse(tc.function.arguments);
    if (tc.function.name === "handoff_to_atlas") {
      const handoff = buildAtlasHandoffContext({
        ...input,
        sourceConversationId: plannerEngine.activeId,
      });
      return {
        resultText: `Atlas handoff prepared: "${handoff.title}". The user can open it from the handoff card.`,
        parts: [assistantHandoffPart(handoff)],
      };
    }
    if (tc.function.name === "generate_file") return dispatchGenerateFile(input);
    if (tc.function.name === "save_insight") {
      const { key, value, note } = input;
      setUserPrefs((prev) => {
        const updated = { ...prev, [key]: value };
        if (note) updated[`${key}_note`] = note;
        return updated;
      });
      return { resultText: `Insight saved: ${key} = "${value}"${note ? ` (${note})` : ""}` };
    }
    if (tc.function.name === "find_nearby_place") {
      const { category, nearSavedPlace, radiusMeters = 2000 } = input;
      const anchor = savedPlaces.find((p) => p.name?.toLowerCase() === nearSavedPlace?.toLowerCase()) ?? savedPlaces[0];
      if (!anchor?.lat || !anchor?.lng) {
        return { resultText: `Cannot search: saved place "${nearSavedPlace}" has no coordinates. Ask the user to add their address in Settings → Places.` };
      }
      const place = await findNearbyPlace(category, anchor.lat, anchor.lng, Math.min(radiusMeters, 5000));
      if (!place) {
        return { resultText: `No ${category} found within ${Math.round(radiusMeters / 1000 * 10) / 10} km of ${anchor.name}. Try increasing the radius or asking the user for a specific address.` };
      }
      const mode = transportProfile.defaultMode ?? "mixed";
      const travelMin = await fetchTravelMinutes(anchor, place, mode);
      const distStr = (place.distanceKm ?? 0) < 1
        ? `${Math.round((place.distanceKm ?? 0) * 1000)} m`
        : `${(place.distanceKm ?? 0).toFixed(1)} km`;
      const addrStr = place.address ? ` at ${place.address}` : "";
      const openStr = place.openNow === true ? " (open now)" : place.openNow === false ? " (currently closed)" : "";
      return { resultText: `Nearest ${category} to ${anchor.name}: "${place.name}"${addrStr}${openStr} — ${distStr} away. Travel time (${getModeLabel(mode)}): ~${travelMin} min. Schedule the task at: departure_time + ${travelMin} min. Coordinates: ${place.lat.toFixed(5)},${place.lng.toFixed(5)}.` };
    }
    if (tc.function.name === "create_whiteboard") {
      const { title, blocks: rawBlocks = [], connections: rawConns = [] } = input;
      const BS_DEFAULTS = { goal:{w:240,h:110}, idea:{w:200,h:88}, task_group:{w:240,h:130}, deadline:{w:220,h:90}, note:{w:240,h:130}, decision:{w:210,h:100} };
      const COLS = [
        [0], [1,2], [0,2], [1,2,3], [0,2,4], [1,2,3,4,5]
      ];
      const layoutBlocks = rawBlocks.map((b, i) => {
        const s = BS_DEFAULTS[b.type] ?? { w:220, h:100 };
        const col = COLS[Math.min(rawBlocks.length-1, 5)][i % 3] ?? i;
        const row = Math.floor(i / 3);
        return { id: uid(), type: b.type, title: b.title, content: b.content ?? "", dueDate: b.dueDate ?? null, completed: false, x: 80 + col * 280, y: 60 + row * 180, w: s.w, h: s.h };
      });
      const idMap = {};
      rawBlocks.forEach((_, i) => { idMap[i] = layoutBlocks[i].id; });
      const layoutConns = rawConns.filter(c => idMap[c.from] && idMap[c.to]).map(c => ({ id: uid(), from: idMap[c.from], to: idMap[c.to] }));
      const newBoard = { id: uid(), title, description: "", createdAt: Date.now(), updatedAt: Date.now(), blocks: layoutBlocks, connections: layoutConns };
      setBoards(prev => [...prev, newBoard]);
      return { resultText: `Whiteboard "${title}" created with ${layoutBlocks.length} blocks.` };
    }
    if (tc.function.name === "update_whiteboard") {
      const { boardTitle, action, blockTitle, block, connectFrom, connectTo } = input;
      setBoards(prev => prev.map(b => {
        if (b.title !== boardTitle) return b;
        if (action === "add_block") {
          const BS_DEFAULTS = { goal:{w:240,h:110}, idea:{w:200,h:88}, task_group:{w:240,h:130}, deadline:{w:220,h:90}, note:{w:240,h:130}, decision:{w:210,h:100} };
          const s = BS_DEFAULTS[block?.type] ?? { w:220, h:100 };
          const maxY = b.blocks.length ? Math.max(...b.blocks.map(x => x.y + x.h)) : 60;
          const nb = { id: uid(), type: block.type, title: block.title, content: block.content ?? "", dueDate: block.dueDate ?? null, completed: false, x: 80, y: maxY + 30, w: s.w, h: s.h };
          return { ...b, blocks: [...b.blocks, nb], updatedAt: Date.now() };
        }
        if (action === "update_block") {
          return { ...b, blocks: b.blocks.map(bl => bl.title === blockTitle ? { ...bl, ...block } : bl), updatedAt: Date.now() };
        }
        if (action === "delete_block") {
          const delId = b.blocks.find(bl => bl.title === blockTitle)?.id;
          return { ...b, blocks: b.blocks.filter(bl => bl.title !== blockTitle), connections: b.connections.filter(c => c.from !== delId && c.to !== delId), updatedAt: Date.now() };
        }
        if (action === "add_connection") {
          const fromId = b.blocks.find(bl => bl.title === connectFrom)?.id;
          const toId = b.blocks.find(bl => bl.title === connectTo)?.id;
          if (fromId && toId) return { ...b, connections: [...b.connections, { id: uid(), from: fromId, to: toId }], updatedAt: Date.now() };
        }
        return b;
      }));
      return { resultText: `Board "${boardTitle}" updated (${action}).` };
    }
    if (tc.function.name === "create_note") {
      const { title = "", content = "", type = "note", color = "cream", pinned = false } = input;
      const isListType = type === "checklist" || type === "shopping";
      const items = isListType && content
        ? content.split("\n").filter(Boolean).map((text) => ({ id: uid(), text: text.replace(/^[-•*]\s*/, "").trim(), done: false }))
        : [];
      const newNote = {
        id: uid(), title, content: isListType ? "" : content,
        color, type, items, pinned, starred: false,
        createdAt: Date.now(), updatedAt: Date.now(),
      };
      setNotes((prev) => [...prev, newNote]);
      return { resultText: `Note created (id="${newNote.id}"): "${title || content.slice(0, 40)}"` };
    }
    if (tc.function.name === "update_note") {
      const { noteId, title, content, appendContent, type, color, pinned, starred } = input;
      let found = false;
      setNotes((prev) => prev.map((n) => {
        if (n.id !== noteId) return n;
        found = true;
        const patch = { updatedAt: Date.now() };
        if (title !== undefined)   patch.title   = title;
        if (type  !== undefined)   patch.type    = type;
        if (color !== undefined)   patch.color   = color;
        if (pinned !== undefined)  patch.pinned  = pinned;
        if (starred !== undefined) patch.starred = starred;
        if (appendContent !== undefined) {
          patch.content = ((n.content ?? "") + "\n" + appendContent).trimStart();
        } else if (content !== undefined) {
          const isListType = (patch.type ?? n.type) === "checklist" || (patch.type ?? n.type) === "shopping";
          if (isListType) {
            patch.items = content.split("\n").filter(Boolean).map((text) => ({ id: uid(), text: text.replace(/^[-•*✓]\s*/, "").trim(), done: false }));
            patch.content = "";
          } else {
            patch.content = content;
          }
        }
        return { ...n, ...patch };
      }));
      return { resultText: found ? `Note "${noteId}" updated.` : `Note "${noteId}" not found.` };
    }
    if (tc.function.name === "delete_note") {
      const { noteId } = input;
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
      return { resultText: `Note "${noteId}" deleted.` };
    }
    // Task tools — same pure executeAiTool dispatcher Atlas also uses,
    // threaded across however many task calls land within this one turn.
    const tasksBefore = plannerWorkingTasksRef.current;
    const { result, nextTasks } = executeTaskTool(tc.function.name, input, tasksBefore);
    plannerWorkingTasksRef.current = nextTasks;
    if (nextTasks === tasksBefore) {
      return { resultText: `Operation was not proposed: ${result}` };
    }
    const affectedTask = input.taskId ? tasksBefore.find((task) => task.id === input.taskId) : null;
    const label = tc.function.name === "add_task"
      ? `Add “${input.title}”`
      : tc.function.name === "move_task"
        ? `Move “${affectedTask?.title ?? "task"}”`
        : tc.function.name === "complete_task"
          ? `Complete “${affectedTask?.title ?? "task"}”`
          : tc.function.name === "delete_task"
            ? `Delete “${affectedTask?.title ?? "task"}”`
            : "Update task";
    plannerOperationsRef.current.push({ name: tc.function.name, input, label });
    return { resultText: `Proposed operation validated but not yet committed: ${result}` };
  };

  const finalizePlannerTurn = async ({ userText, parts }) => {
    const operations = plannerOperationsRef.current;
    if (!operations.length) return parts;

    if (shouldPreviewPlannerOperations(userText, operations)) {
      return [...parts, scheduleProposalPart({
        id: `proposal-${Date.now()}-${uid()}`,
        createdAt: Date.now(),
        userRequest: userText,
        operations,
      })];
    }

    const undoToken = `undo-${Date.now()}-${uid()}`;
    plannerUndoRef.current.set(undoToken, tasks);
    setTasks(plannerWorkingTasksRef.current);
    const operation = operations[0];
    const confirmation = buildToolConfirmationPart(operation.name, operation.input, plannerWorkingTasksRef.current);
    return confirmation ? [...parts, { ...confirmation, undoToken }] : parts;
  };

  const plannerEngine = useConversationEngine({
    toolKey: "planner",
    session,
    buildSystemPrompt: buildPlannerSystem,
    tools: AI_TOOLS,
    dispatchToolCall: dispatchPlannerToolCall,
    onTurnStart: () => {
      plannerWorkingTasksRef.current = tasks;
      plannerOperationsRef.current = [];
    },
    finalizeTurn: finalizePlannerTurn,
  });
  const { messages, loading: chatLoading } = plannerEngine;
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setChatAtBottom(true);
  }, [messages, chatLoading]);

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    setChatInput("");

    // Joining by invite code is deterministic and should not depend on the AI
    // choosing a tool correctly. Generated codes are seven unambiguous chars.
    const inviteCode = extractJoinInviteCode(text);
    if (inviteCode) {
      try {
        const object = await handleJoinCode(inviteCode);
        const title = object?.data?.title ?? object?.data?.name ?? "the shared task";
        await plannerEngine.appendExchange(text, [textPart(`Connected you to “${title}” and added it to your planner.`)]);
      } catch (error) {
        await plannerEngine.appendExchange(text, [textPart(`I couldn't join that task: ${error?.message ?? "invalid invite code"}.`)]);
      }
      return;
    }

    plannerEngine.send(text);
  };

  const editPlannerMessage = (message) => {
    setChatInput(partsToPreviewText(message?.parts));
    requestAnimationFrame(() => chatInputRef.current?.focus());
  };

  const retryPlannerMessage = (message) => {
    const index = messages.indexOf(message);
    const userMessage = index > 0 ? [...messages.slice(0, index)].reverse().find((item) => item.role === "user") : null;
    const text = partsToPreviewText(userMessage?.parts);
    if (text) plannerEngine.send(text);
  };

  // Atlas's own tool dispatcher — deliberately separate from Planner's:
  // Atlas never receives the note/whiteboard/place schemas Planner has
  // (ATLAS_TOOLS never includes those), so merging the two would add
  // complexity for no benefit. Task-mutating tool calls still dispatch
  // through the same pure executeAiTool Planner uses, via the same
  // workingTasksRef-threaded pattern. Posts includeResearchTool:false so
  // Atlas never gets silent access to Planner's productivity-technique KB.
  const atlasWorkingTasksRef = useRef(tasks);
  const activeAtlasHandoffRef = useRef(null);
  // Same workingRef-threaded pattern as tasks — lets create_journey followed
  // by update_journey_milestone in the same turn (e.g. pre-marking a
  // milestone the user already mentioned finishing) see the journey it just
  // created, before setJourneys' state commit is visible to a re-render.
  const atlasWorkingJourneysRef = useRef(journeys);
  const dispatchAtlasToolCall = async (tc) => {
    const input = JSON.parse(tc.function.arguments);
    if (tc.function.name === "return_plan_to_nora") {
      const plan = {
        id: `atlas-plan-${Date.now()}-${uid()}`,
        title: input.title,
        summary: input.summary,
        sourceConversationId: input.sourceConversationId || activeAtlasHandoffRef.current?.sourceConversationId || null,
        actionItems: (input.actionItems ?? []).slice(0, 8).map((item) => ({
          title: String(item.title ?? "").trim(),
          duration: Math.max(10, Math.min(Number(item.duration) || 30, 240)),
          notes: String(item.notes ?? "").trim(),
          preferredTiming: item.preferredTiming ? String(item.preferredTiming) : null,
          deadline: item.deadline || null,
        })).filter((item) => item.title),
      };
      return {
        resultText: `Action plan "${plan.title}" is ready to return to Nora with ${plan.actionItems.length} item(s).`,
        parts: [atlasReturnPlanPart(plan)],
      };
    }
    if (tc.function.name === "generate_file") return dispatchGenerateFile(input);
    if (tc.function.name === "save_insight") {
      const { key, value, note } = input;
      setUserPrefs((prev) => {
        const updated = { ...prev, [key]: value };
        if (note) updated[`${key}_note`] = note;
        saveUserPreferences(updated).catch(console.warn);
        return updated;
      });
      return { resultText: `Insight saved: ${key} = "${value}"${note ? ` (${note})` : ""}` };
    }
    if (tc.function.name === "flag_wellbeing_signal") {
      const { level, note, suggestedAction } = input;
      setUserPrefs((prev) => {
        const updated = { ...prev, wellbeing_signal: { level, note, suggestedAction, source: "atlas", date: today, createdAt: Date.now(), acknowledged: false } };
        saveUserPreferences(updated).catch(console.warn);
        return updated;
      });
      return { resultText: `Wellbeing signal flagged for Planner: ${level} — "${note}"` };
    }
    if (tc.function.name === "create_journey") {
      const newJourney = createJourney(input);
      const nextJourneys = [...atlasWorkingJourneysRef.current, newJourney];
      atlasWorkingJourneysRef.current = nextJourneys;
      setJourneys(nextJourneys);
      return { resultText: `Guided Journey "${newJourney.title}" created (id: ${newJourney.id}), domain=${newJourney.domain}${newJourney.milestones.length ? `, ${newJourney.milestones.length} milestone(s)` : ""}.` };
    }
    if (tc.function.name === "update_journey") {
      const { journeyId, ...patch } = input;
      const journey = atlasWorkingJourneysRef.current.find((j) => j.id === journeyId);
      if (!journey) return { resultText: `Journey ${journeyId} not found.` };
      const updated = applyJourneyUpdate(journey, patch);
      const nextJourneys = atlasWorkingJourneysRef.current.map((j) => (j.id === journeyId ? updated : j));
      atlasWorkingJourneysRef.current = nextJourneys;
      setJourneys(nextJourneys);
      return { resultText: `Journey "${updated.title}" updated${patch.stage ? ` — stage: ${patch.stage}` : ""}${patch.status ? ` — status: ${patch.status}` : ""}.` };
    }
    if (tc.function.name === "update_journey_milestone") {
      const { journeyId, milestoneTitle, done } = input;
      const journey = atlasWorkingJourneysRef.current.find((j) => j.id === journeyId);
      if (!journey) return { resultText: `Journey ${journeyId} not found.` };
      const { journey: updated, found } = applyMilestoneUpdate(journey, milestoneTitle, done);
      if (!found) return { resultText: `Milestone "${milestoneTitle}" not found on journey "${journey.title}".` };
      const nextJourneys = atlasWorkingJourneysRef.current.map((j) => (j.id === journeyId ? updated : j));
      atlasWorkingJourneysRef.current = nextJourneys;
      setJourneys(nextJourneys);
      return { resultText: `Milestone "${milestoneTitle}" marked ${done ? "done" : "not done"} on "${updated.title}" — progress now ${updated.progress}%.` };
    }
    const { result, nextTasks } = executeTaskTool(tc.function.name, input, atlasWorkingTasksRef.current);
    atlasWorkingTasksRef.current = nextTasks;
    setTasks(nextTasks);
    const part = buildToolConfirmationPart(tc.function.name, input, nextTasks);
    return { resultText: result, parts: part ? [part] : [] };
  };

  const atlasEngine = useConversationEngine({
    toolKey: "atlas",
    session,
    buildSystemPrompt: buildAtlasSystem,
    tools: ATLAS_TOOLS,
    includeResearchTool: false,
    dispatchToolCall: dispatchAtlasToolCall,
    onTurnStart: () => { atlasWorkingTasksRef.current = tasks; atlasWorkingJourneysRef.current = journeys; },
  });
  const { messages: atlasMessages, loading: atlasChatLoading } = atlasEngine;

  const sendAtlasChat = async () => {
    const text = atlasChatInput.trim();
    if (!text || atlasChatLoading) return;
    setAtlasChatInput("");
    atlasEngine.send(text);
  };

  const editAtlasMessage = (message) => setAtlasChatInput(partsToPreviewText(message?.parts));
  const retryAtlasMessage = (message) => {
    const index = atlasMessages.indexOf(message);
    const userMessage = index > 0 ? [...atlasMessages.slice(0, index)].reverse().find((item) => item.role === "user") : null;
    const text = partsToPreviewText(userMessage?.parts);
    if (text) atlasEngine.send(text);
  };

  const openAtlasHandoff = async (handoff) => {
    if (!handoff) return;
    activeAtlasHandoffRef.current = handoff;
    setChatOpen(false);
    setAiHubOpen(false);
    await atlasEngine.newConversation();
    setAtlasOpen(true);
    atlasEngine.send(atlasHandoffToPrompt(handoff));
  };

  const openNoraReturnPlan = async (plan) => {
    if (!plan?.actionItems?.length) return false;
    setAtlasOpen(false);
    setAiHubOpen(false);
    setChatOpen(true);
    await plannerEngine.sendToConversation(
      plan.sourceConversationId,
      atlasPlanToNoraPrompt(plan),
    );
    return true;
  };

  const handlePlannerAction = async (action, payload) => {
    if (action === "apply") {
      let nextTasks = tasks;
      for (const operation of payload?.operations ?? []) {
        nextTasks = executeTaskTool(operation.name, operation.input, nextTasks).nextTasks;
      }
      const undoToken = `undo-${Date.now()}-${uid()}`;
      plannerUndoRef.current.set(undoToken, tasks);
      setTasks(nextTasks);
      return true;
    }
    if (action === "undo") {
      const previousTasks = plannerUndoRef.current.get(payload?.undoToken);
      if (!previousTasks) return false;
      setTasks(previousTasks);
      plannerUndoRef.current.delete(payload.undoToken);
      return true;
    }
    if (action === "adjust") {
      setChatOpen(true);
      setChatInput(`Adjust this proposed plan: ${payload?.userRequest ?? ""}\n\nChange: `);
      requestAnimationFrame(() => chatInputRef.current?.focus());
      return true;
    }
    return true;
  };

  // ── New item helper ────────────────────────────────────
  const startNewItem = (type, slot = null) => {
    const isSlot = slot && typeof slot === "object";
    setEditingTask({
      id: uid(), type,
      title: "",
      date: selectedDate,
      startHour:   isSlot ? slot.hour   : null,
      startMinute: isSlot ? slot.minute : null,
      duration:    type === "break" ? 30 : null,
      repeat: null, repeatEnd: null,
      completed: false, notes: "",
      complexity: null, groupId: null,
    });
  };

  // ── Timeline click / drag handlers ────────────────────
  const snapToGrid = (e) => {
    const rect   = e.currentTarget.getBoundingClientRect();
    const offset = window.__dragOffset ?? 0;
    const y      = e.clientY - rect.top - offset;
    const x      = e.clientX - rect.left;
    if (x < LABEL_W) return null;
    const totalMins  = Math.round((y / zoomedH) * 60 / 5) * 5;
    const clamped    = Math.max(0, Math.min(totalMins, HOURS.length * 60 - 5));
    return { hour: HOURS[0] + Math.floor(clamped / 60), minute: clamped % 60 };
  };

  const handleTimelineClick = (e) => {
    const snap = snapToGrid(e);
    if (!snap) return;
    setAddingAt(snap);
    setAddingTitle("");
  };

  const handleTimelineDragOver = (e) => {
    e.preventDefault();
    const snap = snapToGrid(e);
    if (!snap) return;
    const y = cTop(snap.hour, snap.minute);
    setDragOver({ y, snap });
  };

  const handleTimelineDrop = (e) => {
    if (!window.__dragId) return;
    const snap = snapToGrid(e);
    if (snap) moveToSlot(window.__dragId, snap.hour, snap.minute);
    window.__dragId = null;
    window.__dragOffset = 0;
    setDragOver(null);
  };

  // ── Landing page ──────────────────────────────────────
  if (showLanding) return (
    <div className={`app landing-page native-ui${dark ? " dark" : ""}${theme === "liquid_glass" ? " glass" : ""}`}>
      <div className="landing-content">
        <BrandLockup size={56} tone="white" className="landing-hero-logo" />
        <p className="landing-tagline">Your intelligent personal planner</p>
        <ul className="landing-features">
          <li><Check size={14} /> Timeline planner with drag &amp; drop</li>
          <li><Check size={14} /> Deadlines, breaks &amp; recurring tasks</li>
          <li><Check size={14} /> Private notes scratchpad</li>
          <li><Check size={14} /> AI assistant to manage your day</li>
        </ul>
        <button className="landing-cta" onClick={() => { localStorage.setItem("nora_visited", "1"); setShowLanding(false); }}>
          Start Planning
        </button>
      </div>
    </div>
  );

  // ── Auth guard ────────────────────────────────────────
  if (authLoading) return <AppLoadingScreen />;

  // Password reset flow — triggered when user clicks the email link
  if (isResettingPw) return <PasswordResetForm dark={dark} glass={theme === "liquid_glass"} onDone={finishPasswordReset} />;

  if (!session) return <AuthScreen dark={dark} glass={theme === "liquid_glass"} />;

  // ── Mobile layout ─────────────────────────────────────
  if (isMobile) {
    const mobileCtx = {
      tasks, setTasks, groups, notes, setNotes, session, today, nowObj, dark,
      accountName, setAccountName, energy, setEnergy, relaxation, setRelaxation,
      inAppAlert, setInAppAlert, reminderMins, setReminderMins,
      setDark, theme, setTheme, isOnline,
      chatOpen, setChatOpen, aiHubOpen, setAiHubOpen, messengerOpen, setMessengerOpen,
      chatInput, setChatInput, chatLoading, messages, sendChat, noraGreeting: NORA_GREETING,
      editPlannerMessage, retryPlannerMessage,
      onOpenAtlasHandoff: openAtlasHandoff,
      onPlannerAction: handlePlannerAction,
      plannerConversations: plannerEngine.conversations,
      plannerActiveConversationId: plannerEngine.activeId,
      plannerConversationsLoading: plannerEngine.conversationsLoading,
      onSelectPlannerConversation: plannerEngine.selectConversation,
      onNewPlannerConversation: plannerEngine.newConversation,
      onRenamePlannerConversation: plannerEngine.rename,
      onPinPlannerConversation: plannerEngine.pin,
      onArchivePlannerConversation: plannerEngine.archive,
      onDeletePlannerConversation: plannerEngine.remove,
      atlasOpen, setAtlasOpen, atlasShellActive, setStatusMindActive, atlasMessages, atlasChatInput, setAtlasChatInput,
      atlasChatLoading, sendAtlasChat, sendAtlasMessage: atlasEngine.send,
      editAtlasMessage, retryAtlasMessage,
      onOpenNoraReturnPlan: openNoraReturnPlan,
      assistantSettings, updateAssistantSettings, visibleAiTools,
      atlasGreeting: ATLAS_GREETING,
      atlasConversations: atlasEngine.conversations,
      atlasActiveConversationId: atlasEngine.activeId,
      atlasConversationsLoading: atlasEngine.conversationsLoading,
      onSelectAtlasConversation: atlasEngine.selectConversation,
      onNewAtlasConversation: atlasEngine.newConversation,
      onRenameAtlasConversation: atlasEngine.rename,
      onPinAtlasConversation: atlasEngine.pin,
      onArchiveAtlasConversation: atlasEngine.archive,
      onDeleteAtlasConversation: atlasEngine.remove,
      editingTask, setEditingTask, draft, setDraft,
      todayTasks, deferredTasks, contextMode, aiFocus,
      momentum, recoveryState, workloadForecast, weekData, weekTrend,
      adaptiveRecs, weeklyReflection, mostAvoided, focusPatterns,
      doneToday, totalToday, pct,
      toggleTask, skipTask, askNORAtoReschedule, saveTask, deleteTask,
      addNote: (text) => setNotes((p) => [...p, { id: uid(), title: "", content: text, color: "default", type: "note", items: [], pinned: false, starred: false, createdAt: Date.now(), updatedAt: Date.now() }]),
      toggleNote, updateNote, deleteNote, patchNote, createStickyNote, createNote, getGroup,
      userPrefs, setUserPrefs, noraState, behaviorProfile, predictiveSignals,
      metrics, interpretations, patterns, workPatterns, mindPatterns, emotionalDrift, flowPrediction,
      aiCoach, atlasCoach, actionCenter, implementationIntention, taskWeights, recoveryTrendDeclining3d,
      sleepAnalysis, healthSummary,
      microStartMode, setMicroStartMode,
      boards,
      journeys,
      rescheduleTask, setRescheduleTask, saveReschedule,
      morningCheckup, showMorningCheckup, setShowMorningCheckup, handleCheckupComplete,
      pendingMobileView, setPendingMobileView,
      reviewCheckupMode, setReviewCheckupMode,
      showObservations, setShowObservations, dailyMetrics,
      sleepState, todaySleepQuality, setSleepQuality,
      focus, setFocus, motivation, setMotivation,
      userConfidence, assessmentSummary, keySignals,
      focusTask, setFocusTask,
      // Notification system
      notifPermission, notifSettings, updateNotifSettings,
      requestNotifPermission, showNotification,
      notifBannerVisible, dismissNotifBanner,
      notifHealth, sendTestNotification,
      testServerPush, forceResubscribe: forceResubscribePush,
      // Apple Health
      health,
      // Collaboration
      sharingTask, setSharingTask, sharedObjects, setSharedObjects,
      showJoinCode, setShowJoinCode, handleJoinCode,
      // Profile
      userProfile, setUserProfile,
      showOnboarding, setShowOnboarding,
      showProfileModal, setShowProfileModal,
      showUsernameBanner, setShowUsernameBanner,
      // Intelligence
      onIntelClick: () => intel.setCenterOpen(true),
      intelCount: intel.pendingCount,
      // These three render as full-screen overlays as *siblings* of <MobileApp>
      // (see the mobile branch return below), not inside it — MobileApp has no
      // other visibility into them. Exposed here so it can hide the native tab
      // bar (a separate native layer the web dim-mask can't cover) while any
      // of them is showing.
      intelOverlayOpen: intel.proactiveVisible || intel.centerOpen || intel.onboardingOpen,
      // Location / Travel
      savedPlaces, setSavedPlaces, transportProfile, setTransportProfile,
      // Pricing
      pricingOpen, setPricingOpen, subscription,
      // Cold-launch splash — hides the real FAB until the splash logo docks
      // onto its exact spot, so there's never a moment with two icons visible.
      showLaunchSplash,
      launchRevealing,
    };
    // Mobile now has one black native appearance. Keep sibling overlays in the
    // same dark environment while their internals migrate in later phases.
    const themeClass = "dark";
    return (
      <div className={themeClass || undefined} style={{ display: "contents" }}>
        <Suspense fallback={<AppLoadingScreen />}>
          <MobileApp ctx={mobileCtx} />
        </Suspense>
        {showLaunchSplash && (
          <LaunchSplash
            dark={dark}
            glass={theme === "liquid_glass"}
            greeting={launchGreeting}
            onGreetingShown={() => { launchGreetingLockedRef.current = true; }}
            onReveal={() => setLaunchRevealing(true)}
            onComplete={() => { setShowLaunchSplash(false); setLaunchRevealing(false); }}
          />
        )}
        {intel.proactiveVisible && !intel.centerOpen && (
          <ProactiveOverlay
            suggestions={intel.suggestions}
            onReview={() => { intel.setProactiveVisible(false); intel.setCenterOpen(true); }}
            onDismiss={() => intel.setProactiveVisible(false)}
          />
        )}
        {intel.centerOpen && (
          <SuggestionCenter
            suggestions={intel.suggestions}
            accounts={intel.accounts}
            syncing={intel.syncing}
            syncError={intel.syncError}
            lastSyncAt={intel.lastSyncAt}
            onClose={() => intel.setCenterOpen(false)}
            onAccept={intel.acceptSuggestion}
            onReject={intel.rejectSuggestion}
            onRejectAll={intel.rejectAll}
            onSync={async () => { await intel.syncGmail(); await intel.syncTelegram(); }}
            onOpenOnboarding={() => { intel.setCenterOpen(false); intel.setOnboardingOpen(true); }}
          />
        )}
        {intel.onboardingOpen && (
          <IntelligenceOnboarding
            hasGmail={intel.hasGmail}
            hasTelegram={intel.hasTelegram}
            onClose={() => intel.setOnboardingOpen(false)}
            onConnectGmail={intel.connectGmail}
            onConnectTelegramPhone={intel.connectTelegramPhone}
            onVerifyTelegramCode={intel.verifyTelegramCode}
            markOnboarded={intel.markOnboarded}
          />
        )}
      </div>
    );
  }

  // ── Desktop render ────────────────────────────────────
  const tabIdxCur = view === "day" ? 0 : view === "month" ? 1 : 2;
  return (
    <Suspense fallback={<AppLoadingScreen />}>
    <div className={`app${dark ? " dark" : ""}${theme === "liquid_glass" ? " glass" : ""}${atlasShellActive ? " atlas-active" : ""}${showLaunchSplash ? (launchRevealing ? " launch-shell-revealing" : " launch-shell-waiting") : ""}`}>

      {showLaunchSplash && (
        <LaunchSplash
          dark={dark}
          glass={theme === "liquid_glass"}
          greeting={launchGreeting}
          onGreetingShown={() => { launchGreetingLockedRef.current = true; }}
          onReveal={() => setLaunchRevealing(true)}
          onComplete={() => { setShowLaunchSplash(false); setLaunchRevealing(false); }}
        />
      )}

      {/* Ambient warmth wash while Atlas's chat is open — fades in/out via .atlas-active */}
      <div className="app-atlas-tint" aria-hidden="true" />

      {/* Pointer-reactive ambient light for Liquid Glass */}
      <div className="glass-pointer-light" aria-hidden="true" />

      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      <aside className={`sidebar native-ui${sidebarOpen ? " open" : ""}`}>
        <div className="sidebar-atlas-glow" aria-hidden="true" />
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <BrandStar size={28} tone="white" />
            <span className="sidebar-brand-wordmark">NORA</span>
          </div>
          <NativeIconButton
            className="sidebar-close"
            label="Close navigation"
            size="compact"
            onClick={() => setSidebarOpen(false)}
          >
            <X size={18} />
          </NativeIconButton>
        </div>

        <nav className="sidebar-nav">
          {[["day",t("nav.dayView"),<CalendarDays size={16} />],["month",t("nav.monthView"),<CalendarDays size={16} />],["list",t("nav.allTasks"),<List size={16} />],["notes",t("nav.notes"),<FileText size={16} />],["boards",t("nav.whiteboards"),<Layers size={16} />],["status",t("nav.myStatus"),<Activity size={16} />]].map(([v,label,icon]) => (
            <button key={v} className={`snav-btn${view === v ? " active" : ""}`}
              onClick={() => { navigateTo(v); setSidebarOpen(false); }}>
              {icon} {label}
            </button>
          ))}
        </nav>

        <div className="sidebar-sep" />

        <div className="sidebar-accordion">
          <button className={`sacc-btn${activeSettings === "program" ? " open" : ""}`}
            onClick={() => setActiveSettings(activeSettings === "program" ? null : "program")}>
            <Settings size={15} />
            <span>{t("settings.programSettings")}</span>
            <ChevronDown size={13} className={`sacc-arrow${activeSettings === "program" ? " open" : ""}`} />
          </button>
          {activeSettings === "program" && (
            <div className="sacc-body">
              <div className="sett-row">
                <span className="sett-label">{t("settings.darkMode")}</span>
                <NativeSwitch
                  checked={dark}
                  label={t("settings.darkMode")}
                  onChange={setDark}
                />
              </div>
              <div className="sett-row">
                <span className="sett-label">{t("settings.twoAssistantMode")}</span>
                <NativeSwitch
                  checked={assistantSettings.twoAssistantMode}
                  label={t("settings.twoAssistantMode")}
                  onChange={(enabled) => updateAssistantSettings({ twoAssistantMode: enabled })}
                />
              </div>
              {assistantSettings.twoAssistantMode && (
                <p className="sett-field-hint">{t("settings.twoAssistantModeDesc")}</p>
              )}
              <div className="sett-field">
                <label className="sett-field-lbl">{t("settings.appearance")}</label>
                <NativeSegmentedControl
                  className="theme-pill-group"
                  label={t("settings.appearance")}
                  value={theme}
                  onChange={setTheme}
                  options={[
                    { value: "default", label: t("settings.default") },
                    { value: "liquid_glass", label: t("settings.liquidGlass") },
                  ]}
                />
              </div>
              <div className="sett-field">
                <label className="sett-field-lbl">{t("settings.language")}</label>
                <NativeSegmentedControl
                  className="theme-pill-group"
                  label={t("settings.language")}
                  value={i18n.resolvedLanguage}
                  onChange={(language) => i18n.changeLanguage(language)}
                  options={[
                    { value: "en", label: "EN" },
                    { value: "de", label: "DE" },
                    { value: "ru", label: "RU" },
                  ]}
                />
              </div>
              <div className="sett-row">
                <span className="sett-label">{t("settings.notifications")}</span>
              </div>
              <NotificationSettings
                permission={notifPermission}
                settings={notifSettings}
                updateSettings={updateNotifSettings}
                onRequestPermission={requestNotifPermission}
                reminderMins={reminderMins}
                setReminderMins={setReminderMins}
                health={notifHealth}
                sendTestNotification={sendTestNotification}
                testServerPush={testServerPush}
                forceResubscribe={forceResubscribePush}
              />
              <div className="sett-row">
                <span className="sett-label">Apple Health</span>
              </div>
              <HealthSettings health={health} />
            </div>
          )}
        </div>

        <div className="sidebar-accordion">
          <button className={`sacc-btn${activeSettings === "places" ? " open" : ""}`}
            onClick={() => setActiveSettings(activeSettings === "places" ? null : "places")}>
            <MapPin size={15} />
            <span>Places</span>
            <ChevronDown size={13} className={`sacc-arrow${activeSettings === "places" ? " open" : ""}`} />
          </button>
          {activeSettings === "places" && (
            <div className="sacc-body">
              <SavedPlacesManager
                savedPlaces={savedPlaces}
                onSavedPlacesChange={setSavedPlaces}
                transportProfile={transportProfile}
                onTransportProfileChange={setTransportProfile}
              />
            </div>
          )}
        </div>

        <div className="sidebar-accordion">
          <button className={`sacc-btn${activeSettings === "account" ? " open" : ""}`}
            onClick={() => setActiveSettings(activeSettings === "account" ? null : "account")}>
            <User size={15} />
            <span>{t("account.account")}</span>
            <ChevronDown size={13} className={`sacc-arrow${activeSettings === "account" ? " open" : ""}`} />
          </button>
          {activeSettings === "account" && (
            <div className="sacc-body">
              <div className="acc-profile-card">
                <button className="acc-avatar-btn" onClick={() => setShowProfileModal(true)} title={t("account.editProfile")}>
                  <AvatarDisplay avatar={profileToAvatar(userProfile)} size={38} />
                </button>
                <div className="acc-profile-info">
                  <NameEditor name={accountName} onSave={setAccountName} />
                  <span className="acc-email">{session?.user?.email}</span>
                  {userProfile?.username && (
                    <span className="acc-username">@{userProfile.username}</span>
                  )}
                </div>
              </div>
              <button className="acc-edit-profile-btn" onClick={() => setShowProfileModal(true)}>
                {t("account.editProfile")}
              </button>
              <button className="acc-edit-profile-btn" onClick={() => setShowJoinCode(true)}>
                <KeyRound size={13} /> {t("account.joinInviteCode")}
              </button>
              {/* Subscription / Upgrade */}
              <button
                className="acc-upgrade-btn"
                onClick={() => { setSidebarOpen(false); setPricingOpen(true); }}
              >
                <span className="acc-upgrade-plan-badge">
                  {subscription?.plan === "free" ? "Free" : subscription?.plan === "plus" ? "Plus" : subscription?.plan === "pro" ? "Pro" : subscription?.plan === "team" ? "Team" : "Free"}
                </span>
                {subscription?.plan === "free" ? "Upgrade to Pro" : "Manage Subscription"}
              </button>
              <button className="sett-signout-btn" onClick={() => supabase.auth.signOut()}>
                {t("account.signOut")}
              </button>
            </div>
          )}
        </div>
      </aside>

      <div className="main-wrap">
        <header className="header">
          <button className="menu-btn" onClick={() => setSidebarOpen(true)}><Menu size={20} /></button>
          <div className="header-center">
            <button
              className="brand-logo-btn"
              onClick={() => { setSelectedDate(todayStr()); navigateTo("day"); }}
              aria-label="Go to today">
              <BrandLockup
                size={30}
                tone={dark ? "white" : "black"}
                className="brand-logo"
                markOnly
              />
            </button>
          </div>
          <div className="header-right">
            <span className="header-date">{view === "day" ? prettyDate(selectedDate) : view === "month" ? monthLabel : view === "notes" ? "Notes" : "All Tasks"}</span>
          </div>
        </header>

        <div className={`container${isTransitioning ? " page-exiting" : ""}`}>
          <div key={view} className="page-anim">
          {view === "day" && (
            <div className="ai-focus-panel">
              <div className="ai-focus-top">
                <span className="context-badge" style={{ background: `${contextMode.color}1a`, color: contextMode.color, borderColor: `${contextMode.color}40` }}>
                  <BrandStar size={11} tone="current" /> {contextMode.label}
                </span>
                {totalToday > 0 && (
                  <span className="ai-done-count">{doneToday}/{totalToday} done</span>
                )}
              </div>

              {aiFocus.priorityTask ? (
                <div className="ai-priority-wrap">
                  <span className="ai-priority-eyebrow">Focus on next</span>
                  <div className="ai-priority-title">{aiFocus.priorityTask.title}</div>
                  <div className="ai-priority-meta">
                    {aiFocus.priorityTask.startHour != null && (
                      <span>{fmtTime(aiFocus.priorityTask.startHour, aiFocus.priorityTask.startMinute ?? 0)}</span>
                    )}
                    {aiFocus.priorityTask.duration && (
                      <span>· {fmtDur(aiFocus.priorityTask.duration)}</span>
                    )}
                  </div>
                  <div className="ai-priority-actions">
                    <button className="ai-act-btn ai-act-ask" onClick={() => {
                      setChatInput(`What's the best way to approach "${aiFocus.priorityTask.title}" right now?`);
                      setChatOpen(true);
                    }}>
                      <MessageSquare size={11} /> Ask Nora
                    </button>
                  </div>
                </div>
              ) : null}

              <p className="ai-insight-text">{aiFocus.insight}</p>

              {totalToday > 0 && (
                <div className="ai-progress-bar-wrap">
                  <div className="ai-progress-bar-fill" style={{ width: `${pct}%`, background: contextMode.color }} />
                </div>
              )}

              <div className="ai-quick-actions">
                <button className="ai-quick-btn" onClick={() => setChatOpen(true)}>
                  <MessageSquare size={12} /> Chat with Nora
                </button>
                <button className="ai-quick-btn" onClick={() => {
                  setChatInput(totalToday === 0
                    ? "Plan my day for today. Consider my energy and current workload."
                    : "What should I focus on right now?");
                  setChatOpen(true);
                }}>
                  <BrandStar size={12} tone="current" /> {totalToday === 0 ? "Plan my day" : "What's next?"}
                </button>
              </div>
            </div>
          )}

          {/* Date nav & view tabs — hidden in notes view */}
          {view !== "notes" && view !== "status" && <div className="controls">
            <div className="date-nav">
              <button className="nav-btn" onClick={() => view === "month" ? shiftMo(-1) : shiftDate(-1)}><ChevronLeft size={16} /></button>
              {view === "day"
                ? <input type="date" className="date-input" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
                : view === "month"
                ? <span className="month-label-nav">{monthLabel}</span>
                : <span className="month-label-nav">All Tasks</span>}
              <button className="nav-btn" onClick={() => view === "month" ? shiftMo(1) : shiftDate(1)}><ChevronRight size={16} /></button>
            </div>
            <div
              className={`view-tabs${isDraggingTabs ? " view-tabs-dragging" : ""}`}
              ref={tabsRef}
              onPointerDown={onTabPointerDown}
              onPointerMove={onTabPointerMove}
              onPointerUp={onTabPointerUp}
              onPointerCancel={onTabPointerCancel}
            >
              <div
                ref={sliderRef}
                className={`tab-slider${isDraggingTabs ? " tab-slider-drag" : ` tab-slider-${tabIdxCur}`}`}
              />
              <button className={`tab-btn${tabIdxCur === 0 ? " active" : ""}`} onClick={() => { if (!tabDragRef.current.moved) navigateTo("day"); }}>Day</button>
              <button className={`tab-btn${tabIdxCur === 1 ? " active" : ""}`} onClick={() => { if (!tabDragRef.current.moved) navigateTo("month"); }}>Month</button>
              <button className={`tab-btn${tabIdxCur === 2 ? " active" : ""}`} onClick={() => { if (!tabDragRef.current.moved) navigateTo("list"); }}>All</button>
            </div>
          </div>}

          {/* Smart toolbar — day view only */}
          {view === "day" && (
            <div className="smart-toolbar">
              <button
                className={`stb-btn${!smartView ? " stb-active" : ""}`}
                onClick={() => setSmartView((v) => !v)}
                title={smartView ? "Switch to grid timeline" : "Switch to smart card view"}>
                {smartView ? <List size={13} /> : <Brain size={13} />}
                {smartView ? "Grid" : "Smart"}
              </button>
              <button
                className={`stb-btn${showFilters ? " stb-active" : ""}`}
                onClick={() => setShowFilters((f) => !f)}>
                <Target size={13} /> Filters
                {(filterType || filterGroup || filterComplexity) && <span className="filter-dot" />}
              </button>
            </div>
          )}

          {/* Filters — hidden in notes/status, collapsible in day view */}
          {view !== "notes" && view !== "status" && (view !== "day" || showFilters) && <div className="filter-bar">
            <div className="filter-section">
              <span className="filter-label">Type</span>
              <button className={`filter-pill${filterType === null ? " active" : ""}`} onClick={() => setFilterType(null)}>All</button>
              <button className={`filter-pill${filterType === "task" ? " active" : ""}`} onClick={() => setFilterType(filterType === "task" ? null : "task")}><Check size={11} /> Tasks</button>
              <button className={`filter-pill type-pill-dl${filterType === "deadline" ? " active" : ""}`} onClick={() => setFilterType(filterType === "deadline" ? null : "deadline")}><Flag size={11} /> Deadlines</button>
              <button className={`filter-pill type-pill-brk${filterType === "break" ? " active" : ""}`} onClick={() => setFilterType(filterType === "break" ? null : "break")}><Coffee size={11} /> Breaks</button>
            </div>
            <div className="filter-section">
              <span className="filter-label">Group</span>
              <button className={`filter-pill${filterGroup === null ? " active" : ""}`} onClick={() => setFilterGroup(null)}>All</button>
              {groups.map((g) => (
                <button key={g.id} className={`filter-pill gpill${filterGroup === g.id ? " active" : ""}`}
                  style={{ "--gc": g.color }} onClick={() => setFilterGroup(filterGroup === g.id ? null : g.id)}>
                  <span className="gdot" />{g.name}
                </button>
              ))}
              <button className="filter-pill add-gpill" onClick={() => setShowGroupModal(true)}><Plus size={11} /> New</button>
            </div>
            <div className="filter-section">
              <span className="filter-label">Complexity</span>
              <button className={`filter-pill${filterComplexity === null ? " active" : ""}`} onClick={() => setFilterComplexity(null)}>All</button>
              {Object.entries(COMPLEXITY).map(([key]) => (
                <button key={key} className={`filter-pill cpill ${key}${filterComplexity === key ? " active" : ""}`}
                  onClick={() => setFilterComplexity(filterComplexity === key ? null : key)}>{COMPLEXITY[key].label}</button>
              ))}
            </div>
          </div>}

          {/* ── Day view ── */}
          {view === "day" && smartView && (
            <div className="smart-view">
              {(() => {
                const scheduled = filteredTodayTasks
                  .filter((t) => t.startHour != null)
                  .sort((a, b) => a.startHour * 60 + (a.startMinute ?? 0) - (b.startHour * 60 + (b.startMinute ?? 0)));
                const unscheduled = filteredTodayTasks.filter((t) => t.startHour == null);

                if (filteredTodayTasks.length === 0) return (
                  <div className="smart-empty">
                    <BrandStar size={32} tone="current" style={{ opacity: .2 }} />
                    <p>Nothing scheduled yet.</p>
                    <div className="smart-empty-actions">
                      <button className="smart-empty-btn" onClick={() => {
                        setChatInput("Plan my day for today based on my energy and current workload.");
                        setChatOpen(true);
                      }}>
                        <BrandStar size={14} tone="current" /> Plan my day with Nora
                      </button>
                      <button className="smart-empty-add" onClick={() => { setAddingAt("unscheduled"); setAddingTitle(""); }}>
                        <Plus size={14} /> Add task
                      </button>
                      <button className="smart-empty-add" onClick={() => setShowJoinCode(true)}>
                        <KeyRound size={14} /> Join task
                      </button>
                    </div>
                  </div>
                );

                const nextTask = scheduled.find(
                  (t) => !t.completed && (t.startHour * 60 + (t.startMinute ?? 0)) >= nowMins && selectedDate === today
                );

                return (
                  <>
                    {scheduled.map((t) => {
                      const tp    = t.type ?? "task";
                      const group = getGroup(t.groupId);
                      const cx    = t.complexity ? COMPLEXITY[t.complexity] : null;
                      const gc    = tp === "deadline" ? (t.completed ? "#22c55e" : "#ef4444") : tp === "break" ? "#94a3b8" : group?.color ?? cx?.color ?? "var(--accent)";
                      const isPast = selectedDate === today && (t.startHour * 60 + (t.startMinute ?? 0)) < nowMins;
                      const isNext = t === nextTask;
                      return (
                        <div key={t.id}
                          className={`smart-card${t.completed ? " sc-done" : ""}${isPast && !t.completed ? " sc-past" : ""}${isNext ? " sc-next" : ""}${tp === "break" ? " sc-break" : ""}${tp === "deadline" ? " sc-deadline" : ""}`}
                          style={{ "--gc": gc }}>
                          <div className="sc-time-col">
                            <span className="sc-time">{fmtTime(t.startHour, t.startMinute ?? 0)}</span>
                            {t.duration && <span className="sc-dur">{fmtDur(t.duration)}</span>}
                          </div>
                          <div className="sc-body">
                            <div className="sc-title-row">
                              {tp === "task" && (
                                <button className={`chip-check sc-check${t.completed ? " checked" : ""}`}
                                  onClick={(e) => { e.stopPropagation(); toggleTask(t.id); }}>
                                  {t.completed && <Check size={9} strokeWidth={3} />}
                                </button>
                              )}
                              {tp === "deadline" && <Flag size={13} style={{ color: t.completed ? "#22c55e" : "#ef4444", flexShrink: 0 }} />}
                              {tp === "break" && <Coffee size={13} style={{ color: "#94a3b8", flexShrink: 0 }} />}
                              <span className="sc-title" onClick={() => setEditingTask(t)}>
                                {t.title || (tp === "break" ? "Break" : "Deadline")}
                              </span>
                              {isNext && <span className="sc-next-badge">Up next</span>}
                            </div>
                            {tp === "deadline" && !t.completed && (
                              <div className="sc-actions">
                                <button className="tca tca-done-dl" onClick={() => toggleTask(t.id)}>
                                  Mark done
                                </button>
                                <button className="tca tca-edit" onClick={() => setEditingTask(t)}>
                                  <Pencil size={10} /> Edit
                                </button>
                              </div>
                            )}
                            {tp === "task" && !t.completed && (
                              <div className="sc-actions">
                                <button className="tca tca-focus" onClick={() => setFocusTask(t)}>
                                  <Zap size={10} /> Focus
                                </button>
                                <button className="tca tca-resched" onClick={() => setRescheduleTask(t)}>
                                  <CalendarDays size={10} /> Move
                                </button>
                                <button className="tca tca-skip" onClick={() => skipTask(t.id)}>
                                  <SkipForward size={10} /> Skip
                                </button>
                                <button className="tca tca-edit" onClick={() => setEditingTask(t)}>
                                  <Pencil size={10} /> Edit
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {unscheduled.length > 0 && (
                      <div className="sc-unscheduled-section">
                        <div className="sc-unsched-label"><Clock size={13} /> Unscheduled</div>
                        <div className="sc-unsched-tasks">
                          {unscheduled.map((t) => {
                            const tp = t.type ?? "task";
                            if (tp === "deadline") return (
                              <div key={t.id} className={`unsched-deadline${t.completed ? " unsched-dl-done" : ""}`}>
                                <Flag size={11} /><span onClick={() => setEditingTask(t)}>{t.title || "Deadline"}</span>
                                {!t.completed && <button className="dl-done-btn" onClick={() => toggleTask(t.id)}>Done</button>}
                              </div>
                            );
                            if (tp === "break") return (
                              <div key={t.id} className="unsched-break" onClick={() => setEditingTask(t)}>
                                <Coffee size={11} /><span>{t.title || "Break"}{t.duration ? ` · ${fmtDur(t.duration)}` : ""}</span>
                              </div>
                            );
                            return <TaskChip key={t.id} task={t} group={getGroup(t.groupId)} onToggle={toggleTask} onReschedule={setRescheduleTask} onSkip={skipTask} onClick={setEditingTask} />;
                          })}
                        </div>
                      </div>
                    )}

                    <div className="sc-add-row">
                      {addingAt === "unscheduled"
                        ? <input ref={addInputRef} className="slot-input" value={addingTitle}
                            onChange={(e) => setAddingTitle(e.target.value)}
                            onKeyDown={(e) => handleSlotKey(e, null)}
                            onBlur={() => commitAdd(null)}
                            placeholder="Task name..." />
                        : <button className="sc-add-btn" onClick={() => { setAddingAt("unscheduled"); setAddingTitle(""); }}>
                            <Plus size={14} /> Add task
                          </button>
                      }
                      <button className="sc-add-btn sc-join-btn" onClick={() => setShowJoinCode(true)}>
                        <KeyRound size={14} /> Join task
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* Floating nudge bar */}
          {view === "day" && aiFocus.nudge && !nudgeDismissed && (
            <div className="ai-nudge-bar">
              <BrandStar size={14} tone="current" className="nudge-icon" />
              <span className="nudge-text">{aiFocus.nudge}</span>
              <div className="nudge-actions">
                <button className="nudge-cta" onClick={() => {
                  setChatInput(deferredTasks.length > 0
                    ? `I have ${deferredTasks.length} deferred tasks. Can you help me find the right time for them this week?`
                    : "Plan my day for today based on my energy and workload.");
                  setChatOpen(true);
                  setNudgeDismissed(true);
                }}>Let's do it</button>
                <button className="nudge-dismiss" onClick={() => setNudgeDismissed(true)}><X size={12} /></button>
              </div>
            </div>
          )}

          {view === "day" && !smartView && (
            <div className="timeline-wrap">
              <div className="unscheduled-section">
                <div className="section-label"><Clock size={13} /> Unscheduled</div>
                <div className="unscheduled-tasks">
                  {filteredTodayTasks.filter((t) => t.startHour == null).map((t) => {
                    const type = t.type ?? "task";
                    if (type === "deadline") return (
                      <div key={t.id} className="unsched-deadline" onClick={() => setEditingTask(t)}>
                        <Flag size={11} /><span>{t.title || "Untitled deadline"}</span>
                      </div>
                    );
                    if (type === "break") return (
                      <div key={t.id} className="unsched-break" onClick={() => setEditingTask(t)}>
                        <Coffee size={11} /><span>{t.title || "Break"}{t.duration ? ` · ${fmtDur(t.duration)}` : ""}</span>
                      </div>
                    );
                    return <TaskChip key={t.id} task={t} group={getGroup(t.groupId)} onToggle={toggleTask} onReschedule={setRescheduleTask} onSkip={skipTask} onClick={setEditingTask} />;
                  })}
                  {addingAt === "unscheduled"
                    ? <input ref={addInputRef} className="slot-input" value={addingTitle}
                        onChange={(e) => setAddingTitle(e.target.value)} onKeyDown={(e) => handleSlotKey(e, null)}
                        onBlur={() => commitAdd(null)} placeholder="Task name..." />
                    : <div className="unsched-actions">
                        <button className="slot-add-btn" onClick={() => { setAddingAt("unscheduled"); setAddingTitle(""); }}><Plus size={13} /> Task</button>
                        <button className="slot-add-btn slot-add-dl" onClick={() => startNewItem("deadline")}><Flag size={13} /> Deadline</button>
                        <button className="slot-add-btn slot-add-brk" onClick={() => startNewItem("break")}><Coffee size={13} /> Break</button>
                      </div>
                  }
                </div>
              </div>

              <div className="tl-zoom-bar">
                <button className="tl-zoom-btn" disabled={zoomLevel <= 0.5}
                  onClick={() => setZoomLevel((z) => Math.max(0.5, parseFloat((z - 0.25).toFixed(2))))}>
                  <ZoomOut size={14} />
                </button>
                <span className="tl-zoom-label">{Math.round(zoomLevel * 100)}%</span>
                <button className="tl-zoom-btn" disabled={zoomLevel >= 2.5}
                  onClick={() => setZoomLevel((z) => Math.min(2.5, parseFloat((z + 0.25).toFixed(2))))}>
                  <ZoomIn size={14} />
                </button>
                <button className="tl-zoom-reset" onClick={() => setZoomLevel(1)}>Reset</button>
              </div>

              <div className="timeline" ref={timelineRef}>
                <div className="tl-grid"
                  style={{ height: HOURS.length * zoomedH + 1 }}
                  onClick={handleTimelineClick}
                  onDragOver={handleTimelineDragOver}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={handleTimelineDrop}>

                  {/* Travel time blocks */}
                  {computeTravelBlocks(filteredTodayTasks, savedPlaces, transportProfile).map((block) => {
                    const startH = Math.floor(block.startMin / 60);
                    const startM = block.startMin % 60;
                    const top    = cTop(startH, startM);
                    const height = Math.max(block.durationMin / 60 * zoomedH, 16);
                    const TravelIcon = block.mode === "car" ? Car : block.mode === "bicycle" ? Bike : block.mode === "public_transport" ? Bus : block.mode === "walking" ? PersonStanding : Navigation;
                    return (
                      <div key={block.id} className={`tl-travel-block${block.isConflict ? " tl-travel-conflict" : ""}`}
                        style={{ top, height }}
                        title={describeTravelBlock(block)}>
                        <TravelIcon size={9} />
                        <span>{block.durationMin}m</span>
                        {block.isConflict && <span className="tl-travel-warn" title={`${block.minutesShort} min short`}>!</span>}
                      </div>
                    );
                  })}

                  {/* Hour lines and labels */}
                  {HOURS.map((hour, idx) => (
                    <React.Fragment key={hour}>
                      <div className="tl-hour-label" style={{ top: idx * zoomedH }}>{fmtHourLabel(hour)}</div>
                      <div className="tl-hour-line"  style={{ top: idx * zoomedH }} />
                      <div className="tl-half-line"  style={{ top: idx * zoomedH + zoomedH / 2 }} />
                    </React.Fragment>
                  ))}
                  <div className="tl-hour-line" style={{ top: HOURS.length * zoomedH }} />

                  {/* Deadline markers */}
                  {filteredTodayTasks
                    .filter((t) => t.type === "deadline" && t.startHour != null)
                    .map((t) => (
                      <div key={t.id} className={`tl-deadline${t.completed ? " tl-dl-done" : ""}`}
                        style={{ top: cTop(t.startHour, t.startMinute ?? 0) }}>
                        <div className="tl-deadline-flag" onClick={(e) => { e.stopPropagation(); setEditingTask(t); }}><Flag size={12} /></div>
                        <div className="tl-deadline-body" onClick={(e) => { e.stopPropagation(); setEditingTask(t); }}>
                          <span>{t.title || "Deadline"}</span>
                          <span className="tl-deadline-time">{fmtTime(t.startHour, t.startMinute ?? 0)}</span>
                        </div>
                        {!t.completed && (
                          <button className="dl-done-btn" onClick={(e) => { e.stopPropagation(); toggleTask(t.id); }}>Done</button>
                        )}
                      </div>
                    ))
                  }

                  {/* Break blocks */}
                  {filteredTodayTasks
                    .filter((t) => t.type === "break" && t.startHour != null)
                    .map((t) => {
                      const top    = cTop(t.startHour, t.startMinute ?? 0);
                      const durPx  = t.duration ? t.duration / 60 * zoomedH : zoomedH / 2;
                      const height = Math.max(durPx, 22);
                      return (
                        <div key={t.id} className="tl-break-block"
                          style={{ top, height }}
                          onClick={(e) => { e.stopPropagation(); setEditingTask(t); }}>
                          <Coffee size={11} />
                          <span className="tl-break-title">{t.title || "Break"}</span>
                          {t.duration && <span className="tl-break-dur">{fmtDur(t.duration)}</span>}
                        </div>
                      );
                    })
                  }

                  {/* Task chips */}
                  {filteredTodayTasks
                    .filter((t) => (t.type ?? "task") === "task" && t.startHour != null)
                    .map((t) => {
                      const top    = cTop(t.startHour, t.startMinute ?? 0);
                      const durPx  = t.duration ? t.duration / 60 * zoomedH : zoomedH * 0.38;
                      const height = Math.max(durPx, 22);
                      const group  = getGroup(t.groupId);
                      const cx     = t.complexity ? COMPLEXITY[t.complexity] : null;
                      const gc     = group?.color ?? cx?.color ?? "var(--accent)";
                      const isDeferred = !t.completed && t.date < today;
                      return (
                        <div key={t.id}
                          className={`tl-task-chip${t.completed ? " done" : ""}${isDeferred ? " deferred" : ""}`}
                          style={{ "--gc": gc, top, height }}
                          draggable
                          onDragStart={(e) => { e.stopPropagation(); window.__dragId = t.id; window.__dragOffset = e.clientY - e.currentTarget.getBoundingClientRect().top; }}
                          onClick={(e) => { e.stopPropagation(); setEditingTask(t); }}>
                          <button className={`chip-check${t.completed ? " checked" : ""}`}
                            onClick={(e) => { e.stopPropagation(); toggleTask(t.id); }}>
                            {t.completed && <Check size={9} strokeWidth={3} />}
                          </button>
                          <div className="tl-task-content">
                            <span className="tl-task-title" title={t.title}>{shortTitle(t.title)}</span>
                            {height > 36 && (
                              <span className="tl-task-time">
                                {fmtTime(t.startHour, t.startMinute ?? 0)}
                                {t.duration ? ` · ${fmtDur(t.duration)}` : ""}
                              </span>
                            )}
                          </div>
                          {t.repeat && <RotateCcw size={9} style={{ color: "currentColor", opacity: .65, flexShrink: 0, marginTop: 2 }} />}
                          <div className="tl-actions">
                            {!t.completed && (
                              <button className="tl-act tl-act-focus" title="Start focus session"
                                onClick={(e) => { e.stopPropagation(); setFocusTask(t); }}>
                                <Zap size={9} />
                              </button>
                            )}
                            {!t.completed && (
                              <button className="tl-act" title="Move task"
                                onClick={(e) => { e.stopPropagation(); setRescheduleTask(t); }}>
                                <CalendarDays size={9} />
                              </button>
                            )}
                            {!t.completed && (
                              <button className="tl-act" title="Skip to tomorrow"
                                onClick={(e) => { e.stopPropagation(); skipTask(t.id); }}>
                                <SkipForward size={9} />
                              </button>
                            )}
                            <button className="tl-act" title="Edit"
                              onClick={(e) => { e.stopPropagation(); setEditingTask(t); }}>
                              <Pencil size={9} />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  }

                  {/* Inline add input */}
                  {addingAt !== null && typeof addingAt === "object" && (
                    <div className="tl-add-wrap"
                      style={{ top: cTop(addingAt.hour, addingAt.minute) }}
                      onClick={(e) => e.stopPropagation()}>
                      <input ref={addInputRef} className="slot-input" value={addingTitle}
                        onChange={(e) => setAddingTitle(e.target.value)}
                        onKeyDown={(e) => handleSlotKey(e, addingAt)}
                        onBlur={() => commitAdd(addingAt)}
                        placeholder={`Task at ${fmtTime(addingAt.hour, addingAt.minute)}…`} />
                    </div>
                  )}

                  {/* Current time indicator — green line */}
                  {selectedDate === today && currentHour >= HOURS[0] && (
                    <div className="tl-now-line" style={{ top: cTop(currentHour, nowObj.getMinutes()) }}>
                      <div className="tl-now-dot" />
                      <div className="tl-now-rule" />
                    </div>
                  )}

                  {/* Drag position indicator */}
                  {dragOver?.y != null && (
                    <div className="tl-drag-line" style={{ top: dragOver.y }}>
                      {dragOver.snap && (
                        <span className="tl-drag-time">
                          {fmtTime(dragOver.snap.hour, dragOver.snap.minute)}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Month view ── */}
          {view === "month" && (
            <div className="month-wrap">
              <div className="month-weekday-row">
                {WEEKDAY_SHORT.map((d) => <div key={d} className="month-weekday">{d}</div>)}
              </div>
              <div className="month-grid">
                {monthDays.map(({ date, inMonth }) => {
                  const dayTasks = getTasksForDate(date).filter((t) => {
                    if (filterGroup      && t.groupId    !== filterGroup)      return false;
                    if (filterComplexity && t.complexity !== filterComplexity) return false;
                    return true;
                  });
                  const isToday  = date === today;
                  const isPast   = date < today && inMonth;
                  const visible  = dayTasks.slice(0, 3);
                  const overflow = dayTasks.length - visible.length;
                  const dayNum   = new Date(date + "T00:00:00").getDate();
                  return (
                    <div key={date}
                      className={["month-day", !inMonth?"out-month":"", isToday?"is-today":"", isPast?"is-past":""].filter(Boolean).join(" ")}
                      onClick={() => { setSelectedDate(date); setView("day"); }}>
                      <div className={`month-day-num${isToday ? " today-badge" : ""}`}>{dayNum}</div>
                      <div className="month-task-list">
                        {visible.map((t) => {
                          const g  = getGroup(t.groupId);
                          const c  = t.complexity ? COMPLEXITY[t.complexity].color : null;
                          const tp = t.type ?? "task";
                          const gc = tp === "deadline" ? "#ef4444"
                                   : tp === "break"    ? "#94a3b8"
                                   : g?.color ?? c ?? "var(--accent)";
                          return (
                            <div key={t.id}
                              className={`month-task-pill${t.completed?" done":""}${tp !== "task" ? ` mtp-${tp}` : ""}`}
                              style={{ "--gc": gc }}>
                              {tp === "deadline" && <Flag size={8} style={{ flexShrink: 0 }} />}
                              {tp === "break"    && <Coffee size={8} style={{ flexShrink: 0 }} />}
                              {tp === "task" && t.repeat && <RotateCcw size={8} style={{ flexShrink: 0 }} />}
                              {t.startHour != null && <span className="mtp-time">{fmtTimeShort(t.startHour, t.startMinute??0)} </span>}
                              {t.title || (tp === "break" ? "Break" : tp === "deadline" ? "Deadline" : "")}
                            </div>
                          );
                        })}
                        {overflow > 0 && <div className="month-overflow">+{overflow} more</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── All Tasks list view ── */}
          {view === "list" && (() => {
            const allFiltered = tasks.filter((t) => {
              if (filterGroup      && t.groupId    !== filterGroup)      return false;
              if (filterComplexity && t.complexity !== filterComplexity) return false;
              return true;
            }).sort((a, b) => {
              if (a.date !== b.date) return a.date.localeCompare(b.date);
              const aTime = a.startHour != null ? a.startHour * 60 + (a.startMinute ?? 0) : 9999;
              const bTime = b.startHour != null ? b.startHour * 60 + (b.startMinute ?? 0) : 9999;
              return aTime - bTime;
            });

            if (allFiltered.length === 0) {
              return (
                <div className="list-empty">
                  <CalendarDays size={40} style={{ opacity: .25 }} />
                  <p>No tasks yet. Add one from the Day view!</p>
                </div>
              );
            }

            // Group by date
            const byDate = [];
            let lastDate = null;
            allFiltered.forEach((t) => {
              if (t.date !== lastDate) { byDate.push({ date: t.date, tasks: [] }); lastDate = t.date; }
              byDate[byDate.length - 1].tasks.push(t);
            });

            return (
              <div className="list-view">
                {byDate.map(({ date, tasks: dateTasks }) => (
                  <div key={date} className="list-group">
                    <div className="list-date-header">
                      <span className="list-date-label">{prettyDate(date)}</span>
                      <span className="list-date-sub">{new Date(date + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</span>
                    </div>
                    {dateTasks.map((t) => {
                      const tp    = t.type ?? "task";
                      const group = getGroup(t.groupId);
                      const cx    = t.complexity ? COMPLEXITY[t.complexity] : null;
                      const gc    = tp === "deadline" ? "#ef4444"
                                  : tp === "break"    ? "#94a3b8"
                                  : group?.color ?? cx?.color ?? "var(--accent)";
                      const isDeferred = tp === "task" && !t.completed && t.date < today;
                      return (
                        <div key={t.id}
                          className={`list-task${t.completed ? " done" : ""}${isDeferred ? " deferred" : ""}`}
                          style={{ "--gc": gc }}>
                          {/* Header row */}
                          <div className="list-task-main" onClick={() => setEditingTask(t)}>
                            {tp === "task"
                              ? <button className={`chip-check${t.completed ? " checked" : ""}`}
                                  onClick={(e) => { e.stopPropagation(); toggleTask(t.id); }}>
                                  {t.completed && <Check size={10} strokeWidth={3} />}
                                </button>
                              : <span className="list-type-icon">
                                  {tp === "deadline" ? <Flag size={13} style={{ color: "#ef4444" }} /> : <Coffee size={13} style={{ color: "#94a3b8" }} />}
                                </span>
                            }
                            <div className="list-task-body">
                              <span className="list-task-title" title={t.title || undefined}>
                                {shortTitle(t.title) || (tp === "break" ? "Break" : "Deadline")}
                                {t.startHour != null && <span className="list-title-time"> — {fmtTime(t.startHour, t.startMinute ?? 0)}</span>}
                              </span>
                              <div className="list-task-meta">
                                {t.duration   && <span className="badge dbadge">{fmtDur(t.duration)}</span>}
                                {cx           && <span className="badge cbadge" style={{ "--cc": cx.color }}>{t.complexity}</span>}
                                {group        && <span className="badge gbadge" style={{ "--gc": group.color }}>{group.name}</span>}
                                {t.repeat     && <span className="badge rbadge"><RotateCcw size={9} /> {t.repeat}</span>}
                                {t.notes      && <span className="badge nbadge"><FileText size={9} /></span>}
                              </div>
                            </div>
                          </div>
                          {/* Action row */}
                          {tp === "deadline" && !t.completed && (
                            <div className="list-task-actions">
                              <button className="tca tca-done-dl"
                                onClick={(e) => { e.stopPropagation(); toggleTask(t.id); }}>
                                Mark done
                              </button>
                              <button className="tca tca-edit"
                                onClick={(e) => { e.stopPropagation(); setEditingTask(t); }}>
                                <Pencil size={10} /> Edit
                              </button>
                            </div>
                          )}
                          {tp === "task" && (
                            <div className="list-task-actions">
                              {!t.completed && (
                                <button className="tca tca-focus"
                                  onClick={(e) => { e.stopPropagation(); setFocusTask(t); }}>
                                  <Zap size={10} /> Focus
                                </button>
                              )}
                              {!t.completed && (
                                <button className="tca tca-resched"
                                  onClick={(e) => { e.stopPropagation(); setRescheduleTask(t); }}>
                                  <CalendarDays size={10} /> Move
                                </button>
                              )}
                              {!t.completed && (
                                <button className="tca tca-skip"
                                  onClick={(e) => { e.stopPropagation(); skipTask(t.id); }}>
                                  <SkipForward size={10} /> Skip
                                </button>
                              )}
                              <button className="tca tca-edit"
                                onClick={(e) => { e.stopPropagation(); setEditingTask(t); }}>
                                <Pencil size={10} /> Edit
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            );
          })()}

          {/* ── Notes view ── */}
          {/* ── Status view ── */}
          {view === "status" && (
            <StatusPage {...buildWorkMindProps(
              statusEngine,
              { energy, relaxation, focus, motivation, todaySleepQuality, morningCheckup, dailyMetrics },
              {
                setChatInput, setChatOpen, setAtlasOpen, setRescheduleTask,
                setShowMorningCheckup, setReviewCheckupMode,
                setEnergy, setRelaxation, setFocus, setMotivation, setSleepQuality,
              }
            )} health={health}
              onOpenHealthSettings={() => { setSidebarOpen(true); setActiveSettings("program"); }}
              tasks={tasks} dailyMetrics={dailyMetrics} healthSummary={healthSummary} journeys={journeys}
              onOpenInsights={() => setShowObservations(true)}
              onAskAtlas={(message) => { setAtlasChatInput(message); setAtlasOpen(true); }}
              onMindModeChange={setStatusMindActive} />
          )}


          {view === "notes" && (() => {
            const openNote  = openNoteId ? notes.find(n => n.id === openNoteId) : null;
            const migrated  = openNote ? migrateNote(openNote) : null;

            const closeNote = () => {
              if (openNote) {
                const m = migrateNote(openNote);
                const empty = !m.title?.trim() && !m.content?.trim() && !m.items?.length;
                const justCreated = (Date.now() - (openNote.createdAt ?? 0)) < 30_000;
                if (empty && justCreated) deleteNote(openNote.id);
              }
              setOpenNoteId(null);
              setNoteMenuOpen(null);
            };

            const handleDelete = (id) => {
              setDeletingNoteId(id);
              if (openNoteId === id) setOpenNoteId(null);
              setTimeout(() => { deleteNote(id); setDeletingNoteId(null); }, 200);
            };

            const migratedNotes = notes.map(migrateNote);
            const filtered = migratedNotes.filter(n => {
              const matchSearch = !noteSearch || (() => {
                const q = noteSearch.toLowerCase();
                return n.title?.toLowerCase().includes(q) ||
                       n.content?.toLowerCase().includes(q) ||
                       n.items?.some(i => i.text?.toLowerCase().includes(q));
              })();
              const matchFilter = noteFilter === "all" || n.type === noteFilter;
              return matchSearch && matchFilter;
            });
            const sorted = [...filtered].sort((a, b) => {
              if (noteSortBy === "alpha")  return (a.title || "").localeCompare(b.title || "");
              if (noteSortBy === "oldest") return (a.createdAt ?? 0) - (b.createdAt ?? 0);
              if (a.pinned !== b.pinned)   return a.pinned ? -1 : 1;
              if (a.starred !== b.starred) return a.starred ? -1 : 1;
              return (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0);
            });
            const pinnedNotes = sorted.filter(n => n.pinned);
            const otherNotes  = sorted.filter(n => !n.pinned);

            const renderNotesMasonry = (list) => {
              const cols = 3;
              const columns = Array.from({ length: cols }, (_, ci) => list.filter((_, i) => i % cols === ci));
              return (
                <div className="notes-masonry">
                  {columns.map((col, ci) => (
                    <div key={ci} className="notes-masonry-col">
                      {col.map(note => (
                        <NoteCard
                          key={note.id}
                          note={note}
                          deleting={deletingNoteId === note.id}
                          isNew={newNoteId === note.id}
                          onClick={() => setOpenNoteId(note.id)}
                          onDelete={() => handleDelete(note.id)}
                          onPin={() => patchNote(note.id, { pinned: !note.pinned })}
                          onStar={() => patchNote(note.id, { starred: !note.starred })}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              );
            };

            return (
              <div className="notes-view">
                {/* ── Toolbar ── */}
                <div className="notes-toolbar">
                  {/* Search */}
                  <div className="notes-search-bar">
                    <Search size={14} className="notes-search-icon" />
                    <input
                      className="notes-search-input"
                      value={noteSearch}
                      onChange={e => setNoteSearch(e.target.value)}
                      placeholder="Search notes…"
                    />
                    {noteSearch && (
                      <button className="notes-search-clear" onClick={() => setNoteSearch("")}>
                        <X size={13} />
                      </button>
                    )}
                  </div>

                  <div className="notes-tb-actions">
                    {/* Filter */}
                    <div className="notes-tb-btn-wrap">
                      <button
                        className={`notes-tb-btn${noteFilter !== "all" ? " notes-tb-btn-active" : ""}`}
                        onClick={() => setNoteMenuOpen(v => v === "filter" ? null : "filter")}
                      >
                        <Filter size={12} />
                        {noteFilter === "all" ? "Filter" : (NOTE_TYPE_DEFS.find(t => t.key === noteFilter)?.label ?? noteFilter)}
                        <ChevronDown size={11} />
                      </button>
                      {noteMenuOpen === "filter" && (
                        <>
                          <div className="notes-dd-backdrop" onClick={() => setNoteMenuOpen(null)} />
                          <div className="notes-dropdown">
                            {[{ key: "all", label: "All notes", icon: FileText }, ...NOTE_TYPE_DEFS].map(t => {
                              const Icon = t.icon;
                              return (
                                <button
                                  key={t.key}
                                  className={`notes-dd-item${noteFilter === t.key ? " notes-dd-item-active" : ""}`}
                                  onClick={() => { setNoteFilter(t.key); setNoteMenuOpen(null); }}
                                >
                                  <Icon size={13} />{t.label}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Sort */}
                    <div className="notes-tb-btn-wrap">
                      <button
                        className={`notes-tb-btn${noteSortBy !== "recent" ? " notes-tb-btn-active" : ""}`}
                        onClick={() => setNoteMenuOpen(v => v === "sort" ? null : "sort")}
                      >
                        <ArrowUpDown size={12} />
                        {noteSortBy === "recent" ? "Recent" : noteSortBy === "oldest" ? "Oldest" : "A–Z"}
                        <ChevronDown size={11} />
                      </button>
                      {noteMenuOpen === "sort" && (
                        <>
                          <div className="notes-dd-backdrop" onClick={() => setNoteMenuOpen(null)} />
                          <div className="notes-dropdown">
                            {[
                              { key: "recent", label: "Most recent" },
                              { key: "oldest", label: "Oldest first" },
                              { key: "alpha",  label: "A–Z by title"  },
                            ].map(opt => (
                              <button
                                key={opt.key}
                                className={`notes-dd-item${noteSortBy === opt.key ? " notes-dd-item-active" : ""}`}
                                onClick={() => { setNoteSortBy(opt.key); setNoteMenuOpen(null); }}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    {/* New Note */}
                    <div className="notes-tb-btn-wrap">
                      <button
                        className="notes-new-btn"
                        onClick={() => setNoteMenuOpen(v => v === "type" ? null : "type")}
                      >
                        <Plus size={14} />New Note<ChevronDown size={11} />
                      </button>
                      {noteMenuOpen === "type" && (
                        <>
                          <div className="notes-dd-backdrop" onClick={() => setNoteMenuOpen(null)} />
                          <div className="notes-dropdown notes-type-dropdown">
                            {NOTE_TYPE_DEFS.map(t => {
                              const Icon = t.icon;
                              return (
                                <button
                                  key={t.key}
                                  className="notes-dd-item notes-dd-type-item"
                                  onClick={() => { createNote(t.key); setNoteMenuOpen(null); }}
                                >
                                  <Icon size={14} />
                                  <div>
                                    <div className="notes-dd-type-label">{t.label}</div>
                                    <div className="notes-dd-type-desc">{t.desc}</div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Empty state */}
                {sorted.length === 0 && (
                  <div className="notes-empty">
                    <FileText size={42} style={{ opacity: .07 }} />
                    <p>{noteSearch ? "No notes match your search." : "Click \"New Note\" to create your first note."}</p>
                  </div>
                )}

                {/* Pinned section */}
                {pinnedNotes.length > 0 && (
                  <>
                    <div className="notes-section-hdr">Pinned</div>
                    {renderNotesMasonry(pinnedNotes)}
                  </>
                )}

                {/* Other notes */}
                {otherNotes.length > 0 && (
                  <>
                    {pinnedNotes.length > 0 && <div className="notes-section-hdr">Notes</div>}
                    {renderNotesMasonry(otherNotes)}
                  </>
                )}

                {/* Note editor */}
                {migrated && (
                  <NoteEditor
                    note={migrated}
                    isMobile={false}
                    onPatch={fields => patchNote(openNote.id, fields)}
                    onDelete={() => handleDelete(openNote.id)}
                    onClose={closeNote}
                  />
                )}
              </div>
            );
          })()}

          </div>{/* page-anim */}
        </div>

        <footer className="app-footer">
          <div className="footer-inner">
            <div className="footer-brand">
              <BrandLockup size={24} tone={dark ? "white" : "black"} className="footer-logo" />
              <span className="footer-tagline">More than just a planner</span>
            </div>
            {/* ── Social / info links — add links here later ── */}
            <div className="footer-links" />
            <span className="footer-copy">© {tick.getFullYear()} Nora</span>
          </div>
        </footer>
      </div>{/* /main-wrap */}

      {/* Whiteboards — rendered outside main-wrap so position:fixed works through glass theme */}
      {view === "boards" && (
        <Whiteboard
          boards={boards}
          setBoards={setBoards}
          onClose={() => setView("day")}
          session={session}
          onAskNora={(prompt) => { setChatInput(prompt); setChatOpen(true); }}
          onConvertTask={(block) => {
            setEditingTask({
              id: uid(), type: block.type === "deadline" ? "deadline" : "task",
              title: block.title, date: selectedDate,
              startHour: null, startMinute: null,
              duration: null, repeat: null, repeatEnd: null,
              completed: false, notes: block.content || "",
              complexity: null, groupId: null, reminderOffset: null,
              ...(block.type === "deadline" && block.dueDate ? { deadline: block.dueDate } : {}),
            });
          }}
        />
      )}

      {/* AI FAB — opens the AI Hub launcher; closes whichever AI surface is open */}
      <button
        className={`chat-fab${(aiHubOpen || chatOpen || messengerOpen || atlasOpen) ? " active" : ""}${showLaunchSplash ? " chat-fab-launch-hidden" : ""}`}
        onClick={() => {
          if (aiHubOpen || chatOpen || messengerOpen || atlasOpen) {
            setAiHubOpen(false); setChatOpen(false); setMessengerOpen(false); setAtlasOpen(false);
          } else {
            setAiHubOpen(true);
          }
        }}
      >
        {(aiHubOpen || chatOpen || messengerOpen || atlasOpen) ? <X size={22} /> : <BrandStar size={24} tone="white" />}
      </button>

      <div className={`chat-panel native-ui${chatOpen ? " open" : ""}`}>
        <ConversationSidebar
          open={chatSidebarOpen}
          onClose={() => setChatSidebarOpen(false)}
          conversations={plannerEngine.conversations}
          activeId={plannerEngine.activeId}
          loading={plannerEngine.conversationsLoading}
          onSelect={(id) => { plannerEngine.selectConversation(id); setChatSidebarOpen(false); }}
          onNew={() => { plannerEngine.newConversation(); setChatSidebarOpen(false); }}
          onRename={plannerEngine.rename}
          onPin={plannerEngine.pin}
          onArchive={plannerEngine.archive}
          onDelete={plannerEngine.remove}
        />
        <AssistantChatHeader
          title="Nora"
          subtitle="Planning and execution"
          onHistory={() => setChatSidebarOpen((visible) => !visible)}
          onClose={() => setChatOpen(false)}
        />
        <div className="chat-messages-wrap">
          <div className="chat-messages" ref={chatMsgRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              setChatAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
            }}>
            {messages.length === 0 && !chatLoading && (
              <section className="desktop-chat-welcome" aria-label="Nora introduction">
                <span className="desktop-chat-welcome-mark">
                  <BrandStar size={23} tone="current" />
                </span>
                <h1>What should we make easier?</h1>
                <div className="desktop-chat-welcome-copy">
                  <MessagePartsList parts={[textPart(NORA_GREETING)]} />
                </div>
              </section>
            )}
            {messages.map((m, i) => (
              <ConversationMessage
                key={m.id ?? i}
                message={m}
                className={`chat-msg ${m.role}`}
                bubbleClassName="chat-bubble"
                assistantName="Nora"
                onEdit={editPlannerMessage}
                onRetry={retryPlannerMessage}
                onOpenAtlas={openAtlasHandoff}
                onPlannerAction={handlePlannerAction}
                plannerTasks={tasks}
              />
            ))}
            {chatLoading && <div className="chat-msg assistant"><div className="chat-bubble typing"><span /><span /><span /></div></div>}
            <div ref={chatEndRef} />
          </div>
          {!chatAtBottom && (
            <button className="chat-scroll-btn"
              onClick={() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" })}>
              <ChevronDown size={16} />
            </button>
          )}
        </div>
        {desktopSuggestionsVisible && <div className="chat-suggestions">
          {!chatInput ? (
            <div className="chat-ai-bubbles">
              {aiChatSugLoading ? (
                [0, 1, 2].map((i) => <div key={i} className="chat-ai-bubble-shimmer" />)
              ) : (
                (aiChatSuggestions ?? ["What should I focus on today?", "Help me plan my day", "How's my workload this week?"]).map((s, i) => (
                  <button key={i} className="chat-ai-bubble" onClick={() => {
                    setChatInput(s); setChatGhost(""); setChatSuggestions(DEFAULT_CHAT_CHIPS);
                    chatInputRef.current?.focus();
                  }}>{s}</button>
                ))
              )}
            </div>
          ) : (
            chatSuggestions.length > 0 && (
              <div className="chat-chips-pill">
                {chatSuggestions.map((s, i) => (
                  <button key={i} className="chat-chip" onClick={() => {
                    setChatInput(s); setChatGhost(""); setChatSuggestions(DEFAULT_CHAT_CHIPS);
                    chatInputRef.current?.focus();
                  }}>{s}</button>
                ))}
              </div>
            )
          )}
        </div>}
        <AssistantChatComposer
          className="desktop-chat-composer"
          value={chatInput}
          inputRef={chatInputRef}
          rows={2}
          loading={chatLoading}
          ghostSuffix={chatGhost}
          placeholder="Ask Nora anything…"
          onChange={(event) => {
            const value = event.target.value;
            setChatInput(value);
            const ghost = getChatGhost(value);
            setChatGhost(ghost);
            setChatSuggestions(getChatAlternatives(value, ghost));
            event.target.style.height = "auto";
            event.target.style.height = `${Math.min(event.target.scrollHeight, 160)}px`;
          }}
          onKeyDown={(event) => {
            if (event.key === "Tab" && chatGhost) {
              event.preventDefault();
              const completed = chatInput + chatGhost;
              setChatInput(completed);
              setChatGhost(getChatGhost(completed));
              setChatSuggestions(DEFAULT_CHAT_CHIPS);
            } else if (
              event.key === "ArrowRight" &&
              chatGhost &&
              event.target.selectionStart === chatInput.length &&
              event.target.selectionEnd === chatInput.length
            ) {
              event.preventDefault();
              const completed = chatInput + chatGhost;
              setChatInput(completed);
              setChatGhost("");
              setChatSuggestions(DEFAULT_CHAT_CHIPS);
            } else if (event.key === "Escape") {
              setChatGhost("");
              setChatSuggestions(DEFAULT_CHAT_CHIPS);
            } else if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              sendChat();
              setChatGhost("");
              setChatSuggestions(DEFAULT_CHAT_CHIPS);
            }
          }}
          onSend={sendChat}
          leading={(
            <AssistantComposerMenu
              suggestionsVisible={desktopSuggestionsVisible}
              onToggleSuggestions={() => setDesktopSuggestionsVisible((visible) => {
                  const next = !visible;
                  try { localStorage.setItem("nora_desktop_chat_suggestions", next ? "visible" : "hidden"); } catch {}
                  return next;
                })}
              microStartMode={microStartMode}
              onToggleMicroStart={() => setMicroStartMode((mode) => !mode)}
            />
          )}
        />
      </div>

      <AIHub
        open={aiHubOpen}
        onClose={() => setAiHubOpen(false)}
        badges={{ insights: intel.pendingCount > 0 }}
        tools={visibleAiTools}
        onSelect={(id) => {
          setAiHubOpen(false);
          if (id === "assistant") setChatOpen(true);
          else if (id === "atlas") setAtlasOpen(true);
          else if (id === "messenger") setMessengerOpen(true);
          else if (id === "insights") intel.setCenterOpen(true);
        }}
      />
      <DesktopAtlasChat
        open={atlasOpen}
        onClose={() => setAtlasOpen(false)}
        messages={atlasMessages}
        chatInput={atlasChatInput}
        setChatInput={setAtlasChatInput}
        chatLoading={atlasChatLoading}
        onSend={sendAtlasChat}
        introSeen={assistantSettings.atlasIntroSeen}
        onIntroSeen={() => updateAssistantSettings({ atlasIntroSeen: true })}
        greeting={ATLAS_GREETING}
        conversations={atlasEngine.conversations}
        activeConversationId={atlasEngine.activeId}
        conversationsLoading={atlasEngine.conversationsLoading}
        onSelectConversation={atlasEngine.selectConversation}
        onNewConversation={atlasEngine.newConversation}
        onRenameConversation={atlasEngine.rename}
        onPinConversation={atlasEngine.pin}
        onArchiveConversation={atlasEngine.archive}
        onDeleteConversation={atlasEngine.remove}
        onOpenNora={openNoraReturnPlan}
        onEditMessage={editAtlasMessage}
        onRetryMessage={retryAtlasMessage}
        plannerTasks={tasks}
      />
      <DesktopToolComingSoon
        open={messengerOpen}
        onClose={() => setMessengerOpen(false)}
        tool={AI_HUB_TOOLS.find((t) => t.id === "messenger")}
        dark={dark}
      />

      {inAppAlert && (
        <div className="notif-toast" role="alert">
          <Bell size={18} className="notif-toast-icon" />
          <div className="notif-toast-text">
            <div className="notif-toast-title">{inAppAlert.title}</div>
            <div className="notif-toast-body">In {inAppAlert.offset} min · {inAppAlert.timeStr}</div>
          </div>
          <button className="notif-toast-close" onClick={() => setInAppAlert(null)}><X size={14} /></button>
        </div>
      )}

      {/* Nora's observations — full-page discovery experience */}
      {showObservations && (
        <NoraObservations
          metrics={dailyMetrics}
          tasks={tasks}
          healthSummary={healthSummary}
          onClose={() => setShowObservations(false)}
          onAskNora={(message) => {
            setShowObservations(false);
            setChatInput(message);
            setChatOpen(true);
          }}
        />
      )}

      {/* Morning Check-Up overlay */}
      {showMorningCheckup && (
        <MorningCheckup
          dark={dark}
          glass={theme === "liquid_glass"}
          today={today}
          todayTasks={todayTasks}
          onComplete={handleCheckupComplete}
          onClose={() => { setShowMorningCheckup(false); setReviewCheckupMode(false); }}
          viewOnly={reviewCheckupMode && !!morningCheckup}
          existingData={reviewCheckupMode ? morningCheckup : null}
          engineContext={{
            dailyMetrics, deferredTasks, recoveryState, userPrefs,
            metrics, workloadForecast, taskWeights, tasks,
            recoveryTrendDeclining3d, emotionalDrift,
          }}
          healthSleep={health.context?.sleep ?? null}
          health={health}
          healthSummary={healthSummary}
          onAskAtlas={(message) => {
            setShowMorningCheckup(false);
            setReviewCheckupMode(false);
            setAtlasOpen(true);
            atlasEngine.send(message);
          }}
        />
      )}

      {/* Focus session overlay */}
      {focusTask && (
        <FocusSession
          task={focusTask}
          dark={dark}
          userPrefs={userPrefs}
          setUserPrefs={setUserPrefs}
          notifSettings={notifSettings}
          showNotification={showNotification}
          onClose={(action) => {
            setFocusTask(null);
            if (action === "reschedule") setRescheduleTask(focusTask);
          }}
          onComplete={() => { toggleTask(focusTask.id); setFocusTask(null); }}
        />
      )}

      {/* Reschedule modal */}
      {rescheduleTask && (
        <RescheduleModal
          task={rescheduleTask}
          onSave={saveReschedule}
          onClose={() => setRescheduleTask(null)}
        />
      )}

      {/* Task edit modal */}
      {editingTask && draft && (
        <NativeDialog
          onClose={() => setEditingTask(null)}
          title="Task details"
          subtitle="Adjust when, where, and how this task should happen."
          className="task-editor-dialog"
          contentClassName="task-editor-dialog__content"
          footer={(
            <>
              <NativeButton variant="danger" leading={<Trash2 size={15} />} onClick={() => deleteTask(draft.id)}>
                Delete
              </NativeButton>
              <NativeButton
                variant="secondary"
                leading={draft.sharedObjectId ? <Users size={15} /> : <Share2 size={15} />}
                onClick={() => setSharingTask({ ...draft })}
              >
                {draft.sharedObjectId
                  ? `${sharedObjects.find(o => o.id === draft.sharedObjectId)?.collaborators?.length ?? 0} people`
                  : "Share"}
              </NativeButton>
              <NativeButton onClick={saveTask}>Save</NativeButton>
            </>
          )}
        >
            <div className="modal-body">
              <input
                className="modal-title-input"
                value={draft.title}
                placeholder="Task title"
                aria-label="Task title"
                autoFocus
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              />
              {/* Type selector */}
              <NativeSegmentedControl
                label="Task type"
                value={draft.type ?? "task"}
                onChange={(type) => setDraft((d) => ({ ...d, type }))}
                options={[
                  { value: "task", label: "Task", icon: <Check size={13} /> },
                  { value: "deadline", label: "Deadline", icon: <Flag size={13} /> },
                  { value: "break", label: "Break", icon: <Coffee size={13} /> },
                ]}
              />

              <div className="modal-field">
                <label className="field-label">Time</label>
                <div className="time-row">
                  <select className="field-select" value={draft.startHour ?? ""}
                    onChange={(e) => setDraft((d) => ({
                      ...d,
                      startHour:   e.target.value === "" ? null : Number(e.target.value),
                      startMinute: e.target.value === "" ? null : (d.startMinute ?? 0),
                    }))}>
                    <option value="">No time</option>
                    {Array.from({ length: 18 }, (_, i) => i + 6).map((h) => (
                      <option key={h} value={h}>{fmtTime(h, 0)}</option>
                    ))}
                  </select>
                  <select className="field-select" disabled={draft.startHour == null}
                    value={draft.startMinute ?? 0}
                    onChange={(e) => setDraft((d) => ({ ...d, startMinute: Number(e.target.value) }))}>
                    {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                      <option key={m} value={m}>{`:${pad(m)}`}</option>
                    ))}
                  </select>
                </div>
              </div>
              {draft.startHour != null && (
                <div className="modal-field">
                  <label className="field-label">Reminder</label>
                  <div className="reminder-dial">
                    <button
                      className={`reminder-btn none-opt${draft.reminderOffset === "none" ? " active" : ""}`}
                      onClick={() => setDraft((d) => ({ ...d, reminderOffset: d.reminderOffset === "none" ? null : "none" }))}>
                      None
                    </button>
                    {REMINDER_PRESETS.map((m) => (
                      <button key={m}
                        className={`reminder-btn${draft.reminderOffset === m ? " active" : ""}`}
                        onClick={() => setDraft((d) => ({ ...d, reminderOffset: d.reminderOffset === m ? null : m }))}>
                        {m} min
                      </button>
                    ))}
                  </div>
                  {draft.reminderOffset == null && (
                    <span className="field-hint">Default — {reminderMins} min before (from sidebar settings)</span>
                  )}
                </div>
              )}
              {(draft.type ?? "task") !== "deadline" && (
                <div className="modal-field">
                  <label className="field-label">Duration</label>
                  <select className="field-select" value={draft.duration ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, duration: e.target.value === "" ? null : Number(e.target.value) }))}>
                    <option value="">No duration</option>
                    {Array.from({ length: 48 }, (_, i) => (i + 1) * 5).map((m) => (
                      <option key={m} value={m}>{fmtDur(m)}</option>
                    ))}
                  </select>
                </div>
              )}
              <div className="modal-field">
                <label className="field-label">Repeat</label>
                <select className="field-select" value={draft.repeat ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, repeat: e.target.value || null }))}>
                  <option value="">No repeat</option>
                  <option value="daily">Every day</option>
                  <option value="weekly">Every week</option>
                  <option value="monthly">Every month</option>
                </select>
              </div>
              {(draft.type ?? "task") === "task" && (
                <div className="modal-field">
                  <label className="field-label">Complexity</label>
                  <div className="pill-row">
                    {Object.entries(COMPLEXITY).map(([key]) => (
                      <button key={key} className={`complexity-btn ${key}${draft.complexity === key ? " active" : ""}`}
                        onClick={() => setDraft((d) => ({ ...d, complexity: d.complexity === key ? null : key }))}>
                        {COMPLEXITY[key].label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {(draft.type ?? "task") === "task" && (
                <div className="modal-field">
                  <label className="field-label">Group</label>
                  <div className="pill-row">
                    {groups.map((g) => (
                      <button key={g.id} className={`group-btn${draft.groupId === g.id ? " active" : ""}`}
                        style={{ "--gc": g.color }}
                        onClick={() => setDraft((d) => ({ ...d, groupId: d.groupId === g.id ? null : g.id }))}>
                        <span className="gdot-sm" />{g.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="modal-field">
                <label className="field-label">Location</label>
                <LocationField
                  value={draft.location ?? null}
                  onChange={(loc) => setDraft((d) => ({ ...d, location: loc }))}
                  savedPlaces={savedPlaces}
                />
              </div>
              <div className="modal-field">
                <label className="field-label">Notes</label>
                <textarea className="modal-notes" rows={4} value={draft.notes}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                  placeholder="Add notes, links, context..." />
              </div>
            </div>
        </NativeDialog>
      )}

      {/* Group modal */}
      {showGroupModal && (
        <NativeDialog
          onClose={() => setShowGroupModal(false)}
          title="Manage groups"
          subtitle="Create a clear home for related work."
          className="group-editor-dialog"
          footer={(
            <>
              <NativeButton variant="tertiary" onClick={() => setShowGroupModal(false)}>Close</NativeButton>
              <NativeButton
                leading={<Plus size={15} />}
                onClick={createGroup}
                disabled={!newGroupName.trim() || groups.some((g) => g.name.toLowerCase() === newGroupName.trim().toLowerCase())}
              >
                Create
              </NativeButton>
            </>
          )}
        >
            <div className="modal-body">
              <div className="modal-field">
                <label className="field-label">New Group Name</label>
                <input className="field-input" value={newGroupName} autoFocus
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createGroup()}
                  placeholder="e.g. Health, Learning..." />
                {newGroupName.trim() && groups.some((g) => g.name.toLowerCase() === newGroupName.trim().toLowerCase()) && (
                  <span className="field-error">A group with this name already exists.</span>
                )}
              </div>
              <div className="modal-field">
                <label className="field-label">Colour</label>
                <div className="color-row">
                  {["#ef4444","#f97316","#eab308","#22c55e","#06b6d4","#3b82f6","#8b5cf6","#ec4899","#10b981"].map((c) => (
                    <button key={c} className={`color-swatch${newGroupColor === c ? " sel" : ""}`}
                      style={{ background: c, "--sw-color": c }} onClick={() => setNewGroupColor(c)} />
                  ))}
                  <input type="color" className="color-custom" value={newGroupColor}
                    onChange={(e) => setNewGroupColor(e.target.value)} />
                </div>
              </div>
              {groups.filter((g) => g.id !== "private" && g.id !== "work").length > 0 && (
                <div className="modal-field">
                  <label className="field-label">Custom Groups</label>
                  <div className="existing-groups">
                    {groups.filter((g) => g.id !== "private" && g.id !== "work").map((g) => (
                      <div key={g.id} className="existing-group-row">
                        <span className="gdot-sm" style={{ "--gc": g.color }} />
                        <span>{g.name}</span>
                        <button className="del-group-btn" onClick={() => deleteGroup(g.id)}><X size={12} /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
        </NativeDialog>
      )}

      {/* Share modal */}
      {sharingTask && (
        <ShareModal
          objectType={sharingTask.type === "deadline" ? "deadline" : "task"}
          objectData={sharingTask}
          sharedObjectId={sharingTask.sharedObjectId ?? null}
          session={session}
          onClose={() => setSharingTask(null)}
          onSharedObjectId={(id) => {
            setTasks((prev) => prev.map((t) =>
              t.id === sharingTask.id ? { ...t, sharedObjectId: id } : t
            ));
            setSharingTask((prev) => prev ? { ...prev, sharedObjectId: id } : null);
            setDraft((d) => d ? { ...d, sharedObjectId: id } : d);
            cacheSharedObject({ id, type: sharingTask.type === "deadline" ? "deadline" : "task", data: sharingTask }, []);
          }}
          onCollaboratorsChange={(id, collaborators) => {
            cacheSharedObject({
              id,
              type: sharingTask.type === "deadline" ? "deadline" : "task",
              data: sharingTask,
            }, collaborators);
          }}
        />
      )}

      {showJoinCode && <JoinCodeModal onClose={() => setShowJoinCode(false)} onJoin={handleJoinCode} />}

      {/* PWA update / install banners */}
      <PWABanners dark={dark} />

      {/* Notification permission prompt — shown contextually after first meaningful use */}
      {notifBannerVisible && (
        <NotificationPermissionBanner
          onAllow={requestNotifPermission}
          onLater={() => dismissNotifBanner(false)}
          onNever={() => dismissNotifBanner(true)}
        />
      )}

      {/* Username nudge banner — shown when user has no username */}
      {showUsernameBanner && !showOnboarding && (
        <UsernameNudgeBanner
          onSetUp={() => { setShowUsernameBanner(false); setShowOnboarding(true); }}
          onLater={() => setShowUsernameBanner(false)}
        />
      )}

      {/* Username onboarding — full-screen modal, opened from banner or profile */}
      {showOnboarding && (
        <UsernameOnboarding
          displayName={userProfile?.name ?? accountName ?? ""}
          onComplete={(result) => {
            setShowOnboarding(false);
            setUserProfile((p) => ({ ...p, ...result }));
            if (result.name) setAccountName(result.name);
          }}
          onSkip={() => setShowOnboarding(false)}
        />
      )}

      {/* Profile modal */}
      {showProfileModal && (
        <ProfileModal
          session={session}
          onClose={() => setShowProfileModal(false)}
          onSaved={(updated) => {
            setUserProfile((p) => ({ ...p, ...updated }));
            if (updated.name) setAccountName(updated.name);
          }}
        />
      )}

      {/* ── Intelligence Layer ──────────────────────────────── */}
      {intel.proactiveVisible && !intel.centerOpen && (
        <ProactiveOverlay
          suggestions={intel.suggestions}
          onReview={() => { intel.setProactiveVisible(false); intel.setCenterOpen(true); }}
          onDismiss={() => intel.setProactiveVisible(false)}
        />
      )}

      {intel.centerOpen && (
        <SuggestionCenter
          suggestions={intel.suggestions}
          accounts={intel.accounts}
          syncing={intel.syncing}
          extracting={intel.extracting}
          onClose={() => intel.setCenterOpen(false)}
          onAccept={intel.acceptSuggestion}
          onReject={intel.rejectSuggestion}
          onRejectAll={intel.rejectAll}
          onSync={async () => { await intel.syncGmail(); await intel.syncTelegram(); }}
          onExtractText={intel.extractFromText}
          onOpenOnboarding={() => { intel.setCenterOpen(false); intel.setOnboardingOpen(true); }}
        />
      )}

      {intel.onboardingOpen && (
        <IntelligenceOnboarding
          hasGmail={intel.hasGmail}
          hasTelegram={intel.hasTelegram}
          onClose={() => intel.setOnboardingOpen(false)}
          onConnectGmail={intel.connectGmail}
          onConnectTelegramPhone={intel.connectTelegramPhone}
          onVerifyTelegramCode={intel.verifyTelegramCode}
          markOnboarded={intel.markOnboarded}
        />
      )}

      {pricingOpen && (
        <PricingModal
          onClose={() => setPricingOpen(false)}
          currentPlan={subscription?.plan ?? "free"}
          userId={session?.user?.id}
          userEmail={session?.user?.email}
        />
      )}
    </div>
    </Suspense>
  );
}

// ── Inline Name Editor ────────────────────────────────────────────
function NameEditor({ name, onSave }) {
  const [editing, setEditing] = React.useState(false);
  const [draft,   setDraft]   = React.useState(name ?? "");
  const inputRef = React.useRef(null);

  const startEdit = () => { setDraft(name ?? ""); setEditing(true); setTimeout(() => inputRef.current?.focus(), 50); };
  const confirm   = () => { onSave(draft.trim()); setEditing(false); };
  const cancel    = () => setEditing(false);

  if (editing) return (
    <div className="name-editor-row">
      <input ref={inputRef} className="name-editor-input" value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") confirm(); if (e.key === "Escape") cancel(); }}
        placeholder="Your name" />
      <button className="name-editor-confirm" onClick={confirm} title="Save"><Check size={13} /></button>
      <button className="name-editor-cancel"  onClick={cancel}  title="Cancel"><X size={13} /></button>
    </div>
  );

  return (
    <div className="name-editor-row">
      <span className="acc-display-name">{name || "No name set"}</span>
      <button className="name-editor-pencil" onClick={startEdit} title="Edit name"><Pencil size={12} /></button>
    </div>
  );
}

// ── Password Reset Form ──────────────────────────────────────────
function PasswordResetForm({ dark, glass, onDone }) {
  const [password,  setPassword]  = React.useState("");
  const [password2, setPassword2] = React.useState("");
  const [loading,   setLoading]   = React.useState(false);
  const [error,     setError]     = React.useState("");
  const [success,   setSuccess]   = React.useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== password2) { setError("Passwords do not match."); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      setTimeout(() => { supabase.auth.signOut(); onDone(); }, 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`app native-ui${dark ? " dark" : ""}${glass ? " glass" : ""} auth-wrap`}>
      <div className="auth-card pw-reset-card">
        <div className="auth-brand">
          <BrandLockup size={38} tone="white" className="auth-brand-logo" />
        </div>
        <p className="auth-tagline">Set your new password</p>
        {success ? (
          <p className="auth-msg auth-success">Password updated! Signing you out…</p>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <input className="auth-input" type="password" placeholder="New password (min 6 chars)"
              value={password} onChange={e => setPassword(e.target.value)} required minLength={6} autoFocus />
            <input className="auth-input" type="password" placeholder="Confirm new password"
              value={password2} onChange={e => setPassword2(e.target.value)} required minLength={6} />
            {error && <p className="auth-msg auth-error">{error}</p>}
            <button className="auth-submit" type="submit" disabled={loading}>
              {loading ? "…" : "Set new password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Reschedule Modal ─────────────────────────────────────────────
function RescheduleModal({ task, onSave, onClose }) {
  const HOURS = Array.from({ length: 24 }, (_, i) => i);
  const pad2  = (n) => String(n).padStart(2, "0");
  const fmtH  = (h) => `${pad2(h)}:00`;

  const [date,   setDate]   = useState(task.date);
  const [hour,   setHour]   = useState(task.startHour ?? "");
  const [minute, setMinute] = useState(task.startMinute ?? 0);
  const [notes,  setNotes]  = useState(task.notes ?? "");

  const handleSave = () => {
    onSave({
      ...task,
      date,
      startHour:   hour === "" ? null : Number(hour),
      startMinute: hour === "" ? null : Number(minute),
      notes,
    });
  };

  return (
    <NativeDialog
      onClose={onClose}
      title="Move task"
      subtitle={task.title || "Untitled task"}
      className="reschedule-modal"
      footer={(
        <>
          <NativeButton variant="tertiary" onClick={onClose}>Cancel</NativeButton>
          <NativeButton onClick={handleSave}>Save</NativeButton>
        </>
      )}
    >
        <div className="modal-body">
          <div className="sett-field">
            <label className="sett-field-lbl">Date</label>
            <input type="date" className="sett-input" value={date}
              onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="sett-field">
            <label className="sett-field-lbl">Time</label>
            <div style={{ display: "flex", gap: 8 }}>
              <select className="sett-select reschedule-select"
                value={hour}
                onChange={(e) => setHour(e.target.value === "" ? "" : Number(e.target.value))}>
                <option value="">No time</option>
                {HOURS.map((h) => <option key={h} value={h}>{fmtH(h)}</option>)}
              </select>
              {hour !== "" && (
                <select className="sett-select reschedule-select"
                  value={minute}
                  onChange={(e) => setMinute(Number(e.target.value))}>
                  {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                    <option key={m} value={m}>:{pad2(m)}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <div className="sett-field">
            <label className="sett-field-lbl">Notes</label>
            <textarea className="sett-input reschedule-notes" rows={3} value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add a note about why it moved…" />
          </div>
        </div>
    </NativeDialog>
  );
}

function TaskChip({ task, group, onReschedule, onSkip, onClick }) {
  const cx = task.complexity ? COMPLEXITY[task.complexity] : null;
  const todayLocal = fmtDate(new Date());
  const isDeferred = !task.completed && task.date < todayLocal;
  const timeStr = task.startHour != null ? fmtTime(task.startHour, task.startMinute ?? 0) : null;
  return (
    <div
      className={`task-chip${task.completed ? " done" : ""}${isDeferred ? " deferred" : ""}`}
      style={{ "--gc": group?.color ?? cx?.color ?? "var(--accent)" }}
      draggable onDragStart={() => (window.__dragId = task.id)}>
      <div className="chip-header">
        <span className="chip-title">
          {task.title}
          {timeStr && <span className="chip-time"> — {timeStr}</span>}
        </span>
      </div>
      <div className="chip-actions">
        {!task.completed && onReschedule && (
          <button className="tca tca-resched"
            onClick={(e) => { e.stopPropagation(); onReschedule(task); }}>
            <CalendarDays size={10} /> Move
          </button>
        )}
        {!task.completed && onSkip && (
          <button className="tca tca-skip"
            onClick={(e) => { e.stopPropagation(); onSkip(task.id); }}>
            <SkipForward size={10} /> Skip
          </button>
        )}
        <button className="tca tca-edit"
          onClick={(e) => { e.stopPropagation(); onClick(task); }}>
          <Pencil size={10} /> Edit
        </button>
      </div>
    </div>
  );
}
