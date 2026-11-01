-- ====================================================================
-- MIGRATION: 202611020001_delivery_based_customer_ledger.sql
-- Description:
--   Delivery-Based Customer Ledger Accounting for SANKALP IRRIGATION ERP
-- Features:
--   1. Stop premature customer ledger debits at order booking/confirmation.
--   2. Stop premature customer advance allocation at order booking.
--   3. Additive delivery & line financial snapshot columns.
--   4. Atomic post_delivery_to_customer_ledger() RPC on actual dispatch.
--   5. Automatic delivery-level customer advance adjustment (MIN(available, delivered)).
--   6. Atomic reverse_delivery_ledger_posting() for cancelled deliveries.
--   7. One-time historical legacy tagging to protect existing ledger records.
-- ====================================================================

BEGIN;

-- --------------------------------------------------------------------
-- 1. Additive columns on public.orders
-- --------------------------------------------------------------------
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS is_legacy_ledger_posted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS intended_advance_amount NUMERIC(14, 2) NOT NULL DEFAULT 0;

-- One-time data tag: flag existing historical orders that already have INVOICE entries in customer_ledger
UPDATE public.orders o
SET is_legacy_ledger_posted = TRUE
WHERE EXISTS (
  SELECT 1 FROM public.customer_ledger cl
  WHERE cl.order_id = o.id AND cl.entry_type = 'INVOICE'
);

-- --------------------------------------------------------------------
-- 2. Additive columns on public.deliveries
-- --------------------------------------------------------------------
ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS advance_adjusted NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_ledger_posted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ledger_posted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_ledger_reversed BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ledger_reversed_at TIMESTAMPTZ;

-- --------------------------------------------------------------------
-- 3. Additive columns on public.delivery_items
-- --------------------------------------------------------------------
ALTER TABLE public.delivery_items
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(20, 10),
  ADD COLUMN IF NOT EXISTS tax_rate NUMERIC(5, 2),
  ADD COLUMN IF NOT EXISTS discount_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxable_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cgst_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sgst_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS igst_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS line_total NUMERIC(14, 2) NOT NULL DEFAULT 0;

-- --------------------------------------------------------------------
-- 4. Additive columns on public.customer_ledger & customer_advance_allocations
-- --------------------------------------------------------------------
ALTER TABLE public.customer_ledger
  ADD COLUMN IF NOT EXISTS delivery_id UUID REFERENCES public.deliveries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS customer_ledger_business_delivery_idx
  ON public.customer_ledger(business_id, delivery_id);

ALTER TABLE public.customer_advance_allocations
  ADD COLUMN IF NOT EXISTS delivery_id UUID REFERENCES public.deliveries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS customer_advance_allocations_delivery_idx
  ON public.customer_advance_allocations(business_id, delivery_id);

-- --------------------------------------------------------------------
-- 5. Update create_invoice_ledger_entry() trigger function
--    Stops premature order debit for new orders.
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_invoice_ledger_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- DELIVERY-BASED ACCOUNTING:
  -- New orders must not create invoice ledger debits on order confirmation.
  -- Customer ledger debits are posted strictly on delivery/dispatch confirmation.
  -- Only legacy orders (if any remain) are handled by legacy path.
  IF NEW.is_legacy_ledger_posted IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Legacy path (preserve existing behavior for historical records):
  IF NEW.status != 'CONFIRMED' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'CONFIRMED' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.customer_ledger
    WHERE order_id = NEW.id AND entry_type = 'INVOICE'
  ) THEN
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- --------------------------------------------------------------------
-- 6. Core Function: post_delivery_to_customer_ledger()
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.post_delivery_to_customer_ledger(
  p_business_id UUID,
  p_delivery_id UUID,
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
  v_order RECORD;
  v_item RECORD;
  v_actor_id UUID := p_operator_id;
  v_line_taxable NUMERIC(14, 2);
  v_line_cgst NUMERIC(14, 2);
  v_line_sgst NUMERIC(14, 2);
  v_line_igst NUMERIC(14, 2);
  v_line_total NUMERIC(14, 2);
  v_del_subtotal NUMERIC(14, 2) := 0;
  v_del_tax NUMERIC(14, 2) := 0;
  v_del_total NUMERIC(14, 2) := 0;
  v_avail_adv NUMERIC(14, 2) := 0;
  v_adv_to_apply NUMERIC(14, 2) := 0;
  v_pay RECORD;
  v_pay_allocated NUMERIC(14, 2);
  v_pay_avail NUMERIC(14, 2);
  v_this_alloc NUMERIC(14, 2);
  v_needed NUMERIC(14, 2);
  v_alloc_count INT := 0;
BEGIN
  -- 1. Authorization
  IF auth.uid() IS NOT NULL AND NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF v_actor_id IS NULL AND auth.uid() IS NOT NULL THEN
    SELECT id INTO v_actor_id
    FROM public.users
    WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE';
  END IF;

  IF v_actor_id IS NULL THEN
    SELECT id INTO v_actor_id
    FROM public.users
    WHERE business_id = p_business_id AND status = 'ACTIVE'
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  -- 2. Lock and validate delivery
  SELECT * INTO v_del
  FROM public.deliveries
  WHERE id = p_delivery_id AND business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DELIVERY_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotency check: Already posted
  IF v_del.is_ledger_posted IS TRUE THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_posted', true,
      'delivery_id', p_delivery_id,
      'delivery_number', v_del.delivery_number,
      'total_amount', v_del.total_amount,
      'advance_adjusted', v_del.advance_adjusted
    );
  END IF;

  -- State check: Delivery must be confirmed / dispatched
  IF v_del.status NOT IN ('DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'FULLY_DISPATCHED') THEN
    RAISE EXCEPTION 'DELIVERY_NOT_DISPATCHED: Delivery status is %', v_del.status USING ERRCODE = '23514';
  END IF;

  -- 3. Lock and validate parent order
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_del.order_id AND business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- 4. Legacy Protection: If order was already posted under legacy scheme, avoid double debit
  IF v_order.is_legacy_ledger_posted IS TRUE THEN
    UPDATE public.deliveries
    SET is_ledger_posted = TRUE,
        ledger_posted_at = NOW()
    WHERE id = p_delivery_id;

    RETURN jsonb_build_object(
      'success', true,
      'legacy_order_bypassed', true,
      'delivery_id', p_delivery_id,
      'delivery_number', v_del.delivery_number
    );
  END IF;

  -- 5. Calculate Line-Level Financial Amounts and Snapshot onto delivery_items
  FOR v_item IN
    SELECT
      di.id AS di_id,
      di.delivered_quantity,
      oi.unit_price,
      COALESCE(oi.tax_rate, 0) AS tax_rate,
      COALESCE(oi.discount_rate, 0) AS discount_rate
    FROM public.delivery_items di
    JOIN public.order_items oi ON di.order_item_id = oi.id
    WHERE di.delivery_id = p_delivery_id
  LOOP
    IF v_item.delivered_quantity > 0 THEN
      -- Taxable base after discount
      v_line_taxable := ROUND(v_item.delivered_quantity * v_item.unit_price * (1 - v_item.discount_rate / 100), 2);

      -- Tax split based on tax regime
      IF v_order.tax_type = 'INTER_STATE' THEN
        v_line_igst := ROUND(v_line_taxable * (v_item.tax_rate / 100), 2);
        v_line_cgst := 0;
        v_line_sgst := 0;
      ELSE
        v_line_cgst := ROUND(v_line_taxable * (v_item.tax_rate / 200), 2);
        v_line_sgst := ROUND(v_line_taxable * (v_item.tax_rate / 200), 2);
        v_line_igst := 0;
      END IF;

      v_line_total := v_line_taxable + v_line_cgst + v_line_sgst + v_line_igst;

      -- Update delivery item financial snapshot
      UPDATE public.delivery_items
      SET unit_price = v_item.unit_price,
          tax_rate = v_item.tax_rate,
          discount_rate = v_item.discount_rate,
          taxable_amount = v_line_taxable,
          cgst_amount = v_line_cgst,
          sgst_amount = v_line_sgst,
          igst_amount = v_line_igst,
          line_total = v_line_total,
          updated_at = NOW()
      WHERE id = v_item.di_id;

      v_del_subtotal := v_del_subtotal + v_line_taxable;
      v_del_tax := v_del_tax + v_line_cgst + v_line_sgst + v_line_igst;
      v_del_total := v_del_total + v_line_total;
    END IF;
  END LOOP;

  -- Update delivery financial snapshot
  UPDATE public.deliveries
  SET subtotal = v_del_subtotal,
      tax_amount = v_del_tax,
      total_amount = v_del_total
  WHERE id = p_delivery_id;

  -- 6. Insert Delivery Debit into customer_ledger
  INSERT INTO public.customer_ledger (
    business_id,
    customer_id,
    order_id,
    delivery_id,
    entry_type,
    description,
    debit,
    credit,
    balance,
    entry_date,
    created_by,
    created_at
  ) VALUES (
    p_business_id,
    v_order.customer_id,
    v_del.order_id,
    p_delivery_id,
    'INVOICE',
    'Delivery ' || v_del.delivery_number || ' (Inv ' || v_order.order_number || ')',
    v_del_total,
    0,
    0, -- recalculated below
    v_del.delivery_date,
    v_actor_id,
    NOW()
  );

  -- 7. Automatic Advance Adjustment: Allocate MIN(Available Advance, Delivered Total)
  -- Note: In double-entry accounting, customer ledger already holds the cash payment credit.
  -- The delivery debit above settles naturally against that credit balance.
  -- Here we link the delivery to customer_advance_allocations so available advance reflects only unused funds.
  SELECT available_advance INTO v_avail_adv
  FROM public.get_customer_advance_balance(p_business_id, v_order.customer_id);

  v_adv_to_apply := LEAST(COALESCE(v_avail_adv, 0), v_del_total);

  IF v_adv_to_apply > 0 THEN
    v_needed := v_adv_to_apply;

    -- Allocate from unallocated payments in FIFO order
    FOR v_pay IN
      SELECT p.id, p.amount
      FROM public.payments p
      WHERE p.business_id = p_business_id
        AND p.customer_id = v_order.customer_id
        AND p.order_id IS NULL
        AND p.status = 'SUCCESS'
      ORDER BY p.payment_date ASC, p.created_at ASC
      FOR UPDATE OF p
    LOOP
      SELECT COALESCE(SUM(allocated_amount), 0) INTO v_pay_allocated
      FROM public.customer_advance_allocations
      WHERE payment_id = v_pay.id AND status = 'ACTIVE';

      v_pay_avail := GREATEST(0, v_pay.amount - v_pay_allocated);

      IF v_pay_avail > 0 THEN
        v_this_alloc := LEAST(v_needed, v_pay_avail);

        INSERT INTO public.customer_advance_allocations (
          business_id,
          customer_id,
          order_id,
          delivery_id,
          payment_id,
          allocated_amount,
          allocation_date,
          status,
          notes,
          created_by
        ) VALUES (
          p_business_id,
          v_order.customer_id,
          v_del.order_id,
          p_delivery_id,
          v_pay.id,
          v_this_alloc,
          v_del.delivery_date,
          'ACTIVE',
          'Advance adjusted against Delivery ' || v_del.delivery_number,
          v_actor_id
        );

        v_alloc_count := v_alloc_count + 1;
        v_needed := v_needed - v_this_alloc;

        IF v_needed <= 0 THEN
          EXIT;
        END IF;
      END IF;
    END LOOP;

    -- Update delivery advance_adjusted
    UPDATE public.deliveries
    SET advance_adjusted = v_adv_to_apply
    WHERE id = p_delivery_id;

    -- Update order paid & advance applied
    UPDATE public.orders
    SET advance_applied = advance_applied + v_adv_to_apply,
        paid_amount = paid_amount + v_adv_to_apply,
        due_amount = GREATEST(0, total_amount - (paid_amount + v_adv_to_apply)),
        updated_at = NOW()
    WHERE id = v_del.order_id;
  END IF;

  -- 8. Mark delivery as ledger-posted
  UPDATE public.deliveries
  SET is_ledger_posted = TRUE,
      ledger_posted_at = NOW()
  WHERE id = p_delivery_id;

  -- 9. Recalculate customer running balance
  PERFORM public.recalculate_customer_ledger(p_business_id, v_order.customer_id);

  RETURN jsonb_build_object(
    'success', true,
    'delivery_id', p_delivery_id,
    'delivery_number', v_del.delivery_number,
    'total_amount', v_del_total,
    'advance_adjusted', v_adv_to_apply,
    'receivable_due', v_del_total - v_adv_to_apply,
    'allocations_count', v_alloc_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_delivery_to_customer_ledger(UUID, UUID, UUID) TO authenticated, service_role;

-- --------------------------------------------------------------------
-- 7. Core Function: reverse_delivery_ledger_posting()
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reverse_delivery_ledger_posting(
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
  v_order RECORD;
  v_actor_id UUID := p_operator_id;
BEGIN
  -- 1. Authorization
  IF auth.uid() IS NOT NULL AND NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF v_actor_id IS NULL AND auth.uid() IS NOT NULL THEN
    SELECT id INTO v_actor_id
    FROM public.users
    WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE';
  END IF;

  IF v_actor_id IS NULL THEN
    SELECT id INTO v_actor_id
    FROM public.users
    WHERE business_id = p_business_id AND status = 'ACTIVE'
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  -- 2. Lock delivery
  SELECT * INTO v_del
  FROM public.deliveries
  WHERE id = p_delivery_id AND business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DELIVERY_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Check if already reversed or was never posted
  IF v_del.is_ledger_posted IS NOT TRUE OR v_del.is_ledger_reversed IS TRUE THEN
    RETURN jsonb_build_object(
      'success', true,
      'nothing_to_reverse', true,
      'already_reversed', COALESCE(v_del.is_ledger_reversed, false),
      'is_ledger_posted', v_del.is_ledger_posted,
      'is_ledger_reversed', v_del.is_ledger_reversed
    );
  END IF;

  -- 3. Lock order
  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_del.order_id AND business_id = p_business_id
  FOR UPDATE;

  IF v_order.is_legacy_ledger_posted IS TRUE THEN
    UPDATE public.deliveries
    SET is_ledger_reversed = TRUE,
        ledger_reversed_at = NOW()
    WHERE id = p_delivery_id;

    RETURN jsonb_build_object('success', true, 'legacy_bypassed', true);
  END IF;

  -- 4. Reverse delivery debit with compensating credit in customer_ledger
  INSERT INTO public.customer_ledger (
    business_id,
    customer_id,
    order_id,
    delivery_id,
    entry_type,
    description,
    debit,
    credit,
    balance,
    entry_date,
    created_by,
    created_at
  ) VALUES (
    p_business_id,
    v_order.customer_id,
    v_del.order_id,
    p_delivery_id,
    'ADJUSTMENT',
    'Reversal of Delivery ' || v_del.delivery_number || ': ' || COALESCE(p_reason, 'Cancelled'),
    0,
    v_del.total_amount,
    0,
    CURRENT_DATE,
    v_actor_id,
    NOW()
  );

  -- 5. If advance was adjusted, reverse advance allocations and update order
  IF v_del.advance_adjusted > 0 THEN
    -- Mark advance allocations reversed
    UPDATE public.customer_advance_allocations
    SET status = 'REVERSED',
        notes = COALESCE(notes, '') || ' [REVERSED: ' || COALESCE(p_reason, 'Cancelled') || ']',
        updated_at = NOW()
    WHERE delivery_id = p_delivery_id AND status = 'ACTIVE';

    -- Revert order totals
    UPDATE public.orders
    SET advance_applied = GREATEST(0, advance_applied - v_del.advance_adjusted),
        paid_amount = GREATEST(0, paid_amount - v_del.advance_adjusted),
        due_amount = LEAST(total_amount, total_amount - (paid_amount - v_del.advance_adjusted)),
        updated_at = NOW()
    WHERE id = v_del.order_id;
  END IF;

  -- 6. Mark delivery as reversed
  UPDATE public.deliveries
  SET is_ledger_reversed = TRUE,
      ledger_reversed_at = NOW()
  WHERE id = p_delivery_id;

  -- 7. Recalculate customer running balance
  PERFORM public.recalculate_customer_ledger(p_business_id, v_order.customer_id);

  RETURN jsonb_build_object(
    'success', true,
    'reversed_delivery_id', p_delivery_id,
    'reversed_amount', v_del.total_amount,
    'restored_advance', v_del.advance_adjusted
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reverse_delivery_ledger_posting(UUID, UUID, TEXT, UUID) TO authenticated, service_role;

-- --------------------------------------------------------------------
-- 8. Hook into create_partial_delivery()
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_partial_delivery(
  p_business_id UUID,
  p_order_id UUID,
  p_delivery_items JSONB,
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
  v_ledger_post_res JSONB;
BEGIN
  -- 1. Lock the order row
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

  IF EXISTS (
    SELECT 1 FROM public.deliveries 
    WHERE business_id = p_business_id AND delivery_number = v_del_number
  ) THEN
    RAISE EXCEPTION 'DUPLICATE_DELIVERY_NUMBER: Delivery % already exists', v_del_number USING ERRCODE = '23505';
  END IF;

  -- 4. Validate items
  IF p_delivery_items IS NULL OR jsonb_array_length(p_delivery_items) = 0 THEN
    RAISE EXCEPTION 'EMPTY_DELIVERY_ITEMS: At least one item with quantity > 0 must be specified' USING ERRCODE = '23514';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_delivery_items)
  LOOP
    v_oi_id := (v_item->>'order_item_id')::UUID;
    v_qty := (v_item->>'quantity')::NUMERIC;

    IF v_qty < 0 THEN
      RAISE EXCEPTION 'NEGATIVE_QUANTITY: Dispatched quantity cannot be negative for order item %', v_oi_id USING ERRCODE = '23514';
    END IF;

    IF v_qty = 0 THEN
      CONTINUE;
    END IF;

    v_positive_items_count := v_positive_items_count + 1;

    SELECT * INTO v_oi
    FROM public.order_items
    WHERE id = v_oi_id AND order_id = p_order_id AND business_id = p_business_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'INVALID_ORDER_ITEM: Order item % does not belong to order %', v_oi_id, p_order_id USING ERRCODE = 'P0002';
    END IF;

    SELECT COALESCE(SUM(di.delivered_quantity), 0) INTO v_prev_dispatched
    FROM public.delivery_items di
    JOIN public.deliveries d ON di.delivery_id = d.id
    WHERE di.order_item_id = v_oi.id
      AND d.order_id = p_order_id
      AND d.status NOT IN ('CANCELLED');

    v_remaining := GREATEST(0, v_oi.quantity - v_prev_dispatched);

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

  IF v_positive_items_count = 0 THEN
    RAISE EXCEPTION 'EMPTY_DELIVERY_ITEMS: At least one item with quantity > 0 must be specified' USING ERRCODE = '23514';
  END IF;

  -- 5. Insert into deliveries table
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

  -- 6. Insert delivery items
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

  -- 7. Recalculate order delivery status and item dispatched quantities
  v_order_status := public.recalculate_order_delivery_status(p_order_id);

  -- 8. Post to customer ledger if status is DISPATCHED
  IF p_status IN ('DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'FULLY_DISPATCHED') THEN
    v_ledger_post_res := public.post_delivery_to_customer_ledger(p_business_id, v_delivery_id, v_actor_id);
  END IF;

  -- 9. Status history
  INSERT INTO public.delivery_status_history (
    business_id, delivery_id, old_status, new_status, changed_by, reason, created_at
  ) VALUES (
    p_business_id, v_delivery_id, NULL, p_status, v_actor_id, p_notes, NOW()
  );

  -- 10. Audit log
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
      'override_reason', p_override_reason,
      'ledger_post', v_ledger_post_res
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
    'total_remaining', v_total_remaining,
    'ledger_post', v_ledger_post_res
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_partial_delivery(UUID, UUID, JSONB, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, TEXT, UUID) TO authenticated, service_role;

-- --------------------------------------------------------------------
-- 9. Update cancel_partial_delivery()
-- --------------------------------------------------------------------
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
  v_order RECORD;
  v_actor_id UUID;
  v_order_status TEXT;
  v_di RECORD;
  v_reverse_res JSONB;
BEGIN
  IF p_reason IS NULL OR LENGTH(TRIM(p_reason)) < 3 THEN
    RAISE EXCEPTION 'REASON_REQUIRED: A valid cancellation reason of at least 3 characters is required' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_del
  FROM public.deliveries
  WHERE id = p_delivery_id AND business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DELIVERY_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_del.status = 'CANCELLED' THEN
    RETURN jsonb_build_object(
      'success', TRUE,
      'already_cancelled', TRUE,
      'delivery_id', p_delivery_id,
      'message', 'Delivery is already cancelled'
    );
  END IF;

  v_actor_id := p_operator_id;
  IF v_actor_id IS NULL THEN
    SELECT id INTO v_actor_id
    FROM public.users
    WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE';
  END IF;

  IF v_actor_id IS NULL THEN
    SELECT u.id INTO v_actor_id
    FROM public.users u
    JOIN public.user_roles ur ON u.id = ur.user_id
    JOIN public.roles r ON ur.role_id = r.id
    WHERE u.business_id = p_business_id AND lower(r.name) LIKE '%super%'
    LIMIT 1;
  END IF;

  -- Reverse customer ledger debit & advance adjustment if posted
  IF v_del.is_ledger_posted IS TRUE AND v_del.is_ledger_reversed IS NOT TRUE THEN
    v_reverse_res := public.reverse_delivery_ledger_posting(p_business_id, p_delivery_id, p_reason, v_actor_id);
  END IF;

  -- Mark delivery as CANCELLED
  UPDATE public.deliveries
  SET status = 'CANCELLED',
      notes = CASE
        WHEN notes IS NULL OR notes = '' THEN 'CANCELLED: ' || TRIM(p_reason)
        ELSE notes || ' | CANCELLED: ' || TRIM(p_reason)
      END,
      updated_at = NOW()
  WHERE id = p_delivery_id;

  -- Recalculate order delivery status
  v_order_status := public.recalculate_order_delivery_status(v_del.order_id);

  -- Insert into delivery_status_history
  INSERT INTO public.delivery_status_history (
    business_id, delivery_id, old_status, new_status, changed_by, reason, created_at
  ) VALUES (
    p_business_id, p_delivery_id, v_del.status, 'CANCELLED', v_actor_id, TRIM(p_reason), NOW()
  );

  -- Audit log
  INSERT INTO public.audit_logs (
    business_id, user_id, action, entity_type, entity_id, new_data
  ) VALUES (
    p_business_id,
    v_actor_id,
    'DELIVERY_CANCELLED',
    'delivery',
    p_delivery_id,
    jsonb_build_object(
      'delivery_number', v_del.delivery_number,
      'order_id', v_del.order_id,
      'previous_status', v_del.status,
      'reason', TRIM(p_reason),
      'order_delivery_status', v_order_status,
      'ledger_reversal', v_reverse_res
    )
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'delivery_id', p_delivery_id,
    'delivery_number', v_del.delivery_number,
    'order_id', v_del.order_id,
    'order_delivery_status', v_order_status,
    'ledger_reversal', v_reverse_res,
    'message', 'Delivery ' || v_del.delivery_number || ' cancelled and ledger adjustments reversed.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_partial_delivery(UUID, UUID, TEXT, UUID) TO authenticated, service_role;

-- --------------------------------------------------------------------
-- 10. Update dispatch_delivery() & cancel_delivery()
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
  available_qty NUMERIC;
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

  IF delivery_rec.dispatched_at IS NOT NULL THEN
    RAISE EXCEPTION 'ALREADY_DISPATCHED' USING ERRCODE = '23514';
  END IF;

  SELECT id INTO actor_id FROM public.users WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE';
  IF actor_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;

  -- Validate inventory availability
  FOR item_rec IN
    SELECT di.product_id, di.ordered_quantity, di.delivered_quantity,
           (di.ordered_quantity - di.delivered_quantity) as remaining_qty
    FROM public.delivery_items di
    WHERE di.delivery_id = p_delivery_id AND di.business_id = p_business_id
  LOOP
    available_qty := public.get_available_finished_goods(p_business_id, item_rec.product_id);
    IF available_qty < item_rec.remaining_qty THEN
      RAISE EXCEPTION 'INSUFFICIENT_STOCK: Item % requires %, available: %',
        item_rec.product_id, item_rec.remaining_qty, available_qty USING ERRCODE = '23514';
    END IF;
  END LOOP;

  -- Deduct inventory and update delivery items
  FOR item_rec IN
    SELECT di.product_id, (di.ordered_quantity - di.delivered_quantity) as dispatch_qty
    FROM public.delivery_items di
    WHERE di.delivery_id = p_delivery_id AND di.business_id = p_business_id
  LOOP
    UPDATE public.inventory
    SET current_stock = current_stock - item_rec.dispatch_qty,
        available_stock = available_stock - item_rec.dispatch_qty,
        updated_at = NOW()
    WHERE business_id = p_business_id AND item_type = 'finished_good' AND item_id = item_rec.product_id;

    INSERT INTO public.inventory_transactions (
      business_id, item_type, item_id, transaction_type, quantity,
      reference_type, reference_id, notes, created_by
    ) VALUES (
      p_business_id, 'finished_good', item_rec.product_id, 'STOCK_OUT',
      item_rec.dispatch_qty, 'delivery_dispatch', p_delivery_id,
      'Dispatched for delivery ' || delivery_rec.delivery_number, actor_id
    );

    UPDATE public.delivery_items
    SET delivered_quantity = ordered_quantity, updated_at = NOW()
    WHERE delivery_id = p_delivery_id AND product_id = item_rec.product_id;
  END LOOP;

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

  -- Post delivery to customer ledger and apply available advance
  PERFORM public.post_delivery_to_customer_ledger(p_business_id, p_delivery_id, actor_id);
END;
$$;

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

  SELECT id INTO actor_id FROM public.users WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE';
  IF actor_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;

  -- Return inventory if dispatched
  IF delivery_rec.status IN ('DISPATCHED', 'IN_TRANSIT') THEN
    FOR item_rec IN
      SELECT di.product_id, di.delivered_quantity
      FROM public.delivery_items di
      WHERE di.delivery_id = p_delivery_id AND di.business_id = p_business_id
        AND di.delivered_quantity > 0
    LOOP
      UPDATE public.inventory
      SET current_stock = current_stock + item_rec.delivered_quantity,
          available_stock = available_stock + item_rec.delivered_quantity
      WHERE business_id = p_business_id AND item_type = 'finished_good' AND item_id = item_rec.product_id;

      INSERT INTO public.inventory_transactions (
        business_id, item_type, item_id, transaction_type, quantity,
        reference_type, reference_id, notes, created_by
      ) VALUES (
        p_business_id, 'finished_good', item_rec.product_id, 'STOCK_IN',
        item_rec.delivered_quantity, 'delivery_cancellation', p_delivery_id,
        'Finished goods returned from cancelled delivery: ' || p_reason, actor_id
      );

      UPDATE public.delivery_items
      SET delivered_quantity = 0, updated_at = NOW()
      WHERE delivery_id = p_delivery_id AND product_id = item_rec.product_id;
    END LOOP;
  END IF;

  -- Reverse customer ledger debit & advance adjustment if posted
  IF delivery_rec.is_ledger_posted IS TRUE AND delivery_rec.is_ledger_reversed IS NOT TRUE THEN
    PERFORM public.reverse_delivery_ledger_posting(p_business_id, p_delivery_id, p_reason, actor_id);
  END IF;

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

-- --------------------------------------------------------------------
-- 11. Update get_customer_summary() to base purchases on posted invoices
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_customer_summary(
  p_business_id UUID,
  p_customer_id UUID
)
RETURNS TABLE (
  customer_id UUID,
  customer_name TEXT,
  customer_company TEXT,
  total_purchases NUMERIC,
  total_paid NUMERIC,
  total_due NUMERIC,
  available_advance NUMERIC,
  total_advance_received NUMERIC,
  total_advance_allocated NUMERIC,
  opening_balance_amount NUMERIC,
  opening_balance_type TEXT,
  opening_balance_date DATE,
  reconciliation_warning TEXT,
  last_payment_date DATE,
  last_payment_amount NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_name TEXT;
  v_company TEXT;
  v_purchases NUMERIC := 0;
  v_paid NUMERIC := 0;
  v_due NUMERIC := 0;
  v_avail_adv NUMERIC := 0;
  v_adv_received NUMERIC := 0;
  v_adv_allocated NUMERIC := 0;
  v_warning TEXT := NULL;
  v_last_date DATE;
  v_last_amount NUMERIC;
  v_ledger_invoices NUMERIC := 0;
  v_ob RECORD;
  v_ob_amount NUMERIC := 0;
  v_ob_type TEXT := NULL;
  v_ob_date DATE := NULL;
  v_net_closing NUMERIC := 0;
  v_paid_payments NUMERIC := 0;
  v_paid_unlinked NUMERIC := 0;
  v_adv_payments NUMERIC := 0;
  v_adv_unlinked NUMERIC := 0;
  v_last_ledger_date DATE;
  v_last_ledger_amount NUMERIC;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'payments.view') THEN
      RAISE EXCEPTION 'FORBIDDEN: payments.view' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT c.name, c.company_name INTO v_name, v_company
  FROM public.customers c
  WHERE c.id = p_customer_id AND c.business_id = p_business_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CUSTOMER_NOT_FOUND';
  END IF;

  SELECT * INTO v_ob
  FROM public.customer_opening_balances
  WHERE business_id = p_business_id
    AND customer_id = p_customer_id
  ORDER BY as_on_date DESC, created_at DESC
  LIMIT 1;

  IF FOUND THEN
    v_ob_amount := v_ob.amount;
    v_ob_type := v_ob.balance_type;
    v_ob_date := v_ob.as_on_date;
  END IF;

  -- Total Invoiced Purchases from Ledger
  -- (Includes legacy orders posted at confirmation + new deliveries posted at dispatch)
  SELECT COALESCE(SUM(cl.debit), 0) INTO v_ledger_invoices
  FROM public.customer_ledger cl
  WHERE cl.business_id = p_business_id
    AND cl.customer_id = p_customer_id
    AND cl.entry_type = 'INVOICE';

  v_purchases := v_ledger_invoices;

  -- Total Cleared Payments Received
  SELECT COALESCE(SUM(p.amount), 0) INTO v_paid_payments
  FROM public.payments p
  WHERE p.business_id = p_business_id
    AND p.customer_id = p_customer_id
    AND p.status = 'SUCCESS';

  SELECT COALESCE(SUM(cl.credit), 0) INTO v_paid_unlinked
  FROM public.customer_ledger cl
  WHERE cl.business_id = p_business_id
    AND cl.customer_id = p_customer_id
    AND cl.entry_type = 'PAYMENT'
    AND cl.payment_id IS NULL;

  v_paid := v_paid_payments + v_paid_unlinked;

  -- Advance calculations from payments
  SELECT COALESCE(SUM(p.amount), 0) INTO v_adv_payments
  FROM public.payments p
  WHERE p.business_id = p_business_id
    AND p.customer_id = p_customer_id
    AND p.status = 'SUCCESS'
    AND p.order_id IS NULL;

  SELECT COALESCE(SUM(cl.credit), 0) INTO v_adv_unlinked
  FROM public.customer_ledger cl
  WHERE cl.business_id = p_business_id
    AND cl.customer_id = p_customer_id
    AND cl.entry_type = 'PAYMENT'
    AND cl.payment_id IS NULL
    AND cl.order_id IS NULL;

  v_adv_received := v_adv_payments + v_adv_unlinked;

  SELECT COALESCE(SUM(caa.allocated_amount), 0) INTO v_adv_allocated
  FROM public.customer_advance_allocations caa
  WHERE caa.business_id = p_business_id
    AND caa.customer_id = p_customer_id
    AND caa.status = 'ACTIVE';

  -- Net closing ledger balance
  v_net_closing := public.calculate_customer_balance_as_of(p_business_id, p_customer_id, NULL);

  IF v_net_closing > 0 THEN
    v_due := v_net_closing;
    v_avail_adv := 0;
  ELSIF v_net_closing < 0 THEN
    v_due := 0;
    v_avail_adv := ABS(v_net_closing);
  ELSE
    v_due := 0;
    v_avail_adv := 0;
  END IF;

  -- Last payment info
  SELECT p.payment_date, p.amount INTO v_last_date, v_last_amount
  FROM public.payments p
  WHERE p.business_id = p_business_id
    AND p.customer_id = p_customer_id
    AND p.status = 'SUCCESS'
  ORDER BY p.payment_date DESC, p.created_at DESC
  LIMIT 1;

  SELECT cl.entry_date, cl.credit INTO v_last_ledger_date, v_last_ledger_amount
  FROM public.customer_ledger cl
  WHERE cl.business_id = p_business_id
    AND cl.customer_id = p_customer_id
    AND cl.entry_type = 'PAYMENT'
  ORDER BY cl.entry_date DESC, cl.created_at DESC
  LIMIT 1;

  IF v_last_ledger_date IS NOT NULL AND (v_last_date IS NULL OR v_last_ledger_date > v_last_date) THEN
    v_last_date := v_last_ledger_date;
    v_last_amount := v_last_ledger_amount;
  END IF;

  RETURN QUERY SELECT
    p_customer_id,
    v_name::text,
    v_company::text,
    v_purchases,
    v_paid,
    v_due,
    v_avail_adv,
    v_adv_received,
    v_adv_allocated,
    v_ob_amount,
    v_ob_type,
    v_ob_date,
    v_warning,
    v_last_date,
    v_last_amount;
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_summary(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_summary(uuid, uuid) TO authenticated, service_role;

-- --------------------------------------------------------------------
-- 10. Update get_customer_ledger to include delivery_id and delivery_number
-- --------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_customer_ledger(uuid, uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.get_customer_ledger(
  p_business_id UUID,
  p_customer_id UUID,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  business_id UUID,
  customer_id UUID,
  customer_name TEXT,
  order_id UUID,
  order_number TEXT,
  payment_id UUID,
  payment_number TEXT,
  delivery_id UUID,
  delivery_number TEXT,
  entry_type TEXT,
  description TEXT,
  debit NUMERIC,
  credit NUMERIC,
  balance NUMERIC,
  entry_date DATE,
  created_at TIMESTAMPTZ,
  created_by UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'payments.view') THEN
      RAISE EXCEPTION 'FORBIDDEN: payments.view' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    cl.id,
    cl.business_id,
    cl.customer_id,
    c.name::text as customer_name,
    cl.order_id,
    o.order_number::text,
    cl.payment_id,
    p.payment_number::text,
    cl.delivery_id,
    del.delivery_number::text,
    cl.entry_type::text,
    cl.description::text,
    cl.debit,
    cl.credit,
    cl.balance,
    cl.entry_date,
    cl.created_at,
    cl.created_by
  FROM public.customer_ledger cl
  JOIN public.customers c ON c.id = cl.customer_id AND c.business_id = p_business_id
  LEFT JOIN public.orders o ON o.id = cl.order_id AND o.business_id = p_business_id
  LEFT JOIN public.payments p ON p.id = cl.payment_id AND p.business_id = p_business_id
  LEFT JOIN public.deliveries del ON del.id = cl.delivery_id AND del.business_id = p_business_id
  WHERE cl.business_id = p_business_id
    AND cl.customer_id = p_customer_id
  ORDER BY cl.entry_date DESC, cl.created_at DESC, cl.id DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_ledger(uuid, uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_ledger(uuid, uuid, integer, integer) TO authenticated, service_role;


-- --------------------------------------------------------------------
-- 11. Update recalculate_customer_ledger to allow service_role / system calls
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalculate_customer_ledger(
  p_business_id UUID,
  p_customer_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ledger_rec RECORD;
  running_balance NUMERIC := 0;
  v_ob RECORD;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'payments.edit') THEN
      RAISE EXCEPTION 'FORBIDDEN: payments.edit' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Incorporate opening balance if configured
  SELECT * INTO v_ob
  FROM public.customer_opening_balances
  WHERE business_id = p_business_id AND customer_id = p_customer_id
  ORDER BY as_on_date DESC, created_at DESC
  LIMIT 1;

  IF FOUND THEN
    running_balance := CASE WHEN v_ob.balance_type = 'RECEIVABLE' THEN v_ob.amount ELSE -v_ob.amount END;
  END IF;

  -- Compute running balance forward with deterministic primary & secondary keys
  FOR ledger_rec IN
    SELECT id, entry_type, debit, credit
    FROM public.customer_ledger
    WHERE business_id = p_business_id
      AND customer_id = p_customer_id
    ORDER BY entry_date ASC, created_at ASC, id ASC
  LOOP
    running_balance := running_balance + ledger_rec.debit - ledger_rec.credit;

    UPDATE public.customer_ledger
    SET balance = running_balance
    WHERE id = ledger_rec.id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_customer_ledger(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.recalculate_customer_ledger(uuid, uuid) TO authenticated, service_role;

COMMIT;

