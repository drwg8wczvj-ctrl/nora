-- ─────────────────────────────────────────────────────────────
-- NORA — User Profiles & Avatars
-- Extends supabase_collaboration.sql
-- Run once in Supabase SQL Editor (safe to re-run)
-- ─────────────────────────────────────────────────────────────

-- Extend user_profile with avatar + profile fields
ALTER TABLE user_profile
  ADD COLUMN IF NOT EXISTS avatar_type         TEXT    DEFAULT 'color'
    CHECK (avatar_type IN ('color','emoji','upload')),
  ADD COLUMN IF NOT EXISTS avatar_emoji        TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url          TEXT,
  ADD COLUMN IF NOT EXISTS bio                 TEXT,
  ADD COLUMN IF NOT EXISTS location            TEXT,
  ADD COLUMN IF NOT EXISTS timezone            TEXT    DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS username_changed_at TIMESTAMPTZ;

-- Update updated_at trigger for user_profile
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_profile_updated_at ON user_profile;
CREATE TRIGGER user_profile_updated_at
  BEFORE UPDATE ON user_profile
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Allow users to update their own profile
DROP POLICY IF EXISTS "Users can update own profile" ON user_profile;
CREATE POLICY "Users can update own profile"
  ON user_profile FOR UPDATE TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Allow users to insert their own profile
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profile;
CREATE POLICY "Users can insert own profile"
  ON user_profile FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Supabase Storage: create avatars bucket (run this separately in Storage tab or via API)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT DO NOTHING;
-- CREATE POLICY "Avatar images are publicly accessible"
--   ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
-- CREATE POLICY "Users can upload own avatar"
--   ON storage.objects FOR INSERT TO authenticated
--   WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
-- CREATE POLICY "Users can update own avatar"
--   ON storage.objects FOR UPDATE TO authenticated
--   USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Index for faster profile lookups
CREATE INDEX IF NOT EXISTS idx_user_profile_user_id ON user_profile (user_id);