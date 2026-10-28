-- ====================================================================
-- MIGRATION: 202610280004_partial_dispatch_foundation.sql
-- Description: Partial Dispatch Database Foundation for SANKALP IRRIGATION ERP
-- Features:
-- 1. Upgrade delivery_status on orders to support PARTIALLY_DISPATCHED & FULLY_DISPATCHED
-- 2. Upgrade status on deliveries to support PARTIALLY_DISPATCHED, FULLY_DISPATCHED, PENDING
-- 3. Add customer_id, delivery_date, and created_by to deliveries
-- 4. Add dispatched_quantity and delivered_quantity tracking to order_items
-- 5. Atomic delivery sequence generator: DEL-YYYY-000001
-- 6. Dynamic dispatch summary calculation: get_order_dispatch_summary()
-- 7. Atomic partial delivery creation RPC with row locks: create_partial_delivery()
-- 8. Atomic idempotent delivery cancellation RPC: cancel_partial_delivery()
-- ====================================================================

-- 1. Upgrade delivery_status constraint on orders
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_delivery_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_delivery_status_check
  CHECK (delivery_status = ANY (ARRAY[
    'PENDING'::text,
    'ON_TIME'::text,
    'OVERDUE'::text,
    'PARTIALLY_DISPATCHED'::text,
    'PARTIALLY_DELIVERED'::text,
    'FULLY_DISPATCHED'::text,
    'DELIVERED'::text,
    'CANCELLED'::text
  ]));

-- 2. Upgrade status constraint on deliveries
ALTER TABLE public.deliveries DROP CONSTRAINT IF EXISTS deliveries_status_check;
ALTER TABLE public.deliveries ADD CONSTRAINT deliveries_status_check
  CHECK (status = ANY (ARRAY[
    'NOT_READY'::text,
    'PENDING'::text,
    'READY'::text,
    'PACKED'::text,
    'DISPATCHED'::text,
    'PARTIALLY_DISPATCHED'::text,
    'FULLY_DISPATCHED'::text,
    'IN_TRANSIT'::text,
    'DELIVERED'::text,
    'CANCELLED'::text
  ]));

-- 3. Add missing columns to deliveries
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'deliveries' AND column_name = 'customer_id') THEN
    ALTER TABLE public.deliveries ADD COLUMN customer_id UUID REFERENCES public.customers(id) ON DELETE RESTRICT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'deliveries' AND column_name = 'delivery_date') THEN
    ALTER TABLE public.deliveries ADD COLUMN delivery_date DATE DEFAULT CURRENT_DATE NOT NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'deliveries' AND column_name = 'created_by') THEN
    ALTER TABLE public.deliveries ADD COLUMN created_by UUID REFERENCES public.users(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- 4. Add dispatched_quantity and delivered_quantity tracking to order_items
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'dispatched_quantity') THEN
    ALTER TABLE public.order_items ADD COLUMN dispatched_quantity NUMERIC NOT NULL DEFAULT 0;
    ALTER TABLE public.order_items ADD CONSTRAINT order_items_dispatched_quantity_check CHECK (dispatched_quantity >= 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'delivered_quantity') THEN
    ALTER TABLE public.order_items ADD COLUMN delivered_quantity NUMERIC NOT NULL DEFAULT 0;
    ALTER TABLE public.order_items ADD CONSTRAINT order_items_delivered_quantity_check CHECK (delivered_quantity >= 0);
  END IF;
END $$;

-- 5. Create atomic delivery sequence counter table per business and year
CREATE TABLE IF NOT EXISTS public.delivery_sequences (
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  year INT NOT NULL,
  prefix TEXT NOT NULL DEFAULT 'DEL-',
  next_val BIGINT NOT NULL DEFAULT 1,
  padding INT NOT NULL DEFAULT 6,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (business_id, year)
);

ALTER TABLE public.delivery_sequences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'delivery_sequences' AND policyname = 'delivery_sequences_business_member_all'
  ) THEN
    CREATE POLICY delivery_sequences_business_member_all ON public.delivery_sequences
      FOR ALL
      TO authenticated
      USING (public.is_business_member(business_id))
      WITH CHECK (public.is_business_member(business_id));
  END IF;
END $$;

-- 6. Atomic function to generate delivery number: DEL-YYYY-000001
CREATE OR REPLACE FUNCTION public.generate_next_delivery_number(
  p_business_id UUID,
  p_year INT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_year INT;
  v_seq RECORD;
  v_num BIGINT;
  v_result TEXT;
  v_padding INT := 6;
BEGIN
  v_year := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::INT);

  -- 1. Lock sequence row for update to serialize concurrent requests
  SELECT * INTO v_seq
  FROM public.delivery_sequences
  WHERE business_id = p_business_id AND year = v_year
  FOR UPDATE;

  -- 2. If sequence record doesn't exist yet, initialize safely
  IF NOT FOUND THEN
    SELECT COALESCE(
      MAX(NULLIF(SUBSTRING(delivery_number FROM '^DEL-[0-9]{4}-0*([0-9]+)$'), '')::BIGINT),
      0
    ) + 1 INTO v_num
    FROM public.deliveries
    WHERE business_id = p_business_id AND delivery_number ~ ('^DEL-' || v_year::TEXT || '-[0-9]+$');

    v_num := GREATEST(COALESCE(v_num, 1), 1);

    INSERT INTO public.delivery_sequences (business_id, year, prefix, next_val, padding, updated_at)
    VALUES (p_business_id, v_year, 'DEL-', v_num + 1, v_padding, NOW())
    ON CONFLICT (business_id, year) DO UPDATE
      SET next_val = GREATEST(delivery_sequences.next_val, EXCLUDED.next_val),
          updated_at = NOW()
    RETURNING * INTO v_seq;

    v_result := 'DEL-' || v_year::TEXT || '-' || LPAD(v_num::TEXT, v_padding, '0');
    RETURN v_result;
  END IF;

  v_num := v_seq.next_val;
  v_padding := COALESCE(v_seq.padding, 6);

  -- 3. Collision avoidance loop
  LOOP
    v_result := 'DEL-' || v_year::TEXT || '-' || LPAD(v_num::TEXT, v_padding, '0');
    IF NOT EXISTS (
      SELECT 1 FROM public.deliveries
      WHERE business_id = p_business_id AND delivery_number = v_result
    ) THEN
      EXIT;
    END IF;
    v_num := v_num + 1;
  END LOOP;

  -- 4. Advance sequence
  UPDATE public.delivery_sequences
  SET next_val = v_num + 1, updated_at = NOW()
  WHERE business_id = p_business_id AND year = v_year;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_next_delivery_number(UUID, INT) TO authenticated, service_role;

-- 7. SQL Function to calculate dispatch summary for an order
CREATE OR REPLACE FUNCTION public.get_order_dispatch_summary(p_order_id UUID)
RETURNS TABLE (
  order_id UUID,
  order_number TEXT,
  order_delivery_status TEXT,
  order_item_id UUID,
  product_id UUID,
  product_name TEXT,
  ordered_quantity NUMERIC,
  previously_dispatched_quantity NUMERIC,
  remaining_quantity NUMERIC,
  is_item_fully_dispatched BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    o.id AS order_id,
    o.order_number,
    o.delivery_status AS order_delivery_status,
    oi.id AS order_item_id,
    oi.product_id,
    COALESCE(oi.product_name, p.name, 'Product') AS product_name,
    oi.quantity AS ordered_quantity,
    COALESCE(
      (
        SELECT SUM(di.delivered_quantity)
        FROM public.delivery_items di
        JOIN public.deliveries d ON di.delivery_id = d.id
        WHERE di.order_item_id = oi.id
          AND d.order_id = o.id
          AND d.status NOT IN ('CANCELLED')
      ),
      0
    ) AS previously_dispatched_quantity,
    GREATEST(
      0,
      oi.quantity - COALESCE(
        (
          SELECT SUM(di.delivered_quantity)
          FROM public.delivery_items di
          JOIN public.deliveries d ON di.delivery_id = d.id
          WHERE di.order_item_id = oi.id
            AND d.order_id = o.id
            AND d.status NOT IN ('CANCELLED')
        ),
        0
      )
    ) AS remaining_quantity,
    (
      COALESCE(
        (
          SELECT SUM(di.delivered_quantity)
          FROM public.delivery_items di
          JOIN public.deliveries d ON di.delivery_id = d.id
          WHERE di.order_item_id = oi.id
            AND d.order_id = o.id
            AND d.status NOT IN ('CANCELLED')
        ),
        0
      ) >= oi.quantity
    ) AS is_item_fully_dispatched
  FROM public.orders o
  JOIN public.order_items oi ON oi.order_id = o.id
  LEFT JOIN public.products p ON oi.product_id = p.id
  WHERE o.id = p_order_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_order_dispatch_summary(UUID) TO authenticated, service_role;

-- 8. Core Function: Recalculate order delivery status and item dispatch quantities
CREATE OR REPLACE FUNCTION public.recalculate_order_delivery_status(p_order_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_ordered NUMERIC := 0;
  v_total_dispatched NUMERIC := 0;
  v_all_items_full BOOLEAN := TRUE;
  v_any_item_dispatched BOOLEAN := FALSE;
  v_item RECORD;
  v_item_disp NUMERIC := 0;
  v_new_status TEXT;
BEGIN
  -- For each order item, recalculate sum of valid (non-cancelled) deliveries
  FOR v_item IN
    SELECT oi.id, oi.quantity
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
  LOOP
    SELECT COALESCE(SUM(di.delivered_quantity), 0) INTO v_item_disp
    FROM public.delivery_items di
    JOIN public.deliveries d ON di.delivery_id = d.id
    WHERE di.order_item_id = v_item.id
      AND d.order_id = p_order_id
      AND d.status NOT IN ('CANCELLED');

    UPDATE public.order_items
    SET dispatched_quantity = v_item_disp,
        delivered_quantity = v_item_disp,
        updated_at = NOW()
    WHERE id = v_item.id;

    v_total_ordered := v_total_ordered + v_item.quantity;
    v_total_dispatched := v_total_dispatched + v_item_disp;

    IF v_item_disp > 0 THEN
      v_any_item_dispatched := TRUE;
    END IF;

    IF v_item_disp < v_item.quantity THEN
      v_all_items_full := FALSE;
    END IF;
  END LOOP;

  IF NOT v_any_item_dispatched OR v_total_dispatched = 0 THEN
    v_new_status := 'PENDING';
  ELSIF v_all_items_full AND v_total_dispatched >= v_total_ordered THEN
    v_new_status := 'FULLY_DISPATCHED';
  ELSE
    v_new_status := 'PARTIALLY_DISPATCHED';
  END IF;

  UPDATE public.orders
  SET delivery_status = v_new_status,
      updated_at = NOW()
  WHERE id = p_order_id;

  RETURN v_new_status;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recalculate_order_delivery_status(UUID) TO authenticated, service_role;

-- 9. Atomic Partial Delivery Creation Function
CREATE OR REPLACE FUNCTION public.create_partial_delivery(
  p_business_id UUID,
  p_order_id UUID,
  p_delivery_items JSONB, -- Array of objects: [{"order_item_id": UUID, "quantity": NUMERIC}]
  p_delivery_date DATE DEFAULT CURRENT_DATE,
  p_delivery_number TEXT DEFAULT NULL,
  p_vehicle TEXT DEFAULT NULL,
  p_driver TEXT DEFAULT NULL,
  p_driver_phone TEXT DEFAULT NULL,
  p_tracking_number TEXT DEFAULT NULL,
  p_invoice_number TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'DISPATCHED',
  p_allow_override BOOLEAN DEFAULT FALSE,
  p_override_reason TEXT DEFAULT NULL,
  p_operator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_order RECORD;
  v_actor_id UUID;
  v_del_number TEXT;
  v_delivery_id UUID;
  v_item JSONB;
  v_oi_id UUID;
  v_qty NUMERIC;
  v_oi RECORD;
  v_prev_dispatched NUMERIC;
  v_remaining NUMERIC;
  v_has_excess BOOLEAN := FALSE;
  v_order_status TEXT;
  v_positive_items_count INT := 0;
  v_total_ordered NUMERIC := 0;
  v_total_dispatched NUMERIC := 0;
  v_total_remaining NUMERIC := 0;
BEGIN
  -- 1. Lock the order row to serialize concurrent partial deliveries against the same order
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id AND business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_order.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'CANNOT_DELIVER_CANCELLED_ORDER' USING ERRCODE = '23514';
  END IF;

  -- 2. Resolve actor
  v_actor_id := p_operator_id;
  IF v_actor_id IS NULL THEN
    SELECT id INTO v_actor_id
    FROM public.users
    WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE';
  END IF;

  IF v_actor_id IS NULL THEN
    -- Fallback to first super_admin in business if headless
    SELECT u.id INTO v_actor_id
    FROM public.users u
    JOIN public.user_roles ur ON u.id = ur.user_id
    JOIN public.roles r ON ur.role_id = r.id
    WHERE u.business_id = p_business_id AND lower(r.name) LIKE '%super%'
    LIMIT 1;
  END IF;

  -- 3. Resolve atomic sequential delivery number
  IF p_delivery_number IS NULL OR TRIM(p_delivery_number) = '' OR p_delivery_number = 'AUTO' THEN
    v_del_number := public.generate_next_delivery_number(p_business_id, EXTRACT(YEAR FROM p_delivery_date)::INT);
  ELSE
    v_del_number := UPPER(TRIM(p_delivery_number));
  END IF;

  -- Check duplicate delivery number
  IF EXISTS (
    SELECT 1 FROM public.deliveries 
    WHERE business_id = p_business_id AND delivery_number = v_del_number
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_DELIVERY_NUMBER: Delivery % already exists', v_del_number USING ERRCODE = '23505';
  END IF;

  -- 4. Validate items array is not empty
  IF p_delivery_items IS NULL OR jsonb_array_length(p_delivery_items) = 0 THEN
    RAISE EXCEPTION 'EMPTY_DELIVERY_ITEMS: At least one item with quantity > 0 must be specified' USING ERRCODE = '23514';
  END IF;

  -- 5. Validate each item against remaining ordered quantity with row-level locks
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_delivery_items)
  LOOP
    v_oi_id := (v_item->>'order_item_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;

    IF v_qty < 0 THEN
      RAISE EXCEPTION 'NEGATIVE_QUANTITY: Dispatched quantity cannot be negative for order item %', v_oi_id USING ERRCODE = '23514';
    END IF;

    IF v_qty = 0 THEN
      CONTINUE; -- Ignore zero quantity items
    END IF;

    v_positive_items_count := v_positive_items_count + 1;

    -- Lock order_item row
    SELECT * INTO v_oi
    FROM public.order_items
    WHERE id = v_oi_id AND order_id = p_order_id AND business_id = p_business_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVALID_ORDER_ITEM: Order item % does not belong to order %', v_oi_id, p_order_id USING ERRCODE = 'P0002';
    END IF;

    -- Calculate previously dispatched quantity (excluding cancelled deliveries)
    SELECT COALESCE(SUM(di.delivered_quantity), 0) INTO v_prev_dispatched
    FROM public.delivery_items di
    JOIN public.deliveries d ON di.delivery_id = d.id
    WHERE di.order_item_id = v_oi.id
      AND d.order_id = p_order_id
      AND d.status NOT IN ('CANCELLED');

    v_remaining := GREATEST(0, v_oi.quantity - v_prev_dispatched);

    -- Strict over-dispatch check
    IF v_qty > v_remaining THEN
      IF p_allow_override IS TRUE THEN
        IF p_override_reason IS NULL OR LENGTH(TRIM(p_override_reason)) < 5 THEN
          RAISE EXCEPTION 'OVERRIDE_REASON_REQUIRED: A valid reason of at least 5 characters is required for excess dispatch' USING ERRCODE = '23514';
        END IF;
        v_has_excess := TRUE;
      ELSE
        RAISE EXCEPTION 'EXCESS_QUANTITY: Dispatched quantity % exceeds remaining quantity % for order item %', v_qty, v_remaining, v_oi_id USING ERRCODE = '23514';
      END IF;
    END IF;
  END LOOP;

  -- Ensure at least one item had quantity > 0
  IF v_positive_items_count = 0 THEN
    RAISE EXCEPTION 'EMPTY_DELIVERY_ITEMS: At least one item with quantity > 0 must be specified' USING ERRCODE = '23514';
  END IF;

  -- 6. Insert into deliveries table
  INSERT INTO public.deliveries (
    business_id,
    order_id,
    customer_id,
    delivery_number,
    delivery_date,
    expected_delivery_date,
    status,
    vehicle,
    driver,
    driver_phone,
    tracking_number,
    invoice_number,
    notes,
    created_by,
    dispatched_at,
    created_at,
    updated_at
  ) VALUES (
    p_business_id,
    p_order_id,
    v_order.customer_id,
    v_del_number,
    p_delivery_date,
    v_order.expected_delivery_date,
    p_status,
    p_vehicle,
    p_driver,
    p_driver_phone,
    p_tracking_number,
    p_invoice_number,
    p_notes,
    v_actor_id,
    CASE WHEN p_status IN ('DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'FULLY_DISPATCHED') THEN NOW() ELSE NULL END,
    NOW(),
    NOW()
  ) RETURNING id INTO v_delivery_id;

  -- 7. Insert delivery items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_delivery_items)
  LOOP
    v_oi_id := (v_item->>'order_item_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;

    IF v_qty <= 0 THEN
      CONTINUE;
    END IF;

    SELECT * INTO v_oi FROM public.order_items WHERE id = v_oi_id;

    INSERT INTO public.delivery_items (
      business_id,
      delivery_id,
      order_item_id,
      product_id,
      ordered_quantity,
      delivered_quantity,
      created_at,
      updated_at
    ) VALUES (
      p_business_id,
      v_delivery_id,
      v_oi.id,
      v_oi.product_id,
      v_oi.quantity,
      v_qty,
      NOW(),
      NOW()
    );
  END LOOP;

  -- 8. Recalculate order delivery status and item dispatched quantities
  v_order_status := public.recalculate_order_delivery_status(p_order_id);

  -- 9. Status history
  INSERT INTO public.delivery_status_history (
    business_id, delivery_id, old_status, new_status, changed_by, reason, created_at
  ) VALUES (
    p_business_id, v_delivery_id, NULL, p_status, v_actor_id, p_notes, NOW()
  );

  -- 10. Audit log (including override details if applicable)
  INSERT INTO public.audit_logs (
    business_id, user_id, action, entity_type, entity_id, new_data
  ) VALUES (
    p_business_id,
    v_actor_id,
    CASE WHEN v_has_excess THEN 'DELIVERY_OVERRIDE_EXCESS' ELSE 'DELIVERY_CREATED' END,
    'delivery',
    v_delivery_id,
    jsonb_build_object(
      'delivery_number', v_del_number,
      'order_id', p_order_id,
      'status', p_status,
      'order_delivery_status', v_order_status,
      'is_override', v_has_excess,
      'override_reason', p_override_reason
    )
  );

  -- 11. Compute totals for return payload
  SELECT 
    SUM(oi.quantity),
    SUM(oi.dispatched_quantity),
    SUM(GREATEST(0, oi.quantity - oi.dispatched_quantity))
  INTO v_total_ordered, v_total_dispatched, v_total_remaining
  FROM public.order_items oi
  WHERE oi.order_id = p_order_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'delivery_id', v_delivery_id,
    'delivery_number', v_del_number,
    'order_id', p_order_id,
    'order_number', v_order.order_number,
    'order_delivery_status', v_order_status,
    'total_ordered', v_total_ordered,
    'total_dispatched', v_total_dispatched,
    'total_remaining', v_total_remaining
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_partial_delivery(UUID, UUID, JSONB, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, UUID) TO authenticated, service_role;

-- 10. Atomic Cancel Partial Delivery Function
CREATE OR REPLACE FUNCTION public.cancel_partial_delivery(
  p_business_id UUID,
  p_delivery_id UUID,
  p_reason TEXT,
  p_operator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_del RECORD;
  v_actor_id UUID;
  v_new_order_status TEXT;
  v_total_ordered NUMERIC := 0;
  v_total_dispatched NUMERIC := 0;
  v_total_remaining NUMERIC := 0;
BEGIN
  -- 1. Lock delivery row FOR UPDATE
  SELECT * INTO v_del
  FROM public.deliveries
  WHERE id = p_delivery_id AND business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DELIVERY_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- 2. Idempotency Check: if already cancelled, return success without duplicate reversal
  IF v_del.status = 'CANCELLED' THEN
    RETURN jsonb_build_object(
      'success', TRUE,
      'already_cancelled', TRUE,
      'delivery_id', p_delivery_id,
      'delivery_number', v_del.delivery_number,
      'message', 'Delivery is already cancelled'
    );
  END IF;

  -- 3. Resolve actor
  v_actor_id := p_operator_id;
  IF v_actor_id IS NULL THEN
    SELECT id INTO v_actor_id
    FROM public.users
    WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE';
  END IF;

  -- 4. Mark status as CANCELLED
  UPDATE public.deliveries
  SET status = 'CANCELLED',
      notes = COALESCE(notes || E' [Cancelled: ' || p_reason || ']', 'Cancelled: ' || p_reason),
      updated_at = NOW()
  WHERE id = p_delivery_id;

  -- 5. Recompute order delivery status and order items dispatched quantities
  v_new_order_status := public.recalculate_order_delivery_status(v_del.order_id);

  -- 6. Status history
  INSERT INTO public.delivery_status_history (
    business_id, delivery_id, old_status, new_status, changed_by, reason, created_at
  ) VALUES (
    p_business_id, p_delivery_id, v_del.status, 'CANCELLED', v_actor_id, p_reason, NOW()
  );

  -- 7. Audit log
  INSERT INTO public.audit_logs (
    business_id, user_id, action, entity_type, entity_id, old_data, new_data
  ) VALUES (
    p_business_id,
    v_actor_id,
    'DELIVERY_CANCELLED',
    'delivery',
    p_delivery_id,
    jsonb_build_object('status', v_del.status),
    jsonb_build_object('status', 'CANCELLED', 'reason', p_reason, 'order_delivery_status', v_new_order_status)
  );

  -- 8. Compute updated totals
  SELECT 
    SUM(oi.quantity),
    SUM(oi.dispatched_quantity),
    SUM(GREATEST(0, oi.quantity - oi.dispatched_quantity))
  INTO v_total_ordered, v_total_dispatched, v_total_remaining
  FROM public.order_items oi
  WHERE oi.order_id = v_del.order_id;

  RETURN jsonb_build_object(
    'success', TRUE,
    'already_cancelled', FALSE,
    'delivery_id', p_delivery_id,
    'delivery_number', v_del.delivery_number,
    'order_id', v_del.order_id,
    'order_delivery_status', v_new_order_status,
    'total_ordered', v_total_ordered,
    'total_dispatched', v_total_dispatched,
    'total_remaining', v_total_remaining
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_partial_delivery(UUID, UUID, TEXT, UUID) TO authenticated, service_role;
