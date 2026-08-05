-- Phase 3: normalized, record-level planner task storage.
-- Apply before enabling the record sync deployment. The legacy
-- user_app_data.tasks JSON snapshot remains untouched for rollback.

CREATE TABLE IF NOT EXISTS public.planner_tasks (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 500),
  task_date DATE,
  task_type TEXT NOT NULL DEFAULT 'task'
    CHECK (task_type IN ('task', 'deadline', 'break')),
  start_hour SMALLINT CHECK (start_hour BETWEEN 0 AND 23),
  start_minute SMALLINT CHECK (start_minute BETWEEN 0 AND 59),
  duration_minutes INTEGER CHECK (duration_minutes > 0 AND duration_minutes <= 10080),
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  complexity TEXT CHECK (complexity IN ('easy', 'medium', 'hard')),
  repeat_rule TEXT CHECK (repeat_rule IN ('daily', 'weekly', 'monthly')),
  repeat_end DATE,
  notes TEXT NOT NULL DEFAULT '',
  group_id TEXT,
  reminder_offset INTEGER CHECK (reminder_offset >= 0 AND reminder_offset <= 43200),
  reminder_disabled BOOLEAN NOT NULL DEFAULT FALSE,
  shared_object_id TEXT,
  extra JSONB NOT NULL DEFAULT '{}'::jsonb,
  revision BIGINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, id)
);

ALTER TABLE public.planner_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own planner tasks" ON public.planner_tasks;
CREATE POLICY "Users read own planner tasks"
  ON public.planner_tasks FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users create own planner tasks" ON public.planner_tasks;
CREATE POLICY "Users create own planner tasks"
  ON public.planner_tasks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own planner tasks" ON public.planner_tasks;
CREATE POLICY "Users update own planner tasks"
  ON public.planner_tasks FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own planner tasks" ON public.planner_tasks;
CREATE POLICY "Users delete own planner tasks"
  ON public.planner_tasks FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS planner_tasks_user_date_active
  ON public.planner_tasks (user_id, task_date)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS planner_tasks_user_updated
  ON public.planner_tasks (user_id, updated_at DESC);

CREATE OR REPLACE FUNCTION public.touch_planner_task()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  NEW.revision = OLD.revision + 1;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS planner_tasks_touch ON public.planner_tasks;
CREATE TRIGGER planner_tasks_touch
  BEFORE UPDATE ON public.planner_tasks
  FOR EACH ROW EXECUTE FUNCTION public.touch_planner_task();

-- Backfill the current JSON snapshot. Invalid entries are skipped rather than
-- aborting the migration. Original fields not promoted to columns remain in
-- `extra`, so rollback and future migrations do not lose information.
INSERT INTO public.planner_tasks (
  user_id, id, title, task_date, task_type,
  start_hour, start_minute, duration_minutes, completed, complexity,
  repeat_rule, repeat_end, notes, group_id, reminder_offset,
  reminder_disabled, shared_object_id, extra
)
SELECT
  app.user_id,
  item->>'id',
  LEFT(item->>'title', 500),
  CASE WHEN COALESCE(item->>'date', '') ~ '^\d{4}-\d{2}-\d{2}$'
    THEN (item->>'date')::date END,
  CASE WHEN item->>'type' IN ('task', 'deadline', 'break')
    THEN item->>'type' ELSE 'task' END,
  CASE WHEN (item->>'startHour') ~ '^\d+$'
    AND (item->>'startHour')::int BETWEEN 0 AND 23
    THEN (item->>'startHour')::smallint END,
  CASE WHEN (item->>'startMinute') ~ '^\d+$'
    AND (item->>'startMinute')::int BETWEEN 0 AND 59
    THEN (item->>'startMinute')::smallint END,
  CASE WHEN (item->>'duration') ~ '^\d+$'
    AND (item->>'duration')::int BETWEEN 1 AND 10080
    THEN (item->>'duration')::int END,
  CASE WHEN item->>'completed' IN ('true', 'false')
    THEN (item->>'completed')::boolean ELSE FALSE END,
  CASE WHEN item->>'complexity' IN ('easy', 'medium', 'hard')
    THEN item->>'complexity' END,
  CASE WHEN item->>'repeat' IN ('daily', 'weekly', 'monthly')
    THEN item->>'repeat' END,
  CASE WHEN COALESCE(item->>'repeatEnd', '') ~ '^\d{4}-\d{2}-\d{2}$'
    THEN (item->>'repeatEnd')::date END,
  COALESCE(item->>'notes', item->>'note', ''),
  item->>'groupId',
  CASE WHEN (item->>'reminderOffset') ~ '^\d+$'
    THEN LEAST((item->>'reminderOffset')::int, 43200) END,
  COALESCE(item->>'reminderOffset' = 'none', FALSE),
  item->>'sharedObjectId',
  item
FROM public.user_app_data AS app
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(app.tasks) = 'array' THEN app.tasks ELSE '[]'::jsonb END
) AS item
WHERE
  COALESCE(item->>'id', '') <> ''
  AND COALESCE(item->>'title', '') <> ''
ON CONFLICT (user_id, id) DO NOTHING;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.planner_tasks;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;
