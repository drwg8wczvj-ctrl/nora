-- ── Push Notifications — Run this in Supabase SQL Editor ────────────────────

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- ── 1. Push subscriptions (one row per browser/device per user) ───────────────
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  endpoint    text NOT NULL UNIQUE,
  keys        jsonb NOT NULL,
  user_agent  text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Authenticated users can manage their own subscriptions
CREATE POLICY "push_subscriptions_user" ON public.push_subscriptions
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role (cron) can read/delete expired subscriptions
CREATE POLICY "push_subscriptions_service" ON public.push_subscriptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 2. Server-side alarm queue ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_alarms (
  id           text        NOT NULL,
  user_id      uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  scheduled_for timestamptz NOT NULL,
  title        text        NOT NULL,
  body         text        NOT NULL,
  tag          text,
  data         jsonb DEFAULT '{}',
  fired_at     timestamptz,
  created_at   timestamptz DEFAULT now(),
  PRIMARY KEY (id, user_id)
);

CREATE INDEX IF NOT EXISTS push_alarms_due_idx
  ON public.push_alarms(scheduled_for)
  WHERE fired_at IS NULL;

ALTER TABLE public.push_alarms ENABLE ROW LEVEL SECURITY;

-- Authenticated users manage their own alarms
CREATE POLICY "push_alarms_user" ON public.push_alarms
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role (cron) can read/update all alarms
CREATE POLICY "push_alarms_service" ON public.push_alarms
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 3. pg_cron job — fires every minute ──────────────────────────────────────
-- Replace YOUR_PROJECT_REF and YOUR_SERVICE_ROLE_KEY before running.
-- Find these in: Supabase Dashboard → Project Settings → API

SELECT cron.schedule(
  'nora-fire-push-alarms',
  '* * * * *',
  $$
    SELECT extensions.http_post(
      url    := 'https://zbdrguzefqxcukotrodg.supabase.co/functions/v1/nora-push',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpiZHJndXplZnF4Y3Vrb3Ryb2RnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTA0MDcyMiwiZXhwIjoyMDk0NjE2NzIyfQ.u0kwEfRsOrEdh5avJshTuMzlbWIJgymjKdvvHzEXu88'
      ),
      body := '{"action":"fire_due_alarms"}'
    );
  $$
);