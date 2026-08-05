// The generic, persona-agnostic conversation engine. Every AI surface (Planner,
// Atlas, and future personas — Messenger/Research/Coach/Email) mounts this
// same hook instead of hand-rolling its own send-loop/persistence/history
// management. What makes a persona a persona — its system prompt, its tool
// schemas, and how it executes a tool call — stays entirely in the caller's
// hands via the three callback params below; this hook only owns the parts
// every persona needs identically: conversation list/CRUD, message
// persistence, and the POST-/api/chat-check-tool_calls-dispatch-repeat loop.
//
// dispatchToolCall(toolCall) => Promise<{ resultText, parts? }>
//   Executes one tool call and returns the tool-result text (fed back to the
//   model) plus any rich parts it produced (e.g. a confirmation_card). Stays
//   with the caller because tool execution needs the caller's own component
//   state (tasks, notes, boards, ...) — this hook never touches that state.
// onTurnStart() — optional, called once before each send()'s tool-calling
//   loop begins, so the caller can reset any per-turn accumulator (e.g. a
//   workingTasks ref) to the latest committed state.

import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch } from "../lib/apiBase";
import {
  listConversations, createConversation, renameConversation,
  setConversationPinned, setConversationArchived, deleteConversation,
  touchConversation, loadConversationMessages, appendConversationMessage,
} from "../lib/noraApi";
import { textPart, errorPart, partsToPreviewText } from "./messageParts";

const localId = () => `local-${Math.random().toString(36).slice(2)}`;

const sortConversations = (list) =>
  [...list].sort((a, b) =>
    (b.pinned === a.pinned ? 0 : b.pinned ? 1 : -1) ||
    new Date(b.last_message_at) - new Date(a.last_message_at)
  );

