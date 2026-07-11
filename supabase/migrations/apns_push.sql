-- ── APNs push support — Run this in Supabase SQL Editor ──────────────────────
-- Extends push_subscriptions (rather than a second table) so fire_due_alarms /
-- test_server_push keep a single query + single dispatch loop, branching per
-- row on `platform` instead of merging two separate result sets.
--
-- Safe to run as-is: every existing row today is platform='webpush' with
-- non-null endpoint/keys, which satisfies the CHECK constraint below.

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS platform     text NOT NULL DEFAULT 'webpush',
  ADD COLUMN IF NOT EXISTS device_token text;

-- endpoint/keys are only meaningful for webpush rows now
ALTER TABLE public.push_subscriptions
  ALTER COLUMN endpoint DROP NOT NULL,
  ALTER COLUMN keys     DROP NOT NULL;

-- endpoint's existing UNIQUE constraint still dedupes webpush rows;
-- add an independent partial unique index for APNs device tokens.
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_device_token_idx
  ON public.push_subscriptions(device_token)
  WHERE platform = 'apns';

-- Enforce the right columns are populated per platform.
ALTER TABLE public.push_subscriptions
  DROP CONSTRAINT IF EXISTS push_subscriptions_platform_shape;
ALTER TABLE public.push_subscriptions
  ADD CONSTRAINT push_subscriptions_platform_shape CHECK (
    (platform = 'webpush' AND endpoint IS NOT NULL AND keys IS NOT NULL AND device_token IS NULL)
    OR
    (platform = 'apns' AND device_token IS NOT NULL AND endpoint IS NULL AND keys IS NULL)
  );

CREATE INDEX IF NOT EXISTS push_subscriptions_platform_idx
  ON public.push_subscriptions(platform);

-- ── Required Supabase Edge Function secrets (set via Dashboard) ──────────────
-- APNS_AUTH_KEY   — full .p8 PEM text of your APNs Auth Key
-- APNS_KEY_ID     — the Key ID shown next to that key in the Developer Portal
-- APNS_TEAM_ID    — your Apple Developer Team ID
-- APNS_BUNDLE_ID  — tech.dongar.nora
-- APNS_PRODUCTION — "true" for App Store builds, "false"/unset for sandbox/dev
