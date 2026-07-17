import React, { useRef, useEffect } from "react";
import { HeartHandshake, X, Send } from "lucide-react";

// Atlas's own chat surface — deliberately a separate component from Planner's
// chat-panel/mob-chat, not a parametrized shared one, so Phase 4's visual
// redesign can restyle Atlas without touching Planner's working CSS. Phase 1
// keeps the layout minimal (no ghost-text/suggestion-chip machinery) — that's
// cosmetic polish for a later phase, not part of the foundation.

export function DesktopAtlasChat({ open, onClose, messages, chatInput, setChatInput, chatLoading, onSend }) {
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, chatLoading]);

  return (
    <div className={`atlas-chat-panel${open ? " open" : ""}`}>
      <div className="atlas-chat-header">
        <div className="atlas-chat-header-info">
          <div className="atlas-chat-avatar"><HeartHandshake size={20} /></div>
          <div>
            <div className="atlas-chat-title">Atlas</div>
            <div className="atlas-chat-subtitle">A space to think it through</div>
          </div>
        </div>
        <button className="atlas-chat-close" onClick={onClose}><X size={16} /></button>
      </div>
      <div className="atlas-chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={`atlas-chat-msg ${m.role}`}><div className="atlas-chat-bubble">{m.content}</div></div>
        ))}
        {chatLoading && (
          <div className="atlas-chat-msg assistant">
            <div className="atlas-chat-bubble atlas-chat-typing"><span /><span /><span /></div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="atlas-chat-input-row">
        <textarea
          className="atlas-chat-input"
          value={chatInput}
          rows={2}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
          }}
          placeholder="Talk to Atlas…"
        />
        <button className="atlas-chat-send" onClick={onSend} disabled={chatLoading || !chatInput.trim()}>
          {chatLoading ? <span className="dot-spin" /> : <Send size={16} />}
        </button>
      </div>
    </div>
  );
}

export function MobileAtlasChat({ open, onClose, messages, chatInput, setChatInput, chatLoading, onSend }) {
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, chatLoading]);

  return (
    <div className={`mob-atlas-chat${open ? " mob-atlas-chat-open" : ""}`}>
      <div className="atlas-chat-header">
        <div className="atlas-chat-header-info">
          <div className="atlas-chat-avatar"><HeartHandshake size={20} /></div>
          <div>
            <div className="atlas-chat-title">Atlas</div>
            <div className="atlas-chat-subtitle">A space to think it through</div>
          </div>
        </div>
        <button className="atlas-chat-close" onClick={onClose}><X size={20} /></button>
      </div>
      <div className="atlas-chat-messages">
        {messages.map((m, i) => (
          <div key={i} className={`atlas-chat-msg ${m.role}`}><div className="atlas-chat-bubble">{m.content}</div></div>
        ))}
        {chatLoading && (
          <div className="atlas-chat-msg assistant">
            <div className="atlas-chat-bubble atlas-chat-typing"><span /><span /><span /></div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="atlas-chat-input-row">
        <textarea
          className="atlas-chat-input"
          value={chatInput}
          rows={2}
          onChange={(e) => setChatInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); }
          }}
          placeholder="Talk to Atlas…"
        />
        <button className="atlas-chat-send" onClick={onSend} disabled={chatLoading || !chatInput.trim()}>
          {chatLoading ? <span className="dot-spin" /> : <Send size={16} />}
        </button>
      </div>
    </div>
  );
}
