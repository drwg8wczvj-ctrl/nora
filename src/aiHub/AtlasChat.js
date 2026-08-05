import React, { useRef, useEffect, useState } from "react";
import { HeartHandshake, Send, Wind, PanelLeft } from "lucide-react";
import { MessagePartsList } from "../conversation/MessagePart";
import { textPart } from "../conversation/messageParts";
import ConversationSidebar, { ConversationSheet } from "../conversation/ConversationList";
import CloseButton from "../components/CloseButton";

// Atlas's own chat surface — deliberately a separate component from Planner's
// chat-panel/mob-chat, not a parametrized shared one, so Phase 4's visual
// redesign can restyle Atlas without touching Planner's working CSS.

const STARTER_PROMPTS = [
  "I'm feeling stressed",
  "I don't know why, but I feel off today",
  "Help me process something that happened",
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
        A private space to think out loud — about stress, motivation, or anything
        on your mind. Nothing here is judged, and nothing leaves this conversation.
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

function AtlasBody({ messages, chatLoading, greeting, onStarterPick, onBreathe }) {
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, chatLoading]);
  const isEmpty = messages.length === 0;

  return (
    <div className="atlas-chat-messages">
      {isEmpty && !chatLoading && (
        <div className="atlas-chat-msg assistant"><div className="atlas-chat-bubble"><MessagePartsList parts={[textPart(greeting)]} /></div></div>
      )}
      {messages.map((m, i) => (
        <div key={m.id ?? i} className={`atlas-chat-msg ${m.role}`}><div className="atlas-chat-bubble"><MessagePartsList parts={m.parts} /></div></div>
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
  greeting = "Hi, I'm Atlas.",
  conversations = [], activeConversationId = null, conversationsLoading = false,
  onSelectConversation, onNewConversation, onRenameConversation, onPinConversation, onArchiveConversation, onDeleteConversation,
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
      <div className="atlas-chat-header">
        <div className="atlas-chat-header-info">
          {!showIntro && (
            <button className="atlas-chat-close" onClick={() => setSidebarOpen((v) => !v)} title="Conversations"><PanelLeft size={16} /></button>
          )}
          <div className="atlas-chat-avatar"><HeartHandshake size={20} /></div>
          <div>
            <div className="atlas-chat-title">Atlas</div>
            <div className="atlas-chat-subtitle">A space to think it through</div>
          </div>
        </div>
        <div className="atlas-chat-header-actions">
          {!showIntro && (
            <button className="atlas-chat-breathe-btn" title="Breathing exercise" onClick={() => setBreathingOpen(true)}>
              <Wind size={15} />
            </button>
          )}
          <CloseButton onClick={onClose} size={26} />
        </div>
      </div>

      {showIntro ? (
        <AtlasIntro onDone={finishIntro} />
      ) : (
        <>
          <AtlasBody messages={messages} chatLoading={chatLoading} greeting={greeting}
            onStarterPick={(p) => setChatInput(p)}
            onBreathe={() => setBreathingOpen(true)} />
          <div className="atlas-chat-input-row">
            <textarea
              className="atlas-chat-input"
              value={chatInput}
              rows={2}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
              placeholder="Talk to Atlas…"
            />
            <button className="atlas-chat-send" onClick={onSend} disabled={chatLoading || !chatInput.trim()}>
              {chatLoading ? <span className="dot-spin" /> : <Send size={16} />}
            </button>
          </div>
        </>
      )}

      {breathingOpen && <AtlasBreathing onClose={() => setBreathingOpen(false)} />}
    </div>
  );
}

export function MobileAtlasChat({
  open, onClose, messages, chatInput, setChatInput, chatLoading, onSend, introSeen, onIntroSeen,
  greeting = "Hi, I'm Atlas.",
  conversations = [], activeConversationId = null, conversationsLoading = false,
  onSelectConversation, onNewConversation, onRenameConversation, onPinConversation, onArchiveConversation, onDeleteConversation,
}) {
  const { showIntro, finishIntro, breathingOpen, setBreathingOpen } = useAtlasSurface({ open, introSeen, onIntroSeen });
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className={`mob-atlas-chat atlas-mode${open ? " mob-atlas-chat-open" : ""}`}>
      <div className="atlas-chat-header">
        <div className="atlas-chat-header-info">
          {!showIntro && (
            <button className="atlas-chat-close" onClick={() => setSidebarOpen(true)} title="Conversations"><PanelLeft size={18} /></button>
          )}
          <div className="atlas-chat-avatar"><HeartHandshake size={20} /></div>
          <div>
            <div className="atlas-chat-title">Atlas</div>
            <div className="atlas-chat-subtitle">A space to think it through</div>
          </div>
        </div>
        <div className="atlas-chat-header-actions">
          {!showIntro && (
            <button className="atlas-chat-breathe-btn" title="Breathing exercise" onClick={() => setBreathingOpen(true)}>
              <Wind size={15} />
            </button>
          )}
          <CloseButton onClick={onClose} />
        </div>
      </div>

      {showIntro ? (
        <AtlasIntro onDone={finishIntro} />
      ) : (
        <>
          <AtlasBody messages={messages} chatLoading={chatLoading} greeting={greeting}
            onStarterPick={(p) => setChatInput(p)}
            onBreathe={() => setBreathingOpen(true)} />
          <div className="atlas-chat-input-row">
            <textarea
              className="atlas-chat-input"
              value={chatInput}
              rows={2}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
              placeholder="Talk to Atlas…"
            />
            <button className="atlas-chat-send" onClick={onSend} disabled={chatLoading || !chatInput.trim()}>
              {chatLoading ? <span className="dot-spin" /> : <Send size={16} />}
            </button>
          </div>
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
