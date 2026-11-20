-- ==============================================================================
-- Migration: 202611180002_notification_24h_retention.sql
-- Description: Automatic 24-hour permanent deletion policy for notifications,
--              audit logging table, advisory-locked cleanup procedure,
--              hardened SECURITY DEFINER RPC functions with strict auth.uid()
--              caller validation, and pg_cron 5-minute automated schedule.
-- ==============================================================================

-- 1. Create cleanup audit log table
CREATE TABLE IF NOT EXISTS public.notification_cleanup_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cutoff_timestamp TIMESTAMPTZ NOT NULL,
    deleted_count INT NOT NULL DEFAULT 0,
    execution_duration_ms INT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL CHECK (status IN ('SUCCESS', 'FAILED', 'SKIPPED')),
    error_message TEXT NULL,
    triggered_by VARCHAR(50) NOT NULL DEFAULT 'cron'
);

-- Index for querying recent cleanup logs
CREATE INDEX IF NOT EXISTS idx_notification_cleanup_logs_executed_at 
ON public.notification_cleanup_logs (executed_at DESC);

-- Ensure index exists on notifications(created_at) for fast range deletion & filtering
CREATE INDEX IF NOT EXISTS idx_notifications_created_at 
ON public.notifications (created_at);

-- 2. Create the cleanup function with advisory locking, error handling, and ms logging
CREATE OR REPLACE FUNCTION public.cleanup_expired_notifications()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_id CONSTANT BIGINT := 884729103;
  v_locked BOOLEAN := FALSE;
  v_start_time TIMESTAMPTZ;
  v_cutoff TIMESTAMPTZ;
  v_deleted_count INT := 0;
  v_duration_ms INT := 0;
BEGIN
  v_start_time := clock_timestamp();
  v_cutoff := NOW() - INTERVAL '24 hours';

  -- 1. Try to acquire advisory lock to prevent overlapping executions
  v_locked := pg_try_advisory_lock(v_lock_id);
  IF NOT v_locked THEN
    v_duration_ms := ROUND((EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000))::INT;
    INSERT INTO public.notification_cleanup_logs (
      executed_at,
      cutoff_timestamp,
      deleted_count,
      execution_duration_ms,
      status,
      error_message,
      triggered_by
    ) VALUES (
      NOW(),
      v_cutoff,
      0,
      v_duration_ms,
      'SKIPPED',
      'Skipped: Another cleanup process is already running and holding advisory lock.',
      'cron'
    );
    RETURN 0;
  END IF;

  -- 2. Execute atomic deletion
  DELETE FROM public.notifications
  WHERE created_at <= v_cutoff;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- 3. Calculate execution duration in milliseconds
  v_duration_ms := ROUND((EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000))::INT;

  -- 4. Log successful cleanup
  INSERT INTO public.notification_cleanup_logs (
    executed_at,
    cutoff_timestamp,
    deleted_count,
    execution_duration_ms,
    status,
    error_message,
    triggered_by
  ) VALUES (
    NOW(),
    v_cutoff,
    v_deleted_count,
    v_duration_ms,
    'SUCCESS',
    NULL,
    'cron'
  );

  -- 5. Release advisory lock
  PERFORM pg_advisory_unlock(v_lock_id);

  RETURN v_deleted_count;

EXCEPTION WHEN OTHERS THEN
  -- Compute elapsed duration even on failure
  v_duration_ms := ROUND((EXTRACT(EPOCH FROM (clock_timestamp() - v_start_time)) * 1000))::INT;

  -- Log failure
  INSERT INTO public.notification_cleanup_logs (
    executed_at,
    cutoff_timestamp,
    deleted_count,
    execution_duration_ms,
    status,
    error_message,
    triggered_by
  ) VALUES (
    NOW(),
    v_cutoff,
    0,
    v_duration_ms,
    'FAILED',
    SQLERRM,
    'cron'
  );

  -- Ensure advisory lock is released if it was acquired
  IF v_locked THEN
    PERFORM pg_advisory_unlock(v_lock_id);
  END IF;

  RAISE;
