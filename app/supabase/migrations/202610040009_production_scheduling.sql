BEGIN;

-- ============================================
-- SCHEDULING ENGINE RPC FUNCTIONS
-- ============================================

-- Helper: Get next working day
CREATE OR REPLACE FUNCTION public.get_next_working_day(
  p_business_id UUID,
  p_date DATE
)
RETURNS DATE
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_day DATE := p_date;
BEGIN
  LOOP
    next_day := next_day + INTERVAL '1 day';
    IF EXISTS (
      SELECT 1 FROM public.business_calendar
      WHERE business_id = p_business_id
        AND calendar_date = next_day
        AND is_working_day = TRUE
    ) THEN
      RETURN next_day;
    END IF;
    -- If no calendar entry, assume working day (Mon-Fri)
    IF EXTRACT(DOW FROM next_day) BETWEEN 1 AND 5 THEN
      RETURN next_day;
    END IF;
  END LOOP;
END;
$$;

-- Helper: Check if date is working day
CREATE OR REPLACE FUNCTION public.is_working_day(
  p_business_id UUID,
  p_date DATE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cal RECORD;
BEGIN
  SELECT is_working_day INTO cal
  FROM public.business_calendar
  WHERE business_id = p_business_id AND calendar_date = p_date
  LIMIT 1;

  IF NOT FOUND THEN
    -- Default: Mon-Fri are working days
    RETURN EXTRACT(DOW FROM p_date) BETWEEN 1 AND 5;
  END IF;

  RETURN cal.is_working_day;
END;
$$;

-- Get production queue (confirmed orders needing production)
CREATE OR REPLACE FUNCTION public.get_production_queue(
  p_business_id UUID
)
RETURNS TABLE (
  production_order_id UUID,
  order_number TEXT,
  customer_name TEXT,
  product_name TEXT,
  product_sku TEXT,
  product_unit TEXT,
  quantity NUMERIC,
  priority TEXT,
  order_date DATE,
  product_daily_capacity INTEGER,
  product_production_unit TEXT,
  product_production_min_days INTEGER,
  product_production_max_days INTEGER,
  product_setup_minutes INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    po.id as production_order_id,
    o.order_number,
    c.name as customer_name,
    p.name as product_name,
    p.sku as product_sku,
    p.unit as product_unit,
    po.quantity,
    po.priority,
    o.order_date,
    p.daily_capacity as product_daily_capacity,
    p.production_unit as product_production_unit,
    p.production_min_days as product_production_min_days,
    p.production_max_days as product_production_max_days,
    p.setup_minutes as product_setup_minutes
  FROM public.production_orders po
  JOIN public.orders o ON o.id = po.order_id AND o.business_id = po.business_id
  JOIN public.customers c ON c.id = o.customer_id AND c.business_id = o.business_id
  JOIN public.products p ON p.id = po.product_id AND p.business_id = po.business_id
  WHERE po.business_id = p_business_id
    AND po.status IN ('PENDING', 'SCHEDULED')
    AND o.status = 'CONFIRMED'
  ORDER BY
    CASE po.priority
      WHEN 'URGENT' THEN 1
      WHEN 'HIGH' THEN 2
      WHEN 'NORMAL' THEN 3
      WHEN 'LOW' THEN 4
    END,
    po.created_at;
END;
$$;

-- Calculate days needed for a production order
CREATE OR REPLACE FUNCTION public.calculate_production_days(
  p_quantity NUMERIC,
  p_daily_capacity INTEGER,
  p_setup_minutes INTEGER,
  p_production_min_days INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  production_days INTEGER;
  setup_days NUMERIC;
BEGIN
  -- Calculate production days (ceiling of quantity / daily_capacity)
  production_days := CEIL(p_quantity / p_daily_capacity);

  -- Add setup time (convert minutes to days, assuming 8-hour work day = 480 minutes)
  setup_days := p_setup_minutes / 480.0;

  -- Total days is production days + setup days, minimum of production_min_days
  RETURN GREATEST(CEIL(production_days + setup_days), p_production_min_days);
END;
$$;

-- Check capacity availability for a date range
CREATE OR REPLACE FUNCTION public.check_capacity_availability(
  p_business_id UUID,
  p_product_id UUID,
  p_start_date DATE,
  p_end_date DATE,
  p_required_quantity NUMERIC,
  p_daily_capacity INTEGER,
  p_exclude_production_order_id UUID DEFAULT NULL
)
RETURNS TABLE (
  check_date DATE,
  available_capacity NUMERIC,
  total_allocated NUMERIC,
  is_working_day BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  check_date DATE := p_start_date;
BEGIN
  WHILE check_date <= p_end_date LOOP
    IF public.is_working_day(p_business_id, check_date) THEN
      -- Get already allocated capacity for this product on this date
      DECLARE
        allocated NUMERIC := 0;
      BEGIN
        SELECT COALESCE(SUM(allocated_quantity), 0) INTO allocated
        FROM public.production_schedules ps
        JOIN public.production_orders po ON po.id = ps.production_order_id
        WHERE ps.business_id = p_business_id
          AND ps.schedule_date = check_date
          AND po.product_id = p_product_id
          AND (p_exclude_production_order_id IS NULL OR po.id != p_exclude_production_order_id)
          AND po.status IN ('SCHEDULED', 'IN_PROGRESS');

        RETURN QUERY SELECT
          check_date,
          GREATEST(p_daily_capacity - allocated, 0) as available_capacity,
          allocated as total_allocated,
          TRUE as is_working_day;
      END;
    ELSE
      RETURN QUERY SELECT
        check_date,
        0 as available_capacity,
        0 as total_allocated,
        FALSE as is_working_day;
    END IF;
    check_date := check_date + INTERVAL '1 day';
  END LOOP;
END;
$$;

-- Core scheduling function for a single production order
CREATE OR REPLACE FUNCTION public.schedule_production_order(
  p_production_order_id UUID,
  p_business_id UUID,
  p_start_date DATE DEFAULT NULL
)
RETURNS TABLE (
  production_order_id UUID,
  scheduled_start_date DATE,
  scheduled_end_date DATE,
  schedules JSONB,
  success BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  po RECORD;
  product RECORD;
  needed_days INTEGER;
  search_start_date DATE;
  v_current_date DATE;
  remaining_quantity NUMERIC;
  daily_allocated NUMERIC;
  schedule_records JSONB := '[]'::JSONB;
  seq_num INTEGER := 0;
  max_search_days INTEGER := 365;
  days_searched INTEGER := 0;
  found_slot BOOLEAN := FALSE;
  slot_start_date DATE;
  slot_end_date DATE;
BEGIN
  -- Get production order details
  SELECT *
  INTO po
  FROM public.production_orders
  WHERE id = p_production_order_id AND business_id = p_business_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT
      p_production_order_id, NULL, NULL, '[]'::JSONB, FALSE, 'Production order not found';
    RETURN;
  END IF;

  SELECT *
  INTO product
  FROM public.products
  WHERE id = po.product_id AND business_id = po.business_id;

  IF po.status NOT IN ('PENDING', 'SCHEDULED') THEN
    RETURN QUERY SELECT
      p_production_order_id, NULL, NULL, '[]'::JSONB, FALSE, 'Production order cannot be scheduled (status: ' || po.status || ')';
    RETURN;
  END IF;

  -- Calculate days needed
  needed_days := public.calculate_production_days(
    po.quantity, product.daily_capacity, product.setup_minutes, product.production_min_days
  );

  -- Determine search start date
  IF p_start_date IS NOT NULL THEN
    search_start_date := p_start_date;
  ELSIF po.scheduled_start_date IS NOT NULL THEN
    search_start_date := po.scheduled_start_date;
  ELSE
    search_start_date := CURRENT_DATE;
  END IF;

  -- Ensure start date is a working day
  IF NOT public.is_working_day(p_business_id, search_start_date) THEN
    search_start_date := public.get_next_working_day(p_business_id, search_start_date - INTERVAL '1 day');
  END IF;

  -- Find contiguous block of working days with sufficient capacity
  v_current_date := search_start_date;
  WHILE days_searched < max_search_days LOOP
    IF public.is_working_day(p_business_id, v_current_date) THEN
      -- Check if we can fit needed_days starting from current_date
      DECLARE
        can_fit BOOLEAN := TRUE;
        check_date DATE := v_current_date;
        working_days_found INTEGER := 0;
        temp_date DATE := v_current_date;
      BEGIN
        WHILE working_days_found < needed_days AND temp_date <= v_current_date + INTERVAL '1 year' LOOP
          IF public.is_working_day(p_business_id, temp_date) THEN
            DECLARE
              available NUMERIC;
            BEGIN
              SELECT GREATEST(product.daily_capacity - COALESCE(SUM(ps.allocated_quantity), 0), 0) INTO available
              FROM public.production_schedules ps
              JOIN public.production_orders po2 ON po2.id = ps.production_order_id
              WHERE ps.business_id = p_business_id
                AND ps.schedule_date = temp_date
                AND po2.product_id = po.product_id
                AND po2.status IN ('SCHEDULED', 'IN_PROGRESS')
                AND po2.id != p_production_order_id;

              IF available < po.quantity / needed_days THEN
                can_fit := FALSE;
                EXIT;
              END IF;
            END;

            working_days_found := working_days_found + 1;
          END IF;
          temp_date := temp_date + INTERVAL '1 day';
        END LOOP;

        IF can_fit AND working_days_found = needed_days THEN
          found_slot := TRUE;
          slot_start_date := v_current_date;
          slot_end_date := temp_date - INTERVAL '1 day';
          EXIT;
        END IF;
      END;
    END IF;

    v_current_date := v_current_date + INTERVAL '1 day';
    days_searched := days_searched + 1;
  END LOOP;

  IF NOT found_slot THEN
    RETURN QUERY SELECT
      p_production_order_id, NULL, NULL, '[]'::JSONB, FALSE,
      'Insufficient capacity within search window (' || max_search_days || ' days)';
    RETURN;
  END IF;

  -- Now allocate the schedule
  remaining_quantity := po.quantity;
  v_current_date := slot_start_date;
  seq_num := 0;

  WHILE remaining_quantity > 0 AND v_current_date <= slot_end_date LOOP
    IF public.is_working_day(p_business_id, v_current_date) THEN
      -- Calculate available capacity for this day
      DECLARE
        already_allocated NUMERIC := 0;
        available NUMERIC;
        to_allocate NUMERIC;
      BEGIN
        SELECT COALESCE(SUM(ps.allocated_quantity), 0) INTO already_allocated
        FROM public.production_schedules ps
        JOIN public.production_orders po2 ON po2.id = ps.production_order_id
        WHERE ps.business_id = p_business_id
          AND ps.schedule_date = v_current_date
          AND po2.product_id = po.product_id
          AND po2.status IN ('SCHEDULED', 'IN_PROGRESS')
          AND po2.id != p_production_order_id;

        available := GREATEST(product.daily_capacity - already_allocated, 0);
        to_allocate := LEAST(remaining_quantity, available);

        IF to_allocate > 0 THEN
          -- Insert or update schedule
          INSERT INTO public.production_schedules (business_id, production_order_id, schedule_date, allocated_quantity, sequence_number)
          VALUES (p_business_id, p_production_order_id, v_current_date, to_allocate, seq_num)
          ON CONFLICT (business_id, schedule_date, production_order_id)
          DO UPDATE SET allocated_quantity = EXCLUDED.allocated_quantity, sequence_number = EXCLUDED.sequence_number;

          schedule_records := schedule_records || jsonb_build_object(
            'schedule_date', v_current_date,
            'allocated_quantity', to_allocate,
            'sequence_number', seq_num
          );

          remaining_quantity := remaining_quantity - to_allocate;
          seq_num := seq_num + 1;
        END IF;
      END;
    END IF;
    v_current_date := v_current_date + INTERVAL '1 day';
  END LOOP;

  -- Update production order with schedule
  UPDATE public.production_orders
  SET status = 'SCHEDULED',
      scheduled_start_date = slot_start_date,
      scheduled_end_date = slot_end_date,
      updated_at = NOW()
  WHERE id = p_production_order_id AND business_id = p_business_id;

  RETURN QUERY SELECT
    p_production_order_id, slot_start_date, slot_end_date, schedule_records, TRUE, 'Scheduled successfully';
END;
$$;

-- Main scheduling engine - runs FIFO with priority handling
CREATE OR REPLACE FUNCTION public.run_scheduling_engine(
  p_business_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS TABLE (
  production_order_id UUID,
  scheduled_start_date DATE,
  scheduled_end_date DATE,
  schedules JSONB,
  success BOOLEAN,
  message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  queue_item RECORD;
  search_date DATE;
BEGIN
  -- Clear existing schedules for PENDING/SCHEDULED orders if rescheduling
  DELETE FROM public.production_schedules ps
  USING public.production_orders po
  WHERE ps.production_order_id = po.id
    AND po.business_id = p_business_id
    AND po.status IN ('PENDING', 'SCHEDULED');

  -- Reset production order statuses to PENDING for rescheduling
  UPDATE public.production_orders
  SET status = 'PENDING',
      scheduled_start_date = NULL,
      scheduled_end_date = NULL,
      updated_at = NOW()
  WHERE business_id = p_business_id
    AND status IN ('PENDING', 'SCHEDULED');

  -- Determine search start date
  search_date := COALESCE(p_start_date, CURRENT_DATE);

  -- Process queue in FIFO order with priority override
  FOR queue_item IN
    SELECT * FROM public.get_production_queue(p_business_id)
  LOOP
    -- Schedule each production order
    RETURN QUERY
    SELECT * FROM public.schedule_production_order(queue_item.production_order_id, p_business_id, search_date);
  END LOOP;

  RETURN;
END;
$$;

-- Cancel production order and reschedule
CREATE OR REPLACE FUNCTION public.cancel_production_order(
  p_production_order_id UUID,
  p_business_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  po_status TEXT;
BEGIN
  -- Get current status
  SELECT status INTO po_status
  FROM public.production_orders
  WHERE id = p_production_order_id AND business_id = p_business_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production order not found';
  END IF;

  IF po_status = 'COMPLETED' THEN
    RAISE EXCEPTION 'Cannot cancel completed production order';
  END IF;

  -- Delete associated schedules
  DELETE FROM public.production_schedules
  WHERE production_order_id = p_production_order_id;

  -- Update production order
  UPDATE public.production_orders
  SET status = 'CANCELLED',
      notes = COALESCE(notes, '') || CASE WHEN notes IS NULL OR notes = '' THEN '' ELSE '; ' END || 'Cancelled: ' || p_reason,
      updated_at = NOW()
  WHERE id = p_production_order_id AND business_id = p_business_id;

  -- Trigger rescheduling of remaining orders
  PERFORM public.run_scheduling_engine(p_business_id);
END;
$$;

-- Get capacity utilization report
CREATE OR REPLACE FUNCTION public.get_capacity_utilization(
  p_business_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  date DATE,
  available_capacity NUMERIC,
  used_capacity NUMERIC,
  total_capacity NUMERIC,
  is_working_day BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  check_date DATE := p_start_date;
  total_daily_capacity NUMERIC;
  day_used NUMERIC;
  day_working BOOLEAN;
BEGIN
  -- Get total daily capacity for the business (sum of all active product daily_capacity)
  SELECT COALESCE(SUM(daily_capacity), 0) INTO total_daily_capacity
  FROM public.products
  WHERE business_id = p_business_id AND active = TRUE;

  WHILE check_date <= p_end_date LOOP
    day_working := public.is_working_day(p_business_id, check_date);

    IF day_working THEN
      SELECT COALESCE(SUM(ps.allocated_quantity), 0) INTO day_used
      FROM public.production_schedules ps
      JOIN public.production_orders po ON po.id = ps.production_order_id
      WHERE ps.business_id = p_business_id
        AND ps.schedule_date = check_date
        AND po.status IN ('SCHEDULED', 'IN_PROGRESS');
    ELSE
      day_used := 0;
    END IF;

    RETURN QUERY SELECT
      check_date,
      GREATEST(total_daily_capacity - day_used, 0) as available_capacity,
      day_used as used_capacity,
      total_daily_capacity as total_capacity,
      day_working as is_working_day;

    check_date := check_date + INTERVAL '1 day';
  END LOOP;
END;
$$;

-- Create production orders from confirmed order
CREATE OR REPLACE FUNCTION public.create_production_orders_from_order(
  p_order_id UUID,
  p_business_id UUID
)
RETURNS TABLE (count INTEGER, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_rec RECORD;
  item_rec RECORD;
  created_count INTEGER := 0;
  po_id UUID;
BEGIN
  -- Verify order exists and is confirmed
  SELECT * INTO order_rec
  FROM public.orders
  WHERE id = p_order_id AND business_id = p_business_id AND status = 'CONFIRMED'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 0, 'Order not found or not confirmed';
    RETURN;
  END IF;

  -- Create production orders for each order item
  FOR item_rec IN
    SELECT oi.*, p.daily_capacity, p.production_unit, p.production_min_days,
           p.production_max_days, p.setup_minutes
    FROM public.order_items oi
    JOIN public.products p ON p.id = oi.product_id AND p.business_id = oi.business_id
    WHERE oi.order_id = p_order_id AND oi.business_id = p_business_id
  LOOP
    -- Check if production order already exists
    IF EXISTS (
      SELECT 1 FROM public.production_orders
      WHERE order_item_id = item_rec.id AND business_id = p_business_id
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.production_orders (
      business_id, order_id, order_item_id, product_id, quantity,
      status, priority, notes
    ) VALUES (
      p_business_id, p_order_id, item_rec.id, item_rec.product_id, item_rec.quantity,
      'PENDING',
      (SELECT priority FROM public.orders WHERE id = p_order_id),
      'Auto-created from order ' || order_rec.order_number
    ) RETURNING id INTO po_id;

    created_count := created_count + 1;
  END LOOP;

  RETURN QUERY SELECT created_count, 'Created ' || created_count || ' production orders';
END;
$$;

-- Update production order status
CREATE OR REPLACE FUNCTION public.update_production_order_status(
  p_business_id UUID,
  p_production_order_id UUID,
  p_status TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_status TEXT;
  valid_transition BOOLEAN := FALSE;
BEGIN
  -- Get current status
  SELECT status INTO current_status
  FROM public.production_orders
  WHERE id = p_production_order_id AND business_id = p_business_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production order not found';
  END IF;

  -- Validate status transitions
  CASE
    WHEN current_status = 'PENDING' AND p_status IN ('SCHEDULED', 'CANCELLED') THEN valid_transition := TRUE;
    WHEN current_status = 'SCHEDULED' AND p_status IN ('IN_PROGRESS', 'CANCELLED', 'PENDING') THEN valid_transition := TRUE;
    WHEN current_status = 'IN_PROGRESS' AND p_status IN ('COMPLETED', 'CANCELLED') THEN valid_transition := TRUE;
    WHEN current_status = 'COMPLETED' AND p_status = 'COMPLETED' THEN valid_transition := TRUE; -- Idempotent
    WHEN current_status = 'CANCELLED' AND p_status = 'CANCELLED' THEN valid_transition := TRUE; -- Idempotent
  END CASE;

  IF NOT valid_transition THEN
    RAISE EXCEPTION 'Invalid status transition from % to %', current_status, p_status;
  END IF;

  -- Update production order
  UPDATE public.production_orders
  SET status = p_status,
      notes = COALESCE(notes, '') || CASE
        WHEN p_reason IS NOT NULL AND p_reason != ''
        THEN CASE WHEN notes IS NULL OR notes = '' THEN '' ELSE '; ' END || p_reason
        ELSE ''
      END,
      actual_start_date = CASE WHEN p_status = 'IN_PROGRESS' AND actual_start_date IS NULL THEN CURRENT_DATE ELSE actual_start_date END,
      actual_end_date = CASE WHEN p_status = 'COMPLETED' AND actual_end_date IS NULL THEN CURRENT_DATE ELSE actual_end_date END,
      updated_at = NOW()
  WHERE id = p_production_order_id AND business_id = p_business_id;

  -- If cancelling, remove schedules and reschedule
  IF p_status = 'CANCELLED' THEN
    DELETE FROM public.production_schedules
    WHERE production_order_id = p_production_order_id;
    PERFORM public.run_scheduling_engine(p_business_id);
  END IF;

  -- If moving back to PENDING, remove schedules
  IF p_status = 'PENDING' AND current_status = 'SCHEDULED' THEN
    DELETE FROM public.production_schedules
    WHERE production_order_id = p_production_order_id;
  END IF;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_next_working_day(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_working_day(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_production_queue(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_production_days(NUMERIC, INTEGER, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_capacity_availability(UUID, UUID, DATE, DATE, NUMERIC, INTEGER, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_production_order(UUID, UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_scheduling_engine(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_production_order(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_capacity_utilization(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_production_orders_from_order(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_production_order_status(UUID, UUID, TEXT, TEXT) TO authenticated;

COMMIT;