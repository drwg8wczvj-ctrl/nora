import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

const AUTH_TIMEOUT_MS = 8_000;

export function useAuthSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isResettingPassword, setIsResettingPassword] = useState(false);

  useEffect(() => {
    let active = true;
    const timeout = window.setTimeout(() => {
      if (active) setLoading(false);
    }, AUTH_TIMEOUT_MS);

    void supabase.auth.getSession().then(
      ({ data }) => {
        if (!active) return;
        window.clearTimeout(timeout);
        setSession(data.session);
        setLoading(false);
      },
      () => {
        if (!active) return;
        window.clearTimeout(timeout);
        setLoading(false);
      },
    );

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      window.clearTimeout(timeout);
      setSession(nextSession);
      setLoading(false);
      if (event === "PASSWORD_RECOVERY") setIsResettingPassword(true);
    });

    return () => {
      active = false;
      window.clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  return {
    session,
    loading,
    isResettingPassword,
    finishPasswordReset: () => setIsResettingPassword(false),
  };
}
