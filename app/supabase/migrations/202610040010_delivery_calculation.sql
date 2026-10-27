BEGIN;

-- ============================================
-- ADD DELIVERY DATE COLUMNS TO ORDERS TABLE
-- ============================================
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS earliest_delivery_date DATE,
ADD COLUMN IF NOT EXISTS latest_delivery_date DATE,
ADD COLUMN IF NOT EXISTS expected_delivery_date DATE,
ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (delivery_status IN ('PENDING', 'ON_TIME', 'OVERDUE', 'DELIVERED', 'CANCELLED')),
ADD COLUMN IF NOT EXISTS delivery_calculated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS delivery_calculation_version INTEGER NOT NULL DEFAULT 1;

-- Add indexes for delivery queries
CREATE INDEX IF NOT EXISTS orders_business_delivery_status_idx ON public.orders (business_id, delivery_status);
CREATE INDEX IF NOT EXISTS orders_business_expected_delivery_idx ON public.orders (business_id, expected_delivery_date);
CREATE INDEX IF NOT EXISTS orders_business_delivery_overdue_idx ON public.orders (business_id, expected_delivery_date) WHERE delivery_status IN ('PENDING', 'ON_TIME');

-- ============================================
-- HELPER: Add working days to a date (skip weekends/holidays)
-- ============================================
CREATE OR REPLACE FUNCTION public.add_working_days(
  p_business_id UUID,
  p_start_date DATE,
  p_days_to_add INTEGER
)
RETURNS DATE
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_date DATE := p_start_date;
  days_added INTEGER := 0;
BEGIN
  IF p_days_to_add <= 0 THEN
    RETURN p_start_date;
  END IF;

  WHILE days_added < p_days_to_add LOOP
    v_current_date := v_current_date + INTERVAL '1 day';
    IF public.is_working_day(p_business_id, v_current_date) THEN
      days_added := days_added + 1;
    END IF;
  END LOOP;

  RETURN v_current_date;
END;
$$;

