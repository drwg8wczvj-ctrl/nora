-- Add MTProto session columns to nora_connected_accounts
-- Run this after 20260630_intelligence.sql

ALTER TABLE nora_connected_accounts
  ADD COLUMN IF NOT EXISTS telegram_phone            text,
  ADD COLUMN IF NOT EXISTS telegram_session          text,
  ADD COLUMN IF NOT EXISTS telegram_auth_session     text,
  ADD COLUMN IF NOT EXISTS telegram_phone_code_hash  text;

-- The original unique constraint covers (user_id, provider, account_email).
-- NULL values in Postgres are never equal in UNIQUE constraints, so Telegram rows
-- (which have no email) can't upsert against it. Add a partial unique index
-- for providers that don't use email (like Telegram).
CREATE UNIQUE INDEX IF NOT EXISTS nora_accounts_no_email_uniq
  ON nora_connected_accounts (user_id, provider)
  WHERE account_email IS NULL;