END;
$$;

-- 3. Helper function for strict caller authorization
-- Validates auth.uid() against p_user_id and prevents users from reading other users' notifications
CREATE OR REPLACE FUNCTION public.check_notification_access(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_auth_id UUID;
  v_resolved_user_id UUID;
BEGIN
  v_caller_auth_id := auth.uid();

  -- Case A: Caller has an authenticated Supabase session (auth.uid() is set)
  IF v_caller_auth_id IS NOT NULL THEN
    -- Verify that the caller's auth_user_id matches the target user's public.users record
    SELECT id INTO v_resolved_user_id
    FROM public.users
    WHERE (id = p_user_id OR auth_user_id = p_user_id)
      AND auth_user_id = v_caller_auth_id;

    IF v_resolved_user_id IS NULL THEN
      RAISE EXCEPTION 'Access denied: You are not authorized to access notifications for user %', p_user_id
        USING ERRCODE = '42501'; -- insufficient_privilege
    END IF;

    RETURN v_resolved_user_id;

  -- Case B: Internal PostgreSQL or Supabase service_role connection
  ELSIF current_user IN ('postgres') 
     OR COALESCE(current_setting('request.jwt.claim.role', true), '') IN ('service_role') THEN
    SELECT id INTO v_resolved_user_id
    FROM public.users
    WHERE id = p_user_id OR auth_user_id = p_user_id;

    RETURN COALESCE(v_resolved_user_id, p_user_id);

  -- Case C: Unauthenticated / Anonymous caller
  ELSE
    RAISE EXCEPTION 'Access denied: Authentication required.'
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;
END;
$$;

-- 4. Hardened notification retrieval RPC functions enforcing 24h retention + strict authorization
CREATE OR REPLACE FUNCTION public.get_unread_notification_count(
  p_user_id UUID
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_user_id UUID;
  v_count INTEGER;
BEGIN
  -- Strict caller authorization check
  v_target_user_id := public.check_notification_access(p_user_id);

  SELECT COUNT(*) INTO v_count
  FROM public.notifications
  WHERE user_id = v_target_user_id 
    AND is_read = FALSE
    AND created_at > NOW() - INTERVAL '24 hours';

  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_notifications(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_unread_only BOOLEAN DEFAULT FALSE
) RETURNS SETOF public.notifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_user_id UUID;
BEGIN
  -- Strict caller authorization check
  v_target_user_id := public.check_notification_access(p_user_id);

  RETURN QUERY
  SELECT *
  FROM public.notifications
  WHERE user_id = v_target_user_id
    AND (p_unread_only = FALSE OR is_read = FALSE)
    AND created_at > NOW() - INTERVAL '24 hours'
  ORDER BY created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- 5. Hardened mark read functions enforcing strict authorization
CREATE OR REPLACE FUNCTION public.mark_notification_read(
  p_notification_id UUID,
  p_user_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_user_id UUID;
  v_updated BOOLEAN;
BEGIN
  v_target_user_id := public.check_notification_access(p_user_id);

  UPDATE public.notifications
  SET is_read = TRUE, read_at = NOW()
  WHERE id = p_notification_id 
    AND user_id = v_target_user_id 
    AND is_read = FALSE;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read(
  p_user_id UUID
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_user_id UUID;
  v_count INTEGER;
BEGIN
  v_target_user_id := public.check_notification_access(p_user_id);

  UPDATE public.notifications
  SET is_read = TRUE, read_at = NOW()
  WHERE user_id = v_target_user_id 
    AND is_read = FALSE;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- 6. Enable pg_cron and schedule automatic cleanup every 5 minutes
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-expired-notifications') THEN
    PERFORM cron.unschedule('cleanup-expired-notifications');
  END IF;
END $$;

SELECT cron.schedule(
  'cleanup-expired-notifications',
  '*/5 * * * *',
  'SELECT public.cleanup_expired_notifications();'
);
