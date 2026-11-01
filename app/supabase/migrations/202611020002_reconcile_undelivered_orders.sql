-- ====================================================================
-- MIGRATION: 202611020002_reconcile_undelivered_orders.sql
-- Description:
--   Delivery-Based Customer Ledger Accounting: Neutralize Premature Debits
--   on Unfulfilled Orders & Reconcile Reports
-- ====================================================================

BEGIN;

-- --------------------------------------------------------------------
-- 1. Create function to neutralize premature debits on unfulfilled orders
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_undelivered_orders(
  p_business_id UUID DEFAULT NULL,
  p_operator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_ord RECORD;
  v_inv_entry RECORD;
  v_actor_id UUID := p_operator_id;
  v_count INT := 0;
  v_reversed_orders JSONB := '[]'::jsonb;
BEGIN
  FOR v_ord IN
    SELECT o.id, o.business_id, o.customer_id, o.order_number, o.total_amount
    FROM public.orders o
    WHERE (p_business_id IS NULL OR o.business_id = p_business_id)
      AND (
        SELECT count(*)
        FROM public.deliveries d
        WHERE d.order_id = o.id AND d.status NOT IN ('CANCELLED')
      ) = 0
      AND EXISTS (
        SELECT 1 FROM public.customer_ledger cl
        WHERE cl.order_id = o.id AND cl.entry_type = 'INVOICE' AND cl.delivery_id IS NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.customer_ledger cl
        WHERE cl.order_id = o.id AND cl.entry_type = 'ADJUSTMENT'
          AND cl.description LIKE '%premature%'
      )
    ORDER BY o.order_number
  LOOP
    -- Find actor
    IF v_actor_id IS NULL THEN
      SELECT id INTO v_actor_id
      FROM public.users
      WHERE business_id = v_ord.business_id AND status = 'ACTIVE'
      ORDER BY created_at ASC LIMIT 1;
    END IF;

    -- Find the premature invoice entry
    SELECT * INTO v_inv_entry
    FROM public.customer_ledger
    WHERE order_id = v_ord.id AND entry_type = 'INVOICE' AND delivery_id IS NULL
    ORDER BY created_at ASC LIMIT 1;

    IF FOUND THEN
      -- Post compensating reversal adjustment
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
        v_ord.business_id,
        v_ord.customer_id,
        v_ord.id,
        NULL,
        'ADJUSTMENT',
        'Auditable Reversal: Neutralizing premature invoice debit for undelivered Order ' || v_ord.order_number,
        0,
        v_inv_entry.debit,
        0,
        CURRENT_DATE,
        v_actor_id,
        NOW()
      );

      -- Update order so future real deliveries will post genuine delivery debits
      UPDATE public.orders
      SET is_legacy_ledger_posted = FALSE,
          updated_at = NOW()
      WHERE id = v_ord.id;

      -- Recalculate customer running balance
      PERFORM public.recalculate_customer_ledger(v_ord.business_id, v_ord.customer_id);

      v_count := v_count + 1;
      v_reversed_orders := v_reversed_orders || jsonb_build_object(
        'order_id', v_ord.id,
        'order_number', v_ord.order_number,
        'reversed_debit', v_inv_entry.debit,
        'customer_id', v_ord.customer_id
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'neutralized_count', v_count,
    'orders', v_reversed_orders
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_undelivered_orders(UUID, UUID) TO authenticated, service_role;

-- Execute the reconciliation one-time for all existing unfulfilled orders
SELECT public.reconcile_undelivered_orders();

-- --------------------------------------------------------------------
-- 2. Update post_delivery_to_customer_ledger() description
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
    'Goods delivered against Order ' || v_order.order_number || ' (' || v_del.delivery_number || ')',
    v_del_total,
    0,
    0, -- recalculated below
    v_del.delivery_date,
    v_actor_id,
    NOW()
  );

  -- 7. Automatic Advance Adjustment: Allocate MIN(Available Advance, Delivered Total)
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
-- 3. Update reverse_delivery_ledger_posting() description
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
    'Reversal of Delivery ' || v_del.delivery_number || ' (Order ' || v_order.order_number || '): ' || COALESCE(p_reason, 'Cancelled'),
    0,
    v_del.total_amount,
    0,
    CURRENT_DATE,
    v_actor_id,
    NOW()
  );

  -- 5. If advance was adjusted, reverse advance allocations and update order
  IF v_del.advance_adjusted > 0 THEN
    UPDATE public.customer_advance_allocations
    SET status = 'REVERSED',
        notes = COALESCE(notes, '') || ' [REVERSED: ' || COALESCE(p_reason, 'Cancelled') || ']',
        updated_at = NOW()
    WHERE delivery_id = p_delivery_id AND status = 'ACTIVE';

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
-- 4. Update get_customer_summary() to subtract neutralizing adjustments
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

  -- Total Invoiced Purchases from Ledger:
  -- Sum of invoice debits minus compensating reversal adjustments
  SELECT GREATEST(0, COALESCE(
    SUM(CASE WHEN cl.entry_type = 'INVOICE' THEN cl.debit ELSE 0 END) -
    SUM(CASE WHEN cl.entry_type = 'ADJUSTMENT' AND (cl.order_id IS NOT NULL OR cl.delivery_id IS NOT NULL) THEN cl.credit ELSE 0 END),
    0
  )) INTO v_purchases
  FROM public.customer_ledger cl
  WHERE cl.business_id = p_business_id
    AND cl.customer_id = p_customer_id;

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

COMMIT;

