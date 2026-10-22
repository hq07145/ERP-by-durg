-- ============================================
-- STEP 16: Notifications + Alerts
-- ============================================

BEGIN;

-- Notification types enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
    CREATE TYPE notification_type AS ENUM (
      'ORDER_NEW',
      'ORDER_CONFIRMED',
      'ORDER_CANCELLED',
      'PRODUCTION_STARTED',
      'PRODUCTION_COMPLETED',
      'PRODUCTION_DELAYED',
      'MATERIAL_SHORTAGE',
      'LOW_STOCK',
      'DELIVERY_READY',
      'DELIVERY_DISPATCHED',
      'DELIVERY_DELIVERED',
      'PAYMENT_RECEIVED',
      'PAYMENT_OVERDUE',
      'CUSTOMER_DUE',
      'CAPACITY_INSUFFICIENT',
      'QUALITY_CHECK_FAILED'
    );
  END IF;
END $$;

-- Notification reference types enum
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_ref_type') THEN
    CREATE TYPE notification_ref_type AS ENUM (
      'order',
      'production_order',
      'delivery',
      'payment',
      'customer',
      'raw_material',
      'product'
    );
  END IF;
END $$;

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  ref_type notification_ref_type NOT NULL,
  ref_id UUID NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_notifications_business_user ON notifications(business_id, user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_notifications_ref ON notifications(ref_type, ref_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- RLS Policies
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Users can only see their own notifications
CREATE POLICY "notifications_select_own" ON notifications
  FOR SELECT USING (
    auth.uid() = user_id
  );

-- Users can only update their own notifications (mark as read)
CREATE POLICY "notifications_update_own" ON notifications
  FOR UPDATE USING (
    auth.uid() = user_id
  ) WITH CHECK (
    auth.uid() = user_id
  );

-- System can insert notifications (using service role)
CREATE POLICY "notifications_insert_system" ON notifications
  FOR INSERT WITH CHECK (
    true
  );

-- Function to create a notification
CREATE OR REPLACE FUNCTION create_notification(
  p_business_id UUID,
  p_user_id UUID,
  p_type notification_type,
  p_title TEXT,
  p_message TEXT,
  p_ref_type notification_ref_type,
  p_ref_id UUID
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification_id UUID;
BEGIN
  INSERT INTO notifications (business_id, user_id, type, title, message, ref_type, ref_id)
  VALUES (p_business_id, p_user_id, p_type, p_title, p_message, p_ref_type, p_ref_id)
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;
END;
$$;

-- Function to mark notification as read
CREATE OR REPLACE FUNCTION mark_notification_read(
  p_notification_id UUID,
  p_user_id UUID
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated BOOLEAN;
BEGIN
  UPDATE notifications
  SET is_read = TRUE, read_at = NOW()
  WHERE id = p_notification_id AND user_id = p_user_id AND is_read = FALSE;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

-- Function to mark all notifications as read for a user
CREATE OR REPLACE FUNCTION mark_all_notifications_read(
  p_user_id UUID
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE notifications
  SET is_read = TRUE, read_at = NOW()
  WHERE user_id = p_user_id AND is_read = FALSE;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Function to get unread notification count
CREATE OR REPLACE FUNCTION get_unread_notification_count(
  p_user_id UUID
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM notifications
  WHERE user_id = p_user_id AND is_read = FALSE;

  RETURN v_count;
END;
$$;

-- Function to get user notifications with pagination
CREATE OR REPLACE FUNCTION get_user_notifications(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0,
  p_unread_only BOOLEAN DEFAULT FALSE
) RETURNS SETOF notifications
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM notifications
  WHERE user_id = p_user_id
    AND (p_unread_only = FALSE OR is_read = FALSE)
  ORDER BY created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- Trigger function to notify relevant users on order events
CREATE OR REPLACE FUNCTION notify_on_order_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_type notification_type;
  v_title TEXT;
  v_message TEXT;
BEGIN
  -- Determine notification type based on status change
  IF TG_OP = 'INSERT' THEN
    v_type := 'ORDER_NEW';
    v_title := 'New Order Created';
    v_message := 'Order ' || NEW.order_number || ' has been created';
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    CASE NEW.status
      WHEN 'CONFIRMED' THEN
        v_type := 'ORDER_CONFIRMED';
        v_title := 'Order Confirmed';
        v_message := 'Order ' || NEW.order_number || ' has been confirmed';
      WHEN 'CANCELLED' THEN
        v_type := 'ORDER_CANCELLED';
        v_title := 'Order Cancelled';
        v_message := 'Order ' || NEW.order_number || ' has been cancelled';
      ELSE
        RETURN NEW;
    END CASE;
  ELSE
    RETURN NEW;
  END IF;

  FOR v_user_id IN
    SELECT DISTINCT u.id
    FROM public.users u
    JOIN public.user_roles ur ON ur.user_id = u.id AND ur.business_id = u.business_id
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE u.business_id = NEW.business_id
      AND u.status = 'ACTIVE'
      AND p.module = 'orders' AND p.action = 'view'
  LOOP
    PERFORM public.create_notification(
      NEW.business_id,
      v_user_id,
      v_type,
      v_title,
      v_message,
      'order',
      NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

-- Trigger for order events
DROP TRIGGER IF EXISTS trigger_notify_order_event ON orders;
CREATE TRIGGER trigger_notify_order_event
  AFTER INSERT OR UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION notify_on_order_event();

-- Trigger function to notify on production events
CREATE OR REPLACE FUNCTION notify_on_production_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_type notification_type;
  v_title TEXT;
  v_message TEXT;
  v_order_number TEXT;
BEGIN
  -- Get order number for message
  SELECT order_number INTO v_order_number
  FROM public.orders
  WHERE id = NEW.order_id;

  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    CASE NEW.status
      WHEN 'IN_PROGRESS' THEN
        v_type := 'PRODUCTION_STARTED';
        v_title := 'Production Started';
        v_message := 'Production for order ' || COALESCE(v_order_number, NEW.order_id::TEXT) || ' has started';
      WHEN 'COMPLETED' THEN
        v_type := 'PRODUCTION_COMPLETED';
        v_title := 'Production Completed';
        v_message := 'Production for order ' || COALESCE(v_order_number, NEW.order_id::TEXT) || ' has been completed';
      WHEN 'CANCELLED' THEN
        v_type := 'PRODUCTION_DELAYED';
        v_title := 'Production Cancelled';
        v_message := 'Production for order ' || COALESCE(v_order_number, NEW.order_id::TEXT) || ' has been cancelled';
      ELSE
        RETURN NEW;
    END CASE;
  ELSE
    RETURN NEW;
  END IF;

  FOR v_user_id IN
    SELECT DISTINCT u.id
    FROM public.users u
    JOIN public.user_roles ur ON ur.user_id = u.id AND ur.business_id = u.business_id
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE u.business_id = NEW.business_id
      AND u.status = 'ACTIVE'
      AND p.module = 'production' AND p.action = 'view'
  LOOP
    PERFORM public.create_notification(
      NEW.business_id,
      v_user_id,
      v_type,
      v_title,
      v_message,
      'production_order',
      NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_production_event ON production_orders;
CREATE TRIGGER trigger_notify_production_event
  AFTER UPDATE ON production_orders
  FOR EACH ROW EXECUTE FUNCTION notify_on_production_event();

-- Trigger function to notify on quality check failure
CREATE OR REPLACE FUNCTION notify_on_quality_check()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_order_number TEXT;
BEGIN
  IF NEW.status = 'FAILED' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    SELECT o.order_number INTO v_order_number
    FROM public.orders o
    JOIN public.production_orders po ON o.id = po.order_id
    WHERE po.id = NEW.production_order_id;

    FOR v_user_id IN
      SELECT DISTINCT u.id
      FROM public.users u
      JOIN public.user_roles ur ON ur.user_id = u.id AND ur.business_id = u.business_id
      JOIN public.role_permissions rp ON rp.role_id = ur.role_id
      JOIN public.permissions p ON p.id = rp.permission_id
      WHERE u.business_id = NEW.business_id
        AND u.status = 'ACTIVE'
        AND p.module = 'production' AND p.action = 'view'
    LOOP
      PERFORM public.create_notification(
        NEW.business_id,
        v_user_id,
        'QUALITY_CHECK_FAILED',
        'Quality Check Failed',
        'Quality check failed for order ' || COALESCE(v_order_number, 'unknown') || ': ' || COALESCE(NEW.notes, 'No details'),
        'production_order',
        NEW.production_order_id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_quality_check ON quality_checks;
CREATE TRIGGER trigger_notify_quality_check
  AFTER INSERT OR UPDATE ON quality_checks
  FOR EACH ROW EXECUTE FUNCTION notify_on_quality_check();

-- Trigger function to notify on delivery events
CREATE OR REPLACE FUNCTION notify_on_delivery_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_type notification_type;
  v_title TEXT;
  v_message TEXT;
  v_order_number TEXT;
BEGIN
  SELECT order_number INTO v_order_number
  FROM public.orders
  WHERE id = NEW.order_id;

  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    CASE NEW.status
      WHEN 'READY' THEN
        v_type := 'DELIVERY_READY';
        v_title := 'Delivery Ready';
        v_message := 'Order ' || COALESCE(v_order_number, NEW.order_id::TEXT) || ' is ready for delivery';
      WHEN 'DISPATCHED' THEN
        v_type := 'DELIVERY_DISPATCHED';
        v_title := 'Delivery Dispatched';
        v_message := 'Delivery for order ' || COALESCE(v_order_number, NEW.order_id::TEXT) || ' has been dispatched';
      WHEN 'DELIVERED' THEN
        v_type := 'DELIVERY_DELIVERED';
        v_title := 'Delivery Completed';
        v_message := 'Delivery for order ' || COALESCE(v_order_number, NEW.order_id::TEXT) || ' has been completed';
      ELSE
        RETURN NEW;
    END CASE;
  ELSE
    RETURN NEW;
  END IF;

  FOR v_user_id IN
    SELECT DISTINCT u.id
    FROM public.users u
    JOIN public.user_roles ur ON ur.user_id = u.id AND ur.business_id = u.business_id
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE u.business_id = NEW.business_id
      AND u.status = 'ACTIVE'
      AND p.module = 'delivery' AND p.action = 'view'
  LOOP
    PERFORM public.create_notification(
      NEW.business_id,
      v_user_id,
      v_type,
      v_title,
      v_message,
      'delivery',
      NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_delivery_event ON deliveries;
CREATE TRIGGER trigger_notify_delivery_event
  AFTER UPDATE ON deliveries
  FOR EACH ROW EXECUTE FUNCTION notify_on_delivery_event();

-- Trigger function to notify on payment events
CREATE OR REPLACE FUNCTION notify_on_payment_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_type notification_type;
  v_title TEXT;
  v_message TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_type := 'PAYMENT_RECEIVED';
    v_title := 'Payment Received';
    v_message := 'Payment ' || NEW.payment_number || ' of ' || NEW.amount || ' has been received';
  ELSIF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'SUCCESS' THEN
    v_type := 'PAYMENT_RECEIVED';
    v_title := 'Payment Received';
    v_message := 'Payment ' || NEW.payment_number || ' of ' || NEW.amount || ' has been confirmed';
  ELSE
    RETURN NEW;
  END IF;

  FOR v_user_id IN
    SELECT DISTINCT u.id
    FROM public.users u
    JOIN public.user_roles ur ON ur.user_id = u.id AND ur.business_id = u.business_id
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE u.business_id = NEW.business_id
      AND u.status = 'ACTIVE'
      AND p.module = 'payments' AND p.action = 'view'
  LOOP
    PERFORM public.create_notification(
      NEW.business_id,
      v_user_id,
      v_type,
      v_title,
      v_message,
      'payment',
      NEW.id
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_notify_payment_event ON payments;
CREATE TRIGGER trigger_notify_payment_event
  AFTER INSERT OR UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION notify_on_payment_event();

-- Function to check and notify low stock
CREATE OR REPLACE FUNCTION check_and_notify_low_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_material_name TEXT;
  v_reorder_level NUMERIC;
BEGIN
  -- Only check on inventory updates for raw materials
  IF NEW.item_type != 'raw_material' THEN
    RETURN NEW;
  END IF;

  -- Get material info
  SELECT name, reorder_level INTO v_material_name, v_reorder_level
  FROM public.raw_materials
  WHERE id = NEW.item_id AND business_id = NEW.business_id;

  IF v_reorder_level IS NULL OR v_reorder_level = 0 THEN
    RETURN NEW;
  END IF;

  -- Check if stock went below reorder level
  IF NEW.available_stock <= v_reorder_level AND (TG_OP = 'INSERT' OR OLD.available_stock > v_reorder_level) THEN
    FOR v_user_id IN
      SELECT DISTINCT u.id
      FROM public.users u
      JOIN public.user_roles ur ON ur.user_id = u.id AND ur.business_id = u.business_id
      JOIN public.role_permissions rp ON rp.role_id = ur.role_id
      JOIN public.permissions p ON p.id = rp.permission_id
      WHERE u.business_id = NEW.business_id
        AND u.status = 'ACTIVE'
        AND p.module = 'inventory' AND p.action = 'view'
    LOOP
      PERFORM public.create_notification(
        NEW.business_id,
        v_user_id,
        'LOW_STOCK',
        'Low Stock Alert',
        'Raw material "' || v_material_name || '" is below reorder level (Available: ' || NEW.available_stock || ', Reorder: ' || v_reorder_level || ')',
        'raw_material',
        NEW.item_id
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_check_low_stock ON inventory;
CREATE TRIGGER trigger_check_low_stock
  AFTER INSERT OR UPDATE ON inventory
  FOR EACH ROW EXECUTE FUNCTION check_and_notify_low_stock();

-- Function to check material shortage on production start
CREATE OR REPLACE FUNCTION check_material_shortage_on_production()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_shortages TEXT[];
  v_order_number TEXT;
BEGIN
  -- Check when production starts
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'IN_PROGRESS' THEN
    SELECT order_number INTO v_order_number
    FROM public.orders
    WHERE id = NEW.order_id;

    -- Get material requirements vs availability using product_bom and bom_items
    SELECT ARRAY_AGG(
      rm.name || ': Need ' || (bi.quantity_per_unit * NEW.quantity) || ', Have ' || COALESCE(i.available_stock, 0)
    ) INTO v_shortages
    FROM public.product_bom pb
    JOIN public.bom_items bi ON bi.bom_id = pb.id AND bi.business_id = pb.business_id
    JOIN public.raw_materials rm ON rm.id = bi.raw_material_id AND rm.business_id = pb.business_id
    LEFT JOIN public.inventory i ON i.item_id = rm.id AND i.business_id = NEW.business_id AND i.item_type = 'raw_material'
    WHERE pb.product_id = NEW.product_id
      AND pb.business_id = NEW.business_id
      AND pb.active = TRUE
      AND COALESCE(i.available_stock, 0) < (bi.quantity_per_unit * NEW.quantity);

    IF v_shortages IS NOT NULL AND array_length(v_shortages, 1) > 0 THEN
      FOR v_user_id IN
        SELECT DISTINCT u.id
        FROM public.users u
        JOIN public.user_roles ur ON ur.user_id = u.id AND ur.business_id = u.business_id
        JOIN public.role_permissions rp ON rp.role_id = ur.role_id
        JOIN public.permissions p ON p.id = rp.permission_id
        WHERE u.business_id = NEW.business_id
          AND u.status = 'ACTIVE'
          AND p.module = 'production' AND p.action = 'view'
      LOOP
        PERFORM public.create_notification(
          NEW.business_id,
          v_user_id,
          'MATERIAL_SHORTAGE',
          'Material Shortage',
          'Insufficient materials for production order ' || COALESCE(v_order_number, NEW.id::TEXT) || ': ' || array_to_string(v_shortages, '; '),
          'production_order',
          NEW.id
        );
      END LOOP;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_check_material_shortage ON production_orders;
CREATE TRIGGER trigger_check_material_shortage
  AFTER UPDATE ON production_orders
  FOR EACH ROW EXECUTE FUNCTION check_material_shortage_on_production();

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION create_notification TO authenticated;
GRANT EXECUTE ON FUNCTION mark_notification_read TO authenticated;
GRANT EXECUTE ON FUNCTION mark_all_notifications_read TO authenticated;
GRANT EXECUTE ON FUNCTION get_unread_notification_count TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_notifications TO authenticated;

COMMIT;