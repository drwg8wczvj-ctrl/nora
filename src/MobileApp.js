import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Check, ChevronDown, ChevronLeft, ChevronRight, Clock, MessageSquare, X,
  FileText, Trash2, User, RotateCcw, CalendarDays, Pin, Star,
  Flag, Coffee, Bell, Activity,
  SkipForward, Plus,
  BarChart2, Zap, List, Pencil,
  Share2, Users, Search, KeyRound, HeartPulse, MoreHorizontal, Languages,
  SlidersHorizontal,
} from "lucide-react";
import { MessagePartsList } from "./conversation/MessagePart";
import ConversationMessage from "./conversation/ConversationMessage";
import { textPart } from "./conversation/messageParts";
import { ConversationSheet } from "./conversation/ConversationList";
import CloseButton from "./components/CloseButton";
import BrandStar from "./components/BrandStar";
import {
  NativeButton,
  NativeDialog,
  NativeEmptyState,
  NativeField,
  NativeIconButton,
  NativeListRow,
  NativeSection,
  NativeSegmentedControl,
  NativeSheet,
  NativeSwitch,
} from "./components/ui/NativeUI";
import { MobileShellHeader, MobileShellTabBar } from "./components/mobile/MobileShell";
import {
  AssistantChatComposer,
  AssistantComposerMenu,
  AssistantChatHeader,
} from "./components/mobile/AssistantChatUI";
import {
  buildDaySummary,
  formatPlannerDate,
  partitionDayTasks,
  shiftIsoDate,
} from "./components/mobile/plannerModel";
import { isNativeActionMenuAvailable, showNativeActionMenu } from "./lib/nativeActionMenu";
import { hapticLight, hapticSelection } from "./lib/haptics";
import NoteCard from "./components/NoteCard";
import NoteEditor, { NOTE_TYPE_DEFS, migrateNote } from "./components/NoteEditor";
import { supabase } from "./lib/supabase";
import MorningCheckup from "./MorningCheckup";
import NoraObservations from "./NoraObservations";
import FocusSession from "./FocusSession";
import DeskMode from "./components/desk/DeskMode";
import NotificationPermissionBanner from "./components/NotificationPermissionBanner";
import NotificationSettings from "./components/NotificationSettings";
import HealthSettings from "./components/HealthSettings";
import ShareModal from "./components/ShareModal";
import JoinCodeModal from "./components/JoinCodeModal";
import UsernameOnboarding from "./components/UsernameOnboarding";
import UsernameNudgeBanner from "./components/UsernameNudgeBanner";
import ProfileModal from "./components/ProfileModal";
import AvatarDisplay, { profileToAvatar } from "./components/AvatarDisplay";
import { MapPin } from "lucide-react";
import LocationField from "./components/LocationField";
import SavedPlacesManager from "./components/SavedPlacesManager";
import PricingModal from "./components/PricingModal";
import AIHub from "./aiHub/AIHub";
import { MobileToolComingSoon } from "./aiHub/AIToolComingSoon";
import { MobileAtlasChat } from "./aiHub/AtlasChat";
import { AI_HUB_TOOLS } from "./aiHub/aiToolsRegistry";
import StatusPage from "./status/StatusPage";
import { buildWorkMindProps } from "./status/buildStatusProps";
import "./MobileApp.css";
import { useTranslation } from "react-i18next";
import { useNativeTabBar } from "./hooks/useNativeTabBar";
import { usePhoneLandscape } from "./hooks/useMobile";
import { apiFetch } from "./lib/apiBase";

// ── Local helpers ────────────────────────────────────────────
const uid  = () => Math.random().toString(36).slice(2);
const pad  = (n) => String(n).padStart(2, "0");
const fmtTime = (h, m) => `${pad(h)}:${pad(m)}`;
// ── Chat autocomplete suggestions ──────────────────────
const CHAT_SUGGESTIONS = [
  "Plan my day for today",
  "What should I focus on right now?",
  "How's my week looking?",
  "Help me reschedule my tasks this week",
  "Help me prioritize today",
  "I'm feeling overwhelmed, can you help?",
  "I have no energy today, what should I do?",
  "Rebalance my schedule this week",
  "Schedule my most important task for today",
  "What can I do with 30 minutes?",
  "Plan my morning routine",
  "Can you prioritize my tasks for today?",
  "Move my tasks to a lighter day",
  "Add a break to my afternoon",
  "Help me start this task step by step",
];
const getChatGhost = (input) => {
  if (!input || input.length < 2) return "";
  const lc = input.toLowerCase();
  for (const s of CHAT_SUGGESTIONS) {
    if (s.toLowerCase().startsWith(lc) && s.length > input.length) return s.slice(input.length);
  }
  return "";
};
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

const shortTitle = (title) => {
  if (!title) return "";
  const words = title.trim().split(/\s+/);
  return words.length <= 3 ? title : words.slice(0, 3).join(" ") + "…";
};

const fmtDur = (min) => {
  if (!min) return "";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60), r = min % 60;
  return r === 0 ? `${h}h` : `${h}h${r}m`;
};

// ── Root ─────────────────────────────────────────────────────
export default function MobileApp({ ctx }) {
  const { t } = useTranslation();
  const phoneLandscape = usePhoneLandscape();
  const [mobileView,    setMobileView]    = useState("plan");
  const [planSubView,   setPlanSubView]   = useState("day");
  const [dayMode,       setDayMode]       = useState("list");
  const [planDate,      setPlanDate]      = useState(ctx.today);

  // Auto-advance planDate at midnight — if user was on "today" move to the new day
  const prevMobileTodayRef = useRef(ctx.today);
  useEffect(() => {
    if (ctx.today !== prevMobileTodayRef.current) {
      if (planDate === prevMobileTodayRef.current) setPlanDate(ctx.today);
      prevMobileTodayRef.current = ctx.today;
    }
  }, [ctx.today]); // eslint-disable-line react-hooks/exhaustive-deps

  // Consumes a widget deep link's destination view — App.js has no direct
  // access to this component's own mobileView state, so it hands off the
  // target through ctx.pendingMobileView instead (see App.js's appUrlOpen listener).
  useEffect(() => {
    if (ctx.pendingMobileView) {
      setMobileView(ctx.pendingMobileView);
      ctx.setPendingMobileView(null);
    }
  }, [ctx.pendingMobileView]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter state lives here (root level) so the sheet can be rendered above everything
  const [showFilters,   setShowFilters]   = useState(false);
  const [filterType,    setFilterType]    = useState(null);
  const [filterGroup,   setFilterGroup]   = useState(null);
  const [filterComplex, setFilterComplex] = useState(null);
  const hasFilters = filterType || filterGroup || filterComplex;

  const { dark, theme, chatOpen, setChatOpen, aiHubOpen, setAiHubOpen,
          messengerOpen, setMessengerOpen, editingTask, draft, inAppAlert, setInAppAlert,
          rescheduleTask, setRescheduleTask, saveReschedule, groups,
          focusTask, setFocusTask, userPrefs, setUserPrefs, toggleTask,
          notifBannerVisible, dismissNotifBanner, requestNotifPermission,
          sharingTask, setSharingTask, session,
          atlasOpen, setAtlasOpen, atlasShellActive, showLaunchSplash, launchRevealing, atlasMessages, atlasChatInput, setAtlasChatInput,
          atlasChatLoading, sendAtlasChat, visibleAiTools, atlasGreeting,
          atlasConversations, atlasActiveConversationId, atlasConversationsLoading,
          onSelectAtlasConversation, onNewAtlasConversation, onRenameAtlasConversation,
          onPinAtlasConversation, onArchiveAtlasConversation, onDeleteAtlasConversation,
          onOpenNoraReturnPlan,
          editAtlasMessage, retryAtlasMessage,
          assistantSettings, updateAssistantSettings } = ctx;

  const TYPE_COLORS   = { task:"var(--accent)", deadline:"#ef4444", break:"#94a3b8" };
  const COMPLEX_COLORS = { easy:"#22c55e", medium:"#f59e0b", hard:"#ef4444" };

  const shellLabels = {
    plan: t("mob.plan"),
    tasks: t("mob.tasks"),
    notes: t("mob.notes"),
    status: t("mob.status"),
    settings: t("mob.settings"),
  };

  // The native tab bar renders in its own UIKit layer on top of the WebView,
  // so no web mechanism (z-index, dim masks, position:fixed) can cover it —
  // it has to be told to hide explicitly whenever a full-screen overlay/sheet
  // is showing, or it bleeds through on top of everything. This aggregates
  // every such surface reachable from here, plus ctx.intelOverlayOpen for the
  // three (Proactive/SuggestionCenter/Onboarding) that render as siblings of
  // <MobileApp> rather than inside it.
  const anyOverlayOpen = !!(
    ctx.showMorningCheckup || ctx.showObservations ||
    (editingTask && draft) || rescheduleTask ||
    chatOpen || aiHubOpen || messengerOpen || atlasOpen ||
    sharingTask || ctx.showJoinCode || ctx.showOnboarding ||
    ctx.showProfileModal || ctx.pricingOpen || focusTask ||
    showFilters ||
    ctx.intelOverlayOpen
  );

  // Native iOS tab bar — the OS owns this surface on native iPhone builds.
  // Web/PWA/Android keep the matching web implementation.
  const { usingNative } = useNativeTabBar({
    activeTab: mobileView,
    mode:      atlasShellActive ? "atlas" : "nora",
    dark:      true,
    enabled:   true,
    visible:   !anyOverlayOpen && !phoneLandscape,
    onTabChange: setMobileView,
  });

  if (phoneLandscape) {
    return <DeskMode ctx={ctx} />;
  }

  return (
    <div
      className={`app mob-app native-ui dark${usingNative ? " mob-native-nav" : ""}${atlasShellActive ? " atlas-active" : ""}${showLaunchSplash ? (launchRevealing ? " launch-shell-revealing" : " launch-shell-waiting") : ""}`}
      data-native-ui
      data-persona={atlasShellActive ? "atlas" : "nora"}
    >

      {/* Ambient warmth wash while Atlas's chat is open — fades in/out via .atlas-active */}
      <div className="app-atlas-tint" aria-hidden="true" />

      <MobileShellHeader
        today={ctx.today}
        activeView={mobileView}
        labels={shellLabels}
        isOnline={ctx.isOnline}
        onLogoClick={() => {
          setMobileView("plan");
          setPlanSubView("day");
          setPlanDate(ctx.today);
        }}
      />

      <main className="mob-main">
        {mobileView === "plan"     && <MobilePlan ctx={ctx} subView={planSubView} setSubView={setPlanSubView} dayMode={dayMode} setDayMode={setDayMode} filterType={filterType} filterGroup={filterGroup} filterComplex={filterComplex} hasFilters={hasFilters} onOpenFilters={() => setShowFilters(true)} planDate={planDate} setPlanDate={setPlanDate} />}
        {mobileView === "tasks"    && <MobileTasks ctx={ctx} />}
        {mobileView === "notes"    && <MobileNotes ctx={ctx} />}
        {mobileView === "status"   && <div className="status-page-mobile-gutter"><StatusPage {...buildWorkMindProps(ctx, ctx, ctx)} health={ctx.health} healthSummary={ctx.healthSummary} onOpenHealthSettings={() => setMobileView("settings")} tasks={ctx.tasks || []} dailyMetrics={ctx.dailyMetrics || {}} journeys={ctx.journeys || []} onOpenInsights={() => ctx.setShowObservations(true)} onAskAtlas={(message) => { ctx.setAtlasChatInput(message); ctx.setAtlasOpen(true); }} onMindModeChange={ctx.setStatusMindActive} /></div>}
        {mobileView === "settings" && <MobileSettings ctx={ctx} />}
      </main>

      <MobileShellTabBar
        activeView={mobileView}
        labels={shellLabels}
        onViewChange={(nextView) => {
          if (nextView !== mobileView) hapticSelection();
          setMobileView(nextView);
        }}
      />

      <NativeIconButton
        className={`mob-ai-fab${(aiHubOpen || chatOpen || messengerOpen || atlasOpen) ? " fab-open" : ""}${showLaunchSplash ? " mob-ai-fab-launch-hidden" : ""}`}
        label={(aiHubOpen || chatOpen || messengerOpen || atlasOpen) ? "Close AI" : "Open Nora"}
        variant={(aiHubOpen || chatOpen || messengerOpen || atlasOpen) ? "tertiary" : "accent"}
        onClick={() => {
          if (aiHubOpen || chatOpen || messengerOpen || atlasOpen) {
            setAiHubOpen(false); setChatOpen(false); setMessengerOpen(false); setAtlasOpen(false);
          } else {
            setAiHubOpen(true);
          }
        }}>
        {(aiHubOpen || chatOpen || messengerOpen || atlasOpen) ? <X size={22} /> : <BrandStar size={24} tone="white" />}
      </NativeIconButton>

      <MobileChat ctx={ctx} />
      <MobileAtlasChat
        open={atlasOpen}
        onClose={() => setAtlasOpen(false)}
        messages={atlasMessages}
        chatInput={atlasChatInput}
        setChatInput={setAtlasChatInput}
        chatLoading={atlasChatLoading}
        onSend={sendAtlasChat}
        introSeen={assistantSettings.atlasIntroSeen}
        onIntroSeen={() => updateAssistantSettings({ atlasIntroSeen: true })}
        greeting={atlasGreeting}
        conversations={atlasConversations}
        activeConversationId={atlasActiveConversationId}
        conversationsLoading={atlasConversationsLoading}
        onSelectConversation={onSelectAtlasConversation}
        onNewConversation={onNewAtlasConversation}
        onRenameConversation={onRenameAtlasConversation}
        onPinConversation={onPinAtlasConversation}
        onArchiveConversation={onArchiveAtlasConversation}
        onDeleteConversation={onDeleteAtlasConversation}
        onOpenNora={onOpenNoraReturnPlan}
        onEditMessage={editAtlasMessage}
        onRetryMessage={retryAtlasMessage}
        plannerTasks={ctx.tasks ?? []}
      />
      <AIHub
        open={aiHubOpen}
        onClose={() => setAiHubOpen(false)}
        badges={{ insights: (ctx.intelCount ?? 0) > 0 }}
        tools={visibleAiTools}
        onSelect={(id) => {
          setAiHubOpen(false);
          if (id === "assistant") setChatOpen(true);
          else if (id === "atlas") setAtlasOpen(true);
          else if (id === "messenger") setMessengerOpen(true);
          else if (id === "insights") ctx.onIntelClick();
        }}
      />
      <MobileToolComingSoon
        open={messengerOpen}
        onClose={() => setMessengerOpen(false)}
        tool={AI_HUB_TOOLS.find((t) => t.id === "messenger")}
        dark={dark}
      />
      {editingTask && draft && <MobileEditModal ctx={ctx} />}
      {/* Nora's observations overlay */}
      {ctx.showObservations && (
        <NoraObservations
          metrics={ctx.dailyMetrics || {}}
          tasks={ctx.tasks || []}
          healthSummary={ctx.healthSummary}
          onClose={() => ctx.setShowObservations(false)}
          onAskNora={(message) => {
            ctx.setShowObservations(false);
            ctx.setChatInput(message);
            ctx.setChatOpen(true);
          }}
        />
      )}

      {/* Morning Check-Up overlay */}
      {ctx.showMorningCheckup && (
        <MorningCheckup
          dark={dark}
          glass={theme === "liquid_glass"}
          today={ctx.today}
          todayTasks={ctx.todayTasks || []}
          onComplete={ctx.handleCheckupComplete}
          onClose={() => { ctx.setShowMorningCheckup(false); ctx.setReviewCheckupMode && ctx.setReviewCheckupMode(false); }}
          viewOnly={ctx.reviewCheckupMode && !!ctx.morningCheckup}
          existingData={ctx.reviewCheckupMode ? ctx.morningCheckup : null}
          engineContext={{
            dailyMetrics: ctx.dailyMetrics, deferredTasks: ctx.deferredTasks,
            recoveryState: ctx.recoveryState, userPrefs: ctx.userPrefs,
            metrics: ctx.metrics, workloadForecast: ctx.workloadForecast,
            taskWeights: ctx.taskWeights, tasks: ctx.tasks,
            recoveryTrendDeclining3d: ctx.recoveryTrendDeclining3d, emotionalDrift: ctx.emotionalDrift,
          }}
          healthSleep={ctx.health?.context?.sleep ?? null}
          health={ctx.health}
          healthSummary={ctx.healthSummary}
          onAskAtlas={(message) => {
            ctx.setShowMorningCheckup(false);
            ctx.setReviewCheckupMode && ctx.setReviewCheckupMode(false);
            ctx.setAtlasOpen(true);
            ctx.sendAtlasMessage(message);
          }}
        />
      )}
      {rescheduleTask && (
        <MobileRescheduleModal
          task={rescheduleTask}
          onSave={saveReschedule}
          onClose={() => setRescheduleTask(null)}
        />
      )}
      {/* Focus session overlay */}
      {focusTask && (
        <FocusSession
          task={focusTask}
          dark={dark}
          userPrefs={userPrefs}
          setUserPrefs={setUserPrefs}
          notifSettings={ctx.notifSettings}
          showNotification={ctx.showNotification}
          onClose={(action) => {
            setFocusTask(null);
            if (action === "reschedule") setRescheduleTask(focusTask);
          }}
          onComplete={() => { toggleTask(focusTask.id); setFocusTask(null); }}
        />
      )}
      {/* Filter sheet — rendered at root to escape stacking context issues */}
      {showFilters && (
        <div className="mob-sheet-overlay" onClick={() => setShowFilters(false)}>
          <div className="mob-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="mob-modal-handle" />
            <div className="mob-sheet-header">
              <span className="mob-sheet-title">Filters</span>
              <CloseButton onClick={() => setShowFilters(false)} />
            </div>
            <div className="mob-sheet-section">
              <span className="mob-filter-lbl">Type</span>
              <div className="mob-filter-pills">
                {[["All",null],["Task","task"],["Deadline","deadline"],["Break","break"]].map(([l,v]) => (
                  <button key={l}
                    className={`mob-filter-pill${filterType===v?" active":""}`}
                    style={filterType===v && v ? { background:`${TYPE_COLORS[v]}18`, borderColor:`${TYPE_COLORS[v]}50`, color:TYPE_COLORS[v] } : {}}
                    onClick={() => setFilterType(v)}>{l}</button>
                ))}
              </div>
            </div>
            <div className="mob-sheet-section">
              <span className="mob-filter-lbl">Complexity</span>
              <div className="mob-filter-pills">
                {[["All",null],["Easy","easy"],["Medium","medium"],["Hard","hard"]].map(([l,v]) => (
                  <button key={l}
                    className={`mob-filter-pill${filterComplex===v?" active":""}`}
                    style={filterComplex===v && v ? { background:`${COMPLEX_COLORS[v]}18`, borderColor:`${COMPLEX_COLORS[v]}50`, color:COMPLEX_COLORS[v] } : {}}
                    onClick={() => setFilterComplex(v)}>{l}</button>
                ))}
              </div>
            </div>
            {groups.length > 0 && (
              <div className="mob-sheet-section">
                <span className="mob-filter-lbl">Group</span>
                <div className="mob-filter-pills">
                  <button className={`mob-filter-pill${!filterGroup?" active":""}`} onClick={() => setFilterGroup(null)}>All</button>
                  {groups.map(g => (
                    <button key={g.id}
                      className={`mob-filter-pill${filterGroup===g.id?" active":""}`}
                      style={filterGroup===g.id ? { background:g.color+"25", borderColor:g.color, color:g.color } : {}}
                      onClick={() => setFilterGroup(g.id)}>
                      <span style={{ display:"inline-block",width:7,height:7,borderRadius:"50%",background:g.color,marginRight:4 }} />
                      {g.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {hasFilters && (
              <button className="mob-filter-clear" style={{ margin:"8px 20px 12px", alignSelf:"flex-start" }}
                onClick={() => { setFilterType(null); setFilterGroup(null); setFilterComplex(null); }}>
                Clear all filters
              </button>
            )}
          </div>
        </div>
      )}

      {inAppAlert && (
        <div className="notif-toast" role="alert">
          <Bell size={18} className="notif-toast-icon" />
          <div className="notif-toast-text">
            <div className="notif-toast-title">{inAppAlert.title}</div>
            <div className="notif-toast-body">Starting in {inAppAlert.offset} min · {inAppAlert.timeStr}</div>
          </div>
          <CloseButton onClick={() => setInAppAlert(null)} size={22} />
        </div>
      )}

      {/* Notification permission banner — shown contextually */}
      {notifBannerVisible && (
        <NotificationPermissionBanner
          onAllow={requestNotifPermission}
          onLater={() => dismissNotifBanner(false)}
          onNever={() => dismissNotifBanner(true)}
        />
      )}

      {/* Share modal */}
      {sharingTask && (
        <ShareModal
          objectType={sharingTask.type === "deadline" ? "deadline" : "task"}
          objectData={sharingTask}
          sharedObjectId={sharingTask.sharedObjectId ?? null}
          session={session}
          onClose={() => setSharingTask?.(null)}
          onSharedObjectId={(id) => {
            ctx.setTasks?.((prev) => prev.map((t) =>
              t.id === sharingTask.id ? { ...t, sharedObjectId: id } : t
            ));
            setSharingTask?.((prev) => prev ? { ...prev, sharedObjectId: id } : null);
            ctx.setSharedObjects?.((prev) => {
              const object = { id, type: sharingTask.type === "deadline" ? "deadline" : "task", data: sharingTask, collaborators: [] };
              return prev.some(item => item.id === id) ? prev.map(item => item.id === id ? { ...item, ...object } : item) : [...prev, object];
            });
          }}
          onCollaboratorsChange={(id, collaborators) => {
            ctx.setSharedObjects?.((prev) => {
              const object = { id, type: sharingTask.type === "deadline" ? "deadline" : "task", data: sharingTask, collaborators };
              return prev.some(item => item.id === id) ? prev.map(item => item.id === id ? { ...item, ...object } : item) : [...prev, object];
            });
          }}
        />
      )}

      {ctx.showJoinCode && <JoinCodeModal onClose={() => ctx.setShowJoinCode?.(false)} onJoin={ctx.handleJoinCode} />}

      {/* Username nudge banner */}
      {ctx.showUsernameBanner && !ctx.showOnboarding && (
        <UsernameNudgeBanner
          onSetUp={() => { ctx.setShowUsernameBanner?.(false); ctx.setShowOnboarding?.(true); }}
          onLater={() => ctx.setShowUsernameBanner?.(false)}
        />
      )}

      {/* Username onboarding */}
      {ctx.showOnboarding && (
        <UsernameOnboarding
          displayName={ctx.userProfile?.name ?? ctx.accountName ?? ""}
          onComplete={(result) => {
            ctx.setShowOnboarding?.(false);
            ctx.setUserProfile?.((p) => ({ ...p, ...result }));
            if (result.name) ctx.setAccountName?.(result.name);
          }}
          onSkip={() => ctx.setShowOnboarding?.(false)}
        />
      )}

      {/* Profile modal */}
      {ctx.showProfileModal && (
        <ProfileModal
          session={session}
          onClose={() => ctx.setShowProfileModal?.(false)}
          onSaved={(updated) => {
            ctx.setUserProfile?.((p) => ({ ...p, ...updated }));
            if (updated.name) ctx.setAccountName?.(updated.name);
          }}
        />
      )}

      {/* Pricing modal */}
      {ctx.pricingOpen && (
        <PricingModal
          onClose={() => ctx.setPricingOpen?.(false)}
          currentPlan={ctx.subscription?.plan ?? "free"}
          userId={session?.user?.id}
          userEmail={session?.user?.email}
        />
      )}

    </div>
  );
}

// ── Swipe Row (right = done, left = reschedule) ───────────────
function SwipeRow({ children, onDone, onReschedule }) {
  const outerRef = useRef(null);
  const ts = useRef({ startX: 0, startY: 0, locked: null, dx: 0 });
  const [dx, setDx] = useState(0);
  const [flash, setFlash] = useState(null); // 'done' | 'reschedule'

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const onStart = (e) => {
      ts.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, locked: null, dx: 0 };
    };
    const onMove = (e) => {
      const s = ts.current;
      const ddx = e.touches[0].clientX - s.startX;
      const ddy = e.touches[0].clientY - s.startY;
      if (s.locked === null) {
        if (Math.abs(ddx) > 6 || Math.abs(ddy) > 6)
          s.locked = Math.abs(ddx) > Math.abs(ddy) ? 'h' : 'v';
        return;
      }
      if (s.locked === 'v') return;
      e.preventDefault();
      const clamped = Math.max(-120, Math.min(120, ddx));
      s.dx = clamped;
      setDx(clamped);
    };
    const onEnd = () => {
      const { locked, dx: d } = ts.current;
      if (locked !== 'h') { setDx(0); return; }
      if (d > 60) {
        setFlash('done'); setDx(0);
        setTimeout(() => { setFlash(null); onDone?.(); }, 300);
      } else if (d < -60) {
        setFlash('reschedule'); setDx(0);
        setTimeout(() => { setFlash(null); onReschedule?.(); }, 300);
      } else {
        setDx(0);
      }
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove',  onMove,  { passive: false });
    el.addEventListener('touchend',   onEnd,   { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove',  onMove);
      el.removeEventListener('touchend',   onEnd);
    };
  }, [onDone, onReschedule]); // eslint-disable-line

  return (
    <div ref={outerRef} className={`swipe-row${flash ? ` swipe-fl-${flash}` : ''}`}>
      <div className="swipe-bg swipe-bg-done"><Check size={16} /></div>
      <div className="swipe-bg swipe-bg-rsc"><RotateCcw size={16} /></div>
      <div className="swipe-inner"
        style={dx !== 0 ? { transform: `translateX(${dx}px)`, transition: 'none' } : undefined}>
        {children}
      </div>
    </div>
  );
}

// ── Day Summary strip ─────────────────────────────────────────
function DaySummary({ tasks, planDate, today, doneToday, totalToday, pct }) {
  const summary = buildDaySummary(tasks, planDate, today);
  const durationLabel = summary.durationMinutes >= 60
    ? `${Math.floor(summary.durationMinutes / 60)}h${summary.durationMinutes % 60 ? ` ${summary.durationMinutes % 60}m` : ""}`
    : summary.durationMinutes > 0 ? `${summary.durationMinutes}m` : "Open";
  const workloadLabel = {
    free: "Open",
    light: "Light",
    moderate: "Balanced",
    heavy: "Heavy",
  }[summary.workload];
  const completed = summary.isToday ? doneToday : summary.completedCount;
  const total = summary.isToday ? totalToday : summary.taskCount;
  const progress = summary.isToday ? pct : summary.progress;

  return (
    <section className="mob-day-summary" aria-label="Day workload">
      <div className="mob-ds-metrics">
        <div className="mob-ds-metric">
          <strong>{summary.taskCount}</strong>
          <span>{summary.taskCount === 1 ? "task" : "tasks"}</span>
        </div>
        <div className="mob-ds-metric">
          <strong>{durationLabel}</strong>
          <span>planned</span>
        </div>
        <div className={`mob-ds-metric mob-ds-wl-${summary.workload}`}>
          <strong>{workloadLabel}</strong>
          <span>workload</span>
        </div>
      </div>
      {total > 0 && (
        <div className="mob-ds-progress">
          <div className="mob-ds-bar">
            <div className="mob-ds-bar-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="mob-ds-pct">{completed} of {total} complete</span>
        </div>
      )}
    </section>
  );
}

// ── Plan view (Day / Month) ───────────────────────────────────
function MobilePlan({ ctx, subView, setSubView, dayMode, setDayMode,
                      filterType, filterGroup, filterComplex, hasFilters, onOpenFilters,
                      planDate, setPlanDate }) {
  const { today, tasks, doneToday, totalToday, pct } = ctx;
  const [zoomLevel, setZoomLevel] = useState(1);

  const shiftDate = (delta) => setPlanDate(shiftIsoDate(planDate, delta));
  const dateLabel = formatPlannerDate(planDate, today);

  // Filtered tasks for the selected plan date
  const planTasks = tasks.filter((t) => {
    if (t.date !== planDate) return false;
    if (filterType  && (t.type ?? "task") !== filterType)  return false;
    if (filterGroup && t.groupId !== filterGroup)           return false;
    if (filterComplex && t.complexity !== filterComplex)    return false;
    return true;
  });

  return (
    <div className="mob-plan">
      <div className="mob-plan-range">
        <NativeSegmentedControl
          label="Planner range"
          value={subView}
          onChange={(next) => {
            if (next !== subView) hapticSelection();
            setSubView(next);
          }}
          options={[
            { value: "day", label: "Day" },
            { value: "month", label: "Month" },
          ]}
        />
      </div>

      {subView === "day" && (
        <>
          <div className="mob-plan-date-row">
            <NativeIconButton label="Previous day" variant="tertiary" onClick={() => shiftDate(-1)}>
              <ChevronLeft size={20} />
            </NativeIconButton>
            <button
              type="button"
              className={`mob-date-label${planDate === today ? " is-today" : ""}`}
              onClick={() => setPlanDate(today)}
              aria-label={planDate === today ? "Today" : `Return to today from ${dateLabel.full}`}
            >
              <strong>{dateLabel.short}</strong>
              <span>{dateLabel.full}</span>
            </button>
            <NativeIconButton label="Next day" variant="tertiary" onClick={() => shiftDate(1)}>
              <ChevronRight size={20} />
            </NativeIconButton>
          </div>

          <div className="mob-day-controls">
            <NativeSegmentedControl
              className="mob-day-mode-row"
              label="Day layout"
              value={dayMode}
              onChange={(next) => {
                if (next !== dayMode) hapticSelection();
                setDayMode(next);
              }}
              options={[
                { value: "list", label: "Smart", icon: <BrandStar size={13} tone="current" /> },
                { value: "grid", label: "Timeline", icon: <BarChart2 size={13} /> },
              ]}
            />
            <NativeIconButton
              className={`mob-plan-filter-btn${hasFilters ? " active" : ""}`}
              label={hasFilters ? "Filters active" : "Filter plan"}
              variant="tertiary"
              onClick={onOpenFilters}
            >
              <SlidersHorizontal size={18} />
              {hasFilters && <span className="mob-filter-indicator" />}
            </NativeIconButton>
          </div>

          <DaySummary tasks={tasks} planDate={planDate} today={today}
            doneToday={doneToday} totalToday={totalToday} pct={pct} />

          {dayMode === "list"
            ? <MobileHome ctx={ctx} planDate={planDate} planTasks={planTasks} />
            : <MobileGrid ctx={{ ...ctx, todayTasks: planTasks, effectiveDate: planDate ?? today, zoomLevel, setZoomLevel }} />}
        </>
      )}

      {subView === "month" && <MobileMonth ctx={ctx} onSelectDate={(d) => { setPlanDate(d); setSubView("day"); }} />}

    </div>
  );
}

// ── Home view (Day smart mode) ───────────────────────────────
function MobileHome({ ctx, planDate, planTasks }) {
  const {
    todayTasks, today, aiFocus, contextMode, deferredTasks,
    toggleTask,
    setChatInput, setChatOpen, setEditingTask, setFocusTask,
    setRescheduleTask, groups, nowObj,
  } = ctx;

  const effectiveDate  = planDate ?? today;
  const effectiveTasks = planTasks ?? todayTasks;
  const nowMins = nowObj.getHours() * 60 + nowObj.getMinutes();
  const [expandedId, setExpandedId] = useState(null);
  const isToday = effectiveDate === today;
  const { scheduled, unscheduled, nextTask } = partitionDayTasks(
    effectiveTasks,
    nowMins,
    isToday,
  );
  const summary = buildDaySummary(effectiveTasks, effectiveDate, today);
  const recommendedTask = isToday
    ? aiFocus.priorityTask
    : nextTask || unscheduled.find((task) => !task.completed);
  const focusInsight = isToday
    ? aiFocus.insight
    : recommendedTask
      ? "This is the clearest starting point for the selected day."
      : "This day still has room for something meaningful.";
  const getGroup = (id) => groups.find((g) => g.id === id);

  const renderItem = (t, showTime) => {
    const tp    = t.type ?? "task";
    const group = getGroup(t.groupId);
    const gc    = tp === "deadline" ? "#ef4444"
                : tp === "break"    ? "#94a3b8"
                : group?.color ?? "var(--accent)";
    const tMins = t.startHour != null ? t.startHour * 60 + (t.startMinute ?? 0) : null;
    const isPast = tMins != null && tMins < nowMins && effectiveDate === today;
    const isNext = t === nextTask;
    const isExp  = expandedId === t.id;

    return (
      <SwipeRow key={t.id}
        onDone={tp === "task" ? () => { toggleTask(t.id); setExpandedId(null); } : undefined}
        onReschedule={() => { setRescheduleTask(t); setExpandedId(null); }}
      >
        <div
          className={`mai2${t.completed ? " mai2-done" : ""}${isPast && !t.completed ? " mai2-past" : ""}${isNext ? " mai2-next" : ""}${tp === "break" ? " mai2-break" : ""}${tp === "deadline" ? " mai2-dl" : ""}${isExp ? " mai2-open" : ""}`}
          style={{ "--gc": gc }}
          onClick={() => setExpandedId((p) => p === t.id ? null : t.id)}
        >
          <div className="mai2-main">
            {showTime && t.startHour != null && (
              <span className="mai2-time">{fmtTime(t.startHour, t.startMinute ?? 0)}</span>
            )}
            <div className="mai2-body">
              <span className="mai2-title">{t.title || (tp === "break" ? "Break" : "Deadline")}</span>
              <div className="mai2-meta">
                {t.duration && <span className="mai2-dur">{fmtDur(t.duration)}</span>}
                {group && (
                  <span className="mai2-group">
                    <span className="mai2-gdot" style={{ background: group.color }} />
                    {group.name}
                  </span>
                )}
                {isNext && <span className="mai2-badge">Up next</span>}
              </div>
            </div>
            {tp === "task" ? (
              <button className={`mai2-check${t.completed ? " done" : ""}`}
                onClick={(e) => { e.stopPropagation(); toggleTask(t.id); }}>
                {t.completed && <Check size={12} strokeWidth={3} />}
              </button>
            ) : (
              <span className="mai2-type-icon">
                {tp === "break" ? <Coffee size={13} /> : <Flag size={13} />}
              </span>
            )}
          </div>

          {isExp && (
            <div className="mai2-actions" onClick={(e) => e.stopPropagation()}>
              {tp === "task" && !t.completed && (
                <button className="mai2-act mai2-act-focus"
                  onClick={() => { setFocusTask(t); setExpandedId(null); }}>
                  <Zap size={13} /> Focus
                </button>
              )}
              {tp === "task" && (
                <button className={`mai2-act ${t.completed ? "mai2-act-undo" : "mai2-act-done"}`}
                  onClick={() => { toggleTask(t.id); setExpandedId(null); }}>
                  <Check size={13} /> {t.completed ? "Undo" : "Done"}
                </button>
              )}
              <button className="mai2-act mai2-act-move"
                onClick={() => { setRescheduleTask(t); setExpandedId(null); }}>
                <RotateCcw size={13} /> Move
              </button>
              <button className="mai2-act mai2-act-edit"
                onClick={() => { setEditingTask(t); setExpandedId(null); }}>
                <Pencil size={13} /> Edit
              </button>
            </div>
          )}
        </div>
      </SwipeRow>
    );
  };

  const askNoraAboutFocus = () => {
    setChatInput(recommendedTask
      ? `What's the best way to tackle "${recommendedTask.title}"${isToday ? " right now" : ` on ${effectiveDate}`}?`
      : `Help me plan ${isToday ? "today" : effectiveDate}.`);
    setChatOpen(true);
  };

  return (
    <div className="mob-home">
      <section className="mob-focus-card" aria-labelledby="mob-nora-focus-title">
        <div className="mob-focus-card-top">
          <div className="mob-focus-brand">
            <span className="mob-focus-brand-mark">
              <BrandStar size={15} tone="current" />
            </span>
            <span id="mob-nora-focus-title">Nora's focus</span>
          </div>
          <span className="mob-ctx-badge">{contextMode.label}</span>
        </div>

        {recommendedTask ? (
          <>
            <p className="mob-focus-eyebrow">{isToday ? "Best next move" : "Start here"}</p>
            <h2 className="mob-focus-title">{recommendedTask.title}</h2>
            {recommendedTask.startHour != null && (
              <p className="mob-focus-time">
                {fmtTime(recommendedTask.startHour, recommendedTask.startMinute ?? 0)}
                {recommendedTask.duration ? ` · ${fmtDur(recommendedTask.duration)}` : ""}
              </p>
            )}
          </>
        ) : (
          <h2 className="mob-focus-title mob-focus-empty">This day is open.</h2>
        )}

        <p className="mob-focus-insight">{focusInsight}</p>

        {summary.taskCount > 0 && (
          <div className="mob-progress-track">
            <div className="mob-progress-fill" style={{ width: `${summary.progress}%` }} />
          </div>
        )}

        <div className="mob-focus-actions">
          {recommendedTask && !recommendedTask.completed && (
            <NativeButton
              className="mob-btn mob-btn-done"
              leading={<Zap size={16} />}
              onClick={() => setFocusTask(recommendedTask)}
            >
              Start focus
            </NativeButton>
          )}
          {recommendedTask && (
            <NativeIconButton
              className="mob-btn-skip"
              label={recommendedTask.completed ? "Mark incomplete" : "Mark complete"}
              variant="tertiary"
              onClick={() => toggleTask(recommendedTask.id)}
            >
              <Check size={18} />
            </NativeIconButton>
          )}
          <NativeButton
            className="mob-btn mob-btn-ai"
            variant="secondary"
            leading={<MessageSquare size={16} />}
            onClick={askNoraAboutFocus}
          >
            Ask Nora
          </NativeButton>
        </div>
      </section>

      {/* Deferred nudge */}
      {isToday && deferredTasks.length > 0 && (
        <button className="mob-nudge-bar" onClick={() => {
          ctx.setPendingMobileView("tasks");
        }}>
          <RotateCcw size={14} />
          <span>{deferredTasks.length} task{deferredTasks.length > 1 ? "s" : ""} still pending — tap to reschedule</span>
          <ChevronRight size={14} />
        </button>
      )}

      {/* Scheduled */}
      {scheduled.length > 0 ? (
        <section className="mob-agenda2" aria-labelledby="mob-schedule-title">
          <div className="mob-section-title">
            <div><Clock size={15} /><h2 id="mob-schedule-title">Schedule</h2></div>
            <span>{scheduled.length}</span>
          </div>
          <div className="mob-agenda2-list">
            {scheduled.map((t) => renderItem(t, true))}
          </div>
        </section>
      ) : (
        <NativeEmptyState
          className="mob-empty-state"
          title="Nothing scheduled"
          description={isToday
            ? "Nora can turn your priorities into a plan you can review before anything changes."
            : "Add a task or ask Nora to prepare this day."}
          action={(
            <NativeButton
              className="mob-plan-cta"
              leading={<BrandStar size={15} tone="white" />}
              onClick={() => {
                setChatInput(`Plan ${isToday ? "my day today" : effectiveDate}. Consider my energy level and current workload.`);
                setChatOpen(true);
              }}
            >
              Preview a plan
            </NativeButton>
          )}
        />
      )}

      {/* Unscheduled */}
      {unscheduled.length > 0 && (
        <section className="mob-agenda2 mob-unsched-section" aria-labelledby="mob-unscheduled-title">
          <div className="mob-section-title">
            <div><List size={15} /><h2 id="mob-unscheduled-title">Unscheduled</h2></div>
            <span>{unscheduled.length}</span>
          </div>
          <div className="mob-agenda2-list">
            {unscheduled.map((t) => renderItem(t, false))}
          </div>
        </section>
      )}

      {/* Quick add */}
      <div className="mob-task-create-row">
        <NativeButton
          className="mob-quick-add"
          variant="secondary"
          leading={<Plus size={17} />}
          onClick={() => {
            ctx.setEditingTask({
              id: uid(), type: "task",
              title: "", date: effectiveDate,
              startHour: null, startMinute: null,
              duration: null, repeat: null, repeatEnd: null,
              completed: false, notes: "", complexity: null,
              groupId: null, reminderOffset: null,
            });
          }}
        >
          Add task
        </NativeButton>
        <NativeIconButton
          className="mob-join-task"
          label="Join a shared task"
          variant="tertiary"
          onClick={() => ctx.setShowJoinCode?.(true)}
        >
          <KeyRound size={18} />
        </NativeIconButton>
      </div>

    </div>
  );
}

// ── Grid view (timetable) — Google Calendar style ────────────
function MobileGrid({ ctx }) {
  const { todayTasks, groups, toggleTask, setEditingTask, setTasks, nowObj, effectiveDate, today, zoomLevel = 1, setZoomLevel } = ctx;
  const scrollRef = useRef(null);
  const gridRef   = useRef(null);

  // Pinch-to-zoom
  const [zoomHint, setZoomHint]  = useState(null); // null = hidden; number = % shown
  const pinchRef                 = useRef(null);    // { startDist, startZoom }
  const zoomHintTimerRef         = useRef(null);
  const zoomLevelRef             = useRef(zoomLevel);
  const setZoomRef               = useRef(setZoomLevel ?? (() => {}));
  // Keep refs current every render (stable setters — just being explicit)
  zoomLevelRef.current = zoomLevel;
  setZoomRef.current   = setZoomLevel ?? (() => {});

  // Layout constants — kept in a ref so the passive touchmove listener reads current values
  const PX_H = Math.round(64 * zoomLevel);
  const PX_M = PX_H / 60;

  const scheduled = [...todayTasks]
    .filter((t) => t.startHour != null)
    .sort((a, b) => a.startHour * 60 + (a.startMinute ?? 0) - (b.startHour * 60 + (b.startMinute ?? 0)));
  const unscheduled = todayTasks.filter((t) => t.startHour == null);
  const getGroup = (id) => groups.find((g) => g.id === id);

  // Always show 07:00–22:00 minimum; expand to fit tasks
  const firstH = scheduled.length
    ? Math.max(0, Math.min(7, scheduled[0].startHour - 1))
    : 7;
  const lastH = scheduled.length
    ? Math.min(24, Math.max(22, Math.ceil(Math.max(...scheduled.map(
        t => t.startHour + ((t.startMinute ?? 0) + (t.duration ?? 60)) / 60
      ))) + 1))
    : 22;
  const hours  = Array.from({ length: lastH - firstH + 1 }, (_, i) => firstH + i);
  const totalH = (lastH - firstH + 1) * PX_H;

  // Keep a ref of layout values so the passive touchmove handler (added once) sees current values
  const layoutRef = useRef({ firstH, PX_M, totalH });
  layoutRef.current = { firstH, PX_M, totalH };

  // Overlap columns
  const withCols = (() => {
    const res = scheduled.map(t => ({
      ...t,
      _s: t.startHour * 60 + (t.startMinute ?? 0),
      _e: t.startHour * 60 + (t.startMinute ?? 0) + (t.duration ?? 60),
      _col: 0, _nc: 1,
    }));
    const colEnd = [];
    for (const t of res) {
      let c = colEnd.findIndex(e => e <= t._s);
      if (c < 0) c = colEnd.length;
      colEnd[c] = t._e; t._col = c;
    }
    for (const t of res) {
      let nc = t._col + 1;
      for (const u of res) if (u._s < t._e && u._e > t._s) nc = Math.max(nc, u._col + 1);
      t._nc = nc;
    }
    return res;
  })();

  const nowMin  = nowObj.getHours() * 60 + nowObj.getMinutes();
  const nowTop  = (nowMin - firstH * 60) * PX_M;
  const showNow = effectiveDate === today && nowMin >= firstH * 60 && nowMin <= lastH * 60;

  // ── Drag state ───────────────────────────────────────────────
  const [dragId,      setDragId]      = useState(null);
  const [dragTop,     setDragTop]     = useState(0);
  const [dragTimeMin, setDragTimeMin] = useState(0);

  const dragStartRef  = useRef(null); // { taskId, startY, startX, origTop, origMin, origH, origM, dragging }
  const longPressRef  = useRef(null);
  const clickBlockRef = useRef(false); // prevents click from firing after drag ends

  // Non-passive touch handlers — must use addEventListener (React synthetic events are passive)
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const onStart = (e) => {
      if (e.touches.length !== 2) return;
      // Two fingers → start pinch; cancel any pending drag
      clearTimeout(longPressRef.current);
      dragStartRef.current = null;
      const [t0, t1] = [e.touches[0], e.touches[1]];
      const dx = t0.clientX - t1.clientX;
      const dy = t0.clientY - t1.clientY;
      pinchRef.current = {
        startDist: Math.sqrt(dx * dx + dy * dy),
        startZoom: zoomLevelRef.current,
      };
      e.preventDefault();
    };

    const onMove = (e) => {
      // ── Pinch zoom (2 fingers) ──────────────────────────
      if (e.touches.length === 2) {
        if (!pinchRef.current) return;
        e.preventDefault();
        const [t0, t1] = [e.touches[0], e.touches[1]];
        const dx  = t0.clientX - t1.clientX;
        const dy  = t0.clientY - t1.clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const raw  = pinchRef.current.startZoom * (dist / pinchRef.current.startDist);
        const next = parseFloat(Math.max(0.5, Math.min(3, raw)).toFixed(2));
        setZoomRef.current(next);
        // Show transient percentage indicator
        clearTimeout(zoomHintTimerRef.current);
        setZoomHint(Math.round(next * 100));
        zoomHintTimerRef.current = setTimeout(() => setZoomHint(null), 1200);
        return;
      }

      // ── Single-finger drag ──────────────────────────────
      const ref = dragStartRef.current;
      if (!ref) return;
      const touch = e.touches[0];
      if (!ref.dragging) {
        const dy = Math.abs(touch.clientY - ref.startY);
        const dx = Math.abs(touch.clientX - ref.startX);
        if (dy > 8 || dx > 8) {
          clearTimeout(longPressRef.current);
          dragStartRef.current = null;
        }
        return;
      }
      e.preventDefault();
      const { firstH: fH, PX_M: pxm, totalH: tH } = layoutRef.current;
      const dy     = touch.clientY - ref.startY;
      const newTop = Math.max(0, Math.min(tH - 36, ref.origTop + dy));
      const rawMin = fH * 60 + newTop / pxm;
      const snap   = Math.max(0, Math.min(1439, Math.round(rawMin / 5) * 5));
      setDragTop(newTop);
      setDragTimeMin(snap);
    };

    container.addEventListener("touchstart", onStart, { passive: false });
    container.addEventListener("touchmove",  onMove,  { passive: false });
    return () => {
      container.removeEventListener("touchstart", onStart);
      container.removeEventListener("touchmove",  onMove);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTaskTouchStart = useCallback((e, task) => {
    const touch   = e.touches[0];
    const origMin = task.startHour * 60 + (task.startMinute ?? 0);
    const { firstH: fH, PX_M: pxm } = layoutRef.current;
    const origTop = (origMin - fH * 60) * pxm;

    dragStartRef.current = {
      taskId: task.id,
      startY: touch.clientY,
      startX: touch.clientX,
      origTop,
      origMin,
      origH: task.startHour,
      origM: task.startMinute ?? 0,
      dragging: false,
    };

    clearTimeout(longPressRef.current);
    longPressRef.current = setTimeout(() => {
      const ref = dragStartRef.current;
      if (!ref || ref.taskId !== task.id) return;

      navigator.vibrate?.(50);
      ref.dragging = true;
      clickBlockRef.current = true;

      setDragId(task.id);
      setDragTop(origTop);
      setDragTimeMin(origMin);
    }, 300);
  }, []); // eslint-disable-line

  const handleContainerTouchEnd = useCallback((e) => {
    // End pinch when fewer than 2 fingers remain
    if (!e || e.touches.length < 2) pinchRef.current = null;

    clearTimeout(longPressRef.current);
    const ref = dragStartRef.current;
    dragStartRef.current = null;

    if (!ref?.dragging) {
      setDragId(null);
      return;
    }

    // Snap to 5-minute grid
    const h = Math.max(0, Math.min(23, Math.floor(dragTimeMin / 60)));
    const m = Math.min(55, Math.round((dragTimeMin % 60) / 5) * 5);

    if (h !== ref.origH || m !== ref.origM) {
      setTasks(p => p.map(t =>
        t.id === ref.taskId ? { ...t, startHour: h, startMinute: m } : t
      ));
    }

    setDragId(null);
    // Block the synthetic click that fires after touchend on mobile
    setTimeout(() => { clickBlockRef.current = false; }, 80);
  }, [dragTimeMin, setTasks]);

  // Tap on grid background → create task at that time
  const handleGridClick = useCallback((e) => {
    if (e.target !== gridRef.current) return;
    const rect     = gridRef.current.getBoundingClientRect();
    const y        = e.clientY - rect.top;
    const { firstH: fH, PX_M: pxm } = layoutRef.current;
    const totalMin = fH * 60 + Math.round(y / pxm);
    const h        = Math.max(0, Math.min(23, Math.floor(totalMin / 60)));
    const m        = Math.min(55, Math.round((totalMin % 60) / 5) * 5);
    setEditingTask({
      id: uid(), type: "task",
      title: "", date: effectiveDate ?? today,
      startHour: h, startMinute: m,
      duration: 60, repeat: null, repeatEnd: null,
      completed: false, notes: "", complexity: null,
      groupId: null, reminderOffset: null,
    });
  }, [setEditingTask, effectiveDate, today]);

  // Auto-scroll to now on mount
  useEffect(() => {
    if (scrollRef.current && showNow) {
      scrollRef.current.scrollTop = Math.max(0, nowTop - 100);
    }
  }, []); // eslint-disable-line

  const dragH = Math.max(0, Math.min(23, Math.floor(dragTimeMin / 60)));
  const dragM = dragTimeMin % 60;

  return (
    <div
      ref={scrollRef}
      className="mob-timetable"
      onTouchEnd={handleContainerTouchEnd}
      onTouchCancel={handleContainerTouchEnd}>

      {/* Pinch-zoom percentage indicator */}
      {zoomHint !== null && (
        <div className="mob-pinch-hint">{zoomHint}%</div>
      )}

      <div
        ref={gridRef}
        className="mob-tt-grid"
        style={{ height: totalH }}
        onClick={handleGridClick}>

        {/* Hour lines */}
        {hours.map(h => (
          <div key={h} className="mob-tt-hour" style={{ top: (h - firstH) * PX_H }}>
            <span className="mob-tt-hlabel">{fmtTime(h, 0)}</span>
            <span className="mob-tt-hline" />
          </div>
        ))}

        {/* Empty-day hint */}
        {scheduled.length === 0 && (
          <div className="mob-tt-empty-hint" style={{ top: (totalH / 2) - 20 }}>
            Tap to schedule a task
          </div>
        )}

        {/* Current time indicator */}
        {showNow && (
          <div className="mob-tt-now" style={{ top: nowTop }}>
            <span className="mob-tt-ndot" />
            <span className="mob-tt-nbar" />
          </div>
        )}

        {/* Drag time badge — shows current minute while dragging */}
        {dragId && (
          <div className="mob-tt-drag-badge" style={{ top: dragTop }}>
            {fmtTime(dragH, dragM)}
          </div>
        )}

        {/* Tasks */}
        {withCols.map(t => {
          const isDragging = dragId === t.id;
          const tp    = t.type ?? "task";
          const group = getGroup(t.groupId);
          const gc    = tp === "deadline" ? "#ef4444"
                      : tp === "break"    ? "#94a3b8"
                      : group?.color ?? "var(--accent)";
          const top       = isDragging ? dragTop : (t._s - firstH * 60) * PX_M;
          const height    = Math.max(6, (t._e - t._s) * PX_M - 2);
          const showTitle = height >= 18;
          const showMeta  = height >= 42;
          const isPast = effectiveDate === today && t._s < nowMin;
          const isNext = !isDragging && withCols.find(x => !x.completed && x._s >= nowMin) === t;

          return (
            <div key={t.id}
              className={[
                "mob-tt-task",
                height < 18     ? "tt-tiny"   : "",
                t.completed      ? "tt-done"  : "",
                isPast && !t.completed && !isDragging ? "tt-past"  : "",
                isNext           ? "tt-next"  : "",
                tp === "break"   ? "tt-break" : "",
                tp === "deadline"? "tt-dl"    : "",
                isDragging       ? "tt-dragging" : "",
              ].filter(Boolean).join(" ")}
              style={{
                top, height,
                "--gc":  gc,
                "--col": isDragging ? 0 : t._col,
                "--nc":  isDragging ? 1 : t._nc,
              }}
              onClick={() => {
                if (clickBlockRef.current) return;
                setEditingTask(t);
              }}
              onTouchStart={(e) => handleTaskTouchStart(e, t)}>
              {isDragging && <div className="mob-tt-drag-bar" />}
              <div className="mob-tt-inner">
                {showTitle && (
                  <span className="mob-tt-title">
                    {t.title || (tp === "break" ? "Break" : "Deadline")}
                  </span>
                )}
                {showMeta && (
                  <span className="mob-tt-meta">
                    {fmtTime(
                      isDragging ? dragH : t.startHour,
                      isDragging ? dragM : (t.startMinute ?? 0)
                    )}{t.duration ? ` · ${fmtDur(t.duration)}` : ""}
                  </span>
                )}
              </div>
              {tp === "task" && !isDragging && showTitle && (
                <button className={`mob-tt-cb${t.completed ? " done" : ""}`}
                  onClick={e => { e.stopPropagation(); toggleTask(t.id); }}>
                  {t.completed && <Check size={9} strokeWidth={3} />}
                </button>
              )}
              {tp === "deadline" && showTitle && <span className="mob-tt-dl-icon"><Flag size={10}/></span>}
            </div>
          );
        })}
      </div>

      {/* Unscheduled tasks */}
      {unscheduled.length > 0 && (
        <div className="mob-tt-unsched">
          <p className="mob-tt-usec-lbl">Unscheduled</p>
          {unscheduled.map(t => {
            const tp    = t.type ?? "task";
            const group = getGroup(t.groupId);
            const gc    = tp === "deadline" ? "#ef4444"
                        : tp === "break"    ? "#94a3b8"
                        : group?.color ?? "var(--accent)";
            return (
              <div key={t.id}
                className={`mob-tt-ui${t.completed ? " tt-done" : ""}`}
                style={{ "--gc": gc }}
                onClick={() => setEditingTask(t)}>
                <span className="mob-tt-title" style={{ flex: 1 }}>
                  {t.title || (tp === "break" ? "Break" : "Task")}
                </span>
                {tp === "task" && (
                  <button className={`mob-tt-cb${t.completed ? " done" : ""}`}
                    onClick={e => { e.stopPropagation(); toggleTask(t.id); }}>
                    {t.completed && <Check size={9} strokeWidth={3} />}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Month / Calendar view ────────────────────────────────────
function MobileMonth({ ctx, onSelectDate }) {
  const { tasks, today, setEditingTask } = ctx;
  const [cur, setCur] = useState(() => {
    const [y, m] = today.split("-");
    return { year: Number(y), month: Number(m) - 1 };
  });
  const [sel, setSel] = useState(today);

  const { year, month } = cur;
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7; // 0=Mon … 6=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const taskMap = {};
  tasks.forEach((t) => {
    if (!taskMap[t.date]) taskMap[t.date] = [];
    taskMap[t.date].push(t);
  });

  const shiftMonth = (delta) => {
    let nextMonth = month + delta;
    let nextYear = year;
    if (nextMonth < 0) { nextMonth = 11; nextYear--; }
    if (nextMonth > 11) { nextMonth = 0; nextYear++; }
    setCur({ year: nextYear, month: nextMonth });
    const nextMonthPrefix = `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}`;
    setSel(today.startsWith(nextMonthPrefix) ? today : `${nextMonthPrefix}-01`);
  };

  const cells = Array.from({ length: Math.ceil((firstDay + daysInMonth) / 7) * 7 }, (_, i) => {
    const day = i - firstDay + 1;
    if (day < 1 || day > daysInMonth) return null;
    const ds = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return { day, ds, ts: taskMap[ds] || [] };
  });

  const selTasks = taskMap[sel] || [];
  const selectedDateLabel = formatPlannerDate(sel, today);

  return (
    <div className="mob-month-view">
      <div className="mob-month-nav">
        <NativeIconButton
          className="mob-month-nav-btn"
          label="Previous month"
          variant="tertiary"
          onClick={() => shiftMonth(-1)}
        >
          <ChevronLeft size={20} />
        </NativeIconButton>
        <h2 className="mob-month-title">{MONTHS[month]} {year}</h2>
        <NativeIconButton
          className="mob-month-nav-btn"
          label="Next month"
          variant="tertiary"
          onClick={() => shiftMonth(1)}
        >
          <ChevronRight size={20} />
        </NativeIconButton>
      </div>

      <div className="mob-cal-grid" aria-label={`${MONTHS[month]} ${year}`}>
        {["Mo","Tu","We","Th","Fr","Sa","Su"].map((d) => (
          <div key={d} className="mob-cal-dow">{d}</div>
        ))}
        {cells.map((cell, i) => {
          if (!cell) return <div key={i} className="mob-cal-empty" />;
          const { day, ds, ts } = cell;
          const isToday = ds === today;
          const isSel = ds === sel;
          const hasDl      = ts.some((t) => t.type === "deadline");
          const doneCount  = ts.filter((t) => t.completed && t.type !== "break").length;
          const pendCount  = ts.filter((t) => !t.completed && t.type !== "break" && t.type !== "deadline").length;
          return (
            <button
              key={ds}
              type="button"
              className={`mob-cal-cell${isToday ? " mob-cal-today" : ""}${isSel ? " mob-cal-sel" : ""}`}
              aria-label={`${MONTHS[month]} ${day}, ${year}${ts.length ? `, ${ts.length} item${ts.length === 1 ? "" : "s"}` : ""}`}
              aria-pressed={isSel}
              onClick={() => setSel(ds)}
            >
              <span className="mob-cal-num">{day}</span>
              <div className="mob-cal-dots">
                {hasDl && <span className="mob-dot mob-dot-dl" />}
                {doneCount > 0 && <span className="mob-dot mob-dot-done" />}
                {pendCount > 0 && <span className="mob-dot" />}
              </div>
            </button>
          );
        })}
      </div>

      <div className="mob-cal-day-panel">
        <div className="mob-cal-day-header">
          <div>
            <span className="mob-cal-day-eyebrow">
              <CalendarDays size={13} />
              {selectedDateLabel.short}
            </span>
            <h3>{selectedDateLabel.full}</h3>
            <span className="mob-cal-task-count">
              {selTasks.length} item{selTasks.length !== 1 ? "s" : ""}
            </span>
          </div>
          {onSelectDate && (
            <NativeButton
              className="mob-cal-view-day-btn"
              variant="tertiary"
              size="compact"
              onClick={() => onSelectDate(sel)}
            >
              View day
            </NativeButton>
          )}
        </div>
        {selTasks.length === 0 ? (
          <p className="mob-cal-empty-msg">Nothing planned</p>
        ) : (
          selTasks.map((t) => {
            const tp = t.type ?? "task";
            const color = tp === "deadline" ? "#ef4444" : tp === "break" ? "#94a3b8" : "var(--accent)";
            return (
              <button
                key={t.id}
                type="button"
                className={`mob-cal-task-row${t.completed ? " done" : ""}`}
                style={{ "--cal-task-color": color }}
                onClick={() => setEditingTask(t)}
              >
                <span className="mob-cal-task-name">{t.title || (tp === "break" ? "Break" : "Deadline")}</span>
                {t.startHour != null && <span className="mob-cal-task-time">{fmtTime(t.startHour, t.startMinute ?? 0)}</span>}
                <ChevronRight size={14} aria-hidden="true" />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Tasks view ───────────────────────────────────────────────
export function MobileTasks({ ctx }) {
  const { tasks, today, toggleTask, skipTask, setRescheduleTask, setEditingTask, groups, setFocusTask,
          setSharingTask } = ctx;
  const [filterType, setFilterType]       = useState(null);
  const [filterGroup, setFilterGroup]     = useState(null);
  const [filterComplex, setFilterComplex] = useState(null);
  const [showFilters, setShowFilters]     = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [actionTask, setActionTask]       = useState(null);

  const getGroup = (id) => groups.find((g) => g.id === id);

  const sorted = [...tasks]
    .filter((t) => {
      if (filterType   && (t.type ?? "task") !== filterType)     return false;
      if (filterGroup  && t.groupId !== filterGroup)              return false;
      if (filterComplex && t.complexity !== filterComplex)        return false;
      return true;
    })
    .sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      const at = a.startHour != null ? a.startHour * 60 + (a.startMinute ?? 0) : 9999;
      const bt = b.startHour != null ? b.startHour * 60 + (b.startMinute ?? 0) : 9999;
      return at - bt;
    });

  const hasFilters = filterType || filterGroup || filterComplex;

  const active    = sorted.filter((t) => !t.completed);
  const completed = sorted
    .filter((t) => t.completed)
    .sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      const at = a.startHour != null ? a.startHour * 60 + (a.startMinute ?? 0) : -1;
      const bt = b.startHour != null ? b.startHour * 60 + (b.startMinute ?? 0) : -1;
      return bt - at;
    });

  const runTaskAction = (task, actionId) => {
    if (!task) return;
    if (actionId === "focus") setFocusTask(task);
    else if (actionId === "skip") skipTask(task.id);
    else if (actionId === "move") setRescheduleTask(task);
    else if (actionId === "share") setSharingTask?.(task);
    setActionTask(null);
  };

  const openTaskActions = async (task, event) => {
    event.stopPropagation();
    hapticLight();
    if (!isNativeActionMenuAvailable()) {
      setActionTask(task);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    let selectedId;
    try {
      selectedId = await showNativeActionMenu({
        actions: [
          { id: "focus", label: "Start Focus Session" },
          { id: "skip", label: "Skip to Tomorrow" },
          { id: "move", label: "Move Task" },
          { id: "share", label: task.sharedObjectId ? "Manage Sharing" : "Share" },
        ],
        sourceRect: { x: rect.left, y: rect.top, width: rect.width, height: rect.height },
      });
    } catch {
      return;
    }
    runTaskAction(task, selectedId);
  };

  // Group active tasks by date
  const tomorrow = (() => {
    const d = new Date(today + "T00:00:00");
    d.setDate(d.getDate() + 1);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  })();

  const deferred = active.filter((t) => t.date < today);
  const todayItems = active.filter((t) => t.date === today);
  const tomorrowItems = active.filter((t) => t.date === tomorrow);
  const future = active.filter((t) => t.date > tomorrow);

  // Group future tasks by date
  const futureByDate = [];
  let lastFutureDate = null;
  future.forEach((t) => {
    if (t.date !== lastFutureDate) {
      futureByDate.push({ date: t.date, items: [] });
      lastFutureDate = t.date;
    }
    futureByDate[futureByDate.length - 1].items.push(t);
  });

  const renderTask = (t) => {
    const tp    = t.type ?? "task";
    const group = getGroup(t.groupId);
    const gc    = tp === "deadline" ? "#ef4444"
                : tp === "break"    ? "#94a3b8"
                : group?.color ?? "var(--accent)";
    const isDeferred = !t.completed && t.date < today;
    return (
      <div key={t.id}
        className={`mob-task-row${t.completed ? " mtr-done" : ""}${isDeferred ? " mtr-deferred" : ""}`}
        style={{ "--gc": gc }}
        role="button"
        tabIndex={0}
        aria-label={`Edit ${t.title || (tp === "break" ? "break" : "deadline")}`}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setEditingTask(t);
          }
        }}
        onClick={() => setEditingTask(t)}>

        <div className="mtr-left">
          {tp === "task" ? (
            <button className={`mob-check${t.completed ? " checked" : ""}`}
              onClick={(e) => { e.stopPropagation(); toggleTask(t.id); }}>
              {t.completed && <Check size={13} strokeWidth={3} />}
            </button>
          ) : (
            <span className="mtr-icon">
              {tp === "deadline"
                ? <Flag size={15} style={{ color: t.completed ? "#22c55e" : "#ef4444" }} />
                : <Coffee size={14} style={{ color: "#94a3b8" }} />}
            </span>
          )}
        </div>

        <div className="mtr-body">
          <span className="mtr-title">{shortTitle(t.title) || (tp === "break" ? "Break" : "Deadline")}</span>
          <span className="mtr-meta">
            {t.startHour != null && <span>{fmtTime(t.startHour, t.startMinute ?? 0)} </span>}
            {t.duration && <span>{fmtDur(t.duration)}</span>}
          </span>
        </div>

        {tp === "deadline" && (
          <div className="mtr-actions" onClick={(e) => e.stopPropagation()}>
            <NativeIconButton
              label={t.completed ? "Mark deadline incomplete" : "Complete deadline"}
              size="compact"
              className={`mtr-act mtr-act-done-dl${t.completed ? " dl-done" : ""}`}
              onClick={() => toggleTask(t.id)}>
              <Check size={13} />
            </NativeIconButton>
          </div>
        )}
        {tp === "task" && !t.completed && (
          <div className="mtr-actions" onClick={(e) => e.stopPropagation()}>
            <NativeIconButton
              label={`More actions for ${t.title || "task"}`}
              size="compact"
              className="mtr-act"
              onClick={(event) => openTaskActions(t, event)}
            >
              <MoreHorizontal size={17} />
            </NativeIconButton>
          </div>
        )}
      </div>
    );
  };

  const DaySection = ({ label, items, accent }) => {
    if (!items.length) return null;
    return (
      <section className="mob-tasks-day-group">
        <div className={`mob-tasks-day-header${accent ? " mob-day-hdr-accent" : ""}`}>{label}
          <span className="mob-tasks-day-count">{items.length}</span>
        </div>
        <div className="mob-tasks-list">{items.map((t) => renderTask(t))}</div>
      </section>
    );
  };

  const fmt = (ds) => {
    const d = new Date(ds + "T00:00:00");
    return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  };

  return (
    <>
      <div className="mob-tasks">
      <div className="mob-page-summary">
        <div>
          <span className="mob-page-summary__eyebrow">Your workload</span>
          <strong>{active.length} active</strong>
        </div>
        <span className="mob-page-summary__meta">
          {deferred.length ? `${deferred.length} pending` : "Up to date"}
        </span>
      </div>

      {/* Filter bar */}
      <div className="mob-filter-bar">
        <NativeButton
          variant={showFilters || hasFilters ? "secondary" : "tertiary"}
          size="compact"
          leading={<SlidersHorizontal size={15} />}
          className={`mob-filter-toggle${showFilters ? " active" : ""}${hasFilters ? " has-active" : ""}`}
          onClick={() => setShowFilters(f => !f)}>
          Filters{hasFilters ? " · Active" : ""}
        </NativeButton>
        {hasFilters && (
          <NativeButton
            variant="tertiary"
            size="compact"
            className="mob-filter-clear"
            onClick={() => { setFilterType(null); setFilterGroup(null); setFilterComplex(null); }}
          >
            Clear
          </NativeButton>
        )}
      </div>
      {showFilters && (
        <div className="mob-filters-panel">
          {/* Type */}
          <div className="mob-filter-section">
            <span className="mob-filter-lbl">Type</span>
            <div className="mob-filter-pills">
              {[["All", null], ["Task", "task"], ["Deadline", "deadline"], ["Break", "break"]].map(([l, v]) => (
                <button key={l} className={`mob-filter-pill${filterType === v ? " active" : ""}`}
                  onClick={() => setFilterType(v)}>{l}</button>
              ))}
            </div>
          </div>
          {/* Complexity */}
          <div className="mob-filter-section">
            <span className="mob-filter-lbl">Complexity</span>
            <div className="mob-filter-pills">
              {[["All", null], ["Easy", "easy"], ["Medium", "medium"], ["Hard", "hard"]].map(([l, v]) => (
                <button key={l} className={`mob-filter-pill${filterComplex === v ? " active" : ""}`}
                  onClick={() => setFilterComplex(v)}>{l}</button>
              ))}
            </div>
          </div>
          {/* Groups */}
          {groups.length > 0 && (
            <div className="mob-filter-section">
              <span className="mob-filter-lbl">Group</span>
              <div className="mob-filter-pills">
                <button className={`mob-filter-pill${!filterGroup ? " active" : ""}`} onClick={() => setFilterGroup(null)}>All</button>
                {groups.map(g => (
                  <button key={g.id} className={`mob-filter-pill${filterGroup === g.id ? " active" : ""}`}
                    style={filterGroup === g.id ? { background: g.color + "25", borderColor: g.color, color: g.color } : {}}
                    onClick={() => setFilterGroup(g.id)}>
                    <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: g.color, marginRight: 4 }} />
                    {g.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {sorted.length === 0 ? (
        <NativeEmptyState
          icon={<CalendarDays size={27} />}
          title={hasFilters ? "No matching tasks" : "No tasks yet"}
          description={hasFilters
            ? "Try clearing a filter to see the rest of your workload."
            : "Add your first task and Nora will help you position it."}
        />
      ) : (
        <>
          {deferred.length > 0 && (
            <section className="mob-tasks-day-group">
              <div className="mob-tasks-day-header mob-day-hdr-deferred">
                Pending <span className="mob-tasks-day-count">{deferred.length}</span>
              </div>
              <div className="mob-tasks-list">{deferred.map((t) => renderTask(t))}</div>
            </section>
          )}
          <DaySection label="Today" items={todayItems} accent />
          <DaySection label="Tomorrow" items={tomorrowItems} />
          {futureByDate.map(({ date, items }) => (
            <DaySection key={date} label={fmt(date)} items={items} />
          ))}
        </>
      )}

      <div className="mob-task-create-row">
        <NativeButton className="mob-quick-add" leading={<Plus size={18} />} onClick={() => {
          ctx.setEditingTask({
            id: uid(), type: "task", title: "", date: today,
            startHour: null, startMinute: null, duration: null,
            repeat: null, repeatEnd: null, completed: false,
            notes: "", complexity: null, groupId: null, reminderOffset: null,
          });
        }}>
          Add task
        </NativeButton>
        <NativeButton
          variant="secondary"
          className="mob-join-task"
          leading={<KeyRound size={17} />}
          onClick={() => ctx.setShowJoinCode?.(true)}
        >
          Join task
        </NativeButton>
      </div>

      {completed.length > 0 && (
        <section className={`mob-completed-archive${showCompleted ? " is-open" : ""}`}>
          <button
            type="button"
            className="mob-completed-toggle"
            aria-expanded={showCompleted}
            aria-controls="mob-completed-task-list"
            onClick={() => {
              hapticSelection();
              setShowCompleted((visible) => !visible);
            }}
          >
            <span className="mob-completed-toggle-copy">
              <span className="mob-completed-toggle-icon" aria-hidden="true">
                <Check size={14} strokeWidth={2.5} />
              </span>
              <span>
                <strong>Completed</strong>
                <small>{showCompleted ? "Hide finished work" : "Show finished work"}</small>
              </span>
            </span>
            <span className="mob-completed-toggle-end">
              <span className="mob-tasks-day-count">{completed.length}</span>
              <ChevronDown className="mob-completed-chevron" size={17} />
            </span>
          </button>
          {showCompleted && (
            <div id="mob-completed-task-list" className="mob-tasks-list mob-completed-list">
              {completed.map((t) => renderTask(t))}
            </div>
          )}
        </section>
      )}
      </div>

      <NativeSheet
        open={Boolean(actionTask)}
        onClose={() => setActionTask(null)}
        title={actionTask?.title || "Task actions"}
        subtitle="Choose what you want to do next."
        className="mob-task-actions-sheet"
      >
        <NativeSection grouped>
          <NativeListRow
            leading={<Zap size={17} />}
            title="Start Focus Session"
            subtitle="Work on this task without distractions"
            onClick={() => runTaskAction(actionTask, "focus")}
          />
          <NativeListRow
            leading={<SkipForward size={17} />}
            title="Skip to Tomorrow"
            subtitle="Move it forward by one day"
            onClick={() => runTaskAction(actionTask, "skip")}
          />
          <NativeListRow
            leading={<CalendarDays size={17} />}
            title="Move Task"
            subtitle="Choose a better date and time"
            onClick={() => runTaskAction(actionTask, "move")}
          />
          <NativeListRow
            leading={actionTask?.sharedObjectId ? <Users size={17} /> : <Share2 size={17} />}
            title={actionTask?.sharedObjectId ? "Manage Sharing" : "Share Task"}
            subtitle="Collaborate without duplicating the task"
            onClick={() => runTaskAction(actionTask, "share")}
          />
        </NativeSection>
      </NativeSheet>
    </>
  );
}

// ── Notes view ───────────────────────────────────────────────
function MobileNotes({ ctx }) {
  const { notes, setNotes, deleteNote, patchNote } = ctx;
  const [openId,      setOpenId]      = useState(null);
  const [deletingId,  setDeletingId]  = useState(null);
  const [newNoteId,   setNewNoteId]   = useState(null);
  const [noteSearch,  setNoteSearch]  = useState("");
  const [actionNote,  setActionNote]  = useState(null);

  const openNote = openId ? notes.find(n => n.id === openId) : null;
  const migrated = openNote ? migrateNote(openNote) : null;

  const closeNote = () => {
    if (openNote) {
      const m = migrateNote(openNote);
      const isEmpty = !m.title?.trim() && !m.content?.trim() && !m.items?.length;
      const justCreated = (Date.now() - (openNote.createdAt ?? 0)) < 30_000;
      if (isEmpty && justCreated) deleteNote(openNote.id);
    }
    setOpenId(null);
  };

  const handleDelete = (id) => {
    setDeletingId(id);
    if (openId === id) setOpenId(null);
    setTimeout(() => { deleteNote(id); setDeletingId(null); }, 200);
  };

  const handleCreate = (type = "note") => {
    const n = { id: uid(), type, title: "", content: "", items: [], color: "cream", pinned: false, starred: false, createdAt: Date.now(), updatedAt: Date.now() };
    setNotes(p => [...p, n]);
    setNewNoteId(n.id);
    setTimeout(() => setNewNoteId(null), 400);
    setOpenId(n.id);
  };

  const migratedNotes = notes.map(migrateNote);
  const filtered = migratedNotes.filter(n => {
    if (!noteSearch) return true;
    const q = noteSearch.toLowerCase();
    return n.title?.toLowerCase().includes(q) ||
           n.content?.toLowerCase().includes(q) ||
           n.items?.some(i => i.text?.toLowerCase().includes(q));
  });
  const sorted = [...filtered].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.starred !== b.starred) return a.starred ? -1 : 1;
    return (b.updatedAt ?? b.createdAt ?? 0) - (a.updatedAt ?? a.createdAt ?? 0);
  });
  const pinnedNotes = sorted.filter(n => n.pinned);
  const otherNotes  = sorted.filter(n => !n.pinned);

  const renderNoteCard = (note) => (
    <NoteCard
      key={note.id}
      note={note}
      deleting={deletingId === note.id}
      isNew={newNoteId === note.id}
      onClick={() => setOpenId(note.id)}
      onDelete={() => handleDelete(note.id)}
      onPin={() => patchNote(note.id, { pinned: !note.pinned })}
      onStar={() => patchNote(note.id, { starred: !note.starred })}
      onMore={() => setActionNote(note)}
    />
  );

  const renderNoteList = (noteList) => (
    <div className="mob-notes-list">{noteList.map(renderNoteCard)}</div>
  );

  const [firstType, ...typeShortcuts] = NOTE_TYPE_DEFS;

  return (
    <>
      <div className="mob-notes-v2">
        <div className="mob-page-summary">
          <div>
            <span className="mob-page-summary__eyebrow">Your library</span>
            <strong>{sorted.length} {sorted.length === 1 ? "note" : "notes"}</strong>
          </div>
          <span className="mob-page-summary__meta">
            {pinnedNotes.length ? `${pinnedNotes.length} pinned` : "Ready to capture"}
          </span>
        </div>

        {/* ── New-note creation bar ── */}
        <div className="mob-notes-newbar">
          <NativeButton
            className="mob-notes-newbar-main"
            leading={<firstType.icon size={17} />}
            onClick={() => handleCreate("note")}
          >
            New note
          </NativeButton>
          <div className="mob-notes-newbar-divider" />
          <div className="mob-notes-newbar-types">
            {typeShortcuts.map(t => {
              const Icon = t.icon;
              return (
                <NativeIconButton
                  key={t.key}
                  label={`Create ${t.label}`}
                  size="compact"
                  variant="tertiary"
                  className="mob-notes-newbar-type-btn"
                  onClick={() => handleCreate(t.key)}
                >
                  <Icon size={15} />
                </NativeIconButton>
              );
            })}
          </div>
        </div>

        {/* Search */}
        <NativeField
          className="mob-notes-search-bar"
          value={noteSearch}
          onChange={e => setNoteSearch(e.target.value)}
          placeholder="Search notes"
          aria-label="Search notes"
          leading={<Search size={16} />}
          trailing={noteSearch && (
            <NativeIconButton
              label="Clear note search"
              size="compact"
              className="mob-notes-search-clear"
              onClick={() => setNoteSearch("")}
            >
              <X size={14} />
            </NativeIconButton>
          )}
        />

        {/* Empty state */}
        {sorted.length === 0 && (
          <NativeEmptyState
            icon={<FileText size={27} />}
            title={noteSearch ? "No matching notes" : "A quiet place for ideas"}
            description={noteSearch
              ? "Try another phrase or clear the search."
              : "Capture a thought, checklist, shopping list, or idea."}
          />
        )}

        {/* Pinned section */}
        {pinnedNotes.length > 0 && (
          <>
            <div className="mob-notes-section-hdr">Pinned</div>
            {renderNoteList(pinnedNotes)}
          </>
        )}

        {/* Other notes */}
        {otherNotes.length > 0 && (
          <>
            {pinnedNotes.length > 0 && <div className="mob-notes-section-hdr">Notes</div>}
            {renderNoteList(otherNotes)}
          </>
        )}
      </div>

      {/* Note editor — bottom sheet, outside scroll container */}
      {migrated && (
        <NoteEditor
          note={migrated}
          isMobile={true}
          onPatch={fields => patchNote(openNote.id, fields)}
          onDelete={() => handleDelete(openNote.id)}
          onClose={closeNote}
        />
      )}

      <NativeSheet
        open={Boolean(actionNote)}
        onClose={() => setActionNote(null)}
        title={actionNote?.title || "Note actions"}
        subtitle="Organize this note or remove it."
      >
        <NativeSection grouped>
          <NativeListRow
            leading={<Pin size={17} />}
            title={actionNote?.pinned ? "Unpin Note" : "Pin Note"}
            subtitle="Control whether it stays at the top"
            onClick={() => {
              if (actionNote) patchNote(actionNote.id, { pinned: !actionNote.pinned });
              setActionNote(null);
            }}
          />
          <NativeListRow
            leading={<Star size={17} />}
            title={actionNote?.starred ? "Remove Star" : "Star Note"}
            subtitle="Mark it as especially important"
            onClick={() => {
              if (actionNote) patchNote(actionNote.id, { starred: !actionNote.starred });
              setActionNote(null);
            }}
          />
          <NativeListRow
            destructive
            leading={<Trash2 size={17} />}
            title="Delete Note"
            subtitle="This cannot be undone"
            onClick={() => {
              if (actionNote) handleDelete(actionNote.id);
              setActionNote(null);
            }}
          />
        </NativeSection>
      </NativeSheet>
    </>
  );
}

// ── Settings view ────────────────────────────────────────────
function MobNameEditor({ name, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState(name ?? "");
  const inputRef = useRef(null);

  const startEdit = () => { setDraft(name ?? ""); setEditing(true); setTimeout(() => inputRef.current?.focus(), 60); };
  const confirm   = () => { onSave(draft.trim()); setEditing(false); };
  const cancel    = () => setEditing(false);

  if (editing) return (
    <div className="mob-name-editor-row">
      <input ref={inputRef} className="mob-name-input" value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") confirm(); if (e.key === "Escape") cancel(); }}
        placeholder="Your name" />
      <NativeIconButton label="Save name" size="compact" className="mob-name-confirm" onClick={confirm}>
        <Check size={14} strokeWidth={3} />
      </NativeIconButton>
      <NativeIconButton label="Cancel name edit" size="compact" className="mob-name-cancel" onClick={cancel}>
        <X size={14} />
      </NativeIconButton>
    </div>
  );

  return (
    <div className="mob-name-editor-row">
      <span className="mob-sett-display-name">{name || "No name set"}</span>
      <NativeIconButton label="Edit name" size="compact" className="mob-name-pencil" onClick={startEdit}>
        <Pencil size={13} />
      </NativeIconButton>
    </div>
  );
}

const GROUP_PRESET_COLORS = ["#ef4444","#f97316","#eab308","#22c55e","#06b6d4","#3b82f6","#8b5cf6","#ec4899"];

function MobileSettings({ ctx }) {
  const { t, i18n } = useTranslation();
  const {
    accountName, setAccountName,
    reminderMins, setReminderMins,
    session, groups, setGroups,
    notifPermission, notifSettings, updateNotifSettings, requestNotifPermission,
    userProfile, setShowProfileModal,
    assistantSettings, updateAssistantSettings,
  } = ctx;

  const [newGroupName,  setNewGroupName]  = useState("");
  const [newGroupColor, setNewGroupColor] = useState(GROUP_PRESET_COLORS[0]);

  const addGroup = () => {
    const name = newGroupName.trim();
    if (!name) return;
    if (groups.some(g => g.name.toLowerCase() === name.toLowerCase())) return;
    setGroups(g => [...g, { id: uid(), name, color: newGroupColor }]);
    setNewGroupName("");
  };
  const deleteGroup = (id) => {
    if (id === "private" || id === "work") return;
    setGroups(g => g.filter(x => x.id !== id));
  };

  return (
    <div className="mob-settings">
      <div className="mob-page-summary">
        <div>
          <span className="mob-page-summary__eyebrow">Your Nora</span>
          <strong>Personal settings</strong>
        </div>
        <span className="mob-page-summary__meta">Private to you</span>
      </div>

      {/* Profile */}
      <NativeSection
        className="mob-sett-card"
        title={<span className="mob-sett-section-title"><User size={15} /> {t("account.profile")}</span>}
      >
        <div className="mob-sett-avatar-row">
          <button className="mob-sett-avatar-btn" onClick={() => setShowProfileModal?.(true)}>
            <AvatarDisplay avatar={profileToAvatar(userProfile)} size={44} />
          </button>
          <div className="mob-sett-avatar-info">
            <MobNameEditor name={accountName} onSave={setAccountName} />
            <span className="mob-sett-email-sm">{session?.user?.email}</span>
            {userProfile?.username && (
              <span className="mob-sett-username">@{userProfile.username}</span>
            )}
          </div>
        </div>
        <NativeButton
          variant="secondary"
          className="mob-edit-profile-btn"
          onClick={() => setShowProfileModal?.(true)}
        >
          {t("account.editProfileAvatar")}
        </NativeButton>
        <NativeButton
          variant="secondary"
          className="mob-edit-profile-btn"
          leading={<KeyRound size={15} />}
          onClick={() => ctx.setShowJoinCode?.(true)}
        >
          {t("account.joinInviteCode")}
        </NativeButton>
      </NativeSection>

      {/* Language */}
      <NativeSection
        className="mob-sett-card"
        title={<span className="mob-sett-section-title"><Languages size={15} /> {t("settings.language")}</span>}
      >
        <NativeSegmentedControl
          className="mob-theme-pills"
          label={t("settings.language")}
          value={i18n.resolvedLanguage}
          onChange={(language) => {
            if (i18n.resolvedLanguage !== language) hapticSelection();
            i18n.changeLanguage(language);
          }}
          options={[
            { value: "en", label: "English" },
            { value: "de", label: "Deutsch" },
            { value: "ru", label: "Русский" },
          ]}
        />
      </NativeSection>

      {/* AI experience */}
      <NativeSection
        className="mob-sett-card"
        title={<span className="mob-sett-section-title"><BrandStar size={15} tone="current" /> AI experience</span>}
      >
        <div className="mob-sett-row">
          <span>
            <span className="mob-sett-row-label">{t("settings.twoAssistantMode")}</span>
            <span className="mob-sett-row-detail">Nora can hand focused coaching conversations to Atlas.</span>
          </span>
          <NativeSwitch
            checked={assistantSettings.twoAssistantMode}
            label={t("settings.twoAssistantMode")}
            onChange={(enabled) => {
              hapticSelection();
              updateAssistantSettings({ twoAssistantMode: enabled });
            }}
          />
        </div>
        {assistantSettings.twoAssistantMode && (
          <p className="mob-sett-hint">{t("settings.twoAssistantModeDesc")}</p>
        )}
      </NativeSection>

      {/* Notifications */}
      <NativeSection
        className="mob-sett-card"
        title={<span className="mob-sett-section-title"><Bell size={15} /> {t("settings.notifications")}</span>}
      >
        <NotificationSettings
          permission={notifPermission}
          settings={notifSettings}
          updateSettings={updateNotifSettings}
          onRequestPermission={requestNotifPermission}
          reminderMins={reminderMins}
          setReminderMins={setReminderMins}
          health={ctx.notifHealth}
          sendTestNotification={ctx.sendTestNotification}
          testServerPush={ctx.testServerPush}
          forceResubscribe={ctx.forceResubscribe}
        />
      </NativeSection>

      {/* Apple Health */}
      <NativeSection
        className="mob-sett-card"
        title={<span className="mob-sett-section-title"><HeartPulse size={15} /> Apple Health</span>}
      >
        <HealthSettings health={ctx.health} />
      </NativeSection>

      {/* Places & Transport */}
      <NativeSection
        className="mob-sett-card"
        title={<span className="mob-sett-section-title"><MapPin size={15} /> Places</span>}
      >
        <SavedPlacesManager
          savedPlaces={ctx.savedPlaces ?? []}
          onSavedPlacesChange={ctx.setSavedPlaces ?? (() => {})}
          transportProfile={ctx.transportProfile ?? { defaultMode: "mixed" }}
          onTransportProfileChange={ctx.setTransportProfile ?? (() => {})}
        />
      </NativeSection>

      {/* Groups */}
      <NativeSection
        className="mob-sett-card"
        title={<span className="mob-sett-section-title"><Activity size={15} /> {t("account.taskGroups")}</span>}
      >
        {/* Existing groups */}
        {(groups || []).map(g => {
          const isBuiltin = g.id === "private" || g.id === "work";
          return (
            <div key={g.id} className="mob-group-row">
              <span className="mob-group-dot" style={{ background: g.color }} />
              <span className="mob-group-name">{g.name}</span>
              {isBuiltin
                ? <span className="mob-group-builtin">{t("account.builtin")}</span>
                : <NativeIconButton
                    className="mob-group-del"
                    size="compact"
                    label={`Delete ${g.name}`}
                    onClick={() => deleteGroup(g.id)}
                  >
                    <Trash2 size={14} />
                  </NativeIconButton>
              }
            </div>
          );
        })}
        {/* Add new group */}
        <div className="mob-group-add-row">
          <div className="mob-group-colors">
            {GROUP_PRESET_COLORS.map(c => (
              <button key={c}
                className={`mob-group-color-dot${newGroupColor === c ? " active" : ""}`}
                style={{ background: c, "--dot-color": c }}
                onClick={() => setNewGroupColor(c)}
                aria-label={c} />
            ))}
          </div>
          <div className="mob-group-input-row">
            <NativeField className="mob-sett-input" value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addGroup(); }}
              aria-label={t("account.newGroupName")}
              placeholder={t("account.newGroupName")} />
            <NativeIconButton
              label="Add group"
              className="mob-group-add-btn"
              style={{ background: newGroupColor, opacity: newGroupName.trim() ? 1 : 0.4 }}
              onClick={addGroup} disabled={!newGroupName.trim()}>
              <Plus size={16} />
            </NativeIconButton>
          </div>
        </div>
      </NativeSection>

      {/* Account */}
      <NativeSection
        className="mob-sett-card mob-sett-account"
        title={<span className="mob-sett-section-title"><User size={15} /> {t("account.account")}</span>}
      >
        <p className="mob-sett-email-text">{session?.user?.email}</p>
        {/* Upgrade button */}
        <NativeButton
          className="mob-upgrade-btn"
          onClick={() => ctx.setPricingOpen?.(true)}
        >
          <span className="mob-upgrade-plan-badge">
            {ctx.subscription?.plan === "free"  ? "Free"
           : ctx.subscription?.plan === "plus"  ? "Plus"
           : ctx.subscription?.plan === "pro"   ? "Pro"
           : ctx.subscription?.plan === "team"  ? "Team"
           : "Free"}
          </span>
          {ctx.subscription?.plan === "free" ? "Upgrade to Pro" : "Manage Subscription"}
        </NativeButton>
        <NativeButton variant="danger" className="mob-signout-btn" onClick={() => supabase.auth.signOut()}>
          {t("account.signOut")}
        </NativeButton>
      </NativeSection>
    </div>
  );
}

// ── Chat overlay ─────────────────────────────────────────────
function MobileChat({ ctx }) {
  const { chatOpen, setChatOpen, messages, chatInput, setChatInput, chatLoading, sendChat,
          editPlannerMessage, retryPlannerMessage,
          microStartMode, setMicroStartMode, noraGreeting,
          plannerConversations = [], plannerActiveConversationId = null, plannerConversationsLoading = false,
          onSelectPlannerConversation, onNewPlannerConversation, onRenamePlannerConversation,
          onPinPlannerConversation, onArchivePlannerConversation, onDeletePlannerConversation,
          onOpenAtlasHandoff,
          onPlannerAction,
          todayTasks = [], deferredTasks = [], energy, focus } = ctx;
  const [chatSuggestions, setChatSuggestions] = useState(DEFAULT_CHAT_CHIPS);
  const [chatGhost,       setChatGhost]       = useState("");
  const [aiChatSuggestions, setAiChatSuggestions] = useState(null);
  const [aiChatSugLoading,  setAiChatSugLoading]  = useState(false);
  const aiChatSugFetchedRef = useRef(false);
  const endRef      = useRef(null);
  const inputRef    = useRef(null);
  const [chatAtBottom, setChatAtBottom] = useState(true);
  const [convSheetOpen, setConvSheetOpen] = useState(false);
  const [suggestionsVisible, setSuggestionsVisible] = useState(() => {
    try { return localStorage.getItem("nora_mobile_chat_suggestions") !== "hidden"; }
    catch { return true; }
  });

  const toggleSuggestions = () => {
    setSuggestionsVisible((visible) => {
      const next = !visible;
      try { localStorage.setItem("nora_mobile_chat_suggestions", next ? "visible" : "hidden"); } catch {}
      return next;
    });
  };

  useEffect(() => {
    if (!chatOpen || !suggestionsVisible || aiChatSugFetchedRef.current) return;
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
  }, [chatOpen, suggestionsVisible]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
    setChatAtBottom(true);
  }, [messages, chatLoading]);

  // Reset textarea height when input is cleared after send
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    if (!chatInput) {
      el.style.height = "";   // remove inline height → CSS min-height takes over
    }
  }, [chatInput]);

  return (
    <div className={`mob-chat${chatOpen ? " mob-chat-open" : ""}`}>
      <AssistantChatHeader
        title="Nora"
        subtitle="Planning and execution"
        onHistory={() => setConvSheetOpen(true)}
        onClose={() => setChatOpen(false)}
      />

      <div className="mob-chat-messages-wrap">
        <div className="mob-chat-messages"
          onScroll={(e) => {
            const el = e.currentTarget;
            setChatAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
          }}>
          {messages.length === 0 && !chatLoading && (
            <section className="mob-chat-welcome" aria-label="Nora introduction">
              <span className="mob-chat-welcome-mark">
                <BrandStar size={23} tone="current" />
              </span>
              <h1>What should we make easier?</h1>
              <div className="mob-chat-welcome-copy">
                <MessagePartsList parts={[textPart(noraGreeting)]} />
              </div>
            </section>
          )}
          {messages.map((m, i) => (
            <ConversationMessage
              key={m.id ?? i}
              message={m}
              className={`mob-chat-msg mob-chat-${m.role}`}
              bubbleClassName="mob-chat-bubble"
              assistantName="Nora"
              onEdit={editPlannerMessage}
              onRetry={retryPlannerMessage}
              onOpenAtlas={onOpenAtlasHandoff}
              onPlannerAction={onPlannerAction}
              plannerTasks={ctx.tasks ?? []}
            />
          ))}
          {chatLoading && (
            <div className="mob-chat-msg mob-chat-assistant">
              <div className="mob-chat-bubble mob-chat-typing">
                <span /><span /><span />
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
        {!chatAtBottom && (
          <button className="chat-scroll-btn"
            onClick={() => endRef.current?.scrollIntoView({ behavior: "smooth" })}>
            <ChevronDown size={16} />
          </button>
        )}
      </div>

      {suggestionsVisible && <div className="mob-chat-suggestions">
        {!chatInput ? (
          <div className="mob-chat-ai-bubbles">
            {aiChatSugLoading ? (
              [0, 1, 2].map((i) => <div key={i} className="mob-chat-ai-bubble-shimmer" />)
            ) : (
              (aiChatSuggestions ?? ["What should I focus on today?", "Help me plan my day", "How's my workload this week?"]).map((s, i) => (
                <button key={i} className="mob-chat-ai-bubble" onClick={() => {
                  setChatInput(s); setChatGhost(""); setChatSuggestions(DEFAULT_CHAT_CHIPS);
                  inputRef.current?.focus();
                }}>{s}</button>
              ))
            )}
          </div>
        ) : (
          chatSuggestions.length > 0 && (
            <div className="mob-chat-chips-pill">
              {chatSuggestions.map((s, i) => (
                <button key={i} className="mob-chat-chip" onClick={() => {
                  setChatInput(s); setChatGhost(""); setChatSuggestions(DEFAULT_CHAT_CHIPS);
                  inputRef.current?.focus();
                }}>{s}</button>
              ))}
            </div>
          )
        )}
      </div>}
      <AssistantChatComposer
        className="mob-chat-composer"
        value={chatInput}
        inputRef={inputRef}
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
          event.target.style.height = `${Math.min(event.target.scrollHeight, 120)}px`;
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
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
            suggestionsVisible={suggestionsVisible}
            onToggleSuggestions={toggleSuggestions}
            microStartMode={microStartMode}
            onToggleMicroStart={() => setMicroStartMode((mode) => !mode)}
          />
        )}
      />
      <ConversationSheet
        open={convSheetOpen}
        onClose={() => setConvSheetOpen(false)}
        conversations={plannerConversations}
        activeId={plannerActiveConversationId}
        loading={plannerConversationsLoading}
        onSelect={(id) => { onSelectPlannerConversation?.(id); setConvSheetOpen(false); }}
        onNew={() => { onNewPlannerConversation?.(); setConvSheetOpen(false); }}
        onRename={onRenamePlannerConversation}
        onPin={onPinPlannerConversation}
        onArchive={onArchivePlannerConversation}
        onDelete={onDeletePlannerConversation}
      />
    </div>
  );
}

// ── Reschedule modal ──────────────────────────────────────────
function MobileRescheduleModal({ task, onSave, onClose }) {
  const HOURS = Array.from({ length: 24 }, (_, i) => i);
  const pad2  = (n) => String(n).padStart(2, "0");
  const fmtH  = (h) => `${pad(h)}:00`;

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
      className="mob-task-dialog mob-reschedule-modal"
      footer={(
        <>
          <NativeButton variant="tertiary" onClick={onClose}>Cancel</NativeButton>
          <NativeButton onClick={handleSave}>Save</NativeButton>
        </>
      )}
    >
        <div className="mob-modal-body">
          <div className="mob-modal-field">
            <label className="mob-modal-label">Date</label>
            <input type="date" className="mob-modal-select"
              value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="mob-modal-field">
            <label className="mob-modal-label">Time</label>
            <div className="mob-time-row">
              <select className="mob-modal-select mob-time-select"
                value={hour}
                onChange={(e) => setHour(e.target.value === "" ? "" : Number(e.target.value))}>
                <option value="">No time</option>
                {HOURS.map((h) => <option key={h} value={h}>{fmtH(h)}</option>)}
              </select>
              {hour !== "" && (
                <select className="mob-modal-select mob-min-select"
                  value={minute}
                  onChange={(e) => setMinute(Number(e.target.value))}>
                  {Array.from({ length: 60 }, (_, i) => i).map((m) => (
                    <option key={m} value={m}>:{pad2(m)}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <div className="mob-modal-field">
            <label className="mob-modal-label">Notes</label>
            <textarea className="mob-modal-notes" rows={3}
              value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Why did it move?" />
          </div>
        </div>
    </NativeDialog>
  );
}

// ── Task edit modal ───────────────────────────────────────────
function MobileEditModal({ ctx }) {
  const { draft, setDraft, saveTask, deleteTask, groups, setSharingTask } = ctx; // eslint-disable-line

  return (
    <NativeDialog
      onClose={() => ctx.setEditingTask(null)}
      title="Task details"
      subtitle="Adjust this task without leaving your plan."
      className="mob-task-dialog mob-edit-task-dialog"
      contentClassName="mob-task-dialog__content"
      footer={(
        <>
          <NativeButton
            variant="danger"
            leading={<Trash2 size={15} />}
            onClick={() => deleteTask(draft.id)}
          >
            Delete
          </NativeButton>
          <NativeIconButton
            label="Share task"
            variant="tertiary"
            onClick={() => { ctx.setEditingTask(null); setSharingTask?.(draft); }}
          >
            {draft.sharedObjectId ? <Users size={16} /> : <Share2 size={16} />}
          </NativeIconButton>
          <NativeButton onClick={saveTask}>Save</NativeButton>
        </>
      )}
    >
        <div className="mob-modal-header mob-modal-title-row">
          <input
            className="mob-modal-title-input"
            value={draft.title}
            placeholder="Task title"
            aria-label="Task title"
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
            autoFocus />
        </div>

        <div className="mob-modal-body">

          {/* Type */}
          <div className="mob-modal-field">
            <label className="mob-modal-label">Type</label>
            <NativeSegmentedControl
              label="Task type"
              value={draft.type ?? "task"}
              onChange={(type) => {
                if ((draft.type ?? "task") !== type) hapticSelection();
                setDraft((d) => ({ ...d, type }));
              }}
              options={["task", "deadline", "break"].map((value) => ({
                value,
                label: value[0].toUpperCase() + value.slice(1),
              }))}
            />
          </div>

          {/* Date */}
          <div className="mob-modal-field">
            <label className="mob-modal-label">Date</label>
            <input type="date" className="mob-modal-select"
              value={draft.date}
              onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))} />
          </div>

          {/* Time */}
          <div className="mob-modal-field">
            <label className="mob-modal-label">Time</label>
            <div className="mob-modal-select mob-time-display">
              {draft.startHour != null
                ? fmtTime(draft.startHour, draft.startMinute ?? 0)
                : <span className="mob-time-empty">No time</span>}
              <input
                type="time"
                className="mob-time-native"
                value={draft.startHour != null ? `${pad(draft.startHour)}:${pad(draft.startMinute ?? 0)}` : ""}
                onChange={(e) => {
                  const val = e.target.value;
                  if (!val) {
                    setDraft(d => ({ ...d, startHour: null, startMinute: null }));
                  } else {
                    const [h, m] = val.split(":").map(Number);
                    setDraft(d => ({ ...d, startHour: h, startMinute: m }));
                  }
                }}
              />
            </div>
          </div>

          {/* Duration */}
          {(draft.type ?? "task") !== "deadline" && (
            <div className="mob-modal-field">
              <label className="mob-modal-label">Duration</label>
              <select className="mob-modal-select"
                value={draft.duration ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, duration: e.target.value === "" ? null : Number(e.target.value) }))}>
                <option value="">No duration</option>
                {Array.from({ length: 48 }, (_, i) => (i + 1) * 5).map((m) => (
                  <option key={m} value={m}>{fmtDur(m)}</option>
                ))}
              </select>
            </div>
          )}

          {/* Repeat */}
          <div className="mob-modal-field">
            <label className="mob-modal-label">Repeat</label>
            <select className="mob-modal-select"
              value={draft.repeat ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, repeat: e.target.value || null }))}>
              <option value="">No repeat</option>
              <option value="daily">Every day</option>
              <option value="weekly">Every week</option>
              <option value="monthly">Every month</option>
            </select>
          </div>

          {/* Group */}
          {(draft.type ?? "task") === "task" && (
            <div className="mob-modal-field">
              <label className="mob-modal-label">Group</label>
              <div className="mob-pill-row">
                {groups.map((g) => (
                  <button key={g.id}
                    className={`mob-pill${draft.groupId === g.id ? " active" : ""}`}
                    style={{ "--gc": g.color }}
                    onClick={() => setDraft((d) => ({ ...d, groupId: d.groupId === g.id ? null : g.id }))}>
                    <span className="mob-gdot" />{g.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Complexity */}
          {(draft.type ?? "task") === "task" && (
            <div className="mob-modal-field">
              <label className="mob-modal-label">Complexity</label>
              <div className="mob-type-row">
                {[["easy","Easy","#22c55e"],["medium","Medium","#f59e0b"],["hard","Hard","#ef4444"]].map(([val, lbl, color]) => (
                  <button key={val}
                    className={`mob-type-btn mob-complexity-btn${draft.complexity === val ? " active" : ""}`}
                    style={draft.complexity === val ? { background: color + "22", borderColor: color, color } : {}}
                    onClick={() => { hapticSelection(); setDraft((d) => ({ ...d, complexity: d.complexity === val ? null : val })); }}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Location */}
          <div className="mob-modal-field">
            <label className="mob-modal-label">Location</label>
            <LocationField
              value={draft.location ?? null}
              onChange={(loc) => setDraft((d) => ({ ...d, location: loc }))}
              savedPlaces={ctx.savedPlaces ?? []}
            />
          </div>

          {/* Notes */}
          <div className="mob-modal-field">
            <label className="mob-modal-label">Notes</label>
            <textarea className="mob-modal-notes" rows={3}
              value={draft.notes}
              onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
              placeholder="Add notes…" />
          </div>

        </div>
    </NativeDialog>
  );
}
