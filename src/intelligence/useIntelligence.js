import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";

const INTEL_ONBOARDING_KEY = "nora_intel_onboarded_v1";

export function useIntelligence({ session, onAddTask }) {
  const [suggestions, setSuggestions]         = useState([]);
  const [accounts, setAccounts]               = useState([]);
  const [loading, setLoading]                 = useState(false);
  const [syncing, setSyncing]                 = useState(false);
  const [proactiveVisible, setProactiveVisible] = useState(false);
  const [centerOpen, setCenterOpen]           = useState(false);
  const [onboardingOpen, setOnboardingOpen]   = useState(false);
  const [extracting, setExtracting]           = useState(false);
  const proactiveShownRef = useRef(false);

  // ── Data loading ──────────────────────────────────────────────

  const loadSuggestions = useCallback(async () => {
    if (!session?.user?.id) return;
    const { data } = await supabase
      .from("nora_suggestions")
      .select("*")
      .eq("user_id", session.user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setSuggestions(data);
  }, [session?.user?.id]);

  const loadAccounts = useCallback(async () => {
    if (!session?.user?.id) return;
    const { data } = await supabase
      .from("nora_connected_accounts")
      .select("id,provider,display_name,account_email,is_active,last_sync_at,telegram_chat_id")
      .eq("user_id", session.user.id)
      .eq("is_active", true);
    if (data) setAccounts(data);
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session) return;
    setLoading(true);
    Promise.all([loadSuggestions(), loadAccounts()]).finally(() => {
      setLoading(false);
      // First-time users: auto-open onboarding so NORA asks for access
      if (!localStorage.getItem(INTEL_ONBOARDING_KEY)) {
        setTimeout(() => setOnboardingOpen(true), 2000);
      }
    });
  }, [session, loadSuggestions, loadAccounts]);

  // Show proactive overlay once per session when suggestions exist
  useEffect(() => {
    if (suggestions.length > 0 && !proactiveShownRef.current) {
      proactiveShownRef.current = true;
      const t = setTimeout(() => setProactiveVisible(true), 1200);
      return () => clearTimeout(t);
    }
  }, [suggestions.length]);

  // Handle OAuth result URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get("intel_status");
    if (status === "gmail_connected") {
      loadAccounts();
      window.history.replaceState({}, "", window.location.pathname);
    } else if (status === "gmail_denied" || status === "gmail_error") {
      window.history.replaceState({}, "", window.location.pathname);
    } else if (status === "gmail_not_configured") {
      window.history.replaceState({}, "", window.location.pathname);
      alert("Gmail integration isn't set up yet. Add GOOGLE_CLIENT_ID and GOOGLE_REDIRECT_URI to your Vercel environment variables to enable it.");
    }
  }, [loadAccounts]);

  // ── Actions ───────────────────────────────────────────────────

  const acceptSuggestion = useCallback(async (suggestion) => {
    // Update Supabase status
    await supabase
      .from("nora_suggestions")
      .update({ status: "accepted", updated_at: new Date().toISOString() })
      .eq("id", suggestion.id);

    // Convert to NORA task/event
    if (onAddTask) {
      const task = {
        title:       suggestion.title,
        date:        suggestion.date ?? null,
        startHour:   suggestion.time ? parseInt(suggestion.time.split(":")[0]) : null,
        startMinute: suggestion.time ? parseInt(suggestion.time.split(":")[1]) : null,
        completed:   false,
        type:        suggestion.suggestion_type === "task" || suggestion.suggestion_type === "deadline" ? "task" : "task",
        note:        [suggestion.description, suggestion.location ? `📍 ${suggestion.location}` : null]
                       .filter(Boolean).join(" · ") || null,
      };
      onAddTask(task);
    }

    setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
  }, [onAddTask]);

  const rejectSuggestion = useCallback(async (id) => {
    await supabase
      .from("nora_suggestions")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", id);
    setSuggestions((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const rejectAll = useCallback(async () => {
    if (!session?.user?.id) return;
    await supabase
      .from("nora_suggestions")
      .update({ status: "rejected" })
      .eq("user_id", session.user.id)
      .eq("status", "pending");
    setSuggestions([]);
  }, [session?.user?.id]);

  // Manual text extraction
  const extractFromText = useCallback(async (text) => {
    if (!session?.user?.id || !text?.trim()) return 0;
    setExtracting(true);
    try {
      const res = await fetch("/api/intelligence-extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message:    text,
          userId:     session.user.id,
          sourceType: "manual",
        }),
      });
      const data = await res.json();
      if (data.count > 0) await loadSuggestions();
      return data.count ?? 0;
    } catch {
      return 0;
    } finally {
      setExtracting(false);
    }
  }, [session?.user?.id, loadSuggestions]);

  // Gmail sync
  const syncGmail = useCallback(async () => {
    if (!session?.user?.id) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/gmail-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: session.user.id }),
      });
      const data = await res.json();
      if ((data.synced ?? 0) > 0) await loadSuggestions();
      return data.synced ?? 0;
    } catch {
      return 0;
    } finally {
      setSyncing(false);
    }
  }, [session?.user?.id, loadSuggestions]);

  // Connect Gmail — fetches the OAuth URL first so a misconfigured endpoint
  // never navigates the user away from the app.
  const connectGmail = useCallback(async () => {
    if (!session?.user?.id) return;
    try {
      const res = await fetch(`/api/gmail-auth-start?user_id=${session.user.id}`);
      if (res.redirected) {
        // Endpoint returned a redirect (success path) — follow it
        window.location.href = res.url;
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        alert(data.error ?? "Gmail integration isn't configured yet. Add GOOGLE_CLIENT_ID to Vercel env vars.");
      }
    } catch {
      alert("Could not start Gmail connection. Check your internet connection and try again.");
    }
  }, [session?.user?.id]);

  // ── Telegram MTProto auth ─────────────────────────────────────

  // Step 1: send OTP to the user's phone number via Telegram
  const connectTelegramPhone = useCallback(async (phone) => {
    if (!session?.user?.id) return { ok: false, error: "Not logged in" };
    try {
      const res = await fetch("/api/telegram-auth-phone", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ phone, userId: session.user.id }),
      });
      const data = await res.json();
      return data;
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }, [session?.user?.id]);

  // Step 2: verify OTP (and optionally 2FA cloud password)
  const verifyTelegramCode = useCallback(async (code, password) => {
    if (!session?.user?.id) return { ok: false, error: "Not logged in" };
    try {
      const res = await fetch("/api/telegram-auth-code", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ code, password, userId: session.user.id }),
      });
      const data = await res.json();
      if (data.ok) await loadAccounts();
      return data;
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }, [session?.user?.id, loadAccounts]);

  // Sync: read recent Telegram messages and extract suggestions
  const syncTelegram = useCallback(async () => {
    if (!session?.user?.id) return 0;
    setSyncing(true);
    try {
      const res = await fetch("/api/telegram-sync", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ userId: session.user.id }),
      });
      const data = await res.json();
      if ((data.suggestions ?? 0) > 0) await loadSuggestions();
      return data.suggestions ?? 0;
    } catch {
      return 0;
    } finally {
      setSyncing(false);
    }
  }, [session?.user?.id, loadSuggestions]);

  // Auto-sync Telegram once per session when connected
  const hasTelegramRef = useRef(false);
  useEffect(() => {
    const connected = accounts.some((a) => a.provider === "telegram" && a.is_active);
    if (connected && !hasTelegramRef.current) {
      hasTelegramRef.current = true;
      syncTelegram();
    }
  }, [accounts, syncTelegram]);

  // Onboarding
  const hasOnboarded = Boolean(localStorage.getItem(INTEL_ONBOARDING_KEY));
  const markOnboarded = () => localStorage.setItem(INTEL_ONBOARDING_KEY, "1");

  return {
    suggestions,
    accounts,
    loading,
    syncing,
    extracting,
    pendingCount:     suggestions.length,
    hasGmail:         accounts.some((a) => a.provider === "gmail"),
    hasTelegram:      accounts.some((a) => a.provider === "telegram"),
    hasAnyAccount:    accounts.length > 0,
    hasOnboarded,
    markOnboarded,

    proactiveVisible,
    setProactiveVisible,
    centerOpen,
    setCenterOpen,
    onboardingOpen,
    setOnboardingOpen,

    acceptSuggestion,
    rejectSuggestion,
    rejectAll,
    extractFromText,
    syncGmail,
    connectGmail,
    connectTelegramPhone,
    verifyTelegramCode,
    syncTelegram,
    loadSuggestions,
    loadAccounts,
  };
}
