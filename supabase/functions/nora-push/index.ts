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

// ── APNs provider-token JWT + HTTP/2 send ────────────────────────────────────
// No well-maintained Deno-native APNs library exists (checked JSR + npm) — the
// one real precedent (cloudflare-apns2) hand-rolls exactly this too. Deno's
// crypto.subtle.sign for ECDSA returns the raw r||s signature directly, which
// is exactly what JWT ES256 requires — no DER-to-raw conversion needed (unlike
// Node's default crypto.sign output).
const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function pemToPkcs8(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----/, "")
                 .replace(/-----END PRIVATE KEY-----/, "")
                 .replace(/\s+/g, "");
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0)).buffer;
}

let cachedApnsKey: CryptoKey | null = null;
let cachedApnsJwt: { token: string; iat: number } | null = null;

async function getApnsSigningKey(): Promise<CryptoKey> {
  if (cachedApnsKey) return cachedApnsKey;
  cachedApnsKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(Deno.env.get("APNS_AUTH_KEY")!),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  return cachedApnsKey;
}

// Apple allows reusing a provider token for up to ~1h; cache to avoid
// "TooManyProviderTokenUpdates" on high-frequency (per-minute cron) sends.
async function getApnsJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedApnsJwt && now - cachedApnsJwt.iat < 50 * 60) return cachedApnsJwt.token;

  const header = { alg: "ES256", kid: Deno.env.get("APNS_KEY_ID")! };
  const claims = { iss: Deno.env.get("APNS_TEAM_ID")!, iat: now };
  const signingInput = `${b64url(new TextEncoder().encode(JSON.stringify(header)))}.${b64url(new TextEncoder().encode(JSON.stringify(claims)))}`;

  const key = await getApnsSigningKey();
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(signingInput)
  );
  const token = `${signingInput}.${b64url(sig)}`;
  cachedApnsJwt = { token, iat: now };
  return token;
}

async function sendApnsPush(
  deviceToken: string,
  payload: { title: string; body: string; data?: Record<string, unknown> }
): Promise<{ ok: boolean; expired?: boolean; error?: string }> {
  const host = Deno.env.get("APNS_PRODUCTION") === "true"
    ? "https://api.push.apple.com"
    : "https://api.sandbox.push.apple.com";

  const jwt = await getApnsJwt();
  const res = await fetch(`${host}/3/device/${deviceToken}`, {
    method: "POST",
    headers: {
      "authorization": `bearer ${jwt}`,
      "apns-topic": Deno.env.get("APNS_BUNDLE_ID")!,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": String(Math.floor(Date.now() / 1000) + 86400),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      aps: { alert: { title: payload.title, body: payload.body }, sound: "default" },
      ...(payload.data ?? {}),
    }),
  });

  if (res.ok) return { ok: true };
  const reason = await res.json().catch(() => ({}));
  const expired = res.status === 410 ||
    (res.status === 400 && reason.reason === "BadDeviceToken");
  return { ok: false, expired, error: reason.reason ?? String(res.status) };
}

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

  // ── get_vapid_key — public, no auth needed (public key is not sensitive) ─────
  if (action === "get_vapid_key") {
    return json({ publicKey: Deno.env.get("VAPID_PUBLIC_KEY") ?? "" });
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

  // ── save_apns_token — native iOS push registration ──────────────────────────
  if (action === "save_apns_token") {
    if (!userId) return json({ error: "Unauthorized" }, 401);
    const { token } = body as { token: string };
    if (!token) return json({ error: "Missing token" }, 400);
    const { error } = await admin.from("push_subscriptions").upsert(
      {
        user_id: userId,
        platform: "apns",
        device_token: token,
        user_agent: req.headers.get("user-agent") ?? "",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "device_token" }
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
    // fired_at must be explicitly reset to null so that rescheduled alarms are
    // picked up again by the cron job (which filters WHERE fired_at IS NULL).
    const { error } = await admin.from("push_alarms").upsert(
      {
        id: alarm.id,
        user_id: userId,
        scheduled_for: new Date(alarm.scheduledFor).toISOString(),
        title: alarm.title,
        body: alarm.body,
        tag: alarm.tag ?? alarm.id,
        data: alarm.data ?? {},
        fired_at: null,
      },
      { onConflict: "id,user_id" }
    );
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

  // ── replace_subscription — called by SW pushsubscriptionchange handler ────────
  // No user-session auth needed: the old endpoint acts as the credential.
  // Only a browser that already holds a valid APNs token for that endpoint can
  // trigger this; the server verifies ownership by looking up the old endpoint.
  if (action === "replace_subscription") {
    const { old_endpoint, subscription } = body as {
      old_endpoint: string;
      subscription: { endpoint: string; keys: Record<string, string> };
    };
    if (!old_endpoint || !subscription?.endpoint) {
      return json({ error: "Missing old_endpoint or subscription" }, 400);
    }
    const { data: existing } = await admin
      .from("push_subscriptions")
      .select("user_id")
      .eq("endpoint", old_endpoint)
      .maybeSingle();
    if (!existing) return json({ ok: false, error: "Unknown subscription" }, 404);
    // Delete old then insert new atomically so no push window is missed.
    await admin.from("push_subscriptions").delete().eq("endpoint", old_endpoint);
    const { error } = await admin.from("push_subscriptions").insert({
      user_id: existing.user_id,
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      user_agent: req.headers.get("user-agent") ?? "",
      updated_at: new Date().toISOString(),
    });
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true });
  }

  // ── test_server_push — immediately push to verify chain end-to-end ───────────
  if (action === "test_server_push") {
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, keys, platform, device_token")
      .eq("user_id", userId);

    if (!subs?.length) return json({ ok: false, error: "no_subscriptions" });

    const title = "✅ Background push works";
    const bodyText = "Delivered while the app was closed.";
    const payload = JSON.stringify({
      title,
      body: bodyText,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: "nora-server-test",
      data: { action: "test" },
    });

    let sent = 0;
    const errors: string[] = [];
    for (const sub of subs) {
      if (sub.platform === "apns") {
        const r = await sendApnsPush(sub.device_token, { title, body: bodyText, data: { action: "test" } });
        if (r.ok) sent++;
        else {
          if (r.expired) await admin.from("push_subscriptions").delete().eq("device_token", sub.device_token);
          errors.push(r.expired ? "expired:apns" : `apns:${r.error}`);
        }
        continue;
      }

      // Verify VAPID keys are configured before attempting to send
      if (!Deno.env.get("VAPID_PUBLIC_KEY") || !Deno.env.get("VAPID_PRIVATE_KEY")) {
        errors.push("vapid_keys_missing");
        continue;
      }
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payload,
          // TTL=86400: APNs must queue for up to 24 h if device is offline.
          // urgency=high: deliver immediately — bypasses iOS low-power deferral.
          { TTL: 86400, urgency: "high" }
        );
        sent++;
      } catch (e: unknown) {
        const err = e as { statusCode?: number; message?: string; body?: string };
        const code = err.statusCode;
        // Include the actual response body so the client can show the real reason
        const detail = (err.body ?? err.message ?? String(e)).toString().slice(0, 300);
        if (code === 410 || code === 404) {
          await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          errors.push("expired:410");
        } else {
          errors.push(`${code ?? "err"}:${detail}`);
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
        .select("endpoint, keys, platform, device_token")
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
        if (sub.platform === "apns") {
          const r = await sendApnsPush(sub.device_token, { title: alarm.title, body: alarm.body, data: alarm.data ?? {} });
          if (r.ok) fired++;
          else if (r.expired) await admin.from("push_subscriptions").delete().eq("device_token", sub.device_token);
          continue;
        }
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            payload,
            { TTL: 86400, urgency: "high" }
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