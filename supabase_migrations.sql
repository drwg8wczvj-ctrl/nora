-- ─────────────────────────────────────────────────────────────
-- NORA — Database migrations
-- Run once in Supabase SQL Editor (safe to re-run)
-- ─────────────────────────────────────────────────────────────

-- 1. Chat messages (24-hour rolling window)
CREATE TABLE IF NOT EXISTS chat_messages (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text        NOT NULL CHECK (role IN ('user', 'assistant')),
  message    text        NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own chat messages" ON chat_messages;
CREATE POLICY "Users can manage own chat messages"
  ON chat_messages FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS chat_messages_user_created
  ON chat_messages (user_id, created_at DESC);


-- 1b. Atlas (Psychologist persona) chat messages — mirrors chat_messages
-- exactly but kept as its own table so Planner's and Atlas's histories
-- never interleave (loadRecentChatMessages has no persona filter).
CREATE TABLE IF NOT EXISTS atlas_chat_messages (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       text        NOT NULL CHECK (role IN ('user', 'assistant')),
  message    text        NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE atlas_chat_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own atlas chat messages" ON atlas_chat_messages;
CREATE POLICY "Users can manage own atlas chat messages"
  ON atlas_chat_messages FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS atlas_chat_messages_user_created
  ON atlas_chat_messages (user_id, created_at DESC);


-- 2. Persistent user preferences (never deleted)
CREATE TABLE IF NOT EXISTS user_preferences (
  user_id     uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  preferences jsonb       NOT NULL DEFAULT '{}',
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own preferences" ON user_preferences;
CREATE POLICY "Users can manage own preferences"
  ON user_preferences FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- 3. User profile — name, birthday, visible in Supabase dashboard
CREATE TABLE IF NOT EXISTS user_profile (
  id         uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name       text,
  birthday   date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Safe column additions for existing tables
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS name     text;
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS birthday date;
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE user_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_profile_select" ON user_profile;
CREATE POLICY "user_profile_select"
  ON user_profile FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_profile_insert" ON user_profile;
CREATE POLICY "user_profile_insert"
  ON user_profile FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_profile_update" ON user_profile;
CREATE POLICY "user_profile_update"
  ON user_profile FOR UPDATE
  USING (auth.uid() = user_id);


-- 4. Morning Check-Up — Phase 2 (adaptive, sleep-science redesign) columns.
-- The `morning_checkups` table itself has no migration anywhere in this file
-- (it predates migration tracking here) — this only adds new, nullable JSONB
-- columns to whatever that table already looks like in your project, so it's
-- additive and safe to re-run. Existing rows are untouched; old rows simply
-- have NULLs here and the app already renders that gracefully.
ALTER TABLE morning_checkups ADD COLUMN IF NOT EXISTS sleep_analysis       jsonb;
ALTER TABLE morning_checkups ADD COLUMN IF NOT EXISTS readiness_subscores  jsonb;
ALTER TABLE morning_checkups ADD COLUMN IF NOT EXISTS adaptive_question    jsonb;


-- 5. Conversations — the new multi-conversation AI workspace engine.
-- One shared model for every AI persona (tool_key: 'planner' | 'atlas' |
-- future personas), replacing the old flat chat_messages/atlas_chat_messages
-- rolling logs above. Those two tables are left in place but the app stops
-- writing to them — there's nothing meaningful to migrate forward given
-- their 24h purge already limited what they ever held. Each message is an
-- ordered jsonb array of typed "parts" (text today; task/confirmation/table/
-- file-attachment parts land in later phases) instead of a plain string.
CREATE TABLE IF NOT EXISTS conversations (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tool_key        text        NOT NULL,
  title           text        NOT NULL DEFAULT 'New Chat',
  pinned          boolean     NOT NULL DEFAULT false,
  archived        boolean     NOT NULL DEFAULT false,
  last_message_at timestamptz DEFAULT now(),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own conversations" ON conversations;
CREATE POLICY "Users can manage own conversations"
  ON conversations FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS conversations_user_tool_last_message
  ON conversations (user_id, tool_key, last_message_at DESC);

-- 5b. Conversation messages — parts-based, replaces plain-string messages.
CREATE TABLE IF NOT EXISTS conversation_messages (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id uuid        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            text        NOT NULL CHECK (role IN ('user', 'assistant')),
  parts           jsonb       NOT NULL,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own conversation messages" ON conversation_messages;
CREATE POLICY "Users can manage own conversation messages"
  ON conversation_messages FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS conversation_messages_conversation_created
  ON conversation_messages (conversation_id, created_at ASC);


-- 6. Generated files — Storage bucket backing the generate_file tool
-- (docx/xlsx/pdf/pptx/csv/md/txt attachments). Public bucket so the
-- returned URL can be used directly as a download link in a
-- file_attachment message part; per-user RLS still restricts who can
-- WRITE into each folder. Objects are named "<user_id>/<timestamp>-<name>",
-- so a public URL is only guessable by someone who already has it.
INSERT INTO storage.buckets (id, name, public)
VALUES ('generated-files', 'generated-files', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Users can upload own generated files" ON storage.objects;
CREATE POLICY "Users can upload own generated files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'generated-files' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Users can manage own generated files" ON storage.objects;
CREATE POLICY "Users can manage own generated files"
  ON storage.objects FOR ALL
  USING (bucket_id = 'generated-files' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'generated-files' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Anyone can read generated files" ON storage.objects;
CREATE POLICY "Anyone can read generated files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'generated-files');


-- ─────────────────────────────────────────────────────────────
-- OPTIONAL: server-side 24h cleanup via pg_cron
-- (requires pg_cron extension — Supabase Settings → Extensions)
--
-- SELECT cron.schedule(
--   'delete-old-chat-messages',
--   '0 * * * *',
--   $$ DELETE FROM chat_messages WHERE created_at < now() - interval '24 hours'; $$
-- );
-- SELECT cron.schedule(
--   'delete-old-atlas-chat-messages',
--   '0 * * * *',
--   $$ DELETE FROM atlas_chat_messages WHERE created_at < now() - interval '24 hours'; $$
-- );
-- ─────────────────────────────────────────────────────────────
