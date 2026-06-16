import React, { useState, useMemo, useRef, useEffect } from "react";
import { supabase } from "./lib/supabase";
import {
  loadUserData, saveUserData,
  saveChatMessage, loadRecentChatMessages, deleteOldChatMessages,
  getUserPreferences, saveUserPreferences,
  saveMorningCheckup, loadTodayCheckup,
} from "./lib/noraApi";
import AuthScreen from "./AuthScreen";
import MobileApp from "./MobileApp";
import MorningCheckup, { computeReadiness } from "./MorningCheckup";
import LongTermInsights from "./LongTermInsights";
import FocusSession from "./FocusSession";
import Whiteboard from "./Whiteboard";
import PWABanners from "./PWABanners";
import { useMobile } from "./hooks/useMobile";
import { useNotifications } from "./hooks/useNotifications";
import NotificationPermissionBanner from "./components/NotificationPermissionBanner";
import NotificationSettings from "./components/NotificationSettings";
import {
  Plus, Check, ChevronLeft, ChevronRight, CalendarDays,
  Clock, MessageSquare, X, Send, FileText, Trash2,
  Menu, Settings, User, ChevronDown, RotateCcw, List, Layers,
  Flag, Coffee, Bell,
  Activity, Zap, Wind, TrendingUp, TrendingDown, Minus,
  ZoomIn, ZoomOut,
  Brain, Target, Lightbulb, BarChart2, AlertTriangle,
  Pencil, SkipForward, Sparkles, Moon, Sunrise,
} from "lucide-react";
import { calculateTaskWeight } from "./utils/taskUtils";
import "./App.css";
import "./glass.css";

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

// ── Note colors (Apple Stickies palette) ───────────────
const NOTE_COLORS = {
  yellow: { bg: "#fef9c3", border: "#fde68a", text: "#78350f" },
  pink:   { bg: "#fce7f3", border: "#f9a8d4", text: "#701a75" },
  blue:   { bg: "#dbeafe", border: "#93c5fd", text: "#1e3a8a" },
  green:  { bg: "#dcfce7", border: "#86efac", text: "#14532d" },
};

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

const fmtTime = (h, m) => {
  const suffix = h < 12 ? "AM" : "PM";
  const hr = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hr}:${pad(m)} ${suffix}`;
};

const fmtTimeShort = (h, m) => {
  const sfx = h < 12 ? "AM" : "PM";
  const hr  = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${hr}${sfx}` : `${hr}:${pad(m)}${sfx}`;
};