-- ============================================
-- CORE: Calculate delivery dates for a single order item
-- ============================================
CREATE OR REPLACE FUNCTION public.calculate_order_item_delivery_dates(
  p_business_id UUID,
  p_order_id UUID,
  p_order_item_id UUID
)
RETURNS TABLE (
  order_item_id UUID,
  production_completion_date DATE,
  earliest_delivery_date DATE,
  latest_delivery_date DATE,
  expected_delivery_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  po RECORD;
  product RECORD;
  prod_completion DATE;
  earliest_del DATE;
  latest_del DATE;
  expected_del DATE;
BEGIN
  -- Get production order and product delivery times
  SELECT *
  INTO po
  FROM public.production_orders
  WHERE id = (
    SELECT id FROM public.production_orders
    WHERE order_item_id = p_order_item_id AND business_id = p_business_id
    ORDER BY created_at DESC LIMIT 1
  );

  IF NOT FOUND THEN
    RETURN QUERY SELECT p_order_item_id, NULL, NULL, NULL, NULL;
    RETURN;
  END IF;

  SELECT *
  INTO product
  FROM public.products
  WHERE id = po.product_id AND business_id = po.business_id;

  -- Use actual completion date if available, otherwise scheduled
  prod_completion := COALESCE(po.actual_end_date, po.scheduled_end_date);

  IF prod_completion IS NULL THEN
    RETURN QUERY SELECT p_order_item_id, NULL, NULL, NULL, NULL;
    RETURN;
  END IF;

  -- Calculate delivery dates by adding delivery_min/max_days as working days
  earliest_del := public.add_working_days(p_business_id, prod_completion, COALESCE(product.delivery_min_days, 0));
  latest_del := public.add_working_days(p_business_id, prod_completion, COALESCE(product.delivery_max_days, 0));

  -- Expected is midpoint (or earliest if min=max)
  IF product.delivery_min_days = product.delivery_max_days THEN
    expected_del := earliest_del;
  ELSE
    expected_del := public.add_working_days(p_business_id, prod_completion,
      CEIL((COALESCE(product.delivery_min_days, 0) + COALESCE(product.delivery_max_days, 0)) / 2.0));
  END IF;

  RETURN QUERY SELECT p_order_item_id, prod_completion, earliest_del, latest_del, expected_del;
END;
$$;

-- ============================================
-- MAIN: Calculate delivery dates for an entire order
-- ============================================
CREATE OR REPLACE FUNCTION public.calculate_order_delivery_dates(
  p_business_id UUID,
  p_order_id UUID
)
RETURNS TABLE (
  order_id UUID,
  earliest_delivery_date DATE,
  latest_delivery_date DATE,
  expected_delivery_date DATE,
  delivery_calculation_version INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  order_rec RECORD;
  item_delivery RECORD;
  order_earliest DATE := NULL;
  order_latest DATE := NULL;
  order_expected DATE := NULL;
  has_production_orders BOOLEAN := FALSE;
  current_version INTEGER := 0;
BEGIN
  -- Verify order exists and is confirmed
  SELECT o.id, o.status INTO order_rec
  FROM public.orders o
  WHERE o.id = p_order_id AND o.business_id = p_business_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF order_rec.status != 'CONFIRMED' THEN
    RETURN QUERY SELECT p_order_id, NULL, NULL, NULL, 1;
    RETURN;
  END IF;

  -- Check if production orders exist for this order
  SELECT EXISTS(
    SELECT 1 FROM public.production_orders po
    WHERE po.order_id = p_order_id AND po.business_id = p_business_id
  ) INTO has_production_orders;

  IF NOT has_production_orders THEN
    RETURN QUERY SELECT p_order_id, NULL, NULL, NULL, 1;
    RETURN;
  END IF;

  -- Calculate delivery dates for each order item
  FOR item_delivery IN
    SELECT cd.*
    FROM public.order_items oi
    CROSS JOIN LATERAL public.calculate_order_item_delivery_dates(p_business_id, p_order_id, oi.id) cd
    WHERE oi.order_id = p_order_id AND oi.business_id = p_business_id
  LOOP
    -- For multi-product orders, use the LATEST required delivery date
    IF item_delivery.earliest_delivery_date IS NOT NULL THEN
      IF order_earliest IS NULL OR item_delivery.earliest_delivery_date > order_earliest THEN
        order_earliest := item_delivery.earliest_delivery_date;
      END IF;
    END IF;
    IF item_delivery.latest_delivery_date IS NOT NULL THEN
      IF order_latest IS NULL OR item_delivery.latest_delivery_date > order_latest THEN
        order_latest := item_delivery.latest_delivery_date;
      END IF;
    END IF;
    IF item_delivery.expected_delivery_date IS NOT NULL THEN
      IF order_expected IS NULL OR item_delivery.expected_delivery_date > order_expected THEN
        order_expected := item_delivery.expected_delivery_date;
      END IF;
    END IF;
  END LOOP;

  -- Get current calculation version
  SELECT COALESCE(o.delivery_calculation_version, 0) INTO current_version
  FROM public.orders o WHERE o.id = p_order_id AND o.business_id = p_business_id;

  RETURN QUERY SELECT p_order_id, order_earliest, order_latest, order_expected, current_version + 1;
END;
$$;

-- ============================================
-- UPDATE ORDER DELIVERY DATES (with audit)
-- ============================================
CREATE OR REPLACE FUNCTION public.update_order_delivery_dates(
  p_business_id UUID,
  p_order_id UUID,
  p_trigger_source TEXT DEFAULT 'manual'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delivery_data RECORD;
  old_earliest DATE;
  old_latest DATE;
  old_expected DATE;
  old_status TEXT;
  new_delivery_status TEXT;
  actor_id UUID;
BEGIN
  -- Get current order delivery data
  SELECT earliest_delivery_date, latest_delivery_date, expected_delivery_date, delivery_status
  INTO old_earliest, old_latest, old_expected, old_status
  FROM public.orders
  WHERE id = p_order_id AND business_id = p_business_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Calculate new delivery dates
  SELECT * INTO delivery_data
  FROM public.calculate_order_delivery_dates(p_business_id, p_order_id)
  LIMIT 1;

  IF delivery_data.earliest_delivery_date IS NULL THEN
    -- No production orders or not scheduled yet
    RETURN;
  END IF;

  -- Determine delivery status
  IF old_status = 'DELIVERED' OR old_status = 'CANCELLED' THEN
    new_delivery_status := old_status; -- Don't change historical records
  ELSE
    IF delivery_data.expected_delivery_date < CURRENT_DATE THEN
      new_delivery_status := 'OVERDUE';
    ELSE
      new_delivery_status := 'ON_TIME';
    END IF;
  END IF;

  -- Update order with new delivery dates
  UPDATE public.orders
  SET earliest_delivery_date = delivery_data.earliest_delivery_date,
      latest_delivery_date = delivery_data.latest_delivery_date,
      expected_delivery_date = delivery_data.expected_delivery_date,
      delivery_status = new_delivery_status,
      delivery_calculated_at = NOW(),
      delivery_calculation_version = delivery_data.delivery_calculation_version
  WHERE id = p_order_id AND business_id = p_business_id;

  -- Audit log if dates changed
  IF old_earliest IS DISTINCT FROM delivery_data.earliest_delivery_date
     OR old_latest IS DISTINCT FROM delivery_data.latest_delivery_date
     OR old_expected IS DISTINCT FROM delivery_data.expected_delivery_date
     OR old_status IS DISTINCT FROM new_delivery_status THEN

    SELECT id INTO actor_id
    FROM public.users
    WHERE auth_user_id = auth.uid() AND business_id = p_business_id;

    INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, old_data, new_data)
    VALUES (
      p_business_id,
      actor_id,
      'ORDER_DELIVERY_DATES_RECALCULATED',
      'order',
      p_order_id,
      jsonb_build_object(
        'earliest_delivery_date', old_earliest,
        'latest_delivery_date', old_latest,
        'expected_delivery_date', old_expected,
        'delivery_status', old_status,
        'trigger_source', p_trigger_source
      ),
      jsonb_build_object(
        'earliest_delivery_date', delivery_data.earliest_delivery_date,
        'latest_delivery_date', delivery_data.latest_delivery_date,
        'expected_delivery_date', delivery_data.expected_delivery_date,
        'delivery_status', new_delivery_status,
        'trigger_source', p_trigger_source
      )
    );
  END IF;
END;
$$;

-- ============================================
-- TRIGGER: Recalculate on production order completion
-- ============================================
CREATE OR REPLACE FUNCTION public.trigger_delivery_recalc_on_production_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only trigger when production order is completed
  IF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' THEN
    PERFORM public.update_order_delivery_dates(NEW.business_id, NEW.order_id, 'production_completed');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER production_order_delivery_recalc
AFTER UPDATE ON public.production_orders
FOR EACH ROW EXECUTE FUNCTION public.trigger_delivery_recalc_on_production_complete();

-- ============================================
-- TRIGGER: Recalculate on production schedule change
-- ============================================
CREATE OR REPLACE FUNCTION public.trigger_delivery_recalc_on_schedule_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  po RECORD;
BEGIN
  -- Get production order for this schedule
  SELECT order_id, business_id INTO po
  FROM public.production_orders
  WHERE id = COALESCE(NEW.production_order_id, OLD.production_order_id)
  LIMIT 1;

  IF FOUND THEN
    PERFORM public.update_order_delivery_dates(po.business_id, po.order_id, 'production_schedule_changed');
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER production_schedule_delivery_recalc
AFTER INSERT OR UPDATE OR DELETE ON public.production_schedules
FOR EACH ROW EXECUTE FUNCTION public.trigger_delivery_recalc_on_schedule_change();

-- ============================================
-- TRIGGER: Recalculate on product delivery time change
-- ============================================
CREATE OR REPLACE FUNCTION public.trigger_delivery_recalc_on_product_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_orders RECORD;
BEGIN
  -- Only trigger if delivery times changed
  IF OLD.delivery_min_days IS DISTINCT FROM NEW.delivery_min_days
     OR OLD.delivery_max_days IS DISTINCT FROM NEW.delivery_max_days THEN

    FOR affected_orders IN
      SELECT DISTINCT o.id, o.business_id
      FROM public.orders o
      JOIN public.order_items oi ON oi.order_id = o.id AND oi.business_id = o.business_id
      WHERE oi.product_id = NEW.id
        AND o.business_id = NEW.business_id
        AND o.status = 'CONFIRMED'
    LOOP
      PERFORM public.update_order_delivery_dates(affected_orders.business_id, affected_orders.id, 'product_delivery_time_changed');
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER product_delivery_time_delivery_recalc
AFTER UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.trigger_delivery_recalc_on_product_change();

-- ============================================
-- TRIGGER: Recalculate on business calendar change
-- ============================================
CREATE OR REPLACE FUNCTION public.trigger_delivery_recalc_on_calendar_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_orders RECORD;
BEGIN
  -- Only trigger if working day status changed
  IF OLD.is_working_day IS DISTINCT FROM NEW.is_working_day THEN
    FOR affected_orders IN
      SELECT DISTINCT o.id, o.business_id
      FROM public.orders o
      JOIN public.production_orders po ON po.order_id = o.id AND po.business_id = o.business_id
      WHERE o.business_id = NEW.business_id
        AND o.status = 'CONFIRMED'
        AND po.status IN ('SCHEDULED', 'IN_PROGRESS')
    LOOP
      PERFORM public.update_order_delivery_dates(affected_orders.business_id, affected_orders.id, 'calendar_changed');
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER business_calendar_delivery_recalc
AFTER UPDATE ON public.business_calendar
FOR EACH ROW EXECUTE FUNCTION public.trigger_delivery_recalc_on_calendar_change();

-- ============================================
-- BATCH RECALCULATION: Update all orders delivery status (overdue check)
-- ============================================
CREATE OR REPLACE FUNCTION public.refresh_all_delivery_statuses(
  p_business_id UUID
)
RETURNS TABLE (updated_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_rec RECORD;
  updated INTEGER := 0;
BEGIN
  FOR order_rec IN
    SELECT id, expected_delivery_date, delivery_status
    FROM public.orders
    WHERE business_id = p_business_id
      AND status = 'CONFIRMED'
      AND delivery_status IN ('PENDING', 'ON_TIME')
  LOOP
    IF order_rec.expected_delivery_date IS NOT NULL
       AND order_rec.expected_delivery_date < CURRENT_DATE
       AND order_rec.delivery_status != 'OVERDUE' THEN

      UPDATE public.orders
      SET delivery_status = 'OVERDUE'
      WHERE id = order_rec.id AND business_id = p_business_id;

      updated := updated + 1;
    END IF;
  END LOOP;

  RETURN QUERY SELECT updated;
END;
$$;

-- ============================================
-- GRANT EXECUTE PERMISSIONS
-- ============================================
GRANT EXECUTE ON FUNCTION public.add_working_days(UUID, DATE, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_order_item_delivery_dates(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_order_delivery_dates(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_delivery_dates(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_all_delivery_statuses(UUID) TO authenticated;

COMMIT;