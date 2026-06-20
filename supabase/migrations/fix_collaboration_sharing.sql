-- Fix collaboration RLS recursion and allow owners to create the first access row.
-- The previous policies queried object_collaborators from that table's own policy,
-- which PostgreSQL rejects as infinite recursion.

CREATE OR REPLACE FUNCTION public.is_shared_object_owner(target_object_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.shared_objects
    WHERE id = target_object_id
      AND owner_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_shared_object_member(
  target_object_id UUID,
  allowed_roles TEXT[] DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.object_collaborators
    WHERE object_id = target_object_id
      AND user_id = auth.uid()
      AND (allowed_roles IS NULL OR role = ANY(allowed_roles))
  );
$$;

REVOKE ALL ON FUNCTION public.is_shared_object_owner(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_shared_object_member(UUID, TEXT[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_shared_object_owner(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_shared_object_member(UUID, TEXT[]) TO authenticated;

DROP POLICY IF EXISTS "Object accessible to collaborators" ON public.shared_objects;
DROP POLICY IF EXISTS "Shared objects can be read" ON public.shared_objects;
DROP POLICY IF EXISTS "Shared objects can be created" ON public.shared_objects;
DROP POLICY IF EXISTS "Shared objects can be updated" ON public.shared_objects;
DROP POLICY IF EXISTS "Shared objects can be deleted" ON public.shared_objects;

CREATE POLICY "Shared objects can be read"
  ON public.shared_objects FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_shared_object_member(id));

CREATE POLICY "Shared objects can be created"
  ON public.shared_objects FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Shared objects can be updated"
  ON public.shared_objects FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR public.is_shared_object_member(id, ARRAY['owner', 'editor'])
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR public.is_shared_object_member(id, ARRAY['owner', 'editor'])
  );

CREATE POLICY "Shared objects can be deleted"
  ON public.shared_objects FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "Collaborator row visible to members" ON public.object_collaborators;
DROP POLICY IF EXISTS "Collaborators visible to members" ON public.object_collaborators;
DROP POLICY IF EXISTS "Owner manages collaborators" ON public.object_collaborators;
DROP POLICY IF EXISTS "Self insert on join" ON public.object_collaborators;
DROP POLICY IF EXISTS "Collaborators can be read" ON public.object_collaborators;
DROP POLICY IF EXISTS "Collaborators can be added" ON public.object_collaborators;
DROP POLICY IF EXISTS "Collaborators can be updated" ON public.object_collaborators;
DROP POLICY IF EXISTS "Collaborators can be removed" ON public.object_collaborators;

CREATE POLICY "Collaborators can be read"
  ON public.object_collaborators FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_shared_object_owner(object_id)
    OR public.is_shared_object_member(object_id)
  );

CREATE POLICY "Collaborators can be added"
  ON public.object_collaborators FOR INSERT TO authenticated
  WITH CHECK (
    public.is_shared_object_owner(object_id)
    OR user_id = auth.uid()
  );

CREATE POLICY "Collaborators can be updated"
  ON public.object_collaborators FOR UPDATE TO authenticated
  USING (public.is_shared_object_owner(object_id))
  WITH CHECK (public.is_shared_object_owner(object_id));

CREATE POLICY "Collaborators can be removed"
  ON public.object_collaborators FOR DELETE TO authenticated
  USING (public.is_shared_object_owner(object_id) OR user_id = auth.uid());

-- Replace the other collaboration policies with non-recursive membership checks.
DROP POLICY IF EXISTS "Comments visible to members" ON public.object_comments;
DROP POLICY IF EXISTS "Comments visible to object members" ON public.object_comments;
CREATE POLICY "Comments visible to members"
  ON public.object_comments FOR SELECT TO authenticated
  USING (public.is_shared_object_owner(object_id) OR public.is_shared_object_member(object_id));

DROP POLICY IF EXISTS "Activity visible to members" ON public.object_activity_log;
DROP POLICY IF EXISTS "Activity visible to object members" ON public.object_activity_log;
CREATE POLICY "Activity visible to members"
  ON public.object_activity_log FOR SELECT TO authenticated
  USING (public.is_shared_object_owner(object_id) OR public.is_shared_object_member(object_id));

DROP POLICY IF EXISTS "Invite codes visible to object members" ON public.object_invites;
DROP POLICY IF EXISTS "Authenticated can read invites" ON public.object_invites;
DROP POLICY IF EXISTS "Owner manages invites" ON public.object_invites;
DROP POLICY IF EXISTS "Invite codes can be created" ON public.object_invites;
DROP POLICY IF EXISTS "Invite codes can be updated" ON public.object_invites;
DROP POLICY IF EXISTS "Invite codes can be deleted" ON public.object_invites;
CREATE POLICY "Authenticated can read invites"
  ON public.object_invites FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Invite codes can be created"
  ON public.object_invites FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_shared_object_owner(object_id)
  );

CREATE POLICY "Invite codes can be updated"
  ON public.object_invites FOR UPDATE TO authenticated
  USING (public.is_shared_object_owner(object_id))
  WITH CHECK (public.is_shared_object_owner(object_id));

CREATE POLICY "Invite codes can be deleted"
  ON public.object_invites FOR DELETE TO authenticated
  USING (public.is_shared_object_owner(object_id));
