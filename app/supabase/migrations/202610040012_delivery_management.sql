BEGIN;

-- ============================================
-- DELIVERY MANAGEMENT TABLES
-- ============================================

-- Main deliveries table
CREATE TABLE public.deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  delivery_number TEXT NOT NULL CHECK (delivery_number = upper(btrim(delivery_number)) AND length(delivery_number) BETWEEN 1 AND 64),
  status TEXT NOT NULL DEFAULT 'NOT_READY' CHECK (status IN ('NOT_READY', 'READY', 'PACKED', 'DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED')),
  expected_delivery_date DATE,
  tracking_number TEXT,
  vehicle TEXT,
  driver TEXT,
  dispatched_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  proof_document_url TEXT,
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT deliveries_business_number_unique UNIQUE (business_id, delivery_number)
);

CREATE INDEX deliveries_business_id_idx ON public.deliveries (business_id);
CREATE INDEX deliveries_business_order_idx ON public.deliveries (business_id, order_id);
CREATE INDEX deliveries_business_status_idx ON public.deliveries (business_id, status);
CREATE INDEX deliveries_business_dispatched_idx ON public.deliveries (business_id, dispatched_at DESC);
CREATE UNIQUE INDEX deliveries_business_number_unique_idx ON public.deliveries (business_id, upper(btrim(delivery_number)));

-- Delivery items table (links to order_items with quantities)
CREATE TABLE public.delivery_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  delivery_id UUID NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  ordered_quantity NUMERIC(14, 3) NOT NULL CHECK (ordered_quantity > 0),
  delivered_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (delivered_quantity >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT delivery_items_business_delivery_order_unique UNIQUE (business_id, delivery_id, order_item_id)
);

CREATE INDEX delivery_items_business_delivery_idx ON public.delivery_items (business_id, delivery_id);
CREATE INDEX delivery_items_business_order_item_idx ON public.delivery_items (business_id, order_item_id);

-- Delivery status history (audit trail)
CREATE TABLE public.delivery_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  delivery_id UUID NOT NULL REFERENCES public.deliveries(id) ON DELETE RESTRICT,
  old_status TEXT,
  new_status TEXT NOT NULL,
  changed_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  reason TEXT CHECK (reason IS NULL OR length(reason) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX delivery_status_history_business_delivery_idx ON public.delivery_status_history (business_id, delivery_id);
CREATE INDEX delivery_status_history_business_created_idx ON public.delivery_status_history (business_id, created_at DESC);

-- ============================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================
CREATE TRIGGER deliveries_touch_updated_at BEFORE UPDATE ON public.deliveries FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER delivery_items_touch_updated_at BEFORE UPDATE ON public.delivery_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================
-- HELPER: Check if order production is complete (all items)
-- ============================================
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
  pending_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO pending_count
  FROM public.production_orders po
  WHERE po.order_id = p_order_id AND po.business_id = p_business_id
    AND po.status NOT IN ('COMPLETED', 'READY_FOR_DISPATCH', 'CANCELLED');

  RETURN pending_count = 0;
END;
$$;

-- ============================================
-- HELPER: Check available finished goods for delivery
-- ============================================
CREATE OR REPLACE FUNCTION public.get_available_finished_goods(
  p_business_id UUID,
  p_product_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  available NUMERIC;
BEGIN
  SELECT COALESCE(available_stock, 0) INTO available
  FROM public.inventory
  WHERE business_id = p_business_id
    AND item_type = 'finished_good'
    AND item_id = p_product_id;

  RETURN available;
END;
$$;

-- ============================================
-- CORE: Create delivery from order (NOT_READY status)
-- ============================================
CREATE OR REPLACE FUNCTION public.create_delivery_from_order(
  p_business_id UUID,
  p_order_id UUID,
  p_delivery_number TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delivery_id UUID;
  order_rec RECORD;
  item_record RECORD;
  actor_id UUID;
  production_complete BOOLEAN;
BEGIN
  -- Check permissions
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'delivery.create') THEN
    RAISE EXCEPTION 'FORBIDDEN: delivery.create' USING ERRCODE = '42501';
  END IF;

  -- Get actor
  SELECT id INTO actor_id
  FROM public.users
  WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE';
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  -- Get and lock order
  SELECT * INTO order_rec
  FROM public.orders
  WHERE id = p_order_id AND business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND';
  END IF;

  IF order_rec.status != 'CONFIRMED' THEN
    RAISE EXCEPTION 'ORDER_MUST_BE_CONFIRMED' USING ERRCODE = '23514';
  END IF;

  -- Check for duplicate delivery number
  IF EXISTS (SELECT 1 FROM public.deliveries WHERE business_id = p_business_id AND upper(btrim(delivery_number)) = upper(btrim(p_delivery_number))) THEN
    RAISE EXCEPTION 'DUPLICATE_DELIVERY_NUMBER' USING ERRCODE = '23505';
  END IF;

  -- Check if production is complete for this order
  production_complete := public.is_order_production_complete(p_business_id, p_order_id);

  -- Create delivery
  INSERT INTO public.deliveries (
    business_id, order_id, delivery_number, status,
    expected_delivery_date, notes
  ) VALUES (
    p_business_id, p_order_id, upper(btrim(p_delivery_number)),
    CASE WHEN production_complete THEN 'READY' ELSE 'NOT_READY' END,
    order_rec.expected_delivery_date, p_notes
  ) RETURNING id INTO delivery_id;

  -- Create delivery items from order items
  FOR item_record IN
    SELECT oi.id as order_item_id, oi.product_id, oi.quantity
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id AND oi.business_id = p_business_id
  LOOP
    INSERT INTO public.delivery_items (
      business_id, delivery_id, order_item_id, product_id,
      ordered_quantity, delivered_quantity
    ) VALUES (
      p_business_id, delivery_id, item_record.order_item_id, item_record.product_id,
      item_record.quantity, 0
    );
  END LOOP;

  -- Log initial status
  INSERT INTO public.delivery_status_history (business_id, delivery_id, new_status, changed_by, reason)
  VALUES (p_business_id, delivery_id, 'NOT_READY', actor_id, 'Delivery created from order');

  IF production_complete THEN
    INSERT INTO public.delivery_status_history (business_id, delivery_id, old_status, new_status, changed_by, reason)
    VALUES (p_business_id, delivery_id, 'NOT_READY', 'READY', actor_id, 'All production items completed');
  END IF;

  -- Audit log
  INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, new_data)
  VALUES (p_business_id, actor_id, 'DELIVERY_CREATED', 'delivery', delivery_id,
    jsonb_build_object(
      'delivery_number', p_delivery_number,
      'order_id', p_order_id,
      'status', CASE WHEN production_complete THEN 'READY' ELSE 'NOT_READY' END,
      'expected_delivery_date', order_rec.expected_delivery_date
    ));

  RETURN delivery_id;
END;
$$;

-- ============================================
-- TRANSITION: NOT_READY -> READY (when production completes)
-- ============================================
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
  -- Check permissions (system/internal call)
  IF NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- Get actor
  SELECT id INTO actor_id
  FROM public.users
  WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE';

  -- Get deliveries for this order that are NOT_READY
  FOR delivery_rec IN
    SELECT id FROM public.deliveries
    WHERE order_id = p_order_id AND business_id = p_business_id
      AND status = 'NOT_READY'
  LOOP
    -- Check if production is now complete
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

-- ============================================
-- TRANSITION: READY -> PACKED
-- ============================================
CREATE OR REPLACE FUNCTION public.pack_delivery(
  p_business_id UUID,
  p_delivery_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delivery_rec RECORD;
  actor_id UUID;
BEGIN
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'delivery.update') THEN
    RAISE EXCEPTION 'FORBIDDEN: delivery.update' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO delivery_rec
  FROM public.deliveries
  WHERE id = p_delivery_id AND business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'DELIVERY_NOT_FOUND'; END IF;

  IF delivery_rec.status != 'READY' THEN
    RAISE EXCEPTION 'INVALID_STATUS: Can only pack READY deliveries, current: %', delivery_rec.status USING ERRCODE = '23514';
  END IF;

  SELECT id INTO actor_id FROM public.users WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE';
  IF actor_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;

  UPDATE public.deliveries SET status = 'PACKED', updated_at = NOW()
  WHERE id = p_delivery_id AND business_id = p_business_id;

  INSERT INTO public.delivery_status_history (business_id, delivery_id, old_status, new_status, changed_by, reason)
  VALUES (p_business_id, p_delivery_id, 'READY', 'PACKED', actor_id, p_notes);

  INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (p_business_id, actor_id, 'DELIVERY_STATUS_CHANGED', 'delivery', p_delivery_id,
    jsonb_build_object('old_status', 'READY', 'notes', p_notes),
    jsonb_build_object('new_status', 'PACKED', 'notes', p_notes));
END;
$$;

-- ============================================
-- TRANSITION: PACKED -> DISPATCHED (deduct finished goods inventory)
-- ============================================
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
  available_qty NUMERIC;
  total_ordered NUMERIC;
  total_delivered NUMERIC;
BEGIN
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'delivery.dispatch') THEN
    RAISE EXCEPTION 'FORBIDDEN: delivery.dispatch' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO delivery_rec
  FROM public.deliveries
  WHERE id = p_delivery_id AND business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'DELIVERY_NOT_FOUND'; END IF;

  IF delivery_rec.status != 'PACKED' THEN
    RAISE EXCEPTION 'INVALID_STATUS: Can only dispatch PACKED deliveries, current: %', delivery_rec.status USING ERRCODE = '23514';
  END IF;

  -- Check if already dispatched (prevent duplicate)
  IF delivery_rec.dispatched_at IS NOT NULL THEN
    RAISE EXCEPTION 'ALREADY_DISPATCHED' USING ERRCODE = '23514';
  END IF;

  SELECT id INTO actor_id FROM public.users WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE';
  IF actor_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;

  -- Validate inventory availability for all items
  FOR item_rec IN
    SELECT di.product_id, di.ordered_quantity, di.delivered_quantity,
           (di.ordered_quantity - di.delivered_quantity) as remaining_qty
    FROM public.delivery_items di
    WHERE di.delivery_id = p_delivery_id AND di.business_id = p_business_id
  LOOP
    available_qty := public.get_available_finished_goods(p_business_id, item_rec.product_id);

    IF available_qty < item_rec.remaining_qty THEN
      RAISE EXCEPTION 'INSUFFICIENT_INVENTORY: Product % - Available: %, Required: %',
        item_rec.product_id, available_qty, item_rec.remaining_qty USING ERRCODE = '23514';
    END IF;
  END LOOP;

  -- Atomic: Deduct finished goods inventory and update delivery items
  FOR item_rec IN
    SELECT di.product_id, (di.ordered_quantity - di.delivered_quantity) as dispatch_qty
    FROM public.delivery_items di
    WHERE di.delivery_id = p_delivery_id AND di.business_id = p_business_id
      AND (di.ordered_quantity - di.delivered_quantity) > 0
  LOOP
    -- Deduct from finished goods inventory
    UPDATE public.inventory
    SET current_stock = current_stock - item_rec.dispatch_qty,
        available_stock = available_stock - item_rec.dispatch_qty
    WHERE business_id = p_business_id AND item_type = 'finished_good' AND item_id = item_rec.product_id;

    -- Create inventory transaction
    INSERT INTO public.inventory_transactions (
      business_id, item_type, item_id, transaction_type, quantity,
      reference_type, reference_id, notes, created_by
    ) VALUES (
      p_business_id, 'finished_good', item_rec.product_id, 'STOCK_OUT',
      item_rec.dispatch_qty, 'delivery_dispatch', p_delivery_id,
      'Dispatched for delivery ' || delivery_rec.delivery_number, actor_id
    );

    -- Update delivery item delivered quantity
    UPDATE public.delivery_items
    SET delivered_quantity = ordered_quantity, updated_at = NOW()
    WHERE delivery_id = p_delivery_id AND product_id = item_rec.product_id;
  END LOOP;

  -- Update delivery status
  UPDATE public.deliveries
  SET status = 'DISPATCHED',
      dispatched_at = NOW(),
      vehicle = p_vehicle,
      driver = p_driver,
      tracking_number = p_tracking_number,
      notes = COALESCE(p_notes, delivery_rec.notes),
      updated_at = NOW()
  WHERE id = p_delivery_id AND business_id = p_business_id;

  INSERT INTO public.delivery_status_history (business_id, delivery_id, old_status, new_status, changed_by, reason)
  VALUES (p_business_id, p_delivery_id, 'PACKED', 'DISPATCHED', actor_id, p_notes);

  INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (p_business_id, actor_id, 'DELIVERY_DISPATCHED', 'delivery', p_delivery_id,
    jsonb_build_object('old_status', 'PACKED', 'vehicle', p_vehicle, 'driver', p_driver, 'tracking', p_tracking_number),
    jsonb_build_object('new_status', 'DISPATCHED', 'dispatched_at', NOW(), 'vehicle', p_vehicle, 'driver', p_driver, 'tracking', p_tracking_number));
END;
$$;

-- ============================================
-- TRANSITION: DISPATCHED -> IN_TRANSIT
-- ============================================
CREATE OR REPLACE FUNCTION public.mark_delivery_in_transit(
  p_business_id UUID,
  p_delivery_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delivery_rec RECORD;
  actor_id UUID;
BEGIN
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'delivery.update') THEN
    RAISE EXCEPTION 'FORBIDDEN: delivery.update' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO delivery_rec
  FROM public.deliveries
  WHERE id = p_delivery_id AND business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'DELIVERY_NOT_FOUND'; END IF;

  IF delivery_rec.status != 'DISPATCHED' THEN
    RAISE EXCEPTION 'INVALID_STATUS: Can only mark DISPATCHED as IN_TRANSIT, current: %', delivery_rec.status USING ERRCODE = '23514';
  END IF;

  SELECT id INTO actor_id FROM public.users WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE';
  IF actor_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;

  UPDATE public.deliveries SET status = 'IN_TRANSIT', updated_at = NOW()
  WHERE id = p_delivery_id AND business_id = p_business_id;

  INSERT INTO public.delivery_status_history (business_id, delivery_id, old_status, new_status, changed_by, reason)
  VALUES (p_business_id, p_delivery_id, 'DISPATCHED', 'IN_TRANSIT', actor_id, p_notes);

  INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (p_business_id, actor_id, 'DELIVERY_STATUS_CHANGED', 'delivery', p_delivery_id,
    jsonb_build_object('old_status', 'DISPATCHED', 'notes', p_notes),
    jsonb_build_object('new_status', 'IN_TRANSIT', 'notes', p_notes));
END;
$$;

-- ============================================
-- TRANSITION: IN_TRANSIT -> DELIVERED (final delivery confirmation)
-- ============================================
CREATE OR REPLACE FUNCTION public.complete_delivery(
  p_business_id UUID,
  p_delivery_id UUID,
  p_proof_document_url TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delivery_rec RECORD;
  actor_id UUID;
  order_rec RECORD;
BEGIN
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'delivery.complete') THEN
    RAISE EXCEPTION 'FORBIDDEN: delivery.complete' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO delivery_rec
  FROM public.deliveries
  WHERE id = p_delivery_id AND business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'DELIVERY_NOT_FOUND'; END IF;

  IF delivery_rec.status NOT IN ('DISPATCHED', 'IN_TRANSIT') THEN
    RAISE EXCEPTION 'INVALID_STATUS: Can only complete DISPATCHED or IN_TRANSIT deliveries, current: %', delivery_rec.status USING ERRCODE = '23514';
  END IF;

  -- Prevent duplicate delivery
  IF delivery_rec.delivered_at IS NOT NULL THEN
    RAISE EXCEPTION 'ALREADY_DELIVERED' USING ERRCODE = '23514';
  END IF;

  SELECT id INTO actor_id FROM public.users WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE';
  IF actor_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;

  UPDATE public.deliveries
  SET status = 'DELIVERED',
      delivered_at = NOW(),
      proof_document_url = p_proof_document_url,
      notes = COALESCE(p_notes, delivery_rec.notes),
      updated_at = NOW()
  WHERE id = p_delivery_id AND business_id = p_business_id;

  INSERT INTO public.delivery_status_history (business_id, delivery_id, old_status, new_status, changed_by, reason)
  VALUES (p_business_id, p_delivery_id, delivery_rec.status, 'DELIVERED', actor_id, p_notes);

  -- Update order delivery status if all deliveries for order are complete
  SELECT * INTO order_rec FROM public.orders WHERE id = delivery_rec.order_id AND business_id = p_business_id;
  IF FOUND THEN
    -- Check if all deliveries for this order are delivered
    IF NOT EXISTS (
      SELECT 1 FROM public.deliveries
      WHERE order_id = delivery_rec.order_id AND business_id = p_business_id
        AND status != 'DELIVERED'
    ) THEN
      UPDATE public.orders
      SET delivery_status = 'DELIVERED'
      WHERE id = delivery_rec.order_id AND business_id = p_business_id;
    END IF;
  END IF;

  INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (p_business_id, actor_id, 'DELIVERY_COMPLETED', 'delivery', p_delivery_id,
    jsonb_build_object('old_status', delivery_rec.status, 'proof_url', p_proof_document_url, 'notes', p_notes),
    jsonb_build_object('new_status', 'DELIVERED', 'delivered_at', NOW(), 'proof_url', p_proof_document_url));
END;
$$;

-- ============================================
-- CANCEL DELIVERY (release if needed)
-- ============================================
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
BEGIN
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'delivery.cancel') THEN
    RAISE EXCEPTION 'FORBIDDEN: delivery.cancel' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO delivery_rec
  FROM public.deliveries
  WHERE id = p_delivery_id AND business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'DELIVERY_NOT_FOUND'; END IF;

  IF delivery_rec.status IN ('DELIVERED', 'CANCELLED') THEN
    RAISE EXCEPTION 'CANNOT_CANCEL: Status is %', delivery_rec.status USING ERRCODE = '23514';
  END IF;

  -- If already dispatched, we need to return finished goods to inventory
  IF delivery_rec.status IN ('DISPATCHED', 'IN_TRANSIT') THEN
    SELECT id INTO actor_id FROM public.users WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE';
    IF actor_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;

    FOR item_rec IN
      SELECT di.product_id, di.delivered_quantity
      FROM public.delivery_items di
      WHERE di.delivery_id = p_delivery_id AND di.business_id = p_business_id
        AND di.delivered_quantity > 0
    LOOP
      -- Return to finished goods inventory
      UPDATE public.inventory
      SET current_stock = current_stock + item_rec.delivered_quantity,
          available_stock = available_stock + item_rec.delivered_quantity
      WHERE business_id = p_business_id AND item_type = 'finished_good' AND item_id = item_rec.product_id;

      -- Create reversal transaction
      INSERT INTO public.inventory_transactions (
        business_id, item_type, item_id, transaction_type, quantity,
        reference_type, reference_id, notes, created_by
      ) VALUES (
        p_business_id, 'finished_good', item_rec.product_id, 'STOCK_IN',
        item_rec.delivered_quantity, 'delivery_cancellation', p_delivery_id,
        'Finished goods returned from cancelled delivery: ' || p_reason, actor_id
      );

      -- Reset delivered quantity
      UPDATE public.delivery_items
      SET delivered_quantity = 0, updated_at = NOW()
      WHERE delivery_id = p_delivery_id AND product_id = item_rec.product_id;
    END LOOP;
  END IF;

  SELECT id INTO actor_id FROM public.users WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE';
  IF actor_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;

  UPDATE public.deliveries
  SET status = 'CANCELLED',
      notes = COALESCE(delivery_rec.notes, '') || CASE WHEN delivery_rec.notes IS NOT NULL THEN ' | ' ELSE '' END || 'Cancelled: ' || p_reason,
      updated_at = NOW()
  WHERE id = p_delivery_id AND business_id = p_business_id;

  INSERT INTO public.delivery_status_history (business_id, delivery_id, old_status, new_status, changed_by, reason)
  VALUES (p_business_id, p_delivery_id, delivery_rec.status, 'CANCELLED', actor_id, p_reason);

  INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (p_business_id, actor_id, 'DELIVERY_CANCELLED', 'delivery', p_delivery_id,
    jsonb_build_object('old_status', delivery_rec.status, 'reason', p_reason),
    jsonb_build_object('new_status', 'CANCELLED', 'reason', p_reason));
END;
$$;

-- ============================================
-- GET DELIVERY WITH ITEMS
-- ============================================
CREATE OR REPLACE FUNCTION public.get_delivery_with_items(
  p_business_id UUID,
  p_delivery_id UUID
)
RETURNS TABLE (
  id UUID,
  business_id UUID,
  order_id UUID,
  delivery_number TEXT,
  status TEXT,
  expected_delivery_date DATE,
  tracking_number TEXT,
  vehicle TEXT,
  driver TEXT,
  dispatched_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  proof_document_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  items JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delivery_rec RECORD;
  items_json JSONB;
BEGIN
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'delivery.view') THEN
    RAISE EXCEPTION 'FORBIDDEN: delivery.view' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO delivery_rec
  FROM public.deliveries
  WHERE id = p_delivery_id AND business_id = p_business_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DELIVERY_NOT_FOUND';
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'id', di.id,
    'order_item_id', di.order_item_id,
    'product_id', di.product_id,
    'product_name', p.name,
    'product_sku', p.sku,
    'ordered_quantity', di.ordered_quantity,
    'delivered_quantity', di.delivered_quantity,
    'unit', p.unit
  )) INTO items_json
  FROM public.delivery_items di
  JOIN public.products p ON p.id = di.product_id AND p.business_id = di.business_id
  WHERE di.delivery_id = p_delivery_id AND di.business_id = p_business_id;

  RETURN QUERY SELECT
    delivery_rec.id, delivery_rec.business_id, delivery_rec.order_id,
    delivery_rec.delivery_number, delivery_rec.status, delivery_rec.expected_delivery_date,
    delivery_rec.tracking_number, delivery_rec.vehicle, delivery_rec.driver,
    delivery_rec.dispatched_at, delivery_rec.delivered_at,
    delivery_rec.proof_document_url, delivery_rec.notes,
    delivery_rec.created_at, delivery_rec.updated_at,
    COALESCE(items_json, '[]'::jsonb);
END;
$$;

-- ============================================
-- LIST DELIVERIES
-- ============================================
CREATE OR REPLACE FUNCTION public.list_deliveries(
  p_business_id UUID,
  p_status TEXT DEFAULT NULL,
  p_order_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  business_id UUID,
  order_id UUID,
  order_number TEXT,
  customer_name TEXT,
  delivery_number TEXT,
  status TEXT,
  expected_delivery_date DATE,
  tracking_number TEXT,
  vehicle TEXT,
  driver TEXT,
  dispatched_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'delivery.view') THEN
    RAISE EXCEPTION 'FORBIDDEN: delivery.view' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT d.id, d.business_id, d.order_id, o.order_number, c.name as customer_name,
    d.delivery_number, d.status, d.expected_delivery_date,
    d.tracking_number, d.vehicle, d.driver,
    d.dispatched_at, d.delivered_at, d.created_at
  FROM public.deliveries d
  JOIN public.orders o ON o.id = d.order_id AND o.business_id = d.business_id
  JOIN public.customers c ON c.id = o.customer_id AND c.business_id = o.business_id
  WHERE d.business_id = p_business_id
    AND (p_status IS NULL OR d.status = p_status)
    AND (p_order_id IS NULL OR d.order_id = p_order_id)
  ORDER BY d.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- ============================================
-- GRANT EXECUTE PERMISSIONS
-- ============================================
GRANT EXECUTE ON FUNCTION public.is_order_production_complete(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_finished_goods(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_delivery_from_order(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_and_update_delivery_readiness(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pack_delivery(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_delivery(UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_delivery_in_transit(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_delivery(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_delivery(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_delivery_with_items(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_deliveries(UUID, TEXT, UUID, INTEGER, INTEGER) TO authenticated;

-- ============================================
-- AUDIT TRIGGERS
-- ============================================
CREATE OR REPLACE FUNCTION public.audit_delivery_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE actor_id UUID;
BEGIN
  SELECT id INTO actor_id FROM public.users
  WHERE auth_user_id = auth.uid() AND business_id = COALESCE(NEW.business_id, OLD.business_id);

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (NEW.business_id, actor_id, 'DELIVERY_CREATED', 'delivery', NEW.id, to_jsonb(NEW));
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, old_data, new_data)
    VALUES (
      NEW.business_id, actor_id, 'DELIVERY_STATUS_CHANGED', 'delivery', NEW.id,
      to_jsonb(OLD), to_jsonb(NEW)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_delivery_items()
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
    CASE WHEN TG_OP = 'INSERT' THEN 'DELIVERY_ITEM_CREATED'
         WHEN TG_OP = 'UPDATE' THEN 'DELIVERY_ITEM_UPDATED'
         ELSE 'DELIVERY_ITEM_REMOVED' END,
    'delivery_item', COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) ELSE NULL END);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_delivery_status_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE actor_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT id INTO actor_id FROM public.users
    WHERE auth_user_id = auth.uid() AND business_id = NEW.business_id;

    INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (NEW.business_id, actor_id, 'DELIVERY_STATUS_HISTORY_RECORDED', 'delivery_status_history', NEW.id, to_jsonb(NEW));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER deliveries_audit AFTER INSERT OR UPDATE ON public.deliveries FOR EACH ROW EXECUTE FUNCTION public.audit_delivery_change();
CREATE TRIGGER delivery_items_audit AFTER INSERT OR UPDATE OR DELETE ON public.delivery_items FOR EACH ROW EXECUTE FUNCTION public.audit_delivery_items();
CREATE TRIGGER delivery_status_history_audit AFTER INSERT ON public.delivery_status_history FOR EACH ROW EXECUTE FUNCTION public.audit_delivery_status_history();

-- ============================================
-- TRIGGER: Check delivery readiness on production completion
-- ============================================
CREATE OR REPLACE FUNCTION public.trigger_delivery_readiness_on_production_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'COMPLETED' AND OLD.status != 'COMPLETED' THEN
    PERFORM public.check_and_update_delivery_readiness(NEW.business_id, NEW.order_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER production_order_delivery_readiness
AFTER UPDATE ON public.production_orders
FOR EACH ROW EXECUTE FUNCTION public.trigger_delivery_readiness_on_production_complete();

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_status_history ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.deliveries TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.delivery_items TO authenticated;
GRANT SELECT ON public.delivery_status_history TO authenticated;
REVOKE DELETE ON public.deliveries, public.delivery_items, public.delivery_status_history FROM anon, authenticated;
GRANT ALL ON public.deliveries, public.delivery_items, public.delivery_status_history TO service_role;

-- Deliveries policies
CREATE POLICY deliveries_select ON public.deliveries
FOR SELECT USING (public.is_business_member(business_id) AND public.has_business_permission(business_id, 'delivery.view'));

CREATE POLICY deliveries_insert ON public.deliveries
FOR INSERT WITH CHECK (public.is_business_member(business_id) AND public.has_business_permission(business_id, 'delivery.create'));

CREATE POLICY deliveries_update ON public.deliveries
FOR UPDATE USING (public.is_business_member(business_id) AND (
  public.has_business_permission(business_id, 'delivery.update') OR
  public.has_business_permission(business_id, 'delivery.dispatch') OR
  public.has_business_permission(business_id, 'delivery.complete') OR
  public.has_business_permission(business_id, 'delivery.cancel')
)) WITH CHECK (public.is_business_member(business_id) AND (
  public.has_business_permission(business_id, 'delivery.update') OR
  public.has_business_permission(business_id, 'delivery.dispatch') OR
  public.has_business_permission(business_id, 'delivery.complete') OR
  public.has_business_permission(business_id, 'delivery.cancel')
));

-- Delivery items policies
CREATE POLICY delivery_items_select ON public.delivery_items
FOR SELECT USING (public.is_business_member(business_id) AND public.has_business_permission(business_id, 'delivery.view'));

CREATE POLICY delivery_items_insert ON public.delivery_items
FOR INSERT WITH CHECK (public.is_business_member(business_id) AND public.has_business_permission(business_id, 'delivery.create'));

CREATE POLICY delivery_items_update ON public.delivery_items
FOR UPDATE USING (public.is_business_member(business_id) AND public.has_business_permission(business_id, 'delivery.update'))
WITH CHECK (public.is_business_member(business_id) AND public.has_business_permission(business_id, 'delivery.update'));

-- Delivery status history policies
CREATE POLICY delivery_status_history_select ON public.delivery_status_history
FOR SELECT USING (public.is_business_member(business_id) AND public.has_business_permission(business_id, 'delivery.view'));

-- ============================================
-- PERMISSIONS
-- ============================================
INSERT INTO public.permissions (module, action, description) VALUES
  ('delivery', 'view', 'View deliveries'),
  ('delivery', 'create', 'Create deliveries from orders'),
  ('delivery', 'update', 'Update delivery details (pack, in_transit)'),
  ('delivery', 'dispatch', 'Dispatch deliveries (deduct finished goods)'),
  ('delivery', 'complete', 'Complete deliveries (mark delivered)'),
  ('delivery', 'cancel', 'Cancel deliveries (release inventory if dispatched)')
ON CONFLICT (module, action) DO UPDATE SET description = EXCLUDED.description;

-- Role assignments
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r JOIN public.permissions p ON p.module = 'delivery'
WHERE replace(lower(trim(r.name)), ' ', '_') IN ('super_admin', 'admin', 'manager')
  AND p.action IN ('view', 'create', 'update', 'dispatch', 'complete', 'cancel')
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;