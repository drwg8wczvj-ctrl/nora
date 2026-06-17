import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Admin client — full access for cron-triggered alarm firing
const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

webpush.setVapidDetails(
  `mailto:${Deno.env.get("VAPID_EMAIL") ?? "admin@example.com"}`,
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!
);

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /**/ }

  const { action } = body as { action: string };
  const authHeader = req.headers.get("Authorization") ?? "";

  // Decode JWT payload and check role claim — avoids fragile exact-string comparison
  // which breaks when the env var has trailing whitespace or different formatting
  function jwtRole(header: string): string {
    try {
      const token = header.startsWith("Bearer ") ? header.slice(7) : header;
      const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
      return payload.role ?? "";
    } catch { return ""; }
  }
  const isServiceRole = jwtRole(authHeader) === "service_role";

  // Resolve user id from JWT (for user-facing actions)
  let userId: string | null = null;
  if (!isServiceRole && authHeader.startsWith("Bearer ")) {
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    userId = user?.id ?? null;
  }

  // ── save_subscription ──────────────────────────────────────────────────────
  if (action === "save_subscription") {
    if (!userId) return json({ error: "Unauthorized" }, 401);
    const { subscription } = body as {
      subscription: { endpoint: string; keys: Record<string, string> };
    };
    const { error } = await admin.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint: subscription.endpoint,
        keys: subscription.keys,
        user_agent: req.headers.get("user-agent") ?? "",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  // ── schedule_alarm ─────────────────────────────────────────────────────────
  if (action === "schedule_alarm") {
    if (!userId) return json({ error: "Unauthorized" }, 401);
    const { alarm } = body as {
      alarm: {
        id: string;
        scheduledFor: number;
        title: string;
        body: string;
        tag?: string;
        data?: Record<string, unknown>;
      };
    };
    const { error } = await admin.from("push_alarms").upsert({
      id: alarm.id,
      user_id: userId,
      scheduled_for: new Date(alarm.scheduledFor).toISOString(),
      title: alarm.title,
      body: alarm.body,
      tag: alarm.tag ?? alarm.id,
      data: alarm.data ?? {},
    });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  // ── cancel_alarm ───────────────────────────────────────────────────────────
  if (action === "cancel_alarm") {
    if (!userId) return json({ error: "Unauthorized" }, 401);
    const { id } = body as { id: string };
    await admin.from("push_alarms").delete().eq("id", id).eq("user_id", userId);
    return json({ ok: true });
  }

  // ── test_server_push — immediately push to verify chain end-to-end ───────────
  if (action === "test_server_push") {
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, keys")
      .eq("user_id", userId);

    if (!subs?.length) return json({ ok: false, error: "no_subscriptions" });

    const payload = JSON.stringify({
      title: "✅ Nora · Server Push Active",
      body: "Background delivery is working correctly.",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "nora-server-test",
      data: { action: "test" },
    });

    let sent = 0;
    const errors: string[] = [];
    for (const sub of subs) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload);
        sent++;
      } catch (e: unknown) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 410) {
          await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          errors.push("expired");
        } else {
          errors.push(String(code ?? "unknown"));
        }
      }
    }

    return json({ ok: sent > 0, sent, total: subs.length, errors });
  }

  // ── fire_due_alarms — called by pg_cron with service role key ──────────────
  if (action === "fire_due_alarms") {
    if (!isServiceRole) return json({ error: "Forbidden" }, 403);

    const now = new Date().toISOString();
    const { data: alarms, error: fetchErr } = await admin
      .from("push_alarms")
      .select("*")
      .lte("scheduled_for", now)
      .is("fired_at", null);

    if (fetchErr) return json({ error: fetchErr.message }, 500);
    if (!alarms?.length) return json({ fired: 0 });

    let fired = 0;
    for (const alarm of alarms) {
      const { data: subs } = await admin
        .from("push_subscriptions")
        .select("endpoint, keys")
        .eq("user_id", alarm.user_id);

      const payload = JSON.stringify({
        title: alarm.title,
        body: alarm.body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: alarm.tag ?? alarm.id,
        data: alarm.data ?? {},
      });

      for (const sub of subs ?? []) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            payload
          );
          fired++;
        } catch (e: unknown) {
          // Remove expired subscriptions (HTTP 410)
          if ((e as { statusCode?: number }).statusCode === 410) {
            await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          }
        }
      }

      await admin
        .from("push_alarms")
        .update({ fired_at: now })
        .eq("id", alarm.id)
        .eq("user_id", alarm.user_id);
    }

    return json({ fired });
  }

  return json({ error: `Unknown action: ${action}` }, 400);
});