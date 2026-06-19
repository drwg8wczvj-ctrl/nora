-- ─────────────────────────────────────────────────────────────────────────────
-- NORA — Full migration: Collaboration + Profiles + Avatars
-- Run this ONCE in the Supabase SQL Editor (safe to re-run with IF NOT EXISTS)
-- ─────────────────────────────────────────────────────────────────────────────

-- ══════════════════════════════════════════════════════════════════════════════
-- PART 1 — EXTEND user_profile
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE user_profile
  ADD COLUMN IF NOT EXISTS username             TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS avatar_color         TEXT DEFAULT '#8b5cf6',
  ADD COLUMN IF NOT EXISTS avatar_type          TEXT DEFAULT 'color'
    CHECK (avatar_type IN ('color','emoji','upload')),
  ADD COLUMN IF NOT EXISTS avatar_emoji         TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url           TEXT,
  ADD COLUMN IF NOT EXISTS bio                  TEXT,
  ADD COLUMN IF NOT EXISTS location             TEXT,
  ADD COLUMN IF NOT EXISTS timezone             TEXT DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS username_changed_at  TIMESTAMPTZ;

-- ══════════════════════════════════════════════════════════════════════════════
-- PART 2 — CREATE ALL TABLES (no policies yet)
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS shared_objects (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL CHECK (type IN ('task','deadline','whiteboard')),
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS object_collaborators (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id  UUID        NOT NULL REFERENCES shared_objects(id) ON DELETE CASCADE,
  user_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT        NOT NULL DEFAULT 'editor' CHECK (role IN ('owner','editor','viewer')),
  invited_by UUID        REFERENCES auth.users(id),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (object_id, user_id)
);

CREATE TABLE IF NOT EXISTS object_comments (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id  UUID        NOT NULL REFERENCES shared_objects(id) ON DELETE CASCADE,
  author_id  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS object_activity_log (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id  UUID        NOT NULL REFERENCES shared_objects(id) ON DELETE CASCADE,
  actor_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action     TEXT        NOT NULL,
  details    JSONB       DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS object_invites (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id  UUID        NOT NULL REFERENCES shared_objects(id) ON DELETE CASCADE,
  created_by UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code       TEXT        UNIQUE NOT NULL,
  role       TEXT        NOT NULL DEFAULT 'editor' CHECK (role IN ('editor','viewer')),
  uses       INT         NOT NULL DEFAULT 0,
  max_uses   INT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════════════════════
-- PART 3 — ENABLE RLS ON ALL TABLES
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE user_profile         ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_objects       ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_comments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_activity_log  ENABLE ROW LEVEL SECURITY;
ALTER TABLE object_invites       ENABLE ROW LEVEL SECURITY;

-- ══════════════════════════════════════════════════════════════════════════════
-- PART 4 — POLICIES (all tables exist now, cross-references are safe)
-- ══════════════════════════════════════════════════════════════════════════════

-- user_profile
DROP POLICY IF EXISTS "Public profile read"          ON user_profile;
DROP POLICY IF EXISTS "Users can update own profile" ON user_profile;
DROP POLICY IF EXISTS "Users can insert own profile" ON user_profile;

CREATE POLICY "Public profile read"
  ON user_profile FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update own profile"
  ON user_profile FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can insert own profile"
  ON user_profile FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- shared_objects — safe now because object_collaborators exists
DROP POLICY IF EXISTS "Object accessible to collaborators" ON shared_objects;
CREATE POLICY "Object accessible to collaborators" ON shared_objects
  FOR ALL TO authenticated
  USING (
    id IN (SELECT object_id FROM object_collaborators WHERE user_id = auth.uid())
  );

-- object_collaborators
DROP POLICY IF EXISTS "Collaborators visible to members" ON object_collaborators;
CREATE POLICY "Collaborators visible to members" ON object_collaborators
  FOR ALL TO authenticated
  USING (
    object_id IN (SELECT object_id FROM object_collaborators WHERE user_id = auth.uid())
  );

-- object_comments
DROP POLICY IF EXISTS "Comments visible to object members" ON object_comments;
CREATE POLICY "Comments visible to object members" ON object_comments
  FOR ALL TO authenticated
  USING (
    object_id IN (SELECT object_id FROM object_collaborators WHERE user_id = auth.uid())
  );

-- object_activity_log
DROP POLICY IF EXISTS "Activity visible to object members" ON object_activity_log;
CREATE POLICY "Activity visible to object members" ON object_activity_log
  FOR ALL TO authenticated
  USING (
    object_id IN (SELECT object_id FROM object_collaborators WHERE user_id = auth.uid())
  );

-- object_invites
DROP POLICY IF EXISTS "Invite codes visible to object members" ON object_invites;
CREATE POLICY "Invite codes visible to object members" ON object_invites
  FOR ALL TO authenticated
  USING (
    object_id IN (SELECT object_id FROM object_collaborators WHERE user_id = auth.uid())
  );

-- ══════════════════════════════════════════════════════════════════════════════
-- PART 5 — TRIGGERS & FUNCTIONS
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_profile_updated_at  ON user_profile;
DROP TRIGGER IF EXISTS shared_objects_updated_at ON shared_objects;

CREATE TRIGGER user_profile_updated_at
  BEFORE UPDATE ON user_profile
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER shared_objects_updated_at
  BEFORE UPDATE ON shared_objects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ══════════════════════════════════════════════════════════════════════════════
-- PART 6 — REALTIME
-- ══════════════════════════════════════════════════════════════════════════════

ALTER PUBLICATION supabase_realtime ADD TABLE shared_objects;
ALTER PUBLICATION supabase_realtime ADD TABLE object_collaborators;
ALTER PUBLICATION supabase_realtime ADD TABLE object_comments;

-- ══════════════════════════════════════════════════════════════════════════════
-- PART 7 — INDEXES
-- ══════════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_user_profile_user_id   ON user_profile          (user_id);
CREATE INDEX IF NOT EXISTS idx_user_profile_username   ON user_profile          (username);
CREATE INDEX IF NOT EXISTS idx_obj_collab_object       ON object_collaborators  (object_id);
CREATE INDEX IF NOT EXISTS idx_obj_collab_user         ON object_collaborators  (user_id);
CREATE INDEX IF NOT EXISTS idx_obj_comments_object     ON object_comments       (object_id);
CREATE INDEX IF NOT EXISTS idx_obj_activity_object     ON object_activity_log   (object_id);
CREATE INDEX IF NOT EXISTS idx_obj_invites_code        ON object_invites        (code);