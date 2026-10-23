-- Migration: 202610240001_mark_production_as_done.sql
-- Description: Adds completed/scrap tracking and atomic mark_production_order_done RPC

BEGIN;

-- 1. Add completed_quantity and scrap_quantity to production_orders
ALTER TABLE public.production_orders
  ADD COLUMN IF NOT EXISTS completed_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scrap_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0;

-- Backfill existing completed production orders
UPDATE public.production_orders
SET completed_quantity = quantity
WHERE status IN ('COMPLETED', 'READY_FOR_DISPATCH')
  AND completed_quantity = 0;

-- 2. Add completed_quantity to order_items
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS completed_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0;

-- Backfill order_items completed_quantity from production_orders
UPDATE public.order_items oi
SET completed_quantity = sub.total_completed
FROM (
  SELECT order_item_id, SUM(completed_quantity) AS total_completed
  FROM public.production_orders
  WHERE order_item_id IS NOT NULL
  GROUP BY order_item_id
) sub
WHERE oi.id = sub.order_item_id;

-- 3. Drop single-batch unique constraint on production_output to allow partial batches
ALTER TABLE public.production_output
  DROP CONSTRAINT IF EXISTS production_output_business_order_unique;

-- Ensure an index on (business_id, production_order_id) still exists for efficient lookup
CREATE INDEX IF NOT EXISTS production_output_po_idx
  ON public.production_output (business_id, production_order_id);

-- 4. Update helper function to accurately check order production completion
CREATE OR REPLACE FUNCTION public.is_order_production_complete(
  p_business_id UUID,
  p_order_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_incomplete_count INTEGER;
  v_po_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_po_count
  FROM public.production_orders po
  WHERE po.order_id = p_order_id AND po.business_id = p_business_id;

  IF v_po_count = 0 THEN
    RETURN FALSE;
  END IF;

  SELECT COUNT(*) INTO v_incomplete_count
  FROM public.production_orders po
  WHERE po.order_id = p_order_id AND po.business_id = p_business_id
    AND (
      po.status NOT IN ('COMPLETED', 'READY_FOR_DISPATCH', 'CANCELLED')
      OR (po.status != 'CANCELLED' AND COALESCE(po.completed_quantity, 0) < po.quantity)
    );

  RETURN v_incomplete_count = 0;
END;
$$;

-- Helper: Ensure delivery readiness trigger can execute safely in system/trigger context
CREATE OR REPLACE FUNCTION public.check_and_update_delivery_readiness(
  p_business_id UUID,
  p_order_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delivery_rec RECORD;
  actor_id UUID;
  production_complete BOOLEAN;
BEGIN
  -- Check permissions (allow service role / trigger / system calls)
  IF auth.uid() IS NOT NULL AND NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- Get actor if available
  IF auth.uid() IS NOT NULL THEN
    SELECT id INTO actor_id
    FROM public.users
    WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE';
  END IF;

  -- Get deliveries for this order that are NOT_READY
  FOR delivery_rec IN
    SELECT id FROM public.deliveries
    WHERE order_id = p_order_id AND business_id = p_business_id
      AND status = 'NOT_READY'
  LOOP
    production_complete := public.is_order_production_complete(p_business_id, p_order_id);

    IF production_complete THEN
      UPDATE public.deliveries
      SET status = 'READY', updated_at = NOW()
      WHERE id = delivery_rec.id AND business_id = p_business_id;

      INSERT INTO public.delivery_status_history (business_id, delivery_id, old_status, new_status, changed_by, reason)
      VALUES (p_business_id, delivery_rec.id, 'NOT_READY', 'READY', actor_id, 'All production items completed');

      INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, old_data, new_data)
      VALUES (p_business_id, actor_id, 'DELIVERY_STATUS_CHANGED', 'delivery', delivery_rec.id,
        jsonb_build_object('old_status', 'NOT_READY', 'trigger', 'production_completed'),
        jsonb_build_object('new_status', 'READY', 'trigger', 'production_completed'));
    END IF;
  END LOOP;
END;
$$;

-- 5. Atomic RPC: mark_production_order_done
CREATE OR REPLACE FUNCTION public.mark_production_order_done(
  p_business_id UUID,
  p_user_id UUID,
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
  actor_rec RECORD;
  is_authorized BOOLEAN := FALSE;
  po RECORD;
  inv_rec RECORD;
  v_current_completed NUMERIC;
  v_remaining_qty NUMERIC;
  v_new_completed NUMERIC;
  v_new_scrap NUMERIC;
  v_target_status TEXT;
  v_actual_start_date DATE;
  v_actual_end_date DATE := NULL;
  v_new_current NUMERIC;
  v_new_reserved NUMERIC;
  v_new_available NUMERIC;
  v_output_id UUID;
  v_clean_batch TEXT;
  v_clean_notes TEXT;
BEGIN
  -- Clean inputs
  v_clean_batch := NULLIF(TRIM(p_batch_number), '');
  v_clean_notes := NULLIF(TRIM(p_notes), '');

  -- 1. Actor verification
  SELECT u.id, u.auth_user_id INTO actor_rec
  FROM public.users u
  WHERE (u.id = p_user_id OR (auth.uid() IS NOT NULL AND u.auth_user_id = auth.uid()))
    AND u.business_id = p_business_id
    AND u.status = 'ACTIVE'
  LIMIT 1;

  IF actor_rec.id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED: Active business user required' USING ERRCODE = '42501';
  END IF;

  -- 2. Permission check: require production.complete OR production.edit OR admin/super_admin
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    JOIN public.user_roles ur ON ur.user_id = u.id
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE u.id = actor_rec.id
      AND p.module || '.' || p.action IN ('production.complete', 'production.edit')
  ) OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = actor_rec.id AND (r.name ILIKE '%admin%' OR r.name IN ('super_admin', 'admin'))
  ) INTO is_authorized;

  IF NOT is_authorized THEN
    RAISE EXCEPTION 'FORBIDDEN: User lacks production.complete permission' USING ERRCODE = '42501';
  END IF;

  -- 3. Lock production order row for atomic update and prevent duplicate clicks
  SELECT * INTO po
  FROM public.production_orders
  WHERE id = p_production_order_id AND business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCTION_ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF po.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'CANNOT_COMPLETE_CANCELLED_ORDER' USING ERRCODE = '23514';
  END IF;

  IF po.status = 'COMPLETED' THEN
    RAISE EXCEPTION 'PRODUCTION_ALREADY_COMPLETED: Order is already marked complete' USING ERRCODE = '23505';
  END IF;

  v_current_completed := COALESCE(po.completed_quantity, 0);
  v_remaining_qty := po.quantity - v_current_completed;

  IF v_remaining_qty <= 0 THEN
    RAISE EXCEPTION 'PRODUCTION_ALREADY_COMPLETED: Remaining production quantity is 0' USING ERRCODE = '23505';
  END IF;

  -- 4. Quantity validations
  IF p_quantity_produced <= 0 THEN
    RAISE EXCEPTION 'QUANTITY_PRODUCED_MUST_BE_POSITIVE' USING ERRCODE = '23514';
  END IF;

  IF p_quantity_produced > v_remaining_qty THEN
    RAISE EXCEPTION 'PRODUCED_EXCEEDS_REMAINING: Produced quantity (%) cannot exceed remaining required quantity (%)',
      p_quantity_produced, v_remaining_qty USING ERRCODE = '23514';
  END IF;

  IF COALESCE(p_quantity_rejected, 0) < 0 THEN
    RAISE EXCEPTION 'QUANTITY_REJECTED_CANNOT_BE_NEGATIVE' USING ERRCODE = '23514';
  END IF;

  -- 5. Calculate new quantities and target status
  v_new_completed := v_current_completed + p_quantity_produced;
  v_new_scrap := COALESCE(po.scrap_quantity, 0) + COALESCE(p_quantity_rejected, 0);

  IF v_new_completed >= po.quantity THEN
    v_target_status := 'COMPLETED';
    v_actual_end_date := CURRENT_DATE;
  ELSE
    v_target_status := 'IN_PRODUCTION';
    v_actual_end_date := NULL;
  END IF;

  v_actual_start_date := COALESCE(po.actual_start_date, CURRENT_DATE);

  -- 6. Update production order
  UPDATE public.production_orders
  SET completed_quantity = v_new_completed,
      scrap_quantity = v_new_scrap,
      status = v_target_status,
      actual_start_date = v_actual_start_date,
      actual_end_date = COALESCE(v_actual_end_date, actual_end_date),
      updated_at = NOW()
  WHERE id = po.id;

  -- 7. Update order items completed quantity if associated with an order
  IF po.order_item_id IS NOT NULL THEN
    UPDATE public.order_items
    SET completed_quantity = COALESCE(completed_quantity, 0) + p_quantity_produced,
        updated_at = NOW()
    WHERE id = po.order_item_id AND business_id = p_business_id;
  ELSIF po.order_id IS NOT NULL THEN
    UPDATE public.order_items
    SET completed_quantity = COALESCE(completed_quantity, 0) + p_quantity_produced,
        updated_at = NOW()
    WHERE id = (
      SELECT id FROM public.order_items
      WHERE order_id = po.order_id AND product_id = po.product_id AND business_id = p_business_id
      LIMIT 1
    );
  END IF;

  -- 8. Record production output
  INSERT INTO public.production_output (
    business_id, production_order_id, product_id, quantity_produced, quantity_rejected,
    batch_number, produced_at, created_by
  ) VALUES (
    p_business_id, po.id, po.product_id, p_quantity_produced, COALESCE(p_quantity_rejected, 0),
    v_clean_batch, NOW(), actor_rec.id
  )
  RETURNING id INTO v_output_id;

  -- 9. Update inventory atomically
  SELECT * INTO inv_rec
  FROM public.inventory
  WHERE business_id = p_business_id AND item_type = 'finished_good' AND item_id = po.product_id
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.inventory (business_id, item_type, item_id, current_stock, reserved_stock, available_stock)
    VALUES (p_business_id, 'finished_good', po.product_id, 0, 0, 0)
    RETURNING * INTO inv_rec;
  END IF;

  v_new_current := inv_rec.current_stock + p_quantity_produced;

  IF po.order_id IS NOT NULL THEN
    -- Stock produced for a confirmed customer order is reserved for that order,
    -- preventing unrelated orders from consuming it before delivery
    v_new_reserved := inv_rec.reserved_stock + p_quantity_produced;
    v_new_available := GREATEST(0, v_new_current - v_new_reserved);
  ELSE
    -- Stock produced for general warehouse (make-to-stock) is immediately available
    v_new_reserved := inv_rec.reserved_stock;
    v_new_available := GREATEST(0, v_new_current - v_new_reserved);
  END IF;

  UPDATE public.inventory
  SET current_stock = v_new_current,
      reserved_stock = v_new_reserved,
      available_stock = v_new_available,
      updated_at = NOW()
  WHERE id = inv_rec.id;

  -- 10. Record inventory transaction (STOCK_IN)
  INSERT INTO public.inventory_transactions (
    business_id, item_type, item_id, transaction_type, quantity,
    batch_number, reference_type, reference_id, notes, created_by
  ) VALUES (
    p_business_id, 'finished_good', po.product_id, 'STOCK_IN',
    p_quantity_produced, v_clean_batch, 'PRODUCTION_OUTPUT', po.id,
    'Finished goods output from production ' || po.id ||
      COALESCE(' (Batch: ' || v_clean_batch || ')', '') ||
      COALESCE('. ' || v_clean_notes, ''),
    actor_rec.id
  );

  -- 11. If linked to customer order, record reservation transaction
  IF po.order_id IS NOT NULL THEN
    INSERT INTO public.inventory_transactions (
      business_id, item_type, item_id, transaction_type, quantity,
      reference_type, reference_id, notes, created_by
    ) VALUES (
      p_business_id, 'finished_good', po.product_id, 'ADJUSTMENT',
      p_quantity_produced, 'ORDER_RESERVATION', po.order_id,
      'Stock reserved from production for customer order ' || po.order_id,
      actor_rec.id
    );
  END IF;

  -- 12. If scrap/rejected units, record STOCK_OUT transaction
  IF COALESCE(p_quantity_rejected, 0) > 0 THEN
    INSERT INTO public.inventory_transactions (
      business_id, item_type, item_id, transaction_type, quantity,
      reference_type, reference_id, notes, created_by
    ) VALUES (
      p_business_id, 'finished_good', po.product_id, 'STOCK_OUT',
      p_quantity_rejected, 'PRODUCTION_REJECTION', po.id,
      'Rejected units from production ' || po.id,
      actor_rec.id
    );
  END IF;

  -- 13. Production log
  INSERT INTO public.production_logs (
    business_id, production_order_id, log_type, message, quantity_completed, created_by
  ) VALUES (
    p_business_id, po.id, 'STATUS_CHANGE',
    'Marked as Done: ' || p_quantity_produced || ' produced' ||
      CASE WHEN COALESCE(p_quantity_rejected, 0) > 0 THEN ', ' || p_quantity_rejected || ' rejected' ELSE '' END ||
      CASE WHEN v_new_completed >= po.quantity THEN ' (Completed)' ELSE ' (' || (po.quantity - v_new_completed) || ' remaining)' END ||
      COALESCE('. ' || v_clean_notes, ''),
    p_quantity_produced,
    actor_rec.id
  );

  -- 14. Audit log
  INSERT INTO public.audit_logs (
    business_id, user_id, action, entity_type, entity_id, old_data, new_data
  ) VALUES (
    p_business_id, actor_rec.id, 'PRODUCTION_ORDER_DONE', 'production_order', po.id,
    jsonb_build_object(
      'status', po.status,
      'completed_quantity', v_current_completed,
      'scrap_quantity', po.scrap_quantity
    ),
    jsonb_build_object(
      'status', v_target_status,
      'quantity_produced', p_quantity_produced,
      'completed_quantity', v_new_completed,
      'scrap_quantity', v_new_scrap,
      'remaining_quantity', GREATEST(0, po.quantity - v_new_completed),
      'batch_number', v_clean_batch
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'production_order_id', po.id,
    'quantity_produced', p_quantity_produced,
    'completed_quantity', v_new_completed,
    'remaining_quantity', GREATEST(0, po.quantity - v_new_completed),
    'status', v_target_status,
    'order_id', po.order_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_production_order_done(UUID, UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT) TO authenticated, service_role;

COMMIT;
