import React, { useRef, useEffect, useState } from "react";
import { HeartHandshake, Wind } from "lucide-react";
import { MessagePartsList } from "../conversation/MessagePart";
import ConversationMessage from "../conversation/ConversationMessage";
import { textPart } from "../conversation/messageParts";
import ConversationSidebar, { ConversationSheet } from "../conversation/ConversationList";
import {
  AssistantChatComposer,
  AssistantChatHeader,
} from "../components/mobile/AssistantChatUI";
import { NativeIconButton } from "../components/ui/NativeUI";

// Atlas's own chat surface — deliberately a separate component from Planner's
// chat-panel/mob-chat, not a parametrized shared one, so Phase 4's visual
// redesign can restyle Atlas without touching Planner's working CSS.

const STARTER_PROMPTS = [
  "Prepare me for an important opportunity",
  "Help me improve a specific skill",
  "Practice a difficult conversation with me",
  "I want to reflect on this week",
];

// First-open only — a brief, calm animation in Atlas's own colors, with an
// explicit trust/privacy line. Shown once ever (gated by atlasIntroSeen),
// not on every open.
function AtlasIntro({ onDone }) {
  return (
    <div className="atlas-intro" onClick={onDone}>
      <div className="atlas-intro-icon"><HeartHandshake size={30} /></div>
      <div className="atlas-intro-title">Welcome to Atlas</div>
      <p className="atlas-intro-sub">
        A focused space to train, prepare, reflect, and improve. Bring a skill,
        opportunity, challenge, or anything you want to work through.
      </p>
      <div className="atlas-intro-hint">Tap anywhere to begin</div>
    </div>
  );
}

// A short guided box-breathing cycle (in 4s → hold 4s → out 4s), triggered
// from a starter prompt or the header action. Purely a client-side timer —
// no persistence, no tool call, just a moment of relief inside the chat.
function AtlasBreathing({ onClose }) {
  const [phase, setPhase] = useState("in");
  useEffect(() => {
    const sequence = [["in", 4000], ["hold", 4000], ["out", 4000]];
    let i = 0;
    let timer;
    const step = () => {
      setPhase(sequence[i][0]);
      timer = setTimeout(step, sequence[i][1]);
      i = (i + 1) % sequence.length;
    };
    step();
    return () => clearTimeout(timer);
  }, []);
  const label = phase === "in" ? "Breathe in…" : phase === "hold" ? "Hold" : "Breathe out…";
  return (
    <div className="atlas-breathing" onClick={onClose}>
      <div className={`atlas-breathing-circle atlas-breathing-${phase}`} />
      <div className="atlas-breathing-label">{label}</div>
      <div className="atlas-breathing-hint">Tap anywhere to return</div>
    </div>
  );
}

function AtlasBody({ messages, chatLoading, greeting, onStarterPick, onBreathe, onOpenNora, onEditMessage, onRetryMessage, plannerTasks }) {
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, chatLoading]);
  const isEmpty = messages.length === 0;

  return (
    <div className="atlas-chat-messages">
      {isEmpty && !chatLoading && (
        <section className="atlas-chat-welcome" aria-label="Atlas introduction">
          <span className="atlas-chat-welcome-mark"><HeartHandshake size={25} /></span>
          <h1>What would you like to improve?</h1>
          <div className="atlas-chat-welcome-copy">
            <MessagePartsList parts={[textPart(greeting)]} />
          </div>
        </section>
      )}
      {messages.map((m, i) => (
        <ConversationMessage
          key={m.id ?? i}
          message={m}
          className={`atlas-chat-msg ${m.role}`}
          bubbleClassName="atlas-chat-bubble"
          assistantName="Atlas"
          onEdit={onEditMessage}
          onRetry={onRetryMessage}
          onOpenNora={onOpenNora}
          plannerTasks={plannerTasks}
        />
      ))}
      {chatLoading && (
        <div className="atlas-chat-msg assistant">
          <div className="atlas-chat-bubble atlas-chat-typing"><span /><span /><span /></div>
        </div>
      )}
      {isEmpty && !chatLoading && (
        <div className="atlas-starter-chips">
          {STARTER_PROMPTS.map((p) => (
            <button key={p} className="atlas-starter-chip" onClick={() => onStarterPick(p)}>{p}</button>
          ))}
          <button className="atlas-starter-chip atlas-starter-chip-breathe" onClick={onBreathe}>
            <Wind size={13} /> I need a moment to breathe
          </button>
        </div>
      )}
      <div ref={endRef} />
    </div>
  );
}

function useAtlasSurface({ open, introSeen, onIntroSeen }) {
  const [showIntro, setShowIntro] = useState(!introSeen);
  const [breathingOpen, setBreathingOpen] = useState(false);

  const finishIntro = () => { setShowIntro(false); onIntroSeen?.(); };

  useEffect(() => {
    if (!open || !showIntro) return;
    const t = setTimeout(finishIntro, 3400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, showIntro]);

  return { showIntro, finishIntro, breathingOpen, setBreathingOpen };
}

export function DesktopAtlasChat({
  open, onClose, messages, chatInput, setChatInput, chatLoading, onSend, introSeen, onIntroSeen,
  greeting = "Hi, I'm Atlas. What would you like to prepare for or improve?",
  conversations = [], activeConversationId = null, conversationsLoading = false,
  onSelectConversation, onNewConversation, onRenameConversation, onPinConversation, onArchiveConversation, onDeleteConversation,
  onOpenNora,
  onEditMessage, onRetryMessage,
  plannerTasks = [],
}) {
  const { showIntro, finishIntro, breathingOpen, setBreathingOpen } = useAtlasSurface({ open, introSeen, onIntroSeen });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className={`atlas-chat-panel atlas-mode${open ? " open" : ""}`}>
      <ConversationSidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        conversations={conversations}
        activeId={activeConversationId}
        loading={conversationsLoading}
        onSelect={(id) => { onSelectConversation?.(id); setSidebarOpen(false); }}
        onNew={() => { onNewConversation?.(); setSidebarOpen(false); }}
        onRename={onRenameConversation}
        onPin={onPinConversation}
        onArchive={onArchiveConversation}
        onDelete={onDeleteConversation}
      />
      <AssistantChatHeader
        title="Atlas"
        subtitle="Training, strategy and reflection"
        brandIcon={<HeartHandshake size={18} />}
        onHistory={!showIntro ? () => setSidebarOpen((visible) => !visible) : undefined}
        onClose={onClose}
        accessory={!showIntro ? (
          <NativeIconButton
            label="Open breathing exercise"
            variant="plain"
            onClick={() => setBreathingOpen(true)}
          >
            <Wind size={18} />
          </NativeIconButton>
        ) : null}
      />

      {showIntro ? (
        <AtlasIntro onDone={finishIntro} />
      ) : (
        <>
          <AtlasBody messages={messages} chatLoading={chatLoading} greeting={greeting}
            onStarterPick={(p) => setChatInput(p)}
            onBreathe={() => setBreathingOpen(true)}
            onOpenNora={onOpenNora}
            onEditMessage={onEditMessage}
            onRetryMessage={onRetryMessage}
            plannerTasks={plannerTasks} />
          <AssistantChatComposer
            value={chatInput}
            rows={2}
            loading={chatLoading}
            placeholder="Talk to Atlas…"
            onChange={(event) => setChatInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSend();
              }
            }}
            onSend={onSend}
          />
        </>
      )}

      {breathingOpen && <AtlasBreathing onClose={() => setBreathingOpen(false)} />}
    </div>
  );
}

export function MobileAtlasChat({
  open, onClose, messages, chatInput, setChatInput, chatLoading, onSend, introSeen, onIntroSeen,
  greeting = "Hi, I'm Atlas. What would you like to prepare for or improve?",
  conversations = [], activeConversationId = null, conversationsLoading = false,
  onSelectConversation, onNewConversation, onRenameConversation, onPinConversation, onArchiveConversation, onDeleteConversation,
  onOpenNora,
  onEditMessage, onRetryMessage,
  plannerTasks = [],
}) {
  const { showIntro, finishIntro, breathingOpen, setBreathingOpen } = useAtlasSurface({ open, introSeen, onIntroSeen });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className={`mob-atlas-chat atlas-mode${open ? " mob-atlas-chat-open" : ""}`}>
      <AssistantChatHeader
        title="Atlas"
        subtitle="Training, strategy and reflection"
        brandIcon={<HeartHandshake size={18} />}
        onHistory={!showIntro ? () => setSidebarOpen(true) : undefined}
        onClose={onClose}
        accessory={!showIntro ? (
          <NativeIconButton
            label="Open breathing exercise"
            variant="plain"
            onClick={() => setBreathingOpen(true)}
          >
            <Wind size={18} />
          </NativeIconButton>
        ) : null}
      />

      {showIntro ? (
        <AtlasIntro onDone={finishIntro} />
      ) : (
        <>
          <AtlasBody messages={messages} chatLoading={chatLoading} greeting={greeting}
            onStarterPick={(p) => setChatInput(p)}
            onBreathe={() => setBreathingOpen(true)}
            onOpenNora={onOpenNora}
            onEditMessage={onEditMessage}
            onRetryMessage={onRetryMessage}
            plannerTasks={plannerTasks} />
          <AssistantChatComposer
            value={chatInput}
            rows={2}
            loading={chatLoading}
            placeholder="Talk to Atlas…"
            onChange={(event) => setChatInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSend();
              }
            }}
            onSend={onSend}
          />
        </>
      )}

      {breathingOpen && <AtlasBreathing onClose={() => setBreathingOpen(false)} />}
      <ConversationSheet
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        conversations={conversations}
        activeId={activeConversationId}
        loading={conversationsLoading}
        onSelect={(id) => { onSelectConversation?.(id); setSidebarOpen(false); }}
        onNew={() => { onNewConversation?.(); setSidebarOpen(false); }}
        onRename={onRenameConversation}
        onPin={onPinConversation}
        onArchive={onArchiveConversation}
        onDelete={onDeleteConversation}
      />
    </div>
  );
}