const fmtHourLabel = (h) => {
  const suffix = h < 12 ? "AM" : "PM";
  const hr = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hr} ${suffix}`;
};

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

// Returns true if task repeats on `date` (excluding the task's own origin date)
const isRepeatMatch = (task, date) => {
  if (!task.repeat || task.date === date || task.date > date) return false;
  if (task.repeatEnd && task.repeatEnd < date) return false;
  const base   = new Date(task.date + "T00:00:00");
  const target = new Date(date      + "T00:00:00");
  const days   = Math.round((target - base) / 86400000);
  if (task.repeat === "daily")   return days > 0;
  if (task.repeat === "weekly")  return days % 7 === 0;
  if (task.repeat === "monthly") return target.getDate() === base.getDate() && days > 0;
  return false;
};

// ── AI tool executor ───────────────────────────────────
const executeAiTool = (name, input, currentTasks) => {
  switch (name) {
    case "add_task": {
      // DUPLICATE PREVENTION — reject if same title + date already active
      const normTitle = (input.title ?? "").toLowerCase().trim();
      const existing = currentTasks.find(
        (t) => t.title.toLowerCase().trim() === normTitle && t.date === input.date && !t.completed
      );
      if (existing) {
        return {
          result: `Duplicate prevented: "${input.title}" on ${input.date} already exists (id: ${existing.id}). Use move_task to reschedule it or delete_task to remove it first.`,
          nextTasks: currentTasks,
        };
      }

      if (input.startHour != null) {
        const now = new Date();
        const todayDate = fmtDate(now);
        if (input.date === todayDate) {
          const inputMins = input.startHour * 60 + (input.startMinute ?? 0);
          const nowMins   = now.getHours() * 60 + now.getMinutes();
          if (inputMins <= nowMins) {
            return {
              result: `Rejected: "${input.title}" at ${fmtTime(input.startHour, input.startMinute ?? 0)} is in the past (now ${pad(now.getHours())}:${pad(now.getMinutes())}). Choose a later time and try again.`,
              nextTasks: currentTasks,
            };
          }
        }
      }
      const task = {
        id: uid(), title: input.title, date: input.date,
        type: input.type ?? "task",
        startHour: input.startHour ?? null, startMinute: input.startMinute ?? null,
        duration: input.duration ?? null,
        repeat: input.repeat ?? null, repeatEnd: null,
        completed: false, notes: input.notes ?? "",
        complexity: input.complexity ?? null, groupId: input.groupId ?? null,
        reminderOffset: input.reminderOffset ?? null,
      };
      return { result: `Created ${task.type} "${task.title}" on ${task.date}`, nextTasks: [...currentTasks, task] };
    }
    case "move_task": {
      const task = currentTasks.find((t) => t.id === input.taskId);
      if (!task) return { result: `Task ${input.taskId} not found`, nextTasks: currentTasks };
      return {
        result: `Moved "${task.title}" to ${input.date ?? task.date}`,
        nextTasks: currentTasks.map((t) => t.id !== input.taskId ? t : {
          ...t,
          date:        input.date        ?? t.date,
          startHour:   "startHour"   in input ? input.startHour   : t.startHour,
          startMinute: "startMinute" in input ? input.startMinute : t.startMinute,
        }),
      };
    }
    case "complete_task": {
      const task = currentTasks.find((t) => t.id === input.taskId);
      if (!task) return { result: `Task ${input.taskId} not found`, nextTasks: currentTasks };
      const done = input.completed !== false;
      return {
        result: `Marked "${task.title}" ${done ? "complete" : "incomplete"}`,
        nextTasks: currentTasks.map((t) => t.id === input.taskId ? { ...t, completed: done } : t),
      };
    }
    case "delete_task": {
      const task = currentTasks.find((t) => t.id === input.taskId);
      if (!task) return { result: `Task ${input.taskId} not found`, nextTasks: currentTasks };
      return {
        result: `Deleted "${task.title}"`,
        nextTasks: currentTasks.filter((t) => t.id !== input.taskId),
      };
    }
    default:
      return { result: `Unknown tool: ${name}`, nextTasks: currentTasks };
  }
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
];

// ── localStorage hook ──────────────────────────────────
function useLocalStorage(key, initial) {
  const [val, setVal] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored !== null ? JSON.parse(stored) : initial;
    } catch { return initial; }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  }, [key, val]);
  return [val, setVal];
}

// ── App ────────────────────────────────────────────────
export default function App() {
  const [session,            setSession]            = useState(null);
  const [authLoading,        setAuthLoading]        = useState(true);
  const [isResettingPw,      setIsResettingPw]      = useState(false);
  const [morningCheckup,      setMorningCheckup]      = useState(null);
  const [showMorningCheckup,  setShowMorningCheckup]  = useState(false);
  const [reviewCheckupMode,   setReviewCheckupMode]   = useState(false);
  const [showLongTermInsights,setShowLongTermInsights] = useState(false);
  const [dailyMetrics,        setDailyMetrics]         = useState(() => {
    try { return JSON.parse(localStorage.getItem("nora_daily_metrics") || "{}"); } catch { return {}; }
  });
  const isMobile = useMobile();

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => { setSession(session); setAuthLoading(false); })
      .catch(() => setAuthLoading(false));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session); setAuthLoading(false);
      if (event === "PASSWORD_RECOVERY") setIsResettingPw(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Load all app data from Supabase when user logs in
  useEffect(() => {
    if (!session) return;
    loadUserData().then((data) => {
      if (!data) return;
      if (Array.isArray(data.tasks) && data.tasks.length) {
        const cutoff = fmtDate(addDays(todayStr(), -30));
        setTasks(data.tasks.filter((t) => t.repeat || t.date >= cutoff));
      }
      if (Array.isArray(data.groups) && data.groups.length) setGroups(data.groups);
      if (Array.isArray(data.notes)  && data.notes.length)  setNotes(data.notes);
      const p = data.preferences ?? {};
      if (p.accountName  != null) setAccountName(p.accountName);
      if (p.dark         != null) setDark(p.dark);
      if (p.reminderMins != null) setReminderMins(p.reminderMins);
      if (p.relaxation   != null) setRelaxation(p.relaxation);
      if (p.energy       != null) setEnergy(p.energy);
      if (p.theme        != null) setTheme(p.theme);
    }).catch(console.error);
  }, [session]); // eslint-disable-line

  // Load chat history (last 24h) and persistent preferences on login
  useEffect(() => {
    if (!session) return;
    (async () => {
      await deleteOldChatMessages();
      const [history, prefs] = await Promise.all([
        loadRecentChatMessages(),
        getUserPreferences(),
      ]);
      // Only restore from Supabase if localStorage has no recent history
      // (Supabase is a cross-device fallback, localStorage is the primary store)
      if (history.length > 0) {
        const lsRaw = localStorage.getItem(CHAT_STORE_KEY);
        const hasLocalHistory = lsRaw && JSON.parse(lsRaw)?.msgs?.length > 1;
        if (!hasLocalHistory) {
          setMessages([{ role: "assistant", content: NORA_GREETING }, ...history]);
        }
      }
      setUserPrefs(prefs);
    })().catch(console.error);
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
    };
  };

  // Load today's morning check-up
  useEffect(() => {
    if (!session) return;
    loadTodayCheckup(todayStr())
      .then(data => { if (data) setMorningCheckup(normalizeCheckup(data)); })
      .catch(console.warn);
  }, [session]); // eslint-disable-line

  // Load user profile (name + birthday) from Supabase on login
  // Also syncs auth.user_metadata → user_profile table so it appears in the dashboard
  useEffect(() => {
    if (!session) return;
    const meta = session.user?.user_metadata ?? {};
    const upsertData = { user_id: session.user.id };
    if (meta.name)     upsertData.name     = meta.name;
    if (meta.birthday) upsertData.birthday = meta.birthday;
    upsertData.updated_at = new Date().toISOString();

    supabase.from("user_profile")
      .upsert(upsertData, { onConflict: "user_id" })
      .then(() =>
        supabase.from("user_profile")
          .select("name, birthday")
          .eq("user_id", session.user.id)
          .single()
      )
      .then(({ data }) => {
        if (!data) return;
        setUserProfile(data);
        if (data.name && !accountName) setAccountName(data.name);
      })
      .catch(console.error);
  }, [session]); // eslint-disable-line

  const [tasks,        setTasks]        = useLocalStorage("nora_tasks", []);
  const [groups,       setGroups]       = useLocalStorage("nora_groups", DEFAULT_GROUPS);
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [view,         setView]         = useState("day");
  const [dark,         setDark]         = useLocalStorage("nora_dark", false);
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
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName,   setNewGroupName]   = useState("");
  const [newGroupColor,  setNewGroupColor]  = useState("#10b981");
  const [chatOpen,       setChatOpen]       = useState(false);
  const [chatInput,      setChatInput]      = useState("");
  const [chatLoading,    setChatLoading]    = useState(false);
  const [microStartMode,  setMicroStartMode]  = useState(false);
  const [chatSuggestions, setChatSuggestions] = useState(DEFAULT_CHAT_CHIPS);
  const [chatGhost,       setChatGhost]       = useState("");
  const [rescheduleTask,  setRescheduleTask]  = useState(null);
  const [inAppAlert,      setInAppAlert]      = useState(null);

  // ── Persistent chat history (localStorage, 24-hour TTL) ────────
  const NORA_GREETING = "Hi! I'm Nora, your productivity coach. I can manage your tasks, spot patterns in your schedule, and give you evidence-based advice to get more done. What are you working on today?";
  const CHAT_STORE_KEY = "nora_chat_v2";
  const CHAT_TTL_MS_LOCAL = 24 * 60 * 60 * 1000;

  const [messages, setMessages] = useState(() => {
    try {
      const raw = localStorage.getItem(CHAT_STORE_KEY);
      if (!raw) return [{ role: "assistant", content: NORA_GREETING }];
      const { msgs, savedAt } = JSON.parse(raw);
      if (!msgs || Date.now() - savedAt > CHAT_TTL_MS_LOCAL) {
        localStorage.removeItem(CHAT_STORE_KEY);
        return [{ role: "assistant", content: NORA_GREETING }];
      }
      return msgs.length > 0 ? msgs : [{ role: "assistant", content: NORA_GREETING }];
    } catch {
      return [{ role: "assistant", content: NORA_GREETING }];
    }
  });

  const [userPrefs,   setUserPrefs]   = useState({});
  const chatEndRef   = useRef(null);
  const chatInputRef = useRef(null);

  const [showLanding,    setShowLanding]    = useState(true);
  const [notes,          setNotes]          = useLocalStorage("nora_notes", []);
  // eslint-disable-next-line no-unused-vars
  const [newNote, setNewNote] = useState("");
  // eslint-disable-next-line no-unused-vars
  const newNoteRef = useRef(null);

  const [sidebarOpen,    setSidebarOpen]    = useState(false);
  const [activeSettings, setActiveSettings] = useState(null);
  const [accountName,    setAccountName]    = useLocalStorage("nora_account_name", "");
  const [reminderMins,   setReminderMins]   = useLocalStorage("nora_reminder_mins", 5);
  const [theme,          setTheme]          = useLocalStorage("nora_theme", "default");
  const [relaxation,     setRelaxation]     = useLocalStorage("nora_relaxation", 5);
  const [energy,         setEnergy]         = useLocalStorage("nora_energy", 5);
  const [focus,          setFocus]          = useLocalStorage("nora_focus", 5);
  const [motivation,     setMotivation]     = useLocalStorage("nora_motivation", 5);
  const [sleepCheckIn, setSleepCheckIn]    = useLocalStorage("nora_sleep_checkin", { date: null, quality: null });
  const [userProfile,    setUserProfile]    = useState({});
  const notifTimers       = useRef({});
  const syncTimer         = useRef(null);

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
  } = useNotifications();
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

  // Sync all app data to Supabase 1 s after the last change
  useEffect(() => {
    if (!session) return;
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      saveUserData({
        tasks, groups, notes,
        preferences: { accountName, dark, reminderMins, relaxation, energy, theme },
      }).catch(console.error);
    }, 1000);
  }, [tasks, groups, notes, accountName, dark, reminderMins, relaxation, energy, theme]); // eslint-disable-line

  // ── Repeat-aware task lookup ─────────────────────────
  const getTasksForDate = (date) => {
    const direct   = tasks.filter((t) => t.date === date);
    const directIds = new Set(direct.map((t) => t.id));
    const repeated = tasks.filter((t) => !directIds.has(t.id) && isRepeatMatch(t, date));
    return [...direct, ...repeated];
  };

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

  const weekData = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const d = fmtDate(addDays(today, i - 6));
    const dayTasks = tasks.filter((t) => t.date === d);
    const done  = dayTasks.filter((t) => t.completed).length;
    const total = dayTasks.length;
    return { date: d, done, total, rate: total > 0 ? done / total : null };
  }), [tasks, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const weekTrend = useMemo(() => {
    const rated = weekData.filter((d) => d.rate !== null);
    if (rated.length < 4) return "new";
    const recent = rated.slice(-3);
    const prior  = rated.slice(0, rated.length - 3);
    const avg    = (arr) => arr.reduce((s, d) => s + d.rate, 0) / arr.length;
    const diff   = avg(recent) - avg(prior);
    return diff > 0.1 ? "improving" : diff < -0.1 ? "declining" : "steady";
  }, [weekData]);

  // ── Behavioral intelligence ─────────────────────────────────────

  // ── Cognitive load weights ──────────────────────────────────────
  const taskWeights = useMemo(() => {
    const map = {};
    tasks.forEach((t) => { map[t.id] = calculateTaskWeight(t, today); });
    return map;
  }, [tasks, today]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── User load baseline — rolling 14-day calibration ────────────
  const userLoadBaseline = useMemo(() => {
    const saved = userPrefs.load_baseline ?? null;
    const days14 = Array.from({ length: 14 }, (_, i) => {
      const date = fmtDate(addDays(today, i - 13));
      const dayT = tasks.filter((t) => t.date === date && t.type !== "break");
      const totalW = dayT.reduce((s, t) => s + (taskWeights[t.id] ?? 3), 0);
      const doneW  = dayT.filter((t) => t.completed).reduce((s, t) => s + (taskWeights[t.id] ?? 3), 0);
      return { totalW, doneW, hasData: dayT.length > 0 };
    }).filter((d) => d.hasData);

    // Not enough history — use saved baseline or sensible defaults
    if (days14.length < 3) {
      return saved ?? {
        avgDailyWeight: 12, avgCompletionWeight: 9,
        maxSustainableWeight: 15, overloadThreshold: 19, heavyDayThreshold: 15,
      };
    }

    const avgDailyWeight      = days14.reduce((s, d) => s + d.totalW, 0) / days14.length;
    const avgCompletionWeight = days14.reduce((s, d) => s + d.doneW,  0) / days14.length;
    return {
      avgDailyWeight:       Math.round(avgDailyWeight),
      avgCompletionWeight:  Math.round(avgCompletionWeight),
      maxSustainableWeight: Math.round(avgDailyWeight * 1.25),
      overloadThreshold:    Math.round(avgDailyWeight * 1.6),
      heavyDayThreshold:    Math.round(avgDailyWeight * 1.25),
    };
  }, [tasks, today, taskWeights, userPrefs.load_baseline]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Momentum — weighted completion rate ─────────────────────────
  const momentum = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, i) => {
      const date   = fmtDate(addDays(today, i - 13));
      const dayT   = tasks.filter((t) => t.date === date && t.type !== "break");
      const totalW = dayT.reduce((s, t) => s + (taskWeights[t.id] ?? 3), 0);
      const doneW  = dayT.filter((t) => t.completed).reduce((s, t) => s + (taskWeights[t.id] ?? 3), 0);
      return { date, total: dayT.length, totalW, doneW, rate: totalW > 0 ? doneW / totalW : null };
    });
    const rated = days.filter((d) => d.rate !== null);
    if (rated.length < 2) return { state: "new", label: "Just Starting", desc: "Build a few days of history and Nora will start recognising patterns.", color: "var(--accent)", score: null };
    const recent = rated.slice(-Math.min(3, rated.length));
    const prior  = rated.slice(0, rated.length - recent.length);
    const avg    = (arr) => arr.length > 0 ? arr.reduce((s, d) => s + d.rate, 0) / arr.length : null;
    const rAvg   = avg(recent);
    const pAvg   = avg(prior) ?? rAvg;
    const trend  = rAvg - pAvg;
    const avgWeightedLoad = recent.reduce((s, d) => s + d.totalW, 0) / recent.length;
    const overloadThresh  = userLoadBaseline.overloadThreshold;
    if (rAvg < 0.40 && avgWeightedLoad > overloadThresh) return { state: "overloaded", label: "Overloaded",      desc: "Cognitive load exceeds your current capacity. Remove or defer tasks — consistency beats volume.", color: "#ef4444", score: rAvg };
    if (rAvg >= 0.65 && trend >  0.08) return { state: "rising",    label: "Rising",         desc: "Momentum is building. Protect this energy and keep sessions predictable.",               color: "#22c55e", score: rAvg };
    if (rAvg >= 0.55 && Math.abs(trend) <= 0.12) return { state: "stable", label: "Stable", desc: "Consistent and reliable. Steady momentum is more sustainable than burst performance.",  color: "#3b82f6", score: rAvg };
    if (trend < -0.20 && pAvg > 0.55) return { state: "recovery",  label: "Recovery Phase",  desc: "You slipped after a strong stretch — that's natural. A lighter day resets the system.", color: "#f59e0b", score: rAvg };
    if (trend >  0.12)                 return { state: "rising",    label: "Recovering",      desc: "Turning around. Each completed task rebuilds the pattern.",                             color: "#22c55e", score: rAvg };
    return { state: "unstable", label: "Unstable", desc: "Inconsistent pattern. Fewer, smaller, well-timed tasks work better than an ambitious list.", color: "#f59e0b", score: rAvg };
  }, [tasks, today, taskWeights, userLoadBaseline]); // eslint-disable-line react-hooks/exhaustive-deps

  const workloadForecast = useMemo(() => Array.from({ length: 7 }, (_, i) => {
    const date         = fmtDate(addDays(today, i));
    const dayT         = tasks.filter((t) => t.date === date && t.type !== "break");
    const mins         = dayT.filter((t) => t.duration).reduce((s, t) => s + t.duration, 0);
    const load         = dayT.length;
    const weightedLoad = dayT.reduce((s, t) => s + (taskWeights[t.id] ?? 3), 0);
    const d            = new Date(date + "T00:00:00");
    const heavyT  = userLoadBaseline.overloadThreshold;
    const modT    = userLoadBaseline.heavyDayThreshold;
    const level   = weightedLoad >= heavyT ? "heavy"
      : weightedLoad >= modT ? "moderate"
      : weightedLoad > 0     ? "light" : "free";
    return {
      date, load, mins, weightedLoad, level,
      label:   i === 0 ? "Today" : i === 1 ? "Tmr" : ["Su","Mo","Tu","We","Th","Fr","Sa"][d.getDay()],
      isToday: i === 0,
    };
  }), [tasks, today, taskWeights, userLoadBaseline]); // eslint-disable-line react-hooks/exhaustive-deps

  const focusPatterns = useMemo(() => {
    const doneT = tasks.filter((t) => t.completed && t.startHour != null && t.type !== "break");
    if (doneT.length < 4) return null;
    const bands = [
      { key: "morning",   label: "Morning",   range: "6–11 AM", hours: [6,7,8,9,10,11],       count: 0 },
      { key: "afternoon", label: "Afternoon", range: "12–5 PM", hours: [12,13,14,15,16,17],    count: 0 },
      { key: "evening",   label: "Evening",   range: "6–10 PM", hours: [18,19,20,21,22],       count: 0 },
    ];
    doneT.forEach((t) => { const b = bands.find((b) => b.hours.includes(t.startHour)); if (b) b.count++; });
    const total = bands.reduce((s, b) => s + b.count, 0);
    if (total === 0) return null;
    const peak = [...bands].sort((a, b) => b.count - a.count)[0];
    return { bands, peak, peakPct: Math.round((peak.count / total) * 100), total };
  }, [tasks]); // eslint-disable-line react-hooks/exhaustive-deps

  const mostAvoided = useMemo(() => {
    const overdue = tasks.filter((t) => !t.completed && t.date < today && t.type === "task");
    if (!overdue.length) return null;
    const task = [...overdue].sort((a, b) => a.date.localeCompare(b.date))[0];
    const daysOverdue = Math.floor((new Date(today + "T00:00:00") - new Date(task.date + "T00:00:00")) / 86400000);
    const tl = task.title.toLowerCase();
    const microStarts =
      /read|study|learn|review/.test(tl)         ? ["Open the material and read just 1 page.", "Set a 5-min timer and start anywhere.", "Write down 3 key things you need to understand."] :
      /write|essay|report|draft/.test(tl)        ? ["Open a blank doc and type one sentence.", "Bullet your 3 main ideas — nothing else.", "Write only the title and intro paragraph."] :
      /code|build|implement|fix|debug/.test(tl)  ? ["Open the file and just read it once.", "Write a comment describing what needs to happen.", "Make one small change and run it."] :
      /email|message|call|reply/.test(tl)        ? ["Open it and read it — don't respond yet.", "Type just the first line of a reply.", "Draft a 2-sentence response and save it."] :
      [`Spend 5 minutes on "${task.title}" — that's it.`, "Set a timer and begin. Anything counts.", "Do the smallest possible piece right now."];
    return { task, daysOverdue, microStarts, count: overdue.length };
  }, [tasks, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const adaptiveRecs = useMemo(() => {
    const recs = [];
    if (momentum.state === "overloaded")                         recs.push("Cut your task list by ~30% this week — volume is the problem, not effort.");
    if (focusPatterns?.peakPct >= 35)                            recs.push(`${focusPatterns.peakPct}% of completions happen in the ${focusPatterns.peak.label.toLowerCase()} (${focusPatterns.peak.range}). Guard that window.`);
    const heavyDays = workloadForecast.filter((d) => d.level === "heavy");
    if (heavyDays.length > 0)                                    recs.push(`${heavyDays.map((d) => d.label).join(", ")} ${heavyDays.length === 1 ? "looks" : "look"} overloaded — move some tasks to lighter days.`);
    if (mostAvoided?.daysOverdue >= 3)                           recs.push(`"${mostAvoided.task.title}" has been waiting ${mostAvoided.daysOverdue} days. A 5-minute start breaks the avoidance loop.`);
    if (momentum.state === "stable")                             recs.push("Consistent rhythm detected. Don't add tasks on already-full days — protect what's working.");
    if (energy <= 3)                                             recs.push("Low energy: 25-min focused blocks beat long exhausted sessions every single time.");
    if (relaxation <= 3)                                         recs.push("Stress is elevated. One completed task restores more calm than five half-started ones.");
    return recs.slice(0, 3);
  }, [momentum, focusPatterns, workloadForecast, mostAvoided, energy, relaxation]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Recovery intelligence — weighted signals ────────────────────
  const recoveryState = useMemo(() => {
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const date   = fmtDate(addDays(today, i - 6));
      const dayT   = tasks.filter((t) => t.date === date && t.type !== "break");
      const totalW = dayT.reduce((s, t) => s + (taskWeights[t.id] ?? 3), 0);
      const doneW  = dayT.filter((t) => t.completed).reduce((s, t) => s + (taskWeights[t.id] ?? 3), 0);
      return { totalW, doneW, rate: totalW > 0 ? doneW / totalW : null };
    });
    const overdueTasks     = tasks.filter((t) => !t.completed && t.date < today && t.type !== "break");
    const overdueWeight    = overdueTasks.reduce((s, t) => s + (taskWeights[t.id] ?? 3), 0);
    const recentRated      = last7.filter((d) => d.rate !== null);
    const recentAvg        = recentRated.length > 0 ? recentRated.reduce((s, d) => s + d.rate, 0) / recentRated.length : 1;
    const avgWeightedLoad  = last7.reduce((s, d) => s + d.totalW, 0) / 7;
    const lateNight        = tasks.filter((t) => t.completed && t.startHour != null && t.startHour >= 21).length;
    const avoidWeightRatio = overdueWeight / Math.max(tasks.reduce((s, t) => s + (taskWeights[t.id] ?? 3), 0), 1);
    const overloadT        = userLoadBaseline.overloadThreshold;

    let score = 100;
    if (recentRated.length > 0) score -= (1 - recentAvg) * 40;
    score -= Math.min(28, (overdueWeight / 3) * 2.5);   // weighted overdue (normalized to ~task count)
    score -= Math.min(18, avoidWeightRatio * 36);
    if (lateNight >= 3)              score -= 10;
    if (avgWeightedLoad > overloadT) score -= 10;        // sustained weighted overload penalty

    if (score >= 78) return { level: "stable",   label: "Stable",             color: "#22c55e", desc: "Output and recovery are balanced. You're in a sustainable rhythm.",                                                   advice: null };
    if (score >= 58) return { level: "mild",     label: "Mild Overload",       color: "#f59e0b", desc: "A few signals suggest the pace is slightly unsustainable.",                                                          advice: "Trim 1–2 tasks this week and protect at least one longer break." };
    if (score >= 38) return { level: "high",     label: "High Cognitive Load", color: "#f97316", desc: "Your schedule has consistently exceeded comfortable capacity.",                                                       advice: "Reduce daily cognitive load by ~30%. Focus only on what genuinely moves things forward." };
    if (score >= 18) return { level: "recovery", label: "Recovery Needed",     color: "#ef4444", desc: "Sustained pressure is reducing effectiveness. Recovery actively improves long-term output.",                         advice: "Protect the next day as near-rest. One essential task only." };
    return              { level: "burnout",  label: "Burnout Risk",        color: "#dc2626", desc: "Patterns suggest significant cumulative exhaustion. Rest is more productive than pushing through.",                  advice: "Pause non-essential tasks entirely. Rest today. Rebuild from a lighter baseline tomorrow." };
  }, [tasks, today, taskWeights, userLoadBaseline]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Adaptive plan data — learns from completion history ─────────
  const adaptivePlanData = useMemo(() => {
    const doneT = tasks.filter((t) => t.completed && t.startHour != null && t.type !== "break");
    if (doneT.length < 5) return null;

    const hourBuckets = {};
    doneT.forEach((t) => { hourBuckets[t.startHour] = (hourBuckets[t.startHour] || 0) + 1; });
    const topHours = Object.entries(hourBuckets).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([h]) => parseInt(h));

    const withDur = doneT.filter((t) => t.duration);
    const avgDur  = withDur.length > 0 ? Math.round(withDur.reduce((s, t) => s + t.duration, 0) / withDur.length) : null;

    const byDay = {};
    doneT.forEach((t) => { const day = new Date(t.date + "T00:00:00").getDay(); byDay[day] = (byDay[day] || 0) + 1; });
    const bestDayEntry = Object.entries(byDay).sort((a, b) => b[1] - a[1])[0];
    const dayNames     = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const bestDayName  = bestDayEntry ? dayNames[parseInt(bestDayEntry[0])] : null;

    const hardTotal    = tasks.filter((t) => t.complexity === "hard" && t.type !== "break").length;
    const hardDone     = tasks.filter((t) => t.complexity === "hard" && t.completed).length;
    const hardRate     = hardTotal >= 3 ? Math.round((hardDone / hardTotal) * 100) : null;

    const longFail = tasks.filter((t) => !t.completed && t.duration && t.duration > 90 && t.type !== "break").length;
    const longAll  = tasks.filter((t) => t.duration && t.duration > 90 && t.type !== "break").length;
    const longTasksFail = longAll >= 4 && (longFail / longAll) > 0.5;

    return { topHours, avgDur, bestDayName, hardRate, longTasksFail, sampleSize: doneT.length };
  }, [tasks]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Weekly reflection — interprets what happened this week ──────
  const weeklyReflection = useMemo(() => {
    const last7 = Array.from({ length: 7 }, (_, i) => {
      const date  = fmtDate(addDays(today, i - 6));
      const d     = new Date(date + "T00:00:00");
      const dayT  = tasks.filter((t) => t.date === date && t.type !== "break");
      const done  = dayT.filter((t) => t.completed).length;
      return { date, name: ["Sun","Mo","Tue","Wed","Thu","Fri","Sat"][d.getDay()], done, total: dayT.length, rate: dayT.length > 0 ? done / dayT.length : null };
    });
    const rated = last7.filter((d) => d.rate !== null);
    if (rated.length < 3) return null;

    const avgRate = rated.reduce((s, d) => s + d.rate, 0) / rated.length;
    const best    = [...rated].sort((a, b) => b.rate - a.rate)[0];
    const worst   = [...rated].sort((a, b) => a.rate - b.rate)[0];
    const heavy   = rated.filter((d) => d.total > 5 && d.rate < 0.5);
    const insights = [];

    if (avgRate >= 0.7)       insights.push(`Strong week — ${Math.round(avgRate * 100)}% of planned work completed.`);
    else if (avgRate >= 0.45) insights.push(`Decent week at ${Math.round(avgRate * 100)}% completion. A solid foundation to build from.`);
    else                      insights.push(`Completion was ${Math.round(avgRate * 100)}% this week — worth reflecting on what created friction.`);

    if (best && best.rate >= 0.75 && best.total > 1)
      insights.push(`${best.name} was your strongest day (${best.done}/${best.total}) — notice what conditions made it flow.`);

    if (heavy.length > 0)
      insights.push(`Heavy-schedule days (${heavy.map((d) => d.name).join(", ")}) had lower output. Dense lists reduce completion, not improve it.`);

    if (worst && worst.rate < 0.3 && worst.total > 1) {
      const recovered = rated.find((d) => d.date > worst.date && d.rate > 0.5);
      insights.push(recovered
        ? `You bounced back after ${worst.name}'s difficult session — that resilience counts.`
        : `${worst.name} was a rough day. Identifying the trigger helps design next week better.`);
    }

    return { insights: insights.slice(0, 4), avgRate };
  }, [tasks, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const deferredTasks = useMemo(() => {
    const past = tasks.filter((t) => !t.completed && t.date < today && (t.type ?? "task") !== "break");
    return past
      .map((t) => {
        const daysDeferred = Math.round(
          (new Date(today + "T00:00:00") - new Date(t.date + "T00:00:00")) / 86400000
        );
        const urgency = daysDeferred >= 7 ? "high" : daysDeferred >= 3 ? "medium" : "low";
        return { ...t, daysDeferred, urgency };
      })
      .sort((a, b) => b.daysDeferred - a.daysDeferred);
  }, [tasks, today]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sleep Intelligence ─────────────────────────────────────────
  const sleepState = useMemo(() => {
    // Tonight's tasks (after 20:00, not completed)
    const tonightTasks = tasks.filter(
      (t) => t.date === today && t.startHour != null && t.startHour >= 20 && !t.completed
    );
    const tonightLoad  = tonightTasks.reduce((s, t) => s + (t.duration ?? 60), 0);
    const hasLateTasks = tonightTasks.length > 0;
    const hasVeryLate  = tonightTasks.some((t) => t.startHour >= 22);

    // Late-work pattern: count past 7 days with tasks after 20:00
    const lateNights = Array.from({ length: 7 }, (_, i) => {
      const d = fmtDate(addDays(today, -(i + 1)));
      return tasks.some((t) => t.date === d && (t.startHour ?? 0) >= 20);
    }).filter(Boolean).length;
    const hasLatePattern = lateNights >= 3;

    // Sleep pressure score
    let score = 0;
    if (energy <= 3)                                    score += 3;
    else if (energy <= 5)                               score += 1;
    if (relaxation <= 3)                                score += 2;
    else if (relaxation <= 5)                           score += 1;
    if (recoveryState.level === "burnout")              score += 3;
    else if (recoveryState.level === "recovery")        score += 2;
    else if (recoveryState.level === "high")            score += 1;
    if (todaySleepQuality === "poor")                   score += 2;
    else if (todaySleepQuality === "okay")              score += 1;

    const pressure      = score >= 5 ? "High" : score >= 3 ? "Moderate" : "Low";
    const pressureColor = pressure === "High" ? "#ef4444" : pressure === "Moderate" ? "#f59e0b" : "#22c55e";

    // Tonight's risk
    let tonightRisk  = "Calm";
    let riskLevel    = "calm";
    if (hasVeryLate || (hasLateTasks && tonightLoad > 90)) { tonightRisk = "Late Work Risk"; riskLevel = "high"; }
    else if (hasLateTasks || workloadForecast[0]?.level === "heavy") { tonightRisk = "Loaded"; riskLevel = "moderate"; }

    const riskColor = riskLevel === "high" ? "#ef4444" : riskLevel === "moderate" ? "#f59e0b" : "#22c55e";

    // Contextual suggestion
    let suggestion = null;
    if (pressure === "High" && hasVeryLate)
      suggestion = "Tonight needs protecting. Move the late tasks to tomorrow — your recovery matters more right now.";
    else if (pressure === "High" && hasLateTasks)
      suggestion = "Keep only the essential tonight and defer the rest. Recovery first.";
    else if (hasVeryLate)
      suggestion = "Move tasks after 22:00 to tomorrow morning — late cognitive work cuts into recovery.";
    else if (hasLatePattern)
      suggestion = "Late work is becoming a pattern. One early evening this week would help a lot.";
    else if (hasLateTasks && pressure === "Moderate")
      suggestion = "Tonight has some late work. Keep it to essentials if possible.";
    else if (pressure === "Moderate")
      suggestion = "Decent balance. Aim to wind down by 22:00 if you can.";
    else if (riskLevel === "calm" && !hasLatePattern)
      suggestion = "Recovery looks protected tonight. Good position.";

    return { pressure, pressureColor, tonightRisk, riskLevel, riskColor, suggestion, hasLateTasks, hasVeryLate, hasLatePattern, tonightTasks, lateNights };
  }, [tasks, today, energy, relaxation, recoveryState, todaySleepQuality, workloadForecast]); // eslint-disable-line

  // ── User Confidence (composite metric) ─────────────────────────
  const userConfidence = useMemo(() => {
    let score = 0.50;
    if (momentum.score != null)          score += (momentum.score - 0.5) * 0.30;
    if (momentum.state === "rising")     score += 0.08;
    if (weekTrend === "improving")       score += 0.10;
    else if (weekTrend === "declining")  score -= 0.10;
    const avoidRatio = deferredTasks.length / Math.max(1, tasks.filter((t) => !t.completed).length);
    score -= avoidRatio * 0.15;
    score = Math.min(1, Math.max(0, score));
    if (score >= 0.62) return { label: "High Confidence",      color: "#22c55e", level: "high" };
    if (score >= 0.38) return { label: "Building Confidence",  color: "#f59e0b", level: "building" };
    return               { label: "Confidence Strained",       color: "#ef4444", level: "strained" };
  }, [momentum, weekTrend, deferredTasks, tasks]); // eslint-disable-line

  // ── Assessment summary text ─────────────────────────────────────
  const assessmentSummary = useMemo(() => {
    if (recoveryState.level === "burnout")
      return "You've been pushing hard for a sustained period. The priority right now is recovery, not more tasks.";
    if (recoveryState.level === "recovery")
      return "Your system is signalling a need to slow down. A lighter approach today will pay off more than pushing through.";
    if (momentum.state === "overloaded")
      return "Your workload has exceeded your baseline for several days. Some redistribution would relieve the pressure.";
    if (momentum.state === "rising" && weekTrend === "improving")
      return "Momentum is building and the week is trending up — you're in a solid rhythm. Keep the pace without overloading.";
    if (momentum.state === "rising")
      return "Things are clicking. Completion is improving and consistency is building.";
    if (weekTrend === "declining" && deferredTasks.length > 2)
      return `${deferredTasks.length} tasks have slipped and the week is trending down. Rebalancing would help.`;
    if (weekTrend === "declining")
      return "The week has been rough, but there's still time to recover. Small consistent actions outperform big catch-up sessions.";
    if (weekTrend === "improving")
      return "You're recovering well from any recent pressure. Steady, balanced progress looks good ahead.";
    if (momentum.state === "stable")
      return "You're in a consistent rhythm. A reliable week ahead with no major red flags.";
    return "Nora is still building your profile. Keep logging completions — patterns emerge quickly.";
  }, [recoveryState, momentum, weekTrend, deferredTasks]); // eslint-disable-line

  // ── 3 key signals for assessment card ──────────────────────────
  const keySignals = useMemo(() => {
    const s = [];
    if (energy >= 7)          s.push("Energy is high");
    else if (energy <= 3)     s.push("Energy is low — protect your rest");
    else                      s.push("Energy is moderate");
    if (recoveryState.level === "stable") s.push("No burnout risk detected");
    else if (recoveryState.level === "burnout" || recoveryState.level === "recovery")
      s.push("Recovery needed — workload has been unsustainably high");
    else s.push("Mild overload signs — watch the next few days");
    const peak = workloadForecast.reduce((a, b) => (a.load > b.load ? a : b), workloadForecast[0]);
    if (peak && peak.level !== "free" && peak.level !== "light")
      s.push(`${peak.label} currently has the highest workload`);
    else if (deferredTasks.length > 0)
      s.push(`${deferredTasks.length} deferred task${deferredTasks.length > 1 ? "s" : ""} still waiting`);
    else s.push("Schedule is well-balanced this week");
    return s.slice(0, 3);
  }, [energy, recoveryState, workloadForecast, deferredTasks]); // eslint-disable-line

  const noraState = useMemo(() => {
    const todayForecast   = workloadForecast[0];
    const heavyForecast   = workloadForecast.some((d) => d.level === "heavy");
    const overdueWeight   = tasks
      .filter((t) => !t.completed && t.date < today && t.type !== "break")
      .reduce((s, t) => s + (taskWeights[t.id] ?? 3), 0);
    const highOverdueCogLoad = overdueWeight >= userLoadBaseline.heavyDayThreshold;

    if (recoveryState.level === "burnout" || recoveryState.level === "recovery")
      return { key: "recovery_day",      label: "Recovery Day",      color: "#ef4444", confidence: "HIGH" };
    if (momentum.state === "overloaded" || highOverdueCogLoad)
      return { key: "high_load",         label: "High Load",         color: "#f97316",
               confidence: (heavyForecast || highOverdueCogLoad) ? "HIGH" : "MEDIUM" };
    if (energy >= 7 && relaxation >= 7 && todayForecast?.level !== "heavy")
      return { key: "peak_focus",        label: "Peak Focus",        color: "#22c55e", confidence: "HIGH" };
    if (momentum.state === "rising")
      return { key: "building_momentum", label: "Building Momentum", color: "#3b82f6", confidence: "MEDIUM" };
    if (momentum.state === "stable")
      return { key: "steady_flow",       label: "Steady Flow",       color: "#8b5cf6", confidence: "HIGH" };
    return   { key: "focus_mode",        label: "Focus Mode",        color: "var(--accent)", confidence: "MEDIUM" };
  }, [recoveryState, momentum, energy, relaxation, workloadForecast, tasks, today, taskWeights, userLoadBaseline]); // eslint-disable-line

  const contextMode = noraState; // UI alias — keeps all existing JSX working

  const behaviorProfile = useMemo(() => {
    const allTasks   = tasks.filter((t) => t.type !== "break");
    const sampleSize = allTasks.length;
    const schedulingRate = sampleSize > 0
      ? allTasks.filter((t) => t.startHour != null).length / sampleSize : 0;
    const work_style = schedulingRate > 0.65 ? "structured"
      : schedulingRate > 0.3 ? "mixed" : "flexible";
    const completion_consistency = momentum.score != null
      ? Math.round(momentum.score * 100) : null;
    const overload_response =
      momentum.state === "overloaded" && recoveryState.level === "burnout"
        ? "continues despite overload"
        : momentum.state === "overloaded" ? "reduces load under pressure"
        : "stable";
    const restart_speed = momentum.state === "recovering" ? "fast"
      : recoveryState.level === "recovery" ? "slow" : "n/a";
    const confidence = sampleSize >= 40 ? "HIGH"
      : sampleSize >= 15 ? "MEDIUM" : "EXPERIMENTAL";

    // Stress response pattern — Part 5
    const overloadT = userLoadBaseline.overloadThreshold;
    const days14 = Array.from({ length: 14 }, (_, i) => {
      const date   = fmtDate(addDays(today, i - 13));
      const dayT   = tasks.filter((t) => t.date === date && t.type !== "break");
      const totalW = dayT.reduce((s, t) => s + (taskWeights[t.id] ?? 3), 0);
      const doneW  = dayT.filter((t) => t.completed).reduce((s, t) => s + (taskWeights[t.id] ?? 3), 0);
      return { totalW, doneW, rate: totalW > 0 ? doneW / totalW : null };
    }).filter((d) => d.rate !== null);
    const overloadDays = days14.filter((d) => d.totalW > overloadT);
    let stress_response_pattern = "stable";
    if (overloadDays.length >= 2) {
      const avgRate = overloadDays.reduce((s, d) => s + d.rate, 0) / overloadDays.length;
      stress_response_pattern = avgRate >= 0.6 ? "resilient"
        : avgRate >= 0.35 ? "overload_sensitive" : "overload_sensitive";
    }

    return { work_style, completion_consistency, overload_response, restart_speed, confidence, sampleSize, stress_response_pattern };
  }, [tasks, momentum, recoveryState, taskWeights, userLoadBaseline, today]); // eslint-disable-line

  // Auto-save behavior profile snapshot to persistent preferences
  useEffect(() => {
    if (!session) return;
    setUserPrefs((prev) => {
      const bp = prev.behavior_profile;
      const changed = !bp
        || bp.work_style              !== behaviorProfile.work_style
        || bp.completion_consistency  !== behaviorProfile.completion_consistency
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

  const predictiveSignals = useMemo(() => {
    const insights = [];

    // Rule A — Overload prevention
    // Heavy day coming + momentum already unstable → prevent the crunch
    const heavyUpcoming = workloadForecast.slice(1, 4).find((d) => d.level === "heavy");
    if (heavyUpcoming && ["unstable", "overloaded", "recovery"].includes(momentum.state)) {
      insights.push({
        type: "warning",
        confidence: momentum.state === "overloaded" ? "HIGH" : "MEDIUM",
        message: `${heavyUpcoming.label} looks heavy and your recent rhythm is inconsistent — moving 1–2 tasks earlier prevents the crunch.`,
        ruleId: "overload_prevention",
      });
    }

    // Rule B — Procrastination detection
    // Avoided task past 3 days → proactively surface micro-start
    if (mostAvoided && mostAvoided.daysOverdue >= 3) {
      insights.push({
        type: "micro-start",
        confidence: mostAvoided.daysOverdue >= 7 ? "HIGH" : "MEDIUM",
        message: `"${mostAvoided.task.title}" has been waiting ${mostAvoided.daysOverdue} days — a 5-minute start now breaks the pattern.`,
        ruleId: "procrastination_detected",
      });
    }

    // Rule C — Energy mismatch
    // Peak performance is NOT afternoon, but hard tasks are scheduled in afternoon
    if (focusPatterns && focusPatterns.peak.key !== "afternoon") {
      const afternoonHard = todayTasks.filter(
        (t) => !t.completed && t.complexity === "hard" &&
               t.startHour != null && t.startHour >= 12 && t.startHour < 17
      );
      if (afternoonHard.length > 0) {
        insights.push({
          type: "optimization",
          confidence: focusPatterns.peakPct >= 50 ? "HIGH" : "MEDIUM",
          message: `"${afternoonHard[0].title}" is scheduled for the afternoon, but your focus peaks in the ${focusPatterns.peak.label.toLowerCase()} — consider moving it.`,
          ruleId: "energy_mismatch",
        });
      }
    }

    // Rule D — Recovery prediction
    // Recovery/overload state + dropping trend + non-light tomorrow → suggest lighter day
    if (["mild", "high", "recovery", "burnout"].includes(recoveryState.level) &&
        (weekTrend === "declining" || ["overloaded", "unstable"].includes(momentum.state))) {
      const tomorrow = workloadForecast[1];
      if (tomorrow && (tomorrow.level === "heavy" || tomorrow.level === "moderate")) {
        insights.push({
          type: "warning",
          confidence: ["burnout", "recovery"].includes(recoveryState.level) ? "HIGH" : "MEDIUM",
          message: `You're showing signs of overextension — a lighter ${tomorrow.label} helps more than pushing through.`,
          ruleId: "recovery_predicted",
        });
      }
    }

    // Sort HIGH confidence first, cap at 2
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return insights
      .sort((a, b) => order[a.confidence] - order[b.confidence])
      .slice(0, 2);
  }, [workloadForecast, momentum, mostAvoided, focusPatterns, todayTasks, recoveryState, weekTrend]); // eslint-disable-line

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
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, chatLoading]);
  useEffect(() => { if (chatOpen) chatInputRef.current?.focus(); }, [chatOpen]);

  // Auto-save daily metrics snapshot for long-term trends
  useEffect(() => {
    if (!session || !today) return;
    const snapshot = {
      energy, stress: relaxation, focus, motivation,
      sleepQuality: todaySleepQuality,
      loadLevel: workloadForecast[0]?.level ?? "light",
      readinessScore: morningCheckup?.readinessScore ?? null,
      tasksCompleted: doneToday, tasksTotal: totalToday,
      updatedAt: Date.now(),
    };
    setDailyMetrics(prev => {
      const next = { ...prev, [today]: { ...prev[today], ...snapshot } };
      localStorage.setItem("nora_daily_metrics", JSON.stringify(next));
      return next;
    });
  }, [energy, relaxation, focus, motivation, doneToday, totalToday, today, session]); // eslint-disable-line

  // Save chat to localStorage on every change (instant persistence across refreshes)
  useEffect(() => {
    if (messages.length <= 1) return; // no need to persist if only the greeting
    localStorage.setItem(CHAT_STORE_KEY, JSON.stringify({ msgs: messages, savedAt: Date.now() }));
  }, [messages]); // eslint-disable-line

  // Liquid Glass pointer reactivity — tracks mouse to shift ambient light
  useEffect(() => {
    if (theme !== "liquid_glass") return;
    const root = document.documentElement;
    let raf;
    const onMove = (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        root.style.setProperty("--gl-x", `${e.clientX}px`);
        root.style.setProperty("--gl-y", `${e.clientY}px`);
        // Subtle orb parallax: shift orbs slightly toward cursor
        const nx = (e.clientX / window.innerWidth  - 0.5) * 24;
        const ny = (e.clientY / window.innerHeight - 0.5) * 16;
        root.style.setProperty("--gl-px", `${nx}px`);
        root.style.setProperty("--gl-py", `${ny}px`);
      });
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => { window.removeEventListener("mousemove", onMove); cancelAnimationFrame(raf); };
  }, [theme]);
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
    Object.values(notifTimers.current).forEach(clearTimeout);
    notifTimers.current = {};
    const now = Date.now();
    tasks.forEach((task) => {
      if (task.completed || task.startHour == null || task.date !== todayStr()) return;
      const type = task.type ?? "task";
      if (type === "break") return;
      // Check per-category setting (fall back to taskReminders for focus sessions)
      const categoryEnabled = type === "deadline"
        ? notifSettings.deadlineReminders
        : notifSettings.taskReminders;
      // Always schedule in-app toast; OS notification requires permission + enabled
      const offset = task.reminderOffset === "none" ? null
        : task.reminderOffset != null ? task.reminderOffset
        : reminderMins;
      if (offset == null) return;
      const start = new Date();
      start.setHours(task.startHour, task.startMinute ?? 0, 0, 0);
      const delay = start.getTime() - offset * 60000 - now;
      if (delay <= 0) return;
      notifTimers.current[task.id] = setTimeout(async () => {
        const timeStr = fmtTime(task.startHour, task.startMinute ?? 0);
        setInAppAlert({ id: uid(), title: task.title, offset, timeStr });
        if (!categoryEnabled) return;
        const typeLabel = type === "deadline" ? "Nora • Deadline" : "Nora • Upcoming Task";
        const body = offset === 0
          ? `${task.title} starts now`
          : `${task.title} in ${offset} min · ${timeStr}`;
        await showNotification(typeLabel, body, {
          tag:  `task-${task.id}`,
          data: { action: "open_task", taskId: task.id, url: "/" },
        });
      }, delay);
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
      "Nora • Morning Check-Up",
      "Good morning! Ready for today's check-up?",
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
    scheduleAlarm(ALARM_ID, trigger.getTime(), "Nora • Daily Insight", message, {
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
    const titles = tomorrowDeadlines.map((t) => t.title).join(", ");
    scheduleAlarm(
      alarmId,
      trigger.getTime(),
      "Nora • Deadline Tomorrow",
      tomorrowDeadlines.length === 1
        ? `"${tomorrowDeadlines[0].title}" is due tomorrow.`
        : `${tomorrowDeadlines.length} deadlines due tomorrow: ${titles}`,
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
    setTasks((p) => {
      const exists = p.some((t) => t.id === draft.id);
      return exists ? p.map((t) => t.id === draft.id ? { ...draft } : t) : [...p, draft];
    });
    setEditingTask(null);
  };
  const deleteTask = (id) => { setTasks((p) => p.filter((t) => t.id !== id)); setEditingTask(null); };
  const toggleTask = (id) => setTasks((p) => p.map((t) => t.id === id ? { ...t, completed: !t.completed } : t));
  const saveReschedule = (updated) => { setTasks((p) => p.map((t) => t.id === updated.id ? updated : t)); setRescheduleTask(null); };

  const handleCheckupComplete = async (checkup) => {
    setMorningCheckup(normalizeCheckup(checkup));
    // Sync Daily Check-In dials from checkup answers
    if (checkup.energyScore  != null) setEnergy(checkup.energyScore);
    if (checkup.restedScore  != null) setRelaxation(checkup.restedScore); // rested ↔ low stress
    if (checkup.clarityScore != null) setFocus(checkup.clarityScore);     // clarity ↔ focus
    // Sync Sleep & Recovery
    if (checkup.sleepQuality) setSleepQuality(checkup.sleepQuality);
    // Save coaching insights
    if (checkup.bedtime)  setUserPrefs(p => ({ ...p, typical_bedtime: checkup.bedtime }));
    if (checkup.wakeTime) setUserPrefs(p => ({ ...p, typical_wake_time: checkup.wakeTime }));
    // Persist to Supabase (fails gracefully if table doesn't exist)
    saveMorningCheckup({
      date: checkup.date, sleep_quality: checkup.sleepQuality,
      bedtime: checkup.bedtime || null, wake_time: checkup.wakeTime || null,
      sleep_duration: checkup.sleepDuration, rested_score: checkup.restedScore,
      energy_score: checkup.energyScore, clarity_score: checkup.clarityScore,
      day_pressure: checkup.dayPressure || null,
      readiness_score: checkup.readinessScore, readiness_label: checkup.readinessLabel,
      nora_summary: checkup.noraSummary, nora_tips: checkup.noraTips,
    }).catch(console.warn);
    // Also cache locally
    localStorage.setItem(`nora_checkup_${checkup.date}`, JSON.stringify(checkup));
  };
  const skipTask   = (id) => {
    const tomorrow = fmtDate(addDays(today, 1));
    setTasks((p) => p.map((t) => t.id === id ? { ...t, date: tomorrow, startHour: null, startMinute: null } : t));
  };
  const moveToSlot = (id, h, m) => setTasks((p) => p.map((t) => t.id === id ? { ...t, startHour: h, startMinute: m } : t));

  const navigateTo = (v) => {
    if (v === view) return;
    pendingViewRef.current = v;
    setIsTransitioning(true);
    setTimeout(() => {
      setView(pendingViewRef.current);
      setIsTransitioning(false);
    }, 130);
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
  const createStickyNote = (color = "yellow") => {
    const n = { id: uid(), title: "", content: "", color, done: false, createdAt: Date.now() };
    setNotes((p) => [...p, n]);
    setOpenNoteId(n.id);
  };
  const patchNote  = (id, fields) => setNotes((p) => p.map((n) => n.id === id ? { ...n, ...fields } : n));
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

  const buildSystem = () => {
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
    const SYSTEM_KEYS = new Set(["load_baseline","peak_hours","preferred_session_mins","work_style","goals","behavior_profile","completion_consistency"]);
    const coachingInsights = Object.entries(userPrefs)
      .filter(([k]) => !SYSTEM_KEYS.has(k) && !k.endsWith("_note"))
      .map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`)
      .slice(0, 12);
    if (coachingInsights.length > 0) prefsLines.push(...coachingInsights);

    const prefsBlock = prefsLines.length > 0
      ? `\n━━━ PERSISTENT USER CONTEXT (coaching memory) ━━━━━━━━━\n\n${prefsLines.join("\n")}\n\nApply these silently when planning. Never re-ask for information already stored here.\nWhen you learn new relevant information (habits, recurring goals, schedules, preferences), call save_insight to remember it.\n`
      : `\n(No coaching insights saved yet. Use save_insight when you learn something useful about how this user works.)\n`;

    const noraStateGuidance = {
      recovery_day:      "Protect the user today. No new tasks. Offer to defer or remove items only.",
      high_load:         "Acknowledge the load. Suggest removing ≥1 task before adding any.",
      peak_focus:        "Full scheduling allowed. Suggest the hardest or most-avoided task first.",
      building_momentum: "Reinforce the trend. Keep sessions consistent — avoid disrupting the rhythm.",
      steady_flow:       "Maintain the rhythm. No sudden schedule changes.",
      focus_mode:        "Standard mode. Be practical and light on structure.",
    }[noraState.key] ?? "Standard mode.";

    const todayDayName = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date(today + "T00:00:00").getDay()];
    return `You are NORA — a calm, intelligent planning butler. Today is ${today} (${todayDayName}).
You know this person's schedule and genuinely care about how they're doing. Be direct, warm, brief.
Never start with "Certainly!", "Absolutely!", "Of course!", or "Great question!". Use contractions. Refer to tasks by name.

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
Consistency:       ${behaviorProfile.completion_consistency != null ? `${behaviorProfile.completion_consistency}% (14-day weighted avg)` : "not enough data"}
Overload pattern:  ${behaviorProfile.overload_response}
Stress response:   ${behaviorProfile.stress_response_pattern}
Restart speed:     ${behaviorProfile.restart_speed}
Data confidence:   ${behaviorProfile.confidence} (${behaviorProfile.sampleSize} tasks sampled)

Cognitive load (today): ${workloadForecast[0]?.weightedLoad ?? 0} pts · Baseline avg: ${userLoadBaseline.avgDailyWeight} pts/day · Overload threshold: ${userLoadBaseline.overloadThreshold} pts
(Load is weighted by task complexity, duration, keywords and urgency — not raw task count)
${prefsBlock}
━━━ CURRENT WELLNESS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Energy ${energy}/10 · Stress relief ${relaxation}/10 · Focus ${focus}/10 · Motivation ${motivation}/10
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
• When real obligations exist (exam, deadline): respect them — suggest the minimum viable late workload only.

━━━ WELLBEING INVESTIGATION PROTOCOL ━━━━━━━━━━━━━━━━

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

Never assume. Always understand first.

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
4. Completion pattern: ${behaviorProfile.completion_consistency != null ? `${behaviorProfile.completion_consistency}% 14-day avg` : "insufficient data"}
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

━━━ RECOVERY AWARENESS ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Current state: ${recoveryState.label}${recoveryState.advice ? ` — ${recoveryState.advice}` : ""}

Stable → full scheduling. Mild Overload → fewer sessions, more breaks.
High Load → 1 essential task/day focus. Recovery Needed → max 2 tasks, protect rest.
Burnout Risk → never add tasks, only reorganize and remove.

Never frame deferred tasks as failures. Never use "you only completed X%". No guilt, no urgency when state is elevated. Focus forward only.

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

━━━ OUTPUT FORMAT ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Task ops → 1 sentence.
Coaching → 2 sentences.
Rescheduling → 1 sentence (where it landed, why it fits).
Planning → Step 5 structured template only.
Weekly reflection → 4-part format above.
Everything else → as short as possible. If nothing notable to add, don't add it.`;
  };

  const sendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatLoading) return;
    const uiHistory = [...messages, { role: "user", content: text }];
    setMessages(uiHistory); setChatInput(""); setChatLoading(true);
    saveChatMessage("user", text).catch(console.warn);

    const toApiMsgs = (msgs) => {
      const flat = msgs.filter((m) => m.role === "user" || m.role === "assistant");
      const first = flat.findIndex((m) => m.role === "user");
      return first >= 0 ? flat.slice(first).slice(-20) : [];
    };

    try {
      let workingTasks = tasks;
      let apiMsgs = [{ role: "system", content: buildSystem() }, ...toApiMsgs(uiHistory)];
      let finalText = "";

      for (let iter = 0; iter < 10; iter++) {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMsgs, tools: AI_TOOLS }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error ?? `API error ${res.status}`);
        }
        const data = await res.json();
        const msg = data.choices[0].message;
        apiMsgs = [...apiMsgs, msg];
        if (!msg.tool_calls || msg.tool_calls.length === 0) { finalText = msg.content ?? ""; break; }
        const toolResults = [];
        for (const tc of msg.tool_calls) {
          const input = JSON.parse(tc.function.arguments);
          // save_insight is handled client-side — doesn't modify tasks
          if (tc.function.name === "save_insight") {
            const { key, value, note } = input;
            setUserPrefs((prev) => {
              const updated = { ...prev, [key]: value };
              if (note) updated[`${key}_note`] = note;
              return updated;
            });
            toolResults.push({ role: "tool", tool_call_id: tc.id, content: `Insight saved: ${key} = "${value}"${note ? ` (${note})` : ""}` });
          } else {
            const { result, nextTasks } = executeAiTool(tc.function.name, input, workingTasks);
            workingTasks = nextTasks;
            toolResults.push({ role: "tool", tool_call_id: tc.id, content: result });
          }
        }
        setTasks(workingTasks);
        apiMsgs = [...apiMsgs, ...toolResults];
      }
      const reply = finalText || "Done!";
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
      saveChatMessage("assistant", reply).catch(console.warn);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: `Error: ${e.message}` }]);
    } finally { setChatLoading(false); }
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
    const rect = e.currentTarget.getBoundingClientRect();
    const y    = e.clientY - rect.top;
    const x    = e.clientX - rect.left;
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
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOver({ y: e.clientY - rect.top });
  };

  const handleTimelineDrop = (e) => {
    if (!window.__dragId) return;
    const snap = snapToGrid(e);
    if (snap) moveToSlot(window.__dragId, snap.hour, snap.minute);
    window.__dragId = null;
    setDragOver(null);
  };

  // ── Landing page ──────────────────────────────────────
  if (showLanding) return (
    <div className={`app landing-page${dark ? " dark" : ""}${theme === "liquid_glass" ? " glass" : ""}`}>
      <div className="landing-content">
        <img
          src={dark ? "/logo-dark.png" : "/logo-light.png"}
          className="landing-hero-logo"
          alt="Nora" />
        <p className="landing-tagline">Your intelligent personal planner</p>
        <ul className="landing-features">
          <li><Check size={14} /> Timeline planner with drag &amp; drop</li>
          <li><Check size={14} /> Deadlines, breaks &amp; recurring tasks</li>
          <li><Check size={14} /> Private notes scratchpad</li>
          <li><Check size={14} /> AI assistant to manage your day</li>
        </ul>
        <button className="landing-cta" onClick={() => setShowLanding(false)}>
          Start Planning
        </button>
      </div>
    </div>
  );

  // ── Auth guard ────────────────────────────────────────
  if (authLoading) return (
    <div className={`app${dark ? " dark" : ""}${theme === "liquid_glass" ? " glass" : ""} auth-loading-wrap`}>
      <div className="auth-spinner" />
    </div>
  );

  // Password reset flow — triggered when user clicks the email link
  if (isResettingPw) return <PasswordResetForm dark={dark} glass={theme === "liquid_glass"} onDone={() => setIsResettingPw(false)} />;

  if (!session) return <AuthScreen dark={dark} glass={theme === "liquid_glass"} />;

  // ── Mobile layout ─────────────────────────────────────
  if (isMobile) {
    const mobileCtx = {
      tasks, setTasks, groups, notes, setNotes, session, today, nowObj, dark,
      accountName, setAccountName, energy, setEnergy, relaxation, setRelaxation,
      inAppAlert, setInAppAlert, reminderMins, setReminderMins,
      setDark, theme, setTheme,
      chatOpen, setChatOpen, chatInput, setChatInput, chatLoading, messages, sendChat,
      editingTask, setEditingTask, draft, setDraft,
      todayTasks, deferredTasks, contextMode, aiFocus,
      momentum, recoveryState, workloadForecast, weekData, weekTrend,
      adaptiveRecs, weeklyReflection, mostAvoided, focusPatterns,
      doneToday, totalToday, pct,
      toggleTask, skipTask, askNORAtoReschedule, saveTask, deleteTask,
      addNote: (text) => setNotes((p) => [...p, { id: uid(), title: "", content: text, color: "yellow", done: false, createdAt: Date.now() }]),
      toggleNote, updateNote, deleteNote, patchNote, createStickyNote, getGroup,
      userPrefs, setUserPrefs, noraState, behaviorProfile, predictiveSignals,
      microStartMode, setMicroStartMode,
      rescheduleTask, setRescheduleTask, saveReschedule,
      morningCheckup, showMorningCheckup, setShowMorningCheckup, handleCheckupComplete,
      reviewCheckupMode, setReviewCheckupMode,
      showLongTermInsights, setShowLongTermInsights, dailyMetrics,
      sleepState, todaySleepQuality, setSleepQuality,
      focus, setFocus, motivation, setMotivation,
      userConfidence, assessmentSummary, keySignals,
      focusTask, setFocusTask,
      // Notification system
      notifPermission, notifSettings, updateNotifSettings,
      requestNotifPermission, showNotification,
      notifBannerVisible, dismissNotifBanner,
      notifHealth, sendTestNotification,
    };
    return <MobileApp ctx={mobileCtx} />;
  }

  // ── Desktop render ────────────────────────────────────
  return (
    <div className={`app${dark ? " dark" : ""}${theme === "liquid_glass" ? " glass" : ""}`}>

      {/* Pointer-reactive ambient light for Liquid Glass */}
      <div className="glass-pointer-light" aria-hidden="true" />

      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      <aside className={`sidebar${sidebarOpen ? " open" : ""}`}>
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <img
              src={dark ? "/logo-dark.png" : "/logo-light.png"}
              className="sidebar-brand-logo"
              alt="Nora" />
          </div>
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)}><X size={18} /></button>
        </div>

        <nav className="sidebar-nav">
          {[["day","Day View",<CalendarDays size={16} />],["month","Month View",<CalendarDays size={16} />],["list","All Tasks",<List size={16} />],["notes","Notes",<FileText size={16} />],["boards","Whiteboards",<Layers size={16} />],["status","My Status",<Activity size={16} />]].map(([v,label,icon]) => (
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
            <span>Program Settings</span>
            <ChevronDown size={13} className={`sacc-arrow${activeSettings === "program" ? " open" : ""}`} />
          </button>
          {activeSettings === "program" && (
            <div className="sacc-body">
              <div className="sett-row">
                <span className="sett-label">Dark Mode</span>
                <button className={`theme-toggle${dark ? " on" : ""}`} onClick={() => setDark((d) => !d)} />
              </div>
              <div className="sett-field">
                <label className="sett-field-lbl">Appearance</label>
                <div className="theme-pill-group">
                  <button className={`theme-pill${theme === "default" ? " active" : ""}`} onClick={() => setTheme("default")}>Default</button>
                  <button className={`theme-pill${theme === "liquid_glass" ? " active" : ""}`} onClick={() => setTheme("liquid_glass")}>✦ Liquid Glass</button>
                </div>
              </div>
              <div className="sett-row">
                <span className="sett-label">Notifications</span>
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
              />
            </div>
          )}
        </div>

        <div className="sidebar-accordion">
          <button className={`sacc-btn${activeSettings === "account" ? " open" : ""}`}
            onClick={() => setActiveSettings(activeSettings === "account" ? null : "account")}>
            <User size={15} />
            <span>Account</span>
            <ChevronDown size={13} className={`sacc-arrow${activeSettings === "account" ? " open" : ""}`} />
          </button>
          {activeSettings === "account" && (
            <div className="sacc-body">
              <div className="acc-profile-card">
                <div className="acc-avatar">
                  {(accountName?.trim()[0] ?? session?.user?.email?.[0] ?? "U").toUpperCase()}
                </div>
                <div className="acc-profile-info">
                  <NameEditor name={accountName} onSave={setAccountName} />
                  <span className="acc-email">{session?.user?.email}</span>
                </div>
              </div>
              <button className="sett-signout-btn" onClick={() => supabase.auth.signOut()}>
                Sign out
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
              <img src={dark ? "/logo-dark.png" : "/logo-light.png"} className="brand-logo" alt="Nora" />
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
                  <Sparkles size={11} /> {contextMode.label}
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
                  <Sparkles size={12} /> {totalToday === 0 ? "Plan my day" : "What's next?"}
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
            <div className="view-tabs">
              <div className={`tab-slider tab-slider-${view === "day" ? 0 : view === "month" ? 1 : 2}`} />
              <button className={`tab-btn${view === "day"   ? " active" : ""}`} onClick={() => navigateTo("day")}>Day</button>
              <button className={`tab-btn${view === "month" ? " active" : ""}`} onClick={() => navigateTo("month")}>Month</button>
              <button className={`tab-btn${view === "list"  ? " active" : ""}`} onClick={() => navigateTo("list")}>All</button>
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
                    <Sparkles size={32} style={{ opacity: .2 }} />
                    <p>Nothing scheduled yet.</p>
                    <div className="smart-empty-actions">
                      <button className="smart-empty-btn" onClick={() => {
                        setChatInput("Plan my day for today based on my energy and current workload.");
                        setChatOpen(true);
                      }}>
                        <Sparkles size={14} /> Plan my day with Nora
                      </button>
                      <button className="smart-empty-add" onClick={() => { setAddingAt("unscheduled"); setAddingTitle(""); }}>
                        <Plus size={14} /> Add task
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
                      const gc    = tp === "deadline" ? "#ef4444" : tp === "break" ? "#94a3b8" : group?.color ?? cx?.color ?? "var(--accent)";
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
                              {tp === "deadline" && <Flag size={13} style={{ color: "#ef4444", flexShrink: 0 }} />}
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
                    </div>
                  </>
                );
              })()}
            </div>
          )}

          {/* Floating nudge bar */}
          {view === "day" && aiFocus.nudge && !nudgeDismissed && (
            <div className="ai-nudge-bar">
              <Sparkles size={14} className="nudge-icon" />
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
                          onDragStart={(e) => { e.stopPropagation(); window.__dragId = t.id; }}
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
                    <div className="tl-drag-line" style={{ top: dragOver.y }} />
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
          {view === "status" && (() => {
            const maxWlLoad = Math.max(...workloadForecast.map((d) => d.load), 1);
            const CHECKIN_DEFS = [
              { icon: <Zap size={13} />,        title: "Energy",     color: "var(--accent)", value: energy,     set: setEnergy,
                levels: [{l:"Very low",v:1},{l:"Low",v:3},{l:"Okay",v:5},{l:"Good",v:7},{l:"High",v:9}] },
              { icon: <Wind size={13} />,       title: "Stress",     color: "#3b82f6",       value: relaxation, set: setRelaxation,
                levels: [{l:"Overwhelmed",v:1},{l:"Stressed",v:3},{l:"Okay",v:5},{l:"Calm",v:7},{l:"Relaxed",v:9}] },
              { icon: <Activity size={13} />,   title: "Focus",      color: "#22c55e",       value: focus,      set: setFocus,
                levels: [{l:"Scattered",v:1},{l:"Drifting",v:3},{l:"Okay",v:5},{l:"Focused",v:7},{l:"Deep",v:9}] },
              { icon: <TrendingUp size={13} />, title: "Motivation", color: "#f59e0b",       value: motivation, set: setMotivation,
                levels: [{l:"None",v:1},{l:"Low",v:3},{l:"Okay",v:5},{l:"Driven",v:7},{l:"Fired up",v:9}] },
            ];
            const closestL = (lvls, val) => lvls.reduce((p, c) => Math.abs(c.v - val) < Math.abs(p.v - val) ? c : p);
            return (
              <div className="status-view-v2">

              <div className="sv2-grid">

                {/* ── § 1 Assessment (hero) ── */}
                <div className="sv2-card sv2-assessment sv2-left">
                  <div className="sv2-assess-header">
                    <div className="sv2-state-row">
                      <span className="sv2-state-dot" style={{ background: noraState.color }} />
                      <span className="sv2-state-label" style={{ color: noraState.color }}>{noraState.label}</span>
                    </div>
                    <span className={`sv2-confidence sv2-conf-${userConfidence.level}`} style={{ color: userConfidence.color }}>
                      {userConfidence.label}
                    </span>
                  </div>
                  <p className="sv2-summary">{assessmentSummary}</p>
                  <div className="sv2-signals">
                    {keySignals.map((s, i) => (
                      <div key={i} className="sv2-signal"><span className="sv2-signal-dot" />{s}</div>
                    ))}
                  </div>
                  {adaptiveRecs[0] && (
                    <div className="sv2-assess-rec">
                      <span className="sv2-rec-lbl">Nora suggests:</span> {adaptiveRecs[0]}
                    </div>
                  )}
                </div>

                {/* ── § 2 Daily Check-In ── */}
                <div className="sv2-card sv2-checkin sv2-right">
                  <div className="sv2-card-title"><Wind size={14} /> Daily Check-In</div>
                  <div className="sv2-checkin-list">
                    {CHECKIN_DEFS.map(({ icon, title, color, value, set, levels }) => {
                      const active = closestL(levels, value);
                      return (
                        <div key={title} className="sv2-check-row">
                          <div className="sv2-check-meta">
                            <span className="sv2-check-icon-wrap" style={{ color }}>{icon}</span>
                            <span className="sv2-check-title">{title}</span>
                            <span className="sv2-check-current" style={{ color }}>{active.l}</span>
                          </div>
                          <div className="sv2-check-levels">
                            {levels.map((lvl) => (
                              <button key={lvl.v}
                                className={`sv2-lvl${lvl.v === active.v ? " active" : ""}`}
                                style={lvl.v === active.v ? { background: `${color}18`, borderColor: `${color}50`, color } : {}}
                                onClick={() => set(lvl.v)}>
                                {lvl.l}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── § Sleep & Recovery ── */}
                <div className="sv2-card sv2-sleep sv2-full">
                  <div className="sv2-card-title"><Moon size={14} /> Sleep &amp; Recovery</div>
                  <div className="sleep-body">
                    {/* Check-in */}
                    <div className="sleep-checkin-section">
                      <span className="sleep-checkin-label">How was your sleep?</span>
                      <div className="sleep-q-row">
                        {[["poor","Poor"],["okay","Okay"],["good","Good"]].map(([val, label]) => (
                          <button key={val}
                            className={`sleep-q-btn sleep-q-${val}${todaySleepQuality === val ? " active" : ""}`}
                            onClick={() => setSleepQuality(val)}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Signals */}
                    <div className="sleep-signals">
                      <div className="sleep-signal-row">
                        <span className="sleep-signal-label">Sleep Pressure</span>
                        <span className="sleep-badge" style={{ color: sleepState.pressureColor, background: `${sleepState.pressureColor}15`, borderColor: `${sleepState.pressureColor}30` }}>
                          {sleepState.pressure}
                        </span>
                      </div>
                      <div className="sleep-signal-row">
                        <span className="sleep-signal-label">Tonight's Risk</span>
                        <span className="sleep-badge" style={{ color: sleepState.riskColor, background: `${sleepState.riskColor}15`, borderColor: `${sleepState.riskColor}30` }}>
                          {sleepState.tonightRisk}
                        </span>
                      </div>
                    </div>
                  </div>
                  {sleepState.suggestion && (
                    <div className="sleep-suggestion">
                      <Moon size={11} /> {sleepState.suggestion}
                    </div>
                  )}
                </div>

                {/* ── § 3 Today's Reality ── */}
                <div className="sv2-card sv2-today sv2-left">
                  <div className="sv2-card-title"><CalendarDays size={14} /> Today's Reality</div>
                  <div className="sv2-reality-row">
                    {[
                      { val: doneToday,                          lbl: "Completed", color: "#22c55e" },
                      { val: Math.max(0, totalToday - doneToday), lbl: "Remaining", color: "var(--text)" },
                      { val: deferredTasks.length,               lbl: "Deferred",  color: deferredTasks.length > 0 ? "#f97316" : "var(--text)" },
                      { val: workloadForecast[0]?.level ?? "—",  lbl: "Load",      color: workloadForecast[0]?.level === "heavy" ? "#ef4444" : workloadForecast[0]?.level === "moderate" ? "#f97316" : "#22c55e" },
                    ].map(({ val, lbl, color }) => (
                      <div key={lbl} className="sv2-reality-stat">
                        <span className="sv2-rstat-val" style={{ color }}>{val}</span>
                        <span className="sv2-rstat-lbl">{lbl}</span>
                      </div>
                    ))}
                  </div>
                  {totalToday > 0 && (
                    <div className="sv2-today-bar-bg">
                      <div className="sv2-today-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>

                {/* ── § 4 Needs Attention ── */}
                <div className="sv2-card sv2-attention sv2-right">
                  <div className="sv2-card-title"><AlertTriangle size={14} /> Needs Attention</div>
                  {recoveryState.level !== "stable" && (
                    <div className={`sv2-recovery-alert sv2-rec-${recoveryState.level}`} style={{ borderLeftColor: recoveryState.color }}>
                      <span className="sv2-rec-name" style={{ color: recoveryState.color }}>{recoveryState.label}</span>
                      <p className="sv2-rec-desc">{recoveryState.desc}</p>
                      {recoveryState.advice && <p className="sv2-rec-advice">{recoveryState.advice}</p>}
                    </div>
                  )}
                  {predictiveSignals.filter((s) => s.confidence === "HIGH").map((s, i) => (
                    <div key={i} className="sv2-psignal"><Zap size={11} /> {s.message}</div>
                  ))}
                  {mostAvoided && (
                    <div className="sv2-attention-item sv2-avoided">
                      <div className="sv2-attn-info">
                        <span className="sv2-attn-name">{mostAvoided.task.title}</span>
                        <span className="sv2-attn-age">Deferred {mostAvoided.daysOverdue}d</span>
                      </div>
                      <p className="sv2-attn-note">"{mostAvoided.daysOverdue >= 5 ? "This is becoming avoidance, not scheduling." : "A 5-minute start breaks the loop."}"</p>
                      <div className="sv2-attn-btns">
                        <button className="sv2-attn-btn" onClick={() => setRescheduleTask(mostAvoided.task)}><CalendarDays size={11} /> Move</button>
                        <button className="sv2-attn-btn sv2-attn-micro" onClick={() => { setChatInput(`Help me micro-start "${mostAvoided.task.title}"`); setChatOpen(true); }}><Zap size={11} /> Micro Start</button>
                      </div>
                    </div>
                  )}
                  {deferredTasks.filter((t) => t.id !== mostAvoided?.task?.id).slice(0, 3).map((t) => (
                    <div key={t.id} className={`sv2-attention-item sv2-def-${t.urgency}`}>
                      <div className="sv2-attn-info">
                        <span className="sv2-attn-name">{t.title}</span>
                        <span className="sv2-attn-age">{t.daysDeferred}d pending</span>
                      </div>
                      <button className="sv2-attn-btn" onClick={() => setRescheduleTask(t)}><CalendarDays size={11} /> Move</button>
                    </div>
                  ))}
                  {recoveryState.level === "stable" && deferredTasks.length === 0 && predictiveSignals.filter((s) => s.confidence === "HIGH").length === 0 && (
                    <p className="sv2-all-clear">✓ Nothing urgent right now.</p>
                  )}
                  {deferredTasks.length > 1 && (
                    <button className="sv2-rebalance-btn" onClick={() => {
                      const titles = deferredTasks.slice(0, 4).map((t) => `"${t.title}"`).join(", ");
                      setChatInput(`I have ${deferredTasks.length} deferred tasks: ${titles}. Rebalance across this week based on my load.`);
                      setChatOpen(true);
                    }}>Rebalance all with Nora</button>
                  )}
                </div>

                {/* ── § 5 Week Outlook ── */}
                <div className="sv2-card sv2-week sv2-left">
                  <div className="sv2-card-title-row">
                    <div className="sv2-card-title" style={{ marginBottom: 0 }}><BarChart2 size={14} /> Week Outlook</div>
                    <span className={`trend-badge trend-${weekTrend}`}>
                      {weekTrend === "improving" ? <TrendingUp size={12} /> : weekTrend === "declining" ? <TrendingDown size={12} /> : <Minus size={12} />}
                      {weekTrend === "new" ? "Starting" : weekTrend.charAt(0).toUpperCase() + weekTrend.slice(1)}
                    </span>
                  </div>
                  <div className="sv2-outlook-chart">
                    {workloadForecast.map((day) => (
                      <div key={day.date} className={`sv2-out-day${day.isToday ? " today" : ""}`}>
                        <div className="sv2-out-bar-wrap">
                          <div className={`sv2-out-bar wl-${day.level}`} style={{ height: `${Math.max(4, Math.round((day.load / maxWlLoad) * 64))}px` }} />
                        </div>
                        <span className="sv2-out-lbl">{day.label}</span>
                      </div>
                    ))}
                  </div>
                  <p className="sv2-outlook-note">{
                    (() => {
                      const heavy = workloadForecast.filter((d) => d.level === "heavy");
                      return heavy.length > 0
                        ? `Heavy work concentrated on ${heavy.map((d) => d.label).join(" and ")}.`
                        : workloadForecast.some((d) => d.level !== "free")
                        ? "This week looks manageable — good pacing."
                        : "Light week ahead.";
                    })()
                  }</p>
                  {weeklyReflection?.insights[0] && (
                    <p className="sv2-reflect-note">{weeklyReflection.insights[0]}</p>
                  )}
                </div>

                {/* ── § 6 How You Work Best ── */}
                <div className="sv2-card sv2-patterns sv2-right">
                  <div className="sv2-card-title"><Activity size={14} /> How You Work Best</div>
                  <div className="sv2-pattern-stats">
                    {[
                      { lbl: "Peak Focus",    val: focusPatterns ? `${focusPatterns.peak.label}` : "—" },
                      { lbl: "Avg Session",   val: adaptivePlanData?.avgDur ? `${adaptivePlanData.avgDur} min` : "—" },
                      { lbl: "Work Style",    val: behaviorProfile.work_style !== "unknown" ? behaviorProfile.work_style.charAt(0).toUpperCase() + behaviorProfile.work_style.slice(1) : "—" },
                      { lbl: "Best Day",      val: adaptivePlanData?.bestDayName ?? "—" },
                    ].map(({ lbl, val }) => (
                      <div key={lbl} className="sv2-pstat">
                        <span className="sv2-pstat-lbl">{lbl}</span>
                        <span className="sv2-pstat-val">{val}</span>
                      </div>
                    ))}
                  </div>
                  {focusPatterns && (
                    <div className="sv2-focus-bands">
                      {focusPatterns.bands.map((b) => (
                        <div key={b.key} className={`sv2-fband${b.key === focusPatterns.peak.key ? " peak" : ""}`}>
                          <span className="sv2-fband-lbl">{b.label}</span>
                          <div className="sv2-fband-bg">
                            <div className="sv2-fband-fill" style={{ width: `${focusPatterns.total > 0 ? Math.round((b.count / focusPatterns.total) * 100) : 0}%` }} />
                          </div>
                          <span className="sv2-fband-pct">{focusPatterns.total > 0 ? Math.round((b.count / focusPatterns.total) * 100) : 0}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {behaviorProfile.completion_consistency != null && (
                    <p className="sv2-pattern-note">{behaviorProfile.completion_consistency}% completion · {behaviorProfile.sampleSize} tasks sampled</p>
                  )}
                </div>

                {/* ── § Morning Check-Up ── */}
                <div className="sv2-card sv2-checkup sv2-full">
                  <div className="sv2-card-title"><Sunrise size={14} className="mcu-sunrise-icon" /> Morning Check-Up</div>
                  {morningCheckup ? (() => {
                    const r = computeReadiness(morningCheckup) ?? { label: "Moderate", color: "#f59e0b", pct: 50 };
                    return (
                      <div className="mcu-status-submitted">
                        <div className="mcu-status-row">
                          <span className="mcu-status-badge mcu-status-done">✓ Submitted today</span>
                          <span className="mcu-readiness-inline" style={{ color: r.color }}>
                            {r.label} readiness{Number.isFinite(r.pct) ? ` · ${r.pct}%` : ""}
                          </span>
                        </div>
                        {morningCheckup.noraSummary && (
                          <p className="mcu-status-summary">"{morningCheckup.noraSummary}"</p>
                        )}
                        <button className="lti-open-btn" style={{ marginTop: 6 }} onClick={() => { setReviewCheckupMode(true); setShowMorningCheckup(true); }}>
                          Review results →
                        </button>
                      </div>
                    );
                  })() : (
                    <div className="mcu-status-cta">
                      <p className="mcu-status-cta-text">Help Nora understand your day before planning it.</p>
                      <button className="mcu-start-btn" onClick={() => { setReviewCheckupMode(false); setShowMorningCheckup(true); }}>
                        <Sunrise size={14} /> Start Morning Check-Up
                      </button>
                    </div>
                  )}
                </div>

                {/* ── § Long-Term Insights ── */}
                <div className="sv2-card sv2-lti sv2-full">
                  <div className="sv2-card-title"><Activity size={14} /> Long-Term Insights</div>
                  {(() => {
                    const entries = Object.entries(dailyMetrics).sort((a, b) => a[0].localeCompare(b[0]));
                    const hasData = entries.length >= 3;
                    if (!hasData) return (
                      <div className="lti-status-cta">
                        <p className="lti-status-text">Complete a few check-ins to unlock your trends.</p>
                        <button className="mcu-start-btn" onClick={() => setShowLongTermInsights(true)}>View Insights</button>
                      </div>
                    );
                    const recent = entries.slice(-7).map(([, v]) => v.energy).filter(Boolean);
                    const trend  = recent.length >= 3 ? (recent.slice(-3).reduce((a, b) => a + b, 0) / 3 > recent.slice(0, 3).reduce((a, b) => a + b, 0) / 3 ? "improving" : "stable") : "stable";
                    return (
                      <div className="lti-status-preview">
                        <div className="lti-status-row">
                          <span className="lti-status-signal">Energy {trend === "improving" ? "↑ improving" : "→ stable"} this week</span>
                          <span className="lti-status-count">{entries.length} days tracked</span>
                        </div>
                        <button className="lti-open-btn" onClick={() => setShowLongTermInsights(true)}>Open Insights →</button>
                      </div>
                    );
                  })()}
                </div>

                {/* ── § 7 What NORA Recommends ── */}
                {adaptiveRecs.length > 0 && (
                  <div className="sv2-card sv2-recs sv2-full">
                    <div className="sv2-card-title"><Lightbulb size={14} /> What Nora Recommends</div>
                    <div className="sv2-recs-list">
                      {adaptiveRecs.slice(0, 3).map((r, i) => (
                        <div key={i} className="sv2-rec-item">
                          <span className="sv2-rec-num">{i + 1}</span>
                          <span className="sv2-rec-text">{r}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>

              </div>
            );
          })()}

          {view === "notes" && (() => {
            const openNote = notes.find(n => n.id === openNoteId);
            const nc = (color) => NOTE_COLORS[color ?? "yellow"];
            const closeNote = () => {
              if (openNote && !openNote.title?.trim() && !openNote.content?.trim()) {
                deleteNote(openNote.id);
              } else {
                setOpenNoteId(null);
              }
            };
            const handleCardDelete = (e, id) => {
              e.stopPropagation();
              setDeletingNoteId(id);
              setTimeout(() => { deleteNote(id); setDeletingNoteId(null); }, 210);
            };
            return (
              <div className="notes-view">
                <div className="notes-view-header">
                  <button className="sticky-add-note-btn" onClick={() => createStickyNote("yellow")}>
                    <Plus size={14} /> New Note
                  </button>
                </div>
                {notes.length === 0 ? (
                  <div className="notes-empty">
                    <FileText size={40} style={{ opacity: .1 }} />
                    <p>No notes yet.</p>
                  </div>
                ) : (
                  <div className="sticky-grid">
                    {[...notes].reverse().map((note) => {
                      const c = nc(note.color);
                      return (
                        <div key={note.id}
                          className={`sticky-card${deletingNoteId === note.id ? " deleting" : ""}`}
                          style={{ background: c.bg, borderColor: c.border }}
                          onClick={() => setOpenNoteId(note.id)}>
                          <button className="sticky-card-del" onClick={e => handleCardDelete(e, note.id)}>
                            <X size={11} />
                          </button>
                          <div className="sticky-card-title" style={{ color: c.text }}>
                            {note.title || "Untitled"}
                          </div>
                          {note.content && (
                            <div className="sticky-card-preview" style={{ color: c.text }}>
                              {note.content}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Expanded note modal */}
                {openNote && (
                  <div className="sticky-modal-overlay" onClick={closeNote}>
                    <div className="sticky-modal" style={{ background: nc(openNote.color).bg, borderColor: nc(openNote.color).border }}
                      onClick={e => e.stopPropagation()}>
                      <div className="sticky-modal-top">
                        <input className="sticky-modal-title"
                          style={{ color: nc(openNote.color).text }}
                          value={openNote.title ?? ""}
                          onChange={e => patchNote(openNote.id, { title: e.target.value })}
                          placeholder="Note title"
                          autoFocus />
                        <button className="sticky-modal-close" onClick={closeNote}>
                          <X size={16} />
                        </button>
                      </div>
                      <div className="sticky-color-row">
                        {Object.entries(NOTE_COLORS).map(([key, val]) => (
                          <button key={key} className={`sticky-color-dot${openNote.color === key ? " active" : ""}`}
                            style={{ background: val.bg, borderColor: val.border, outlineColor: val.text }}
                            onClick={() => patchNote(openNote.id, { color: key })} />
                        ))}
                        <button className="sticky-modal-delete" onClick={() => deleteNote(openNote.id)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                      <textarea className="sticky-modal-content"
                        style={{ color: nc(openNote.color).text }}
                        value={openNote.content ?? ""}
                        onChange={e => patchNote(openNote.id, { content: e.target.value })}
                        placeholder="Write your note…" />
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          </div>{/* page-anim */}
        </div>

        <footer className="app-footer">
          <div className="footer-inner">
            <div className="footer-brand">
              <img src={dark ? "/logo-dark.png" : "/logo-light.png"} className="footer-logo" alt="Nora" />
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
          onClose={() => setView("day")}
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

      {/* Chat FAB */}
      <button className={`chat-fab${chatOpen ? " active" : ""}`} onClick={() => setChatOpen((o) => !o)}>
        {chatOpen ? <X size={22} /> : <MessageSquare size={22} />}
      </button>

      <div className={`chat-panel${chatOpen ? " open" : ""}`}>
        <div className="chat-header">
          <div className="chat-header-info">
            <img src={dark ? "/logo-dark.png" : "/logo-light.png"} className="chat-avatar-logo" alt="Nora" />
            <div><div className="chat-title">Nora</div><div className="chat-subtitle">Your productivity coach</div></div>
          </div>
          <button className="chat-close" onClick={() => setChatOpen(false)}><X size={16} /></button>
        </div>
        <div className="chat-messages">
          {messages.map((m, i) => (
            <div key={i} className={`chat-msg ${m.role}`}><div className="chat-bubble">{m.content}</div></div>
          ))}
          {chatLoading && <div className="chat-msg assistant"><div className="chat-bubble typing"><span /><span /><span /></div></div>}
          <div ref={chatEndRef} />
        </div>
        <div className="chat-suggestions">
          <div className="chat-chips-pill">
            {chatSuggestions.map((s, i) => (
              <button key={i} className="chat-chip" onClick={() => {
                setChatInput(s); setChatGhost(""); setChatSuggestions(DEFAULT_CHAT_CHIPS);
                chatInputRef.current?.focus();
              }}>{s}</button>
            ))}
          </div>
        </div>
        <div className="chat-input-row">
          <button
            className={`chat-micro-btn${microStartMode ? " on" : ""}`}
            onClick={() => setMicroStartMode((m) => !m)}>
            <Zap size={14} />
            <span className="chat-micro-label">{microStartMode ? "Active" : "Micro Start"}</span>
          </button>
          <div className="chat-input-wrap">
            {chatGhost && (
              <div className="chat-ghost" aria-hidden="true">
                {chatInput}<span className="chat-ghost-text">{chatGhost}</span>
                <span className="chat-ghost-hint">Tab</span>
              </div>
            )}
            <textarea ref={chatInputRef} className="chat-input" value={chatInput} rows={2}
              onChange={(e) => {
                const val = e.target.value;
                setChatInput(val);
                const ghost = getChatGhost(val);
                setChatGhost(ghost);
                setChatSuggestions(getChatAlternatives(val, ghost));
                e.target.style.height = "auto";
                e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
              }}
              onKeyDown={(e) => {
                if (e.key === "Tab" && chatGhost) {
                  e.preventDefault();
                  const completed = chatInput + chatGhost;
                  setChatInput(completed);
                  setChatGhost(getChatGhost(completed));
                  setChatSuggestions(DEFAULT_CHAT_CHIPS);
                } else if (e.key === "ArrowRight" && chatGhost &&
                           e.target.selectionStart === chatInput.length &&
                           e.target.selectionEnd === chatInput.length) {
                  e.preventDefault();
                  const completed = chatInput + chatGhost;
                  setChatInput(completed);
                  setChatGhost("");
                  setChatSuggestions(DEFAULT_CHAT_CHIPS);
                } else if (e.key === "Escape") {
                  setChatGhost(""); setChatSuggestions(DEFAULT_CHAT_CHIPS);
                } else if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendChat();
                  setChatGhost(""); setChatSuggestions(DEFAULT_CHAT_CHIPS);
                }
              }}
              placeholder="Ask Nora anything…" />
          </div>
          <button className="chat-send" onClick={sendChat} disabled={chatLoading || !chatInput.trim()}>
            {chatLoading ? <span className="dot-spin" /> : <Send size={16} />}
          </button>
        </div>
      </div>

      {inAppAlert && (
        <div className="notif-toast" role="alert">
          <Bell size={18} className="notif-toast-icon" />
          <div className="notif-toast-text">
            <div className="notif-toast-title">{inAppAlert.title}</div>
            <div className="notif-toast-body">Starting in {inAppAlert.offset} min · {inAppAlert.timeStr}</div>
          </div>
          <button className="notif-toast-close" onClick={() => setInAppAlert(null)}><X size={14} /></button>
        </div>
      )}

      {/* Long-Term Insights overlay */}
      {showLongTermInsights && (
        <LongTermInsights
          dark={dark}
          glass={theme === "liquid_glass"}
          metrics={dailyMetrics}
          tasks={tasks}
          onClose={() => setShowLongTermInsights(false)}
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
        />
      )}

      {/* Focus session overlay */}
      {focusTask && (
        <FocusSession
          task={focusTask}
          dark={dark}
          userPrefs={userPrefs}
          setUserPrefs={setUserPrefs}
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
        <div className="modal-overlay" onClick={() => setEditingTask(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <input className="modal-title-input" value={draft.title} placeholder="Task title"
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
              <button className="modal-close" onClick={() => setEditingTask(null)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              {/* Type selector */}
              <div className="type-tabs">
                {[["task","Task",<Check size={12}/>],["deadline","Deadline",<Flag size={12}/>],["break","Break",<Coffee size={12}/>]].map(([val,label,icon]) => (
                  <button key={val}
                    className={`type-tab type-tab-${val}${(draft.type ?? "task") === val ? " active" : ""}`}
                    onClick={() => setDraft((d) => ({ ...d, type: val }))}>
                    {icon} {label}
                  </button>
                ))}
              </div>

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
                    {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
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
                <label className="field-label">Notes</label>
                <textarea className="modal-notes" rows={4} value={draft.notes}
                  onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
                  placeholder="Add notes, links, context..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-danger" onClick={() => deleteTask(draft.id)}><Trash2 size={14} /> Delete</button>
              <button className="btn-primary" onClick={saveTask}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Group modal */}
      {showGroupModal && (
        <div className="modal-overlay" onClick={() => setShowGroupModal(false)}>
          <div className="modal modal-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-heading">Manage Groups</span>
              <button className="modal-close" onClick={() => setShowGroupModal(false)}><X size={18} /></button>
            </div>
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
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowGroupModal(false)}>Close</button>
              <button className="btn-primary" onClick={createGroup}
                disabled={!newGroupName.trim() || groups.some((g) => g.name.toLowerCase() === newGroupName.trim().toLowerCase())}>
                <Plus size={14} /> Create</button>
            </div>
          </div>
        </div>
      )}

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
    </div>
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
    <div className={`app${dark ? " dark" : ""}${glass ? " glass" : ""} auth-wrap`}>
      <div className="auth-card pw-reset-card">
        <div className="auth-brand">
          <img src={dark ? "/logo-dark.png" : "/logo-light.png"} className="auth-brand-logo" alt="Nora" />
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
  const fmtH  = (h) => h === 0 ? "12:00 AM" : h < 12 ? `${h}:00 AM` : h === 12 ? "12:00 PM" : `${h - 12}:00 PM`;

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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal reschedule-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="reschedule-modal-title">Move task</span>
          <button className="modal-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div className="reschedule-task-name">{task.title || "Untitled"}</div>
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
                  {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
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
        <div className="modal-footer">
          <button className="modal-cancel" onClick={onClose}>Cancel</button>
          <button className="modal-save" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
}

function TaskChip({ task, group, onToggle, onReschedule, onSkip, onClick }) {
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