export function useConversationEngine({
  toolKey,
  session,
  buildSystemPrompt,
  tools,
  includeResearchTool = true,
  dispatchToolCall,
  onTurnStart,
  maxIterations = 10,
}) {
  const [conversations, setConversations] = useState([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [loading, setLoading] = useState(false);

  const activeIdRef = useRef(null);
  activeIdRef.current = activeId;
  const messagesRef = useRef([]);
  messagesRef.current = messages;
  // Set by newConversation() so the messages-loading effect below doesn't
  // race a freshly-created (known-empty) conversation against send()'s own
  // optimistic append — without this, a slow Supabase read landing after
  // send() has already appended the user/assistant turn would clobber it
  // back to [].
  const skipNextLoadRef = useRef(false);

  const lastOpenedKey = `nora_conv_last_opened_${toolKey}`;

  useEffect(() => {
    if (!session) { setConversations([]); setActiveId(null); setMessages([]); return; }
    let cancelled = false;
    (async () => {
      setConversationsLoading(true);
      const list = await listConversations(toolKey);
      if (cancelled) return;
      setConversations(sortConversations(list));
      const lastId = localStorage.getItem(lastOpenedKey);
      const restored = lastId && list.some((c) => c.id === lastId) ? lastId : (list[0]?.id ?? null);
      setActiveId(restored);
      setConversationsLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, toolKey]);

  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    localStorage.setItem(lastOpenedKey, activeId);
    if (skipNextLoadRef.current) { skipNextLoadRef.current = false; return; }
    let cancelled = false;
    (async () => {
      setMessagesLoading(true);
      const msgs = await loadConversationMessages(activeId);
      if (!cancelled) setMessages(msgs);
      setMessagesLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const newConversation = useCallback(async () => {
    // Falls back to a local-only conversation if Supabase is unreachable or
    // the conversations table isn't migrated yet — sending a message should
    // never silently do nothing just because persistence failed.
    const conv = (await createConversation(toolKey)) ?? {
      id: localId(), tool_key: toolKey, title: "New Chat", pinned: false, archived: false, last_message_at: null,
    };
    skipNextLoadRef.current = true;
    setConversations((prev) => sortConversations([conv, ...prev]));
    setActiveId(conv.id);
    setMessages([]);
    return conv;
  }, [toolKey]);

  const selectConversation = useCallback((id) => setActiveId(id), []);

  const rename = useCallback(async (id, title) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
    await renameConversation(id, title);
  }, []);

  const pin = useCallback(async (id, pinned) => {
    setConversations((prev) => sortConversations(prev.map((c) => (c.id === id ? { ...c, pinned } : c))));
    await setConversationPinned(id, pinned);
  }, []);

  const archive = useCallback(async (id) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeIdRef.current === id) { setActiveId(null); setMessages([]); }
    await setConversationArchived(id, true);
  }, []);

  const remove = useCallback(async (id) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeIdRef.current === id) { setActiveId(null); setMessages([]); }
    await deleteConversation(id);
  }, []);

  // Fire-and-forget: a short separate no-tools model call to name the
  // conversation from its opening message. Never blocks the reply.
  const autoTitle = useCallback(async (conversationId, firstUserText) => {
    try {
      const res = await apiFetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: "Reply with only a short 3-5 word conversation title for the user's message. No quotes, no punctuation at the end, no preamble." },
            { role: "user", content: firstUserText.slice(0, 500) },
          ],
          includeResearchTool: false,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      const title = data.choices?.[0]?.message?.content?.trim().replace(/^["']|["']$/g, "");
      if (title) {
        setConversations((prev) => prev.map((c) => (c.id === conversationId ? { ...c, title } : c)));
        touchConversation(conversationId, { title }).catch(() => {});
      }
    } catch { /* title just stays "New Chat" */ }
  }, []);

  // Escape hatch for exchanges that never touch the model (e.g. Planner's
  // deterministic invite-code join) — still persisted and previewed exactly
  // like a normal turn.
  const appendExchange = useCallback(async (userText, assistantParts) => {
    let conversationId = activeIdRef.current;
    if (!conversationId) {
      const conv = await newConversation();
      if (!conv) return;
      conversationId = conv.id;
    }
    const userParts = [textPart(userText)];
    setMessages((m) => [...m, { role: "user", parts: userParts }, { role: "assistant", parts: assistantParts }]);
    appendConversationMessage(conversationId, "user", userParts).catch(() => {});
    appendConversationMessage(conversationId, "assistant", assistantParts).catch(() => {});
    touchConversation(conversationId).catch(() => {});
  }, [newConversation]);

  const send = useCallback(async (text) => {
    const trimmed = (text ?? "").trim();
    if (!trimmed || loading) return;

    let conversationId = activeIdRef.current;
    const isFirstMessage = !conversationId || messagesRef.current.length === 0;
    if (!conversationId) {
      const conv = await newConversation();
      if (!conv) return;
      conversationId = conv.id;
    }

    const priorMessages = messagesRef.current;
    const userParts = [textPart(trimmed)];
    setMessages((m) => [...m, { role: "user", parts: userParts }]);
    setLoading(true);
    appendConversationMessage(conversationId, "user", userParts).catch(() => {});

    try {
      onTurnStart?.();

      const history = priorMessages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-20)
        .map((m) => ({ role: m.role, content: partsToPreviewText(m.parts) }));

      let apiMsgs = [
        { role: "system", content: buildSystemPrompt() },
        ...history,
        { role: "user", content: trimmed },
      ];
      let finalText = "";
      const collectedParts = [];

      for (let iter = 0; iter < maxIterations; iter++) {
        const res = await apiFetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: apiMsgs, tools, includeResearchTool }),
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
          const { resultText, parts } = await dispatchToolCall(tc);
          toolResults.push({ role: "tool", tool_call_id: tc.id, content: resultText });
          if (parts?.length) collectedParts.push(...parts);
        }
        apiMsgs = [...apiMsgs, ...toolResults];
      }

      const assistantParts = [...collectedParts, textPart(finalText || "Done!")];
      setMessages((m) => [...m, { role: "assistant", parts: assistantParts }]);
      appendConversationMessage(conversationId, "assistant", assistantParts).catch(() => {});
      touchConversation(conversationId).catch(() => {});
      if (isFirstMessage) autoTitle(conversationId, trimmed);
    } catch (e) {
      const parts = [errorPart(`Something went wrong: ${e.message}`)];
      setMessages((m) => [...m, { role: "assistant", parts }]);
      appendConversationMessage(conversationId, "assistant", parts).catch(() => {});
    } finally {
      setLoading(false);
    }
  }, [loading, buildSystemPrompt, tools, includeResearchTool, dispatchToolCall, onTurnStart, maxIterations, newConversation, autoTitle]);

  return {
    conversations, conversationsLoading,
    activeId, messages, messagesLoading, loading,
    newConversation, selectConversation, rename, pin, archive, remove, appendExchange, send,
  };
}
