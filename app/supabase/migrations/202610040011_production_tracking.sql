BEGIN;

-- ============================================
-- EXTEND PRODUCTION ORDER STATUSES
-- ============================================
ALTER TABLE public.production_orders
DROP CONSTRAINT IF EXISTS production_orders_status_check;

ALTER TABLE public.production_orders
ADD CONSTRAINT production_orders_status_check
CHECK (status IN (
  'SCHEDULED', 'MATERIAL_READY', 'IN_PRODUCTION',
  'QUALITY_CHECK', 'COMPLETED', 'READY_FOR_DISPATCH',
  'ON_HOLD', 'DELAYED', 'CANCELLED', 'PENDING'
));

-- ============================================
-- PRODUCTION PROGRESS LOGS
-- ============================================
CREATE TABLE public.production_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  production_order_id UUID NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  log_type TEXT NOT NULL CHECK (log_type IN ('STATUS_CHANGE', 'PROGRESS', 'ISSUE', 'NOTE', 'QUALITY_CHECK')),
  message TEXT NOT NULL,
  quantity_completed NUMERIC(14, 3),
  quality_status TEXT CHECK (quality_status IN ('PASSED', 'FAILED')),
  quality_notes TEXT,
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX production_logs_business_order_idx ON public.production_logs (business_id, production_order_id);
CREATE INDEX production_logs_created_at_idx ON public.production_logs (created_at DESC);

-- ============================================
-- QUALITY CHECKS
-- ============================================
CREATE TABLE public.quality_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  production_order_id UUID NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  check_stage TEXT NOT NULL CHECK (check_stage IN ('IN_PROCESS', 'FINAL', 'REWORK')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PASSED', 'FAILED', 'CONDITIONAL_PASS')),
  checked_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  checked_at TIMESTAMPTZ,
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX quality_checks_business_order_idx ON public.quality_checks (business_id, production_order_id);
CREATE INDEX quality_checks_status_idx ON public.quality_checks (status);

-- ============================================
-- PRODUCTION OUTPUT (Finished Goods)
-- ============================================
CREATE TABLE public.production_output (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  production_order_id UUID NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL,
  quantity_produced NUMERIC(14, 3) NOT NULL CHECK (quantity_produced > 0),
  quantity_rejected NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (quantity_rejected >= 0),
  batch_number TEXT,
  produced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT production_output_business_order_unique UNIQUE (business_id, production_order_id)
);

CREATE INDEX production_output_business_idx ON public.production_output (business_id);
CREATE INDEX production_output_product_idx ON public.production_output (product_id);

-- ============================================
-- BOM CONSUMPTION TRACKING
-- ============================================
CREATE TABLE public.production_material_consumption (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  production_order_id UUID NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  raw_material_id UUID NOT NULL REFERENCES public.raw_materials(id) ON DELETE RESTRICT,
  bom_item_id UUID REFERENCES public.bom_items(id) ON DELETE SET NULL,
  planned_quantity NUMERIC(16, 6) NOT NULL,
  consumed_quantity NUMERIC(16, 6) NOT NULL DEFAULT 0 CHECK (consumed_quantity >= 0),
  inventory_transaction_id UUID REFERENCES public.inventory_transactions(id) ON DELETE SET NULL,
  consumed_at TIMESTAMPTZ,
  consumed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT production_material_business_order_material_unique UNIQUE (business_id, production_order_id, raw_material_id)
);

CREATE INDEX production_material_business_order_idx ON public.production_material_consumption (business_id, production_order_id);

-- ============================================
-- EXTEND INVENTORY FOR FINISHED GOODS
-- ============================================
-- The inventory table already supports multiple item_types via item_type column
-- We just need to ensure finished goods can be tracked
ALTER TABLE public.inventory
ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'raw_material'
CHECK (item_type IN ('raw_material', 'finished_good', 'work_in_progress'));

-- Update existing inventory rows
UPDATE public.inventory SET item_type = 'raw_material' WHERE item_type IS NULL;

-- ============================================
-- HELPER: Check material availability for production order
-- ============================================
CREATE OR REPLACE FUNCTION public.check_production_material_availability(
  p_business_id UUID,
  p_production_order_id UUID
)
RETURNS TABLE (
  raw_material_id UUID,
  code TEXT,
  name TEXT,
  unit TEXT,
  required_quantity NUMERIC,
  available_stock NUMERIC,
  is_sufficient BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  po RECORD;
  bom RECORD;
BEGIN
  -- Get production order details
  SELECT po.*, p.name as product_name
  INTO po
  FROM public.production_orders po
  JOIN public.products p ON p.id = po.product_id AND p.business_id = po.business_id
  WHERE po.id = p_production_order_id AND po.business_id = p_business_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCTION_ORDER_NOT_FOUND';
  END IF;

  -- Calculate BOM requirements
  RETURN QUERY
  SELECT rm.id, rm.code, rm.name, rm.unit,
         (bi.quantity_per_unit * po.quantity)::NUMERIC as required_quantity,
         COALESCE(i.available_stock, 0) as available_stock,
         (COALESCE(i.available_stock, 0) >= (bi.quantity_per_unit * po.quantity)::NUMERIC) as is_sufficient
  FROM public.product_bom b
  JOIN public.bom_items bi ON bi.bom_id = b.id AND bi.business_id = b.business_id
  JOIN public.raw_materials rm ON rm.id = bi.raw_material_id AND rm.business_id = b.business_id
  LEFT JOIN public.inventory i ON i.business_id = p_business_id AND i.item_type = 'raw_material' AND i.item_id = rm.id
  WHERE b.business_id = p_business_id AND b.product_id = po.product_id AND b.active
  ORDER BY rm.name;
END;
$$;

-- ============================================
-- CORE: Start production (atomic material consumption)
-- ============================================
CREATE OR REPLACE FUNCTION public.start_production(
  p_business_id UUID,
  p_production_order_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  po RECORD;
  actor_id UUID;
  material RECORD;
  all_sufficient BOOLEAN := TRUE;
  mat_avail RECORD;
BEGIN
  -- Check permissions
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'production.edit') THEN
    RAISE EXCEPTION 'FORBIDDEN: production.edit' USING ERRCODE = '42501';
  END IF;

  -- Get production order with lock
  SELECT * INTO po
  FROM public.production_orders
  WHERE id = p_production_order_id AND business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCTION_ORDER_NOT_FOUND';
  END IF;

  -- Validate status transition
  IF po.status NOT IN ('SCHEDULED', 'MATERIAL_READY') THEN
    RAISE EXCEPTION 'INVALID_STATUS_TRANSITION: Cannot start production from status %', po.status USING ERRCODE = '23514';
  END IF;

  -- Get actor
  SELECT id INTO actor_id
  FROM public.users
  WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE';
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  -- Check material availability
  FOR mat_avail IN
    SELECT * FROM public.check_production_material_availability(p_business_id, p_production_order_id)
  LOOP
    IF NOT mat_avail.is_sufficient THEN
      all_sufficient := FALSE;
      RAISE EXCEPTION 'INSUFFICIENT_MATERIAL: % (%) - Required: %, Available: %',
        mat_avail.name, mat_avail.code, mat_avail.required_quantity, mat_avail.available_stock
      USING ERRCODE = '23514';
    END IF;
  END LOOP;

  -- Atomic consumption of all materials
  FOR material IN
    SELECT rm.id as raw_material_id, bi.quantity_per_unit * po.quantity as required_qty, bi.id as bom_item_id
    FROM public.product_bom b
    JOIN public.bom_items bi ON bi.bom_id = b.id AND bi.business_id = b.business_id
    JOIN public.raw_materials rm ON rm.id = bi.raw_material_id AND rm.business_id = b.business_id
    WHERE b.business_id = p_business_id AND b.product_id = po.product_id AND b.active
  LOOP
    -- Reserve and consume stock atomically
    UPDATE public.inventory
    SET reserved_stock = reserved_stock + material.required_qty,
        available_stock = available_stock - material.required_qty
    WHERE business_id = p_business_id AND item_type = 'raw_material' AND item_id = material.raw_material_id;

    -- Record consumption
    INSERT INTO public.production_material_consumption (
      business_id, production_order_id, raw_material_id, bom_item_id,
      planned_quantity, consumed_quantity, consumed_at, consumed_by
    ) VALUES (
      p_business_id, p_production_order_id, material.raw_material_id, material.bom_item_id,
      material.required_qty, material.required_qty, NOW(), actor_id
    ) ON CONFLICT (business_id, production_order_id, raw_material_id) DO UPDATE SET
      consumed_quantity = EXCLUDED.consumed_quantity,
      consumed_at = EXCLUDED.consumed_at,
      consumed_by = EXCLUDED.consumed_by;

    -- Create inventory transaction
    INSERT INTO public.inventory_transactions (
      business_id, item_type, item_id, transaction_type, quantity,
      reference_type, reference_id, notes, created_by
    ) VALUES (
      p_business_id, 'raw_material', material.raw_material_id, 'STOCK_OUT',
      material.required_qty, 'production_consumption', p_production_order_id,
      'Material consumed for production order ' || po.id, actor_id
    );
  END LOOP;

  -- Update production order status
  UPDATE public.production_orders
  SET status = 'IN_PRODUCTION',
      actual_start_date = CURRENT_DATE,
      updated_at = NOW()
  WHERE id = p_production_order_id AND business_id = p_business_id;

  -- Log the start
  INSERT INTO public.production_logs (business_id, production_order_id, log_type, message, created_by)
  VALUES (p_business_id, p_production_order_id, 'STATUS_CHANGE',
    'Production started' || CASE WHEN p_notes IS NOT NULL THEN ': ' || p_notes ELSE '' END, actor_id);

  -- Update order delivery dates (will recalculate based on actual start)
  PERFORM public.update_order_delivery_dates(p_business_id, po.order_id, 'production_started');
END;
$$;

-- ============================================
-- RECORD PRODUCTION PROGRESS
-- ============================================
CREATE OR REPLACE FUNCTION public.record_production_progress(
  p_business_id UUID,
  p_production_order_id UUID,
  p_quantity_completed NUMERIC,
  p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  po RECORD;
  actor_id UUID;
  new_total NUMERIC;
BEGIN
  -- Check permissions
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'production.edit') THEN
    RAISE EXCEPTION 'FORBIDDEN: production.edit' USING ERRCODE = '42501';
  END IF;

  -- Get production order
  SELECT * INTO po
  FROM public.production_orders
  WHERE id = p_production_order_id AND business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCTION_ORDER_NOT_FOUND';
  END IF;

  IF po.status NOT IN ('IN_PRODUCTION', 'QUALITY_CHECK') THEN
    RAISE EXCEPTION 'INVALID_STATUS: Cannot record progress for status %', po.status USING ERRCODE = '23514';
  END IF;

  IF p_quantity_completed <= 0 THEN
    RAISE EXCEPTION 'QUANTITY_MUST_BE_POSITIVE' USING ERRCODE = '23514';
  END IF;

  -- Get actor
  SELECT id INTO actor_id
  FROM public.users
  WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE';
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  -- Log progress
  INSERT INTO public.production_logs (business_id, production_order_id, log_type, message, quantity_completed, created_by)
  VALUES (p_business_id, p_production_order_id, 'PROGRESS',
    'Progress: ' || p_quantity_completed || ' units completed' || CASE WHEN p_notes IS NOT NULL THEN '. ' || p_notes ELSE '' END,
    p_quantity_completed, actor_id);
END;
$$;

-- ============================================
-- QUALITY CHECK: Pass/Fail
-- ============================================
CREATE OR REPLACE FUNCTION public.record_quality_check(
  p_business_id UUID,
  p_production_order_id UUID,
  p_check_stage TEXT,
  p_status TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  po RECORD;
  actor_id UUID;
  old_status TEXT;
BEGIN
  -- Check permissions
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'production.edit') THEN
    RAISE EXCEPTION 'FORBIDDEN: production.edit' USING ERRCODE = '42501';
  END IF;

  -- Get production order
  SELECT * INTO po
  FROM public.production_orders
  WHERE id = p_production_order_id AND business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCTION_ORDER_NOT_FOUND';
  END IF;

  IF po.status NOT IN ('IN_PRODUCTION', 'QUALITY_CHECK') THEN
    RAISE EXCEPTION 'INVALID_STATUS: Quality check only allowed during production' USING ERRCODE = '23514';
  END IF;

  IF p_check_stage NOT IN ('IN_PROCESS', 'FINAL', 'REWORK') THEN
    RAISE EXCEPTION 'INVALID_CHECK_STAGE' USING ERRCODE = '23514';
  END IF;

  IF p_status NOT IN ('PASSED', 'FAILED', 'CONDITIONAL_PASS') THEN
    RAISE EXCEPTION 'INVALID_QUALITY_STATUS' USING ERRCODE = '23514';
  END IF;

  -- Get actor
  SELECT id INTO actor_id
  FROM public.users
  WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE';
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  old_status := po.status;

  -- Record quality check
  INSERT INTO public.quality_checks (business_id, production_order_id, check_stage, status, checked_by, checked_at, notes)
  VALUES (p_business_id, p_production_order_id, p_check_stage, p_status, actor_id, NOW(), p_notes)
  ON CONFLICT DO NOTHING;

  -- Log quality check
  INSERT INTO public.production_logs (business_id, production_order_id, log_type, message, quality_status, quality_notes, created_by)
  VALUES (p_business_id, p_production_order_id, 'QUALITY_CHECK',
    'Quality check (' || p_check_stage || '): ' || p_status || CASE WHEN p_notes IS NOT NULL THEN ' - ' || p_notes ELSE '' END,
    p_status, p_notes, actor_id);

  -- Handle quality result
  IF p_check_stage = 'FINAL' AND p_status = 'FAILED' THEN
    UPDATE public.production_orders
    SET status = 'ON_HOLD', updated_at = NOW()
    WHERE id = p_production_order_id AND business_id = p_business_id;
  ELSIF p_check_stage = 'FINAL' AND p_status IN ('PASSED', 'CONDITIONAL_PASS') THEN
    UPDATE public.production_orders
    SET status = 'QUALITY_CHECK', updated_at = NOW()
    WHERE id = p_production_order_id AND business_id = p_business_id;
  END IF;

  IF old_status IS DISTINCT FROM po.status THEN
    PERFORM public.update_order_delivery_dates(p_business_id, po.order_id, 'quality_check_' || lower(p_status));
  END IF;
END;
$$;

-- ============================================
-- COMPLETE PRODUCTION (add finished goods)
-- ============================================
CREATE OR REPLACE FUNCTION public.complete_production(
  p_business_id UUID,
  p_production_order_id UUID,
  p_quantity_produced NUMERIC,
  p_quantity_rejected NUMERIC DEFAULT 0,
  p_batch_number TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  po RECORD;
  actor_id UUID;
  inventory_rec RECORD;
  new_stock NUMERIC;
BEGIN
  -- Check permissions
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'production.edit') THEN
    RAISE EXCEPTION 'FORBIDDEN: production.edit' USING ERRCODE = '42501';
  END IF;

  -- Get production order
  SELECT * INTO po
  FROM public.production_orders
  WHERE id = p_production_order_id AND business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCTION_ORDER_NOT_FOUND';
  END IF;

  IF po.status NOT IN ('QUALITY_CHECK', 'IN_PRODUCTION') THEN
    RAISE EXCEPTION 'INVALID_STATUS: Cannot complete from status %', po.status USING ERRCODE = '23514';
  END IF;

  IF p_quantity_produced <= 0 THEN
    RAISE EXCEPTION 'QUANTITY_PRODUCED_MUST_BE_POSITIVE' USING ERRCODE = '23514';
  END IF;

  IF p_quantity_rejected < 0 THEN
    RAISE EXCEPTION 'QUANTITY_REJECTED_CANNOT_BE_NEGATIVE' USING ERRCODE = '23514';
  END IF;

  IF p_quantity_produced + p_quantity_rejected > po.quantity THEN
    RAISE EXCEPTION 'PRODUCED_EXCEEDS_ORDERED: Produced (%) + Rejected (%) > Ordered (%)',
      p_quantity_produced, p_quantity_rejected, po.quantity USING ERRCODE = '23514';
  END IF;

  -- Get actor
  SELECT id INTO actor_id
  FROM public.users
  WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE';
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  -- Check for duplicate completion
  IF EXISTS (SELECT 1 FROM public.production_output WHERE production_order_id = p_production_order_id) THEN
    RAISE EXCEPTION 'PRODUCTION_ALREADY_COMPLETED' USING ERRCODE = '23505';
  END IF;

  -- Create production output record
  INSERT INTO public.production_output (
    business_id, production_order_id, product_id, quantity_produced, quantity_rejected,
    batch_number, produced_at, created_by
  ) VALUES (
    p_business_id, p_production_order_id, po.product_id, p_quantity_produced, p_quantity_rejected,
    p_batch_number, NOW(), actor_id
  );

  -- Add finished goods to inventory
  INSERT INTO public.inventory (business_id, item_type, item_id, current_stock, reserved_stock, available_stock)
  VALUES (p_business_id, 'finished_good', po.product_id, p_quantity_produced, 0, p_quantity_produced)
  ON CONFLICT (business_id, item_type, item_id) DO UPDATE SET
    current_stock = inventory.current_stock + EXCLUDED.current_stock,
    available_stock = inventory.available_stock + EXCLUDED.available_stock
  RETURNING current_stock INTO new_stock;

  -- Create inventory transaction for finished goods
  INSERT INTO public.inventory_transactions (
    business_id, item_type, item_id, transaction_type, quantity,
    reference_type, reference_id, notes, created_by
  ) VALUES (
    p_business_id, 'finished_good', po.product_id, 'STOCK_IN',
    p_quantity_produced, 'production_output', p_production_order_id,
    'Finished goods from production ' || po.id || CASE WHEN p_batch_number IS NOT NULL THEN ' (Batch: ' || p_batch_number || ')' ELSE '' END
    || CASE WHEN p_notes IS NOT NULL THEN '. ' || p_notes ELSE '' END,
    actor_id
  );

  -- Create inventory transaction for rejected goods if any
  IF p_quantity_rejected > 0 THEN
    INSERT INTO public.inventory_transactions (
      business_id, item_type, item_id, transaction_type, quantity,
      reference_type, reference_id, notes, created_by
    ) VALUES (
      p_business_id, 'finished_good', po.product_id, 'STOCK_OUT',
      p_quantity_rejected, 'production_rejection', p_production_order_id,
      'Rejected units from production ' || po.id || CASE WHEN p_notes IS NOT NULL THEN '. ' || p_notes ELSE '' END,
      actor_id
    );
  END IF;

  -- Update production order
  UPDATE public.production_orders
  SET status = 'COMPLETED',
      actual_end_date = CURRENT_DATE,
      updated_at = NOW()
  WHERE id = p_production_order_id AND business_id = p_business_id;

  -- Log completion
  INSERT INTO public.production_logs (business_id, production_order_id, log_type, message, quantity_completed, created_by)
  VALUES (p_business_id, p_production_order_id, 'STATUS_CHANGE',
    'Production completed: ' || p_quantity_produced || ' units produced' ||
    CASE WHEN p_quantity_rejected > 0 THEN ', ' || p_quantity_rejected || ' rejected' ELSE '' END ||
    CASE WHEN p_notes IS NOT NULL THEN '. ' || p_notes ELSE '' END,
    p_quantity_produced, actor_id);

  -- Update order delivery dates (recalculate based on actual completion)
  PERFORM public.update_order_delivery_dates(p_business_id, po.order_id, 'production_completed');

  -- Check if all items for the order are completed
  PERFORM public.check_order_production_complete(p_business_id, po.order_id);
END;
$$;

-- ============================================
-- HELPER: Check if all order items are completed
-- ============================================
CREATE OR REPLACE FUNCTION public.check_order_production_complete(
  p_business_id UUID,
  p_order_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pending_count INTEGER;
  completed_count INTEGER;
  total_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_count
  FROM public.production_orders
  WHERE order_id = p_order_id AND business_id = p_business_id;

  SELECT COUNT(*) INTO completed_count
  FROM public.production_orders
  WHERE order_id = p_order_id AND business_id = p_business_id
    AND status IN ('COMPLETED', 'READY_FOR_DISPATCH');

  SELECT COUNT(*) INTO pending_count
  FROM public.production_orders
  WHERE order_id = p_order_id AND business_id = p_business_id
    AND status NOT IN ('COMPLETED', 'READY_FOR_DISPATCH', 'CANCELLED');

  -- If all items completed, could update order status or notify
  -- For now, just log - order status is managed separately
  IF pending_count = 0 AND total_count > 0 THEN
    -- All production items completed for this order
    INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, new_data)
    SELECT p_business_id, u.id, 'ORDER_PRODUCTION_COMPLETE', 'order', p_order_id,
      jsonb_build_object('total_items', total_count, 'completed_items', completed_count)
    FROM public.users u
    WHERE u.auth_user_id = auth.uid() AND u.business_id = p_business_id AND u.status = 'ACTIVE'
    LIMIT 1;
  END IF;
END;
$$;

-- ============================================
-- DELAY PRODUCTION (reschedule)
-- ============================================
CREATE OR REPLACE FUNCTION public.delay_production(
  p_business_id UUID,
  p_production_order_id UUID,
  p_new_start_date DATE,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  po RECORD;
  actor_id UUID;
BEGIN
  -- Check permissions
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'production.schedule') THEN
    RAISE EXCEPTION 'FORBIDDEN: production.schedule' USING ERRCODE = '42501';
  END IF;

  -- Get production order
  SELECT * INTO po
  FROM public.production_orders
  WHERE id = p_production_order_id AND business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCTION_ORDER_NOT_FOUND';
  END IF;

  IF po.status NOT IN ('SCHEDULED', 'MATERIAL_READY', 'IN_PRODUCTION') THEN
    RAISE EXCEPTION 'INVALID_STATUS: Cannot delay from status %', po.status USING ERRCODE = '23514';
  END IF;

  IF po.actual_start_date IS NOT NULL THEN
    RAISE EXCEPTION 'CANNOT_DELAY_STARTED_PRODUCTION' USING ERRCODE = '23514';
  END IF;

  -- Get actor
  SELECT id INTO actor_id
  FROM public.users
  WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE';
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  -- Update status and schedule
  UPDATE public.production_orders
  SET status = 'DELAYED',
      scheduled_start_date = p_new_start_date,
      updated_at = NOW()
  WHERE id = p_production_order_id AND business_id = p_business_id;

  -- Clear existing schedules and reschedule
  DELETE FROM public.production_schedules
  WHERE production_order_id = p_production_order_id AND business_id = p_business_id;

  -- Log delay
  INSERT INTO public.production_logs (business_id, production_order_id, log_type, message, created_by)
  VALUES (p_business_id, p_production_order_id, 'STATUS_CHANGE',
    'Production delayed to ' || p_new_start_date || '. Reason: ' || p_reason, actor_id);

  -- Update order delivery dates
  PERFORM public.update_order_delivery_dates(p_business_id, po.order_id, 'production_delayed');
END;
$$;

-- ============================================
-- HOLD/RESUME PRODUCTION
-- ============================================
CREATE OR REPLACE FUNCTION public.hold_production(
  p_business_id UUID,
  p_production_order_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  po RECORD;
  actor_id UUID;
BEGIN
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'production.edit') THEN
    RAISE EXCEPTION 'FORBIDDEN: production.edit' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO po
  FROM public.production_orders
  WHERE id = p_production_order_id AND business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCTION_ORDER_NOT_FOUND'; END IF;
  IF po.status NOT IN ('IN_PRODUCTION', 'QUALITY_CHECK') THEN
    RAISE EXCEPTION 'INVALID_STATUS: Can only hold IN_PRODUCTION or QUALITY_CHECK' USING ERRCODE = '23514';
  END IF;

  SELECT id INTO actor_id FROM public.users WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE';
  IF actor_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;

  UPDATE public.production_orders SET status = 'ON_HOLD', updated_at = NOW()
  WHERE id = p_production_order_id AND business_id = p_business_id;

  INSERT INTO public.production_logs (business_id, production_order_id, log_type, message, created_by)
  VALUES (p_business_id, p_production_order_id, 'STATUS_CHANGE', 'Production put on hold. Reason: ' || p_reason, actor_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.resume_production(
  p_business_id UUID,
  p_production_order_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  po RECORD;
  actor_id UUID;
BEGIN
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'production.edit') THEN
    RAISE EXCEPTION 'FORBIDDEN: production.edit' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO po
  FROM public.production_orders
  WHERE id = p_production_order_id AND business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCTION_ORDER_NOT_FOUND'; END IF;
  IF po.status <> 'ON_HOLD' THEN
    RAISE EXCEPTION 'INVALID_STATUS: Can only resume from ON_HOLD' USING ERRCODE = '23514';
  END IF;

  SELECT id INTO actor_id FROM public.users WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE';
  IF actor_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;

  UPDATE public.production_orders SET status = 'IN_PRODUCTION', updated_at = NOW()
  WHERE id = p_production_order_id AND business_id = p_business_id;

  INSERT INTO public.production_logs (business_id, production_order_id, log_type, message, created_by)
  VALUES (p_business_id, p_production_order_id, 'STATUS_CHANGE', 'Production resumed', actor_id);
END;
$$;

-- ============================================
-- CANCEL PRODUCTION (release materials)
-- ============================================
CREATE OR REPLACE FUNCTION public.cancel_production_with_release(
  p_business_id UUID,
  p_production_order_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  po RECORD;
  actor_id UUID;
  mat_rec RECORD;
BEGIN
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'production.cancel') THEN
    RAISE EXCEPTION 'FORBIDDEN: production.cancel' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO po
  FROM public.production_orders
  WHERE id = p_production_order_id AND business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCTION_ORDER_NOT_FOUND'; END IF;
  IF po.status = 'COMPLETED' OR po.status = 'READY_FOR_DISPATCH' THEN
    RAISE EXCEPTION 'CANNOT_CANCEL_COMPLETED_PRODUCTION' USING ERRCODE = '23514';
  END IF;

  SELECT id INTO actor_id FROM public.users WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE';
  IF actor_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;

  -- If materials were consumed, release them back
  IF po.status IN ('IN_PRODUCTION', 'QUALITY_CHECK', 'ON_HOLD') THEN
    FOR mat_rec IN
      SELECT raw_material_id, consumed_quantity
      FROM public.production_material_consumption
      WHERE production_order_id = p_production_order_id AND business_id = p_business_id
    LOOP
      -- Release reserved stock
      UPDATE public.inventory
      SET reserved_stock = GREATEST(reserved_stock - mat_rec.consumed_quantity, 0),
          available_stock = available_stock + mat_rec.consumed_quantity
      WHERE business_id = p_business_id AND item_type = 'raw_material' AND item_id = mat_rec.raw_material_id;

      -- Create reversal transaction
      INSERT INTO public.inventory_transactions (
        business_id, item_type, item_id, transaction_type, quantity,
        reference_type, reference_id, notes, created_by
      ) VALUES (
        p_business_id, 'raw_material', mat_rec.raw_material_id, 'STOCK_IN',
        mat_rec.consumed_quantity, 'production_cancellation', p_production_order_id,
        'Material released from cancelled production: ' || p_reason, actor_id
      );

      -- Update consumption record
      UPDATE public.production_material_consumption
      SET consumed_quantity = 0, consumed_at = NULL, consumed_by = NULL
      WHERE production_order_id = p_production_order_id AND raw_material_id = mat_rec.raw_material_id;
    END LOOP;
  END IF;

  UPDATE public.production_orders SET status = 'CANCELLED', updated_at = NOW()
  WHERE id = p_production_order_id AND business_id = p_business_id;

  DELETE FROM public.production_schedules
  WHERE production_order_id = p_production_order_id AND business_id = p_business_id;

  INSERT INTO public.production_logs (business_id, production_order_id, log_type, message, created_by)
  VALUES (p_business_id, p_production_order_id, 'STATUS_CHANGE', 'Production cancelled. Reason: ' || p_reason, actor_id);

  PERFORM public.update_order_delivery_dates(p_business_id, po.order_id, 'production_cancelled');
END;
$$;

-- ============================================
-- MARK READY FOR DISPATCH
-- ============================================
CREATE OR REPLACE FUNCTION public.mark_ready_for_dispatch(
  p_business_id UUID,
  p_production_order_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  po RECORD;
  actor_id UUID;
BEGIN
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'production.edit') THEN
    RAISE EXCEPTION 'FORBIDDEN: production.edit' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO po
  FROM public.production_orders
  WHERE id = p_production_order_id AND business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCTION_ORDER_NOT_FOUND'; END IF;
  IF po.status <> 'COMPLETED' THEN
    RAISE EXCEPTION 'INVALID_STATUS: Can only mark COMPLETED orders as ready for dispatch' USING ERRCODE = '23514';
  END IF;

  SELECT id INTO actor_id FROM public.users WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE';
  IF actor_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;

  UPDATE public.production_orders SET status = 'READY_FOR_DISPATCH', updated_at = NOW()
  WHERE id = p_production_order_id AND business_id = p_business_id;

  INSERT INTO public.production_logs (business_id, production_order_id, log_type, message, created_by)
  VALUES (p_business_id, p_production_order_id, 'STATUS_CHANGE', 'Marked ready for dispatch', actor_id);
END;
$$;

-- ============================================
-- GRANT EXECUTE PERMISSIONS
-- ============================================
GRANT EXECUTE ON FUNCTION public.check_production_material_availability(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_production(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_production_progress(UUID, UUID, NUMERIC, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_quality_check(UUID, UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_production(UUID, UUID, NUMERIC, NUMERIC, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delay_production(UUID, UUID, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.hold_production(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resume_production(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_production_with_release(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_ready_for_dispatch(UUID, UUID) TO authenticated;

-- ============================================
-- AUDIT TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION public.audit_production_logs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE actor_id UUID;
BEGIN
  SELECT id INTO actor_id FROM public.users
  WHERE auth_user_id = auth.uid() AND business_id = COALESCE(NEW.business_id, OLD.business_id);
  INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, new_data)
  VALUES (COALESCE(NEW.business_id, OLD.business_id), actor_id,
    'PRODUCTION_LOG_' || NEW.log_type, 'production_log', NEW.id, to_jsonb(NEW));
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_quality_checks()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE actor_id UUID;
BEGIN
  SELECT id INTO actor_id FROM public.users
  WHERE auth_user_id = auth.uid() AND business_id = COALESCE(NEW.business_id, OLD.business_id);
  INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (COALESCE(NEW.business_id, OLD.business_id), actor_id,
    CASE WHEN TG_OP = 'INSERT' THEN 'QUALITY_CHECK_CREATED' ELSE 'QUALITY_CHECK_UPDATED' END,
    'quality_check', COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ELSE NULL END);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_production_output()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE actor_id UUID;
BEGIN
  SELECT id INTO actor_id FROM public.users
  WHERE auth_user_id = auth.uid() AND business_id = COALESCE(NEW.business_id, OLD.business_id);
  INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (COALESCE(NEW.business_id, OLD.business_id), actor_id,
    CASE WHEN TG_OP = 'INSERT' THEN 'PRODUCTION_OUTPUT_CREATED' ELSE 'PRODUCTION_OUTPUT_UPDATED' END,
    'production_output', COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ELSE NULL END);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_production_material()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE actor_id UUID;
BEGIN
  SELECT id INTO actor_id FROM public.users
  WHERE auth_user_id = auth.uid() AND business_id = COALESCE(NEW.business_id, OLD.business_id);
  INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (COALESCE(NEW.business_id, OLD.business_id), actor_id,
    CASE WHEN TG_OP = 'INSERT' THEN 'MATERIAL_CONSUMPTION_RECORDED'
         WHEN TG_OP = 'UPDATE' THEN 'MATERIAL_CONSUMPTION_UPDATED'
         ELSE 'MATERIAL_CONSUMPTION_REMOVED' END,
    'production_material_consumption', COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ELSE NULL END);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER production_logs_audit
AFTER INSERT ON public.production_logs
FOR EACH ROW EXECUTE FUNCTION public.audit_production_logs();

CREATE TRIGGER quality_checks_audit
AFTER INSERT OR UPDATE ON public.quality_checks
FOR EACH ROW EXECUTE FUNCTION public.audit_quality_checks();

CREATE TRIGGER production_output_audit
AFTER INSERT OR UPDATE ON public.production_output
FOR EACH ROW EXECUTE FUNCTION public.audit_production_output();

CREATE TRIGGER production_material_consumption_audit
AFTER INSERT OR UPDATE OR DELETE ON public.production_material_consumption
FOR EACH ROW EXECUTE FUNCTION public.audit_production_material();

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE public.production_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_output ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_material_consumption ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON public.production_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.quality_checks TO authenticated;
GRANT SELECT, INSERT ON public.production_output TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.production_material_consumption TO authenticated;
GRANT ALL ON public.production_logs, public.quality_checks, public.production_output, public.production_material_consumption TO service_role;

CREATE POLICY production_logs_select ON public.production_logs
FOR SELECT USING (public.is_business_member(business_id) AND public.has_business_permission(business_id, 'production.view'));
CREATE POLICY production_logs_insert ON public.production_logs
FOR INSERT WITH CHECK (public.is_business_member(business_id) AND public.has_business_permission(business_id, 'production.edit'));

CREATE POLICY quality_checks_select ON public.quality_checks
FOR SELECT USING (public.is_business_member(business_id) AND public.has_business_permission(business_id, 'production.view'));
CREATE POLICY quality_checks_insert ON public.quality_checks
FOR INSERT WITH CHECK (public.is_business_member(business_id) AND public.has_business_permission(business_id, 'production.edit'));
CREATE POLICY quality_checks_update ON public.quality_checks
FOR UPDATE USING (public.is_business_member(business_id) AND public.has_business_permission(business_id, 'production.edit'))
WITH CHECK (public.is_business_member(business_id) AND public.has_business_permission(business_id, 'production.edit'));

CREATE POLICY production_output_select ON public.production_output
FOR SELECT USING (public.is_business_member(business_id) AND public.has_business_permission(business_id, 'production.view'));
CREATE POLICY production_output_insert ON public.production_output
FOR INSERT WITH CHECK (public.is_business_member(business_id) AND public.has_business_permission(business_id, 'production.edit'));

CREATE POLICY production_material_select ON public.production_material_consumption
FOR SELECT USING (public.is_business_member(business_id) AND public.has_business_permission(business_id, 'production.view'));
CREATE POLICY production_material_insert ON public.production_material_consumption
FOR INSERT WITH CHECK (public.is_business_member(business_id) AND public.has_business_permission(business_id, 'production.edit'));
CREATE POLICY production_material_update ON public.production_material_consumption
FOR UPDATE USING (public.is_business_member(business_id) AND public.has_business_permission(business_id, 'production.edit'))
WITH CHECK (public.is_business_member(business_id) AND public.has_business_permission(business_id, 'production.edit'));

-- ============================================
-- PERMISSIONS
-- ============================================
INSERT INTO public.permissions (module, action, description) VALUES
  ('production', 'track_progress', 'Record production progress and logs'),
  ('production', 'quality_check', 'Record quality check results'),
  ('production', 'complete', 'Complete production and add finished goods'),
  ('production', 'hold_resume', 'Hold and resume production'),
  ('production', 'delay', 'Delay/reschedule production'),
  ('production', 'dispatch', 'Mark production ready for dispatch'),
  ('inventory', 'view_finished', 'View finished goods inventory')
ON CONFLICT (module, action) DO UPDATE SET description = EXCLUDED.description;

-- Assign to roles
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r JOIN public.permissions p ON p.module = 'production'
WHERE replace(lower(trim(r.name)), ' ', '_') IN ('super_admin', 'admin', 'manager')
  AND p.action IN ('view', 'create', 'edit', 'schedule', 'cancel', 'track_progress', 'quality_check', 'complete', 'hold_resume', 'delay', 'dispatch')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r JOIN public.permissions p ON p.module = 'inventory'
WHERE replace(lower(trim(r.name)), ' ', '_') IN ('super_admin', 'admin', 'manager')
  AND p.action = 'view_finished'
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;