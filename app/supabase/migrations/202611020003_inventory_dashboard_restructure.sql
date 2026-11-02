-- ====================================================================
-- Migration: 202611020003_inventory_dashboard_restructure.sql
-- Description: Inventory Dashboard Restructuring:
-- 1. Separate factory production output from warehouse manual ready stock
-- 2. Total Remaining Orders calculation and view/RPC
-- 3. Dedicated Ready for Dispatch section view/RPC
-- 4. Atomic database dispatch validation against available stock and order remaining
-- 5. Existing stock reconciliation by transaction source
-- ====================================================================

-- 1. RECONCILE EXISTING FINISHED GOODS INVENTORY BY TRANSACTION SOURCE
-- --------------------------------------------------------------------
-- Production outputs belong in factory production tracking ("Ready for Dispatch").
-- Warehouse Ready Stock represents strictly authorized manual stock additions
-- minus valid confirmed dispatches plus valid cancellations.

DO $$
BEGIN
  -- Reconcile products that have manual finished good transactions
  UPDATE public.inventory i
  SET current_stock = GREATEST(0, COALESCE(tx.net_manual_stock, 0)),
      reserved_stock = 0,
      available_stock = GREATEST(0, COALESCE(tx.net_manual_stock, 0)),
      updated_at = NOW()
  FROM (
    SELECT 
      business_id,
      item_id,
      SUM(
        CASE 
          WHEN transaction_type = 'STOCK_IN' AND reference_type IN ('MANUAL_ADD', 'OPENING_STOCK', 'STOCK_ADDITION', 'STOCK_CORRECTION') THEN quantity
          WHEN transaction_type = 'STOCK_OUT' AND reference_type IN ('DAMAGED_STOCK', 'STOCK_CORRECTION') THEN -quantity
          WHEN transaction_type = 'STOCK_OUT' AND reference_type = 'delivery_dispatch' THEN -quantity
          WHEN transaction_type = 'STOCK_IN' AND reference_type = 'delivery_cancellation' THEN quantity
          ELSE 0
        END
      ) AS net_manual_stock
    FROM public.inventory_transactions
    WHERE item_type = 'finished_good'
    GROUP BY business_id, item_id
  ) tx
  WHERE i.business_id = tx.business_id
    AND i.item_type = 'finished_good'
    AND i.item_id = tx.item_id;

  -- For any finished good inventory without manual transactions, set to 0
  UPDATE public.inventory
  SET current_stock = 0,
      reserved_stock = 0,
      available_stock = 0,
      updated_at = NOW()
  WHERE item_type = 'finished_good'
    AND item_id NOT IN (
      SELECT DISTINCT item_id 
      FROM public.inventory_transactions 
      WHERE item_type = 'finished_good' 
        AND reference_type IN ('MANUAL_ADD', 'OPENING_STOCK', 'STOCK_ADDITION', 'STOCK_CORRECTION')
    );
END $$;


-- 2. UPDATE mark_production_order_done TO NOT INFLATE WAREHOUSE MANUAL STOCK
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_production_order_done(
  p_business_id UUID,
  p_production_order_id UUID,
  p_quantity_produced NUMERIC,
  p_quantity_rejected NUMERIC DEFAULT 0,
  p_batch_number TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  po RECORD;
  actor_rec RECORD;
  inv_rec RECORD;
  v_new_completed NUMERIC;
  v_new_scrap NUMERIC;
  v_target_status TEXT;
  v_actual_start_date DATE;
  v_actual_end_date DATE := NULL;
  v_output_id UUID;
  v_clean_batch TEXT;
  v_clean_notes TEXT;
BEGIN
  -- Clean inputs
  v_clean_batch := NULLIF(TRIM(p_batch_number), '');
  v_clean_notes := NULLIF(TRIM(p_notes), '');

  -- 1. Actor verification
  SELECT id, email, status
  INTO actor_rec
  FROM public.users
  WHERE auth_user_id = auth.uid()
    AND business_id = p_business_id
    AND status = 'ACTIVE';

  IF actor_rec.id IS NULL THEN
    SELECT id, email, status
    INTO actor_rec
    FROM public.users
    WHERE business_id = p_business_id
      AND status = 'ACTIVE'
    LIMIT 1;

    IF actor_rec.id IS NULL THEN
      RAISE EXCEPTION 'AUTH_REQUIRED: active user not found in business %',
        p_business_id USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 2. Lock production order
  SELECT *
  INTO po
  FROM public.production_orders
  WHERE id = p_production_order_id
    AND business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCTION_ORDER_NOT_FOUND: %', p_production_order_id
      USING ERRCODE = '23503';
  END IF;

  -- 3. Idempotent short-circuit
  IF po.status = 'COMPLETED' THEN
    RETURN jsonb_build_object(
      'success', true,
      'production_order_id', po.id,
      'status', 'COMPLETED',
      'completed_quantity', po.completed_quantity,
      'scrap_quantity', po.scrap_quantity,
      'actual_end_date', po.actual_end_date,
      'already_completed', true
    );
  END IF;

  -- 4. State validation
  IF po.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'INVALID_STATUS: cannot complete cancelled production order %', po.id
      USING ERRCODE = '23514';
  END IF;

  -- 5. Quantity validation
  IF p_quantity_produced IS NULL OR p_quantity_produced <= 0 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY: quantity_produced must be positive, got %',
      p_quantity_produced USING ERRCODE = '23514';
  END IF;

  IF p_quantity_rejected IS NOT NULL AND p_quantity_rejected < 0 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY: quantity_rejected cannot be negative, got %',
      p_quantity_rejected USING ERRCODE = '23514';
  END IF;

  -- 6. Calculate new totals
  v_new_completed := COALESCE(po.completed_quantity, 0) + p_quantity_produced;
  v_new_scrap     := COALESCE(po.scrap_quantity, 0) + COALESCE(p_quantity_rejected, 0);

  IF v_new_completed >= po.quantity THEN
    v_target_status := 'COMPLETED';
    v_actual_end_date := CURRENT_DATE;
  ELSE
    v_target_status := 'IN_PROGRESS';
    v_actual_end_date := NULL;
  END IF;

  v_actual_start_date := COALESCE(po.actual_start_date, CURRENT_DATE);

  -- 7. Update production_orders
  UPDATE public.production_orders
  SET completed_quantity = v_new_completed,
      scrap_quantity = v_new_scrap,
      status = v_target_status,
      actual_start_date = v_actual_start_date,
      actual_end_date = COALESCE(v_actual_end_date, po.actual_end_date),
      updated_at = NOW()
  WHERE id = po.id;

  -- 8. Record production output (Source of truth for shop-floor production / Ready for Dispatch)
  INSERT INTO public.production_output (
    business_id, production_order_id, product_id,
    quantity_produced, quantity_rejected,
    batch_number, produced_at, created_by
  ) VALUES (
    p_business_id, po.id, po.product_id,
    p_quantity_produced, COALESCE(p_quantity_rejected, 0),
    v_clean_batch, NOW(), actor_rec.id
  )
  RETURNING id INTO v_output_id;

  -- NOTE: Under approved architecture, factory production output does NOT automatically
  -- increase commercial warehouse manual Ready Stock. It is tracked separately under
  -- "Ready for Dispatch".

  -- 9. Production log
  INSERT INTO public.production_logs (
    business_id, production_order_id,
    log_type, message, quantity_completed, quality_status, quality_notes, created_by
  ) VALUES (
    p_business_id, po.id,
    CASE WHEN v_target_status = 'COMPLETED' THEN 'STATUS_CHANGE' ELSE 'PROGRESS' END,
    COALESCE(v_clean_notes, 'Marked as Done: ' || p_quantity_produced || ' produced (' || CASE WHEN v_target_status = 'COMPLETED' THEN 'Completed' ELSE 'In Progress' END || ')' || COALESCE(' [Batch: ' || v_clean_batch || ']', '')),
    p_quantity_produced,
    'PASSED',
    v_clean_notes,
    actor_rec.id
  );

  -- 10. Audit log
  INSERT INTO public.audit_logs (
    business_id, user_id, action, entity_type, entity_id, old_data, new_data
  ) VALUES (
    p_business_id,
    actor_rec.id,
    'PRODUCTION_ORDER_COMPLETED',
    'production_order',
    po.id,
    jsonb_build_object(
      'status', po.status,
      'completed_quantity', po.completed_quantity,
      'scrap_quantity', po.scrap_quantity,
      'actual_end_date', po.actual_end_date
    ),
    jsonb_build_object(
      'status', v_target_status,
      'completed_quantity', v_new_completed,
      'scrap_quantity', v_new_scrap,
      'quantity_produced_this_run', p_quantity_produced,
      'quantity_rejected_this_run', COALESCE(p_quantity_rejected, 0),
      'batch_number', v_clean_batch,
      'actual_end_date', COALESCE(v_actual_end_date, po.actual_end_date),
      'output_id', v_output_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'production_order_id', po.id,
    'output_id', v_output_id,
    'status', v_target_status,
    'completed_quantity', v_new_completed,
    'scrap_quantity', v_new_scrap,
    'actual_start_date', v_actual_start_date,
    'actual_end_date', COALESCE(v_actual_end_date, po.actual_end_date),
    'batch_number', v_clean_batch
  );
END;
$$;


-- 3. TOTAL REMAINING ORDERS RPC & VIEW
-- --------------------------------------------------------------------
-- Confirmed Order Quantity - Successfully Dispatched Quantity
-- Grouped strictly by product and UOM (BDL, MTR, PCS kept distinct)
CREATE OR REPLACE FUNCTION public.get_product_remaining_orders(p_business_id UUID)
RETURNS TABLE (
  product_id UUID,
  product_name TEXT,
  sku TEXT,
  unit TEXT,
  total_ordered NUMERIC,
  total_dispatched NUMERIC,
  remaining_quantity NUMERIC,
  orders_breakdown JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (auth.role() != 'service_role') AND (NOT public.is_business_member(p_business_id)) THEN
    RAISE EXCEPTION 'FORBIDDEN: business access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT 
    p.id AS product_id,
    p.name::TEXT AS product_name,
    p.sku::TEXT,
    p.unit::TEXT,
    COALESCE(SUM(oi.quantity), 0) AS total_ordered,
    COALESCE(SUM(disp.dispatched_qty), 0) AS total_dispatched,
    COALESCE(SUM(GREATEST(0, oi.quantity - disp.dispatched_qty)), 0) AS remaining_quantity,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'order_id', o.id,
          'order_number', o.order_number,
          'ordered_quantity', oi.quantity,
          'dispatched_quantity', disp.dispatched_qty,
          'remaining_quantity', GREATEST(0, oi.quantity - disp.dispatched_qty)
        )
      ) FILTER (WHERE GREATEST(0, oi.quantity - disp.dispatched_qty) > 0),
      '[]'::jsonb
    ) AS orders_breakdown
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  JOIN public.products p ON p.id = oi.product_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(di.delivered_quantity), 0) AS dispatched_qty
    FROM public.delivery_items di
    JOIN public.deliveries d ON d.id = di.delivery_id
    WHERE di.order_item_id = oi.id
      AND d.business_id = oi.business_id
      AND d.status IN ('DISPATCHED', 'IN_TRANSIT', 'DELIVERED')
  ) disp ON TRUE
  WHERE oi.business_id = p_business_id
    AND o.status = 'CONFIRMED'
  GROUP BY p.id, p.name, p.sku, p.unit
  ORDER BY remaining_quantity DESC, p.name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_remaining_orders(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_product_remaining_orders(UUID) TO service_role;


-- 4. READY FOR DISPATCH SECTION RPC & VIEW
-- --------------------------------------------------------------------
-- Lists factory production completed records with quality standard, date, linked order,
-- and accurate dispatch status
CREATE OR REPLACE FUNCTION public.get_ready_for_dispatch(p_business_id UUID)
RETURNS TABLE (
  production_order_id UUID,
  business_id UUID,
  order_id UUID,
  order_number TEXT,
  product_id UUID,
  product_name TEXT,
  sku TEXT,
  unit TEXT,
  quality_standard TEXT,
  completed_quantity NUMERIC,
  completion_date TIMESTAMPTZ,
  dispatched_quantity NUMERIC,
  dispatch_status TEXT,
  delivery_id UUID,
  delivery_number TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (auth.role() != 'service_role') AND (NOT public.is_business_member(p_business_id)) THEN
    RAISE EXCEPTION 'FORBIDDEN: business access denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT 
    po.id AS production_order_id,
    po.business_id,
    po.order_id,
    COALESCE(o.order_number, 'UNASSIGNED_STOCK')::TEXT AS order_number,
    p.id AS product_id,
    p.name::TEXT AS product_name,
    p.sku::TEXT,
    p.unit::TEXT,
    COALESCE(p.quality_standard, 'Standard')::TEXT AS quality_standard,
    po.completed_quantity,
    po.actual_end_date::TIMESTAMPTZ AS completion_date,
    COALESCE(disp.dispatched_qty, 0) AS dispatched_quantity,
    CASE 
      WHEN po.order_id IS NULL THEN 'UNASSIGNED_STOCK'
      WHEN COALESCE(disp.dispatched_qty, 0) >= po.completed_quantity THEN 'FULLY_DISPATCHED'
      WHEN COALESCE(disp.dispatched_qty, 0) > 0 THEN 'PARTIALLY_DISPATCHED'
      ELSE 'READY_TO_DISPATCH'
    END::TEXT AS dispatch_status,
    del.delivery_id,
    del.delivery_number::TEXT
  FROM public.production_orders po
  JOIN public.products p ON p.id = po.product_id
  LEFT JOIN public.orders o ON o.id = po.order_id
  LEFT JOIN LATERAL (
    SELECT COALESCE(SUM(di.delivered_quantity), 0) AS dispatched_qty
    FROM public.delivery_items di
    JOIN public.deliveries d ON d.id = di.delivery_id
    WHERE (di.order_item_id = po.order_item_id OR (di.order_item_id IS NULL AND di.product_id = po.product_id))
      AND d.order_id = po.order_id
      AND d.business_id = po.business_id
      AND d.status IN ('DISPATCHED', 'IN_TRANSIT', 'DELIVERED')
  ) disp ON TRUE
  LEFT JOIN LATERAL (
    SELECT d.id AS delivery_id, d.delivery_number
    FROM public.deliveries d
    WHERE d.order_id = po.order_id
      AND d.business_id = po.business_id
      AND d.status NOT IN ('CANCELLED')
    ORDER BY d.created_at DESC
    LIMIT 1
  ) del ON TRUE
  WHERE po.business_id = p_business_id
    AND po.status = 'COMPLETED'
    AND po.completed_quantity > 0
  ORDER BY po.actual_end_date DESC NULLS LAST, po.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ready_for_dispatch(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ready_for_dispatch(UUID) TO service_role;


-- 5. ATOMIC DISPATCH DELIVERY RPC (REPLACES TS RESERVATION HACKS)
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dispatch_delivery(
  p_business_id UUID,
  p_delivery_id UUID,
  p_vehicle TEXT DEFAULT NULL,
  p_driver TEXT DEFAULT NULL,
  p_tracking_number TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delivery_rec RECORD;
  item_rec RECORD;
  actor_id UUID;
  v_available_stock NUMERIC;
  v_prev_dispatched NUMERIC;
  v_remaining_order_qty NUMERIC;
  v_dispatch_qty NUMERIC;
  v_all_order_items_delivered BOOLEAN;
BEGIN
  -- 1. Authorization
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'delivery.dispatch') THEN
      RAISE EXCEPTION 'FORBIDDEN: delivery.dispatch' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT id INTO actor_id FROM public.users 
  WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE';
  
  IF actor_id IS NULL THEN
    -- Fallback for service_role or admin scripts
    SELECT id INTO actor_id FROM public.users 
    WHERE business_id = p_business_id AND status = 'ACTIVE' LIMIT 1;
    IF actor_id IS NULL THEN
      RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 2. Lock delivery row
  SELECT * INTO delivery_rec
  FROM public.deliveries
  WHERE id = p_delivery_id AND business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'DELIVERY_NOT_FOUND' USING ERRCODE = '23503'; END IF;

  IF delivery_rec.status NOT IN ('PACKED', 'READY', 'DRAFT') THEN
    RAISE EXCEPTION 'INVALID_STATUS: Can only dispatch PACKED or READY deliveries, current: %', delivery_rec.status USING ERRCODE = '23514';
  END IF;

  IF delivery_rec.dispatched_at IS NOT NULL OR delivery_rec.status IN ('DISPATCHED', 'IN_TRANSIT', 'DELIVERED') THEN
    RAISE EXCEPTION 'ALREADY_DISPATCHED' USING ERRCODE = '23514';
  END IF;

  -- 3. Lock and validate each delivery line item against available stock & remaining order
  FOR item_rec IN
    SELECT 
      di.id AS delivery_item_id,
      di.product_id,
      di.order_item_id,
      di.ordered_quantity,
      di.delivered_quantity,
      p.name AS product_name,
      p.unit,
      oi.quantity AS order_line_qty,
      oi.order_id
    FROM public.delivery_items di
    JOIN public.products p ON p.id = di.product_id
    LEFT JOIN public.order_items oi ON oi.id = di.order_item_id
    WHERE di.delivery_id = p_delivery_id AND di.business_id = p_business_id
    FOR UPDATE OF di
  LOOP
    -- Determine exact dispatch quantity for this delivery item
    v_dispatch_qty := CASE 
      WHEN item_rec.delivered_quantity > 0 THEN item_rec.delivered_quantity 
      ELSE item_rec.ordered_quantity 
    END;

    IF v_dispatch_qty <= 0 THEN
      CONTINUE;
    END IF;

    -- A. Validate Available Manual Ready Stock with row lock
    SELECT available_stock INTO v_available_stock
    FROM public.inventory
    WHERE business_id = p_business_id AND item_type = 'finished_good' AND item_id = item_rec.product_id
    FOR UPDATE;

    IF v_available_stock IS NULL OR v_available_stock < v_dispatch_qty THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK: Item "%" requires % %, but available manual ready stock is % %',
        item_rec.product_name, v_dispatch_qty, item_rec.unit, COALESCE(v_available_stock, 0), item_rec.unit
        USING ERRCODE = '23514';
    END IF;

    -- B. Validate Remaining Order Quantity
    IF item_rec.order_item_id IS NOT NULL AND item_rec.order_line_qty IS NOT NULL THEN
      SELECT COALESCE(SUM(prev_di.delivered_quantity), 0) INTO v_prev_dispatched
      FROM public.delivery_items prev_di
      JOIN public.deliveries prev_d ON prev_d.id = prev_di.delivery_id
      WHERE prev_di.order_item_id = item_rec.order_item_id
        AND prev_d.status IN ('DISPATCHED', 'IN_TRANSIT', 'DELIVERED')
        AND prev_d.id != p_delivery_id;

      v_remaining_order_qty := GREATEST(0, item_rec.order_line_qty - v_prev_dispatched);

      IF v_dispatch_qty > v_remaining_order_qty THEN
        RAISE EXCEPTION 'OVER_DISPATCH: Item "%" requested dispatch quantity % % exceeds remaining order quantity % %',
          item_rec.product_name, v_dispatch_qty, item_rec.unit, v_remaining_order_qty, item_rec.unit
          USING ERRCODE = '23514';
      END IF;
    END IF;

    -- C. Deduct stock atomically
    UPDATE public.inventory
    SET current_stock = current_stock - v_dispatch_qty,
        available_stock = available_stock - v_dispatch_qty,
        updated_at = NOW()
    WHERE business_id = p_business_id AND item_type = 'finished_good' AND item_id = item_rec.product_id;

    -- D. Record inventory transaction (STOCK_OUT)
    INSERT INTO public.inventory_transactions (
      business_id, item_type, item_id, transaction_type, quantity,
      reference_type, reference_id, notes, created_by
    ) VALUES (
      p_business_id, 'finished_good', item_rec.product_id, 'STOCK_OUT',
      v_dispatch_qty, 'delivery_dispatch', p_delivery_id,
      'Dispatched for delivery ' || delivery_rec.delivery_number, actor_id
    );

    -- E. Update delivery item
    UPDATE public.delivery_items
    SET delivered_quantity = v_dispatch_qty,
        updated_at = NOW()
    WHERE id = item_rec.delivery_item_id;

    -- F. Update order item delivered and dispatched quantities
    IF item_rec.order_item_id IS NOT NULL THEN
      UPDATE public.order_items
      SET delivered_quantity = v_prev_dispatched + v_dispatch_qty,
          dispatched_quantity = v_prev_dispatched + v_dispatch_qty,
          updated_at = NOW()
      WHERE id = item_rec.order_item_id;
    END IF;
  END LOOP;

  -- 4. Update delivery status to DISPATCHED
  UPDATE public.deliveries
  SET status = 'DISPATCHED',
      dispatched_at = NOW(),
      vehicle = COALESCE(p_vehicle, delivery_rec.vehicle),
      driver = COALESCE(p_driver, delivery_rec.driver),
      tracking_number = COALESCE(p_tracking_number, delivery_rec.tracking_number),
      notes = COALESCE(p_notes, delivery_rec.notes),
      updated_at = NOW()
  WHERE id = p_delivery_id AND business_id = p_business_id;

  -- 5. Delivery status history
  INSERT INTO public.delivery_status_history (
    business_id, delivery_id, old_status, new_status, changed_by, reason
  ) VALUES (
    p_business_id, p_delivery_id, delivery_rec.status, 'DISPATCHED', actor_id, p_notes
  );

  -- 6. Audit log
  INSERT INTO public.audit_logs (
    business_id, user_id, action, entity_type, entity_id, old_data, new_data
  ) VALUES (
    p_business_id, actor_id, 'DELIVERY_DISPATCHED', 'delivery', p_delivery_id,
    jsonb_build_object('old_status', delivery_rec.status, 'vehicle', delivery_rec.vehicle, 'driver', delivery_rec.driver),
    jsonb_build_object('new_status', 'DISPATCHED', 'dispatched_at', NOW(), 'vehicle', p_vehicle, 'driver', p_driver)
  );

  -- 7. Update overall order delivery status
  IF delivery_rec.order_id IS NOT NULL THEN
    SELECT (COUNT(*) = 0) INTO v_all_order_items_delivered
    FROM public.order_items oi
    WHERE oi.order_id = delivery_rec.order_id
      AND oi.business_id = p_business_id
      AND (oi.quantity - COALESCE(oi.delivered_quantity, 0)) > 0;

    UPDATE public.orders
    SET delivery_status = CASE WHEN v_all_order_items_delivered THEN 'DELIVERED' ELSE 'PARTIALLY_DELIVERED' END,
        updated_at = NOW()
    WHERE id = delivery_rec.order_id AND business_id = p_business_id;
  END IF;

  -- 8. Post delivery to customer ledger and apply advance
  PERFORM public.post_delivery_to_customer_ledger(p_business_id, p_delivery_id, actor_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.dispatch_delivery(UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_delivery(UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;


-- 6. UPDATE cancel_delivery TO ALSO RESTORE ORDER ITEM DELIVERED QUANTITIES
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_delivery(
  p_business_id UUID,
  p_delivery_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delivery_rec RECORD;
  actor_id UUID;
  item_rec RECORD;
  v_new_delivered NUMERIC;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'delivery.cancel') THEN
      RAISE EXCEPTION 'FORBIDDEN: delivery.cancel' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO delivery_rec
  FROM public.deliveries
  WHERE id = p_delivery_id AND business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'DELIVERY_NOT_FOUND' USING ERRCODE = '23503'; END IF;

  IF delivery_rec.status IN ('DELIVERED', 'CANCELLED') THEN
    RAISE EXCEPTION 'CANNOT_CANCEL: Status is %', delivery_rec.status USING ERRCODE = '23514';
  END IF;

  SELECT id INTO actor_id FROM public.users 
  WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE';
  
  IF actor_id IS NULL THEN
    SELECT id INTO actor_id FROM public.users 
    WHERE business_id = p_business_id AND status = 'ACTIVE' LIMIT 1;
    IF actor_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;
  END IF;

  -- Return inventory and restore order quantities if previously dispatched
  IF delivery_rec.status IN ('DISPATCHED', 'IN_TRANSIT') THEN
    FOR item_rec IN
      SELECT di.product_id, di.delivered_quantity, di.order_item_id
      FROM public.delivery_items di
      WHERE di.delivery_id = p_delivery_id AND di.business_id = p_business_id
        AND di.delivered_quantity > 0
    LOOP
      UPDATE public.inventory
      SET current_stock = current_stock + item_rec.delivered_quantity,
          available_stock = available_stock + item_rec.delivered_quantity,
          updated_at = NOW()
      WHERE business_id = p_business_id AND item_type = 'finished_good' AND item_id = item_rec.product_id;

      INSERT INTO public.inventory_transactions (
        business_id, item_type, item_id, transaction_type, quantity,
        reference_type, reference_id, notes, created_by
      ) VALUES (
        p_business_id, 'finished_good', item_rec.product_id, 'STOCK_IN',
        item_rec.delivered_quantity, 'delivery_cancellation', p_delivery_id,
        'Finished goods returned from cancelled delivery ' || delivery_rec.delivery_number || ': ' || p_reason,
        actor_id
      );

      -- Restore order item delivered quantity
      IF item_rec.order_item_id IS NOT NULL THEN
        SELECT COALESCE(SUM(other_di.delivered_quantity), 0) INTO v_new_delivered
        FROM public.delivery_items other_di
        JOIN public.deliveries other_d ON other_d.id = other_di.delivery_id
        WHERE other_di.order_item_id = item_rec.order_item_id
          AND other_d.status IN ('DISPATCHED', 'IN_TRANSIT', 'DELIVERED')
          AND other_d.id != p_delivery_id;

        UPDATE public.order_items
        SET delivered_quantity = v_new_delivered,
            dispatched_quantity = v_new_delivered,
            updated_at = NOW()
        WHERE id = item_rec.order_item_id;
      END IF;
    END LOOP;
  END IF;

  -- Update delivery status
  UPDATE public.deliveries
  SET status = 'CANCELLED',
      notes = COALESCE(notes, '') || ' | CANCELLED: ' || p_reason,
      is_ledger_reversed = CASE WHEN delivery_rec.is_ledger_posted THEN TRUE ELSE is_ledger_reversed END,
      ledger_reversed_at = CASE WHEN delivery_rec.is_ledger_posted THEN NOW() ELSE ledger_reversed_at END,
      updated_at = NOW()
  WHERE id = p_delivery_id AND business_id = p_business_id;

  INSERT INTO public.delivery_status_history (
    business_id, delivery_id, old_status, new_status, changed_by, reason
  ) VALUES (
    p_business_id, p_delivery_id, delivery_rec.status, 'CANCELLED', actor_id, p_reason
  );

  INSERT INTO public.audit_logs (
    business_id, user_id, action, entity_type, entity_id, old_data, new_data
  ) VALUES (
    p_business_id, actor_id, 'DELIVERY_CANCELLED', 'delivery', p_delivery_id,
    jsonb_build_object('old_status', delivery_rec.status, 'delivery_number', delivery_rec.delivery_number),
    jsonb_build_object('new_status', 'CANCELLED', 'reason', p_reason)
  );

  -- Reverse customer ledger entry if posted
  IF delivery_rec.is_ledger_posted IS TRUE THEN
    INSERT INTO public.customer_ledger (
      business_id, customer_id, order_id, delivery_id,
      entry_type, description, debit, credit, balance, entry_date, created_by, created_at
    ) VALUES (
      p_business_id, delivery_rec.customer_id, delivery_rec.order_id, p_delivery_id,
      'ADJUSTMENT', 'Reversal for cancelled delivery ' || delivery_rec.delivery_number,
      0, COALESCE(delivery_rec.total_amount, 0), 0, CURRENT_DATE, actor_id, NOW()
    );

    -- Re-open customer advance allocations tied to this delivery
    UPDATE public.customer_advance_allocations
    SET status = 'CANCELLED',
        notes = notes || ' (Cancelled via delivery reversal)'
    WHERE delivery_id = p_delivery_id AND status = 'ACTIVE';

    -- Recalculate customer running balance
    PERFORM public.recalculate_customer_ledger(p_business_id, delivery_rec.customer_id);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_delivery(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_delivery(UUID, UUID, TEXT) TO service_role;
