-- Phase 0: durable, atomic per-user API rate limits.
-- This migration must be applied before deploying the authenticated API code.

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL,
  window_started_at TIMESTAMPTZ NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  PRIMARY KEY (user_id, bucket)
);

ALTER TABLE public.api_rate_limits ENABLE ROW LEVEL SECURITY;

-- No client policies are intentional. Only service_role-backed API handlers
-- may inspect or mutate rate-limit counters.

CREATE OR REPLACE FUNCTION public.consume_api_rate_limit(
  p_user_id UUID,
  p_bucket TEXT,
  p_limit INTEGER,
  p_window_seconds INTEGER
)
RETURNS TABLE(allowed BOOLEAN, remaining INTEGER, reset_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_row public.api_rate_limits%ROWTYPE;
BEGIN
  IF p_limit < 1 OR p_window_seconds < 1 OR length(p_bucket) > 80 THEN
    RAISE EXCEPTION 'invalid rate limit configuration';
  END IF;

  INSERT INTO public.api_rate_limits AS limits (
    user_id, bucket, window_started_at, request_count
  )
  VALUES (p_user_id, p_bucket, v_now, 1)
  ON CONFLICT (user_id, bucket) DO UPDATE
  SET
    window_started_at = CASE
      WHEN limits.window_started_at + make_interval(secs => p_window_seconds) <= v_now
      THEN v_now ELSE limits.window_started_at END,
    request_count = CASE
      WHEN limits.window_started_at + make_interval(secs => p_window_seconds) <= v_now
      THEN 1 ELSE limits.request_count + 1 END
  RETURNING * INTO v_row;

  allowed := v_row.request_count <= p_limit;
  remaining := GREATEST(0, p_limit - v_row.request_count);
  reset_at := v_row.window_started_at + make_interval(secs => p_window_seconds);
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_api_rate_limit(UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_api_rate_limit(UUID, TEXT, INTEGER, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.consume_api_rate_limit(UUID, TEXT, INTEGER, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_api_rate_limit(UUID, TEXT, INTEGER, INTEGER) TO service_role;
