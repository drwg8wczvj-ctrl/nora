-- ── Rotate the pg_cron service-role secret out of committed SQL ───────────────
-- push_notifications.sql originally hardcoded a live service-role JWT directly
-- in the cron job body — a real secret sitting in git history. This migration
-- moves the cron job to read the token from Supabase Vault instead.
--
-- BEFORE running this migration, do the following ONE-TIME setup yourself
-- (never commit these values — run directly in the Supabase SQL editor):
--
--   1. Rotate the service-role key: Project Settings → API → "Roll" the
--      service_role key. This is what actually neutralizes the old leaked
--      value — redacting it from this repo does not invalidate it.
--   2. Store the NEW key in Vault (run once, in the SQL editor, not in a file):
--        select vault.create_secret(
--          '<new-service-role-key>',
--          'nora_service_role_key',
--          'Service role key for the nora-fire-push-alarms cron job'
--        );
--
-- THEN run the statements below.

SELECT cron.unschedule('nora-fire-push-alarms');

SELECT cron.schedule(
  'nora-fire-push-alarms',
  '* * * * *',
  $$
    SELECT extensions.http_post(
      url    := 'https://zbdrguzefqxcukotrodg.supabase.co/functions/v1/nora-push',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (
          SELECT decrypted_secret FROM vault.decrypted_secrets
          WHERE name = 'nora_service_role_key'
        )
      ),
      body := '{"action":"fire_due_alarms"}'
    );
  $$
);
