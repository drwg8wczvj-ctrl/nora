-- ── NORA Intelligence Layer ──────────────────────────────────────────────────
-- Connected external accounts (Gmail, Telegram, Outlook, …)
CREATE TABLE IF NOT EXISTS nora_connected_accounts (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  provider         text NOT NULL,           -- 'gmail' | 'telegram' | 'outlook'
  display_name     text,
  account_email    text,
  access_token     text,
  refresh_token    text,
  token_expires_at timestamptz,
  telegram_chat_id text,
  link_code        text,                    -- one-time code for Telegram linking
  is_active        boolean DEFAULT true,
  last_sync_at     timestamptz,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  UNIQUE (user_id, provider, account_email)
);

ALTER TABLE nora_connected_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own their accounts"
  ON nora_connected_accounts FOR ALL USING (auth.uid() = user_id);

-- AI-generated suggestions waiting for user confirmation
CREATE TABLE IF NOT EXISTS nora_suggestions (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id           uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  source_type       text NOT NULL,          -- 'gmail' | 'telegram' | 'manual'
  source_account_id uuid REFERENCES nora_connected_accounts(id) ON DELETE SET NULL,
  source_id         text,                   -- message ID / external reference
  raw_excerpt       text,                   -- original text snippet (max ~500 chars)
  sender_name       text,

  -- AI analysis
  ai_summary        text NOT NULL,          -- "I found a dinner reservation for Friday…"
  suggestion_type   text NOT NULL,          -- 'event'|'task'|'travel'|'reservation'|'deadline'|'delivery'|'reminder'
  title             text NOT NULL,
  description       text,
  date              text,                   -- YYYY-MM-DD
  time              text,                   -- HH:MM (24h)
  end_time          text,
  location          text,
  urgency           text DEFAULT 'normal',  -- 'low'|'normal'|'high'|'urgent'
  confidence        float DEFAULT 0.8,
  extra             jsonb DEFAULT '{}',     -- booking_ref, flight_number, etc.

  -- User action
  status            text DEFAULT 'pending', -- 'pending'|'accepted'|'rejected'|'expired'

  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

ALTER TABLE nora_suggestions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users own their suggestions"
  ON nora_suggestions FOR ALL USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS nora_suggestions_user_status
  ON nora_suggestions (user_id, status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS nora_suggestions_source_dedup
  ON nora_suggestions (user_id, source_type, source_id)
  WHERE source_id IS NOT NULL;
