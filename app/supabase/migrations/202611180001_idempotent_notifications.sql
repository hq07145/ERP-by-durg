-- ====================================================================
-- Migration: 202611180001_idempotent_notifications.sql
-- Description: Implement Idempotent Notification Generation
-- 1. Extend enums for GOODS_RETURN and goods_return
-- 2. Add event identity columns (event_type, entity_type, entity_id, event_version, idempotency_key)
-- 3. Audit and clean existing duplicate records (preserving earliest ID, timestamp, and merged read state)
-- 4. Apply NOT NULL and UNIQUE constraint on (business_id, user_id, idempotency_key)
-- 5. Replace create_notification with atomic idempotent upsert
-- 6. Remove redundant DB triggers that cause dual-path duplicate notifications
-- ====================================================================

-- 1. Extend enum types (must be done outside transaction in postgres if altering enum values)
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'GOODS_RETURN';
ALTER TYPE notification_ref_type ADD VALUE IF NOT EXISTS 'goods_return';

-- 2. Add new columns
ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS event_type TEXT,
  ADD COLUMN IF NOT EXISTS entity_type TEXT,
  ADD COLUMN IF NOT EXISTS entity_id UUID,
  ADD COLUMN IF NOT EXISTS event_version TEXT DEFAULT '1',
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- 3. Clean up existing duplicates safely before adding UNIQUE constraint
DO $$
DECLARE
  v_dupe RECORD;
  v_surviving_id UUID;
  v_redundant_ids UUID[];
  v_any_read BOOLEAN;
  v_min_read_at TIMESTAMPTZ;
BEGIN
  FOR v_dupe IN
    SELECT
      business_id,
      user_id,
      type,
      ref_type,
      ref_id,
      ARRAY_AGG(id ORDER BY created_at ASC, id ASC) as ids,
      BOOL_OR(is_read) as any_read,
      MIN(read_at) as min_read_at
    FROM notifications
    GROUP BY business_id, user_id, type, ref_type, ref_id
    HAVING count(*) > 1
  LOOP
    v_surviving_id := v_dupe.ids[1];
    v_redundant_ids := v_dupe.ids[2:array_length(v_dupe.ids, 1)];

    -- Preserve read state: if any duplicate in the group was read, mark surviving record as read
    IF v_dupe.any_read THEN
      UPDATE notifications
      SET is_read = TRUE,
          read_at = COALESCE(read_at, v_dupe.min_read_at, NOW())
      WHERE id = v_surviving_id;
    END IF;

    -- Delete redundant duplicate records
    DELETE FROM notifications
    WHERE id = ANY(v_redundant_ids);
  END LOOP;
END $$;

-- 4. Backfill event identity and idempotency_key for all surviving notifications
UPDATE notifications
SET
  event_type = COALESCE(event_type, type::TEXT),
  entity_type = COALESCE(entity_type, ref_type::TEXT),
  entity_id = COALESCE(entity_id, ref_id),
  event_version = COALESCE(event_version, '1'),
  idempotency_key = COALESCE(
    idempotency_key,
    COALESCE(event_type, type::TEXT) || ':' ||
    COALESCE(entity_type, ref_type::TEXT) || ':' ||
    COALESCE(entity_id, ref_id)::TEXT || ':' ||
    COALESCE(event_version, '1')
  )
WHERE idempotency_key IS NULL OR event_type IS NULL OR entity_type IS NULL OR entity_id IS NULL;

-- 5. Enforce NOT NULL and UNIQUE constraint
ALTER TABLE notifications
  ALTER COLUMN event_type SET NOT NULL,
  ALTER COLUMN entity_type SET NOT NULL,
  ALTER COLUMN entity_id SET NOT NULL,
  ALTER COLUMN event_version SET NOT NULL,
  ALTER COLUMN idempotency_key SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_notifications_user_idempotency'
  ) THEN
    ALTER TABLE notifications
      ADD CONSTRAINT uq_notifications_user_idempotency
      UNIQUE (business_id, user_id, idempotency_key);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notifications_idempotency
  ON notifications(business_id, user_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_notifications_event_entity
  ON notifications(entity_type, entity_id);

-- 6. Atomic, idempotent notification creation function
DROP FUNCTION IF EXISTS public.create_notification(UUID, UUID, notification_type, TEXT, TEXT, notification_ref_type, UUID);

CREATE OR REPLACE FUNCTION create_notification(
  p_business_id UUID,
  p_user_id UUID,
  p_type notification_type,
  p_title TEXT,
  p_message TEXT,
  p_ref_type notification_ref_type,
  p_ref_id UUID,
  p_event_type TEXT DEFAULT NULL,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL,
  p_event_version TEXT DEFAULT '1',
  p_idempotency_key TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id UUID;
  v_event_type TEXT;
  v_entity_type TEXT;
  v_entity_id UUID;
  v_event_version TEXT;
  v_idempotency_key TEXT;
BEGIN
  v_event_type := COALESCE(p_event_type, p_type::TEXT);
  v_entity_type := COALESCE(p_entity_type, p_ref_type::TEXT);
  v_entity_id := COALESCE(p_entity_id, p_ref_id);
  v_event_version := COALESCE(p_event_version, '1');
  v_idempotency_key := COALESCE(
    p_idempotency_key,
    v_event_type || ':' || v_entity_type || ':' || v_entity_id || ':' || v_event_version
  );

  INSERT INTO notifications (
    business_id,
    user_id,
    type,
    title,
    message,
    ref_type,
    ref_id,
    event_type,
    entity_type,
    entity_id,
    event_version,
    idempotency_key
  )
  VALUES (
    p_business_id,
    p_user_id,
    p_type,
    p_title,
    p_message,
    p_ref_type,
    p_ref_id,
    v_event_type,
    v_entity_type,
    v_entity_id,
    v_event_version,
    v_idempotency_key
  )
  ON CONFLICT (business_id, user_id, idempotency_key)
  DO UPDATE SET
    business_id = EXCLUDED.business_id -- Atomic no-op to guarantee RETURNING id
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

-- 7. Remove dual-path database triggers (Centralized in notification service)
DROP TRIGGER IF EXISTS trigger_notify_order_event ON orders;
DROP TRIGGER IF EXISTS trigger_notify_delivery_event ON deliveries;
DROP TRIGGER IF EXISTS trigger_notify_production_event ON production_orders;
DROP TRIGGER IF EXISTS trigger_notify_payment_event ON payments;
DROP TRIGGER IF EXISTS trigger_notify_quality_check ON quality_checks;
DROP TRIGGER IF EXISTS trigger_check_material_shortage ON production_orders;

-- 8. Grant permissions
GRANT EXECUTE ON FUNCTION public.create_notification(UUID, UUID, notification_type, TEXT, TEXT, notification_ref_type, UUID, TEXT, TEXT, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_notification(UUID, UUID, notification_type, TEXT, TEXT, notification_ref_type, UUID, TEXT, TEXT, UUID, TEXT, TEXT) TO service_role;
