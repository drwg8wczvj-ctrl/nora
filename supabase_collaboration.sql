-- ─────────────────────────────────────────────────────────────
-- NORA — Collaboration tables
-- Run once in Supabase SQL Editor (safe to re-run with IF NOT EXISTS)
-- ─────────────────────────────────────────────────────────────

-- 1. Extend user_profile with username + avatar color
ALTER TABLE user_profile
  ADD COLUMN IF NOT EXISTS username    TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS avatar_color TEXT DEFAULT '#8b5cf6';

-- Allow all authenticated users to read profiles (for username search)
DROP POLICY IF EXISTS "Public profile read" ON user_profile;
CREATE POLICY "Public profile read"
  ON user_profile FOR SELECT TO authenticated
  USING (true);


-- 2. shared_objects — tasks, deadlines, whiteboards
CREATE TABLE IF NOT EXISTS shared_objects (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL CHECK (type IN ('task','deadline','whiteboard')),
  data        JSONB       NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE shared_objects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Object accessible to collaborators" ON shared_objects;
CREATE POLICY "Object accessible to collaborators"
  ON shared_objects FOR ALL TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM object_collaborators
      WHERE object_id = shared_objects.id
        AND user_id   = auth.uid()
    )
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM object_collaborators
      WHERE object_id = shared_objects.id
        AND user_id   = auth.uid()
        AND role IN ('editor','owner')
    )
  );

-- Enable realtime on shared_objects
ALTER PUBLICATION supabase_realtime ADD TABLE shared_objects;


-- 3. object_collaborators
CREATE TABLE IF NOT EXISTS object_collaborators (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id   UUID        NOT NULL REFERENCES shared_objects(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT        NOT NULL CHECK (role IN ('owner','editor','viewer')) DEFAULT 'editor',
  invited_by  UUID        REFERENCES auth.users(id),
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (object_id, user_id)
);

ALTER TABLE object_collaborators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Collaborator row visible to members" ON object_collaborators;
CREATE POLICY "Collaborator row visible to members"
  ON object_collaborators FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM object_collaborators AS oc
      WHERE oc.object_id = object_collaborators.object_id
        AND oc.user_id   = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM shared_objects
      WHERE id = object_collaborators.object_id
        AND owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owner manages collaborators" ON object_collaborators;
CREATE POLICY "Owner manages collaborators"
  ON object_collaborators FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM shared_objects
      WHERE id = object_collaborators.object_id
        AND owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM shared_objects
      WHERE id = object_collaborators.object_id
        AND owner_id = auth.uid()
    )
  );

-- Self can insert when joining via invite code
DROP POLICY IF EXISTS "Self insert on join" ON object_collaborators;
CREATE POLICY "Self insert on join"
  ON object_collaborators FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE object_collaborators;


-- 4. object_comments
CREATE TABLE IF NOT EXISTS object_comments (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id   UUID        NOT NULL REFERENCES shared_objects(id) ON DELETE CASCADE,
  author_id   UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     TEXT        NOT NULL CHECK (length(trim(content)) > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE object_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Comments visible to members" ON object_comments;
CREATE POLICY "Comments visible to members"
  ON object_comments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM object_collaborators
      WHERE object_id = object_comments.object_id AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM shared_objects
      WHERE id = object_comments.object_id AND owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Members can post comments" ON object_comments;
CREATE POLICY "Members can post comments"
  ON object_comments FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND (
      EXISTS (SELECT 1 FROM object_collaborators WHERE object_id = object_comments.object_id AND user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM shared_objects WHERE id = object_comments.object_id AND owner_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "Author edits own comment" ON object_comments;
CREATE POLICY "Author edits own comment"
  ON object_comments FOR UPDATE TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());

DROP POLICY IF EXISTS "Author deletes own comment" ON object_comments;
CREATE POLICY "Author deletes own comment"
  ON object_comments FOR DELETE TO authenticated
  USING (author_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE object_comments;


-- 5. object_activity_log
CREATE TABLE IF NOT EXISTS object_activity_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id   UUID        NOT NULL REFERENCES shared_objects(id) ON DELETE CASCADE,
  actor_id    UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action      TEXT        NOT NULL,
  details     JSONB       DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE object_activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Activity visible to members" ON object_activity_log;
CREATE POLICY "Activity visible to members"
  ON object_activity_log FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM object_collaborators
      WHERE object_id = object_activity_log.object_id AND user_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM shared_objects
      WHERE id = object_activity_log.object_id AND owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Members can log activity" ON object_activity_log;
CREATE POLICY "Members can log activity"
  ON object_activity_log FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());


-- 6. object_invites — invite codes
CREATE TABLE IF NOT EXISTS object_invites (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  object_id   UUID        NOT NULL REFERENCES shared_objects(id) ON DELETE CASCADE,
  created_by  UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code        TEXT        UNIQUE NOT NULL,
  role        TEXT        NOT NULL CHECK (role IN ('editor','viewer')) DEFAULT 'editor',
  uses        INT         NOT NULL DEFAULT 0,
  max_uses    INT,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE object_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner manages invites" ON object_invites;
CREATE POLICY "Owner manages invites"
  ON object_invites FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM shared_objects
      WHERE id = object_invites.object_id AND owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM shared_objects
      WHERE id = object_invites.object_id AND owner_id = auth.uid()
    )
  );

-- Anyone authenticated can read an invite (to join via code)
DROP POLICY IF EXISTS "Authenticated can read invites" ON object_invites;
CREATE POLICY "Authenticated can read invites"
  ON object_invites FOR SELECT TO authenticated
  USING (true);


-- 7. Helper: updated_at trigger for shared_objects
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shared_objects_updated_at ON shared_objects;
CREATE TRIGGER shared_objects_updated_at
  BEFORE UPDATE ON shared_objects
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS object_comments_updated_at ON object_comments;
CREATE TRIGGER object_comments_updated_at
  BEFORE UPDATE ON object_comments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


-- 8. Index for performance
CREATE INDEX IF NOT EXISTS idx_object_collaborators_user   ON object_collaborators (user_id);
CREATE INDEX IF NOT EXISTS idx_object_collaborators_object ON object_collaborators (object_id);
CREATE INDEX IF NOT EXISTS idx_object_comments_object      ON object_comments (object_id, created_at);
CREATE INDEX IF NOT EXISTS idx_object_activity_object      ON object_activity_log (object_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_objects_owner        ON shared_objects (owner_id);
CREATE INDEX IF NOT EXISTS idx_user_profile_username       ON user_profile (username);