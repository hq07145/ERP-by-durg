BEGIN;

-- ============================================
-- 1. ADD ADVANCE_APPLIED TO ORDERS TABLE
-- ============================================
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS advance_applied NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (advance_applied >= 0);

-- ============================================
-- 2. CREATE CUSTOMER_ADVANCE_ALLOCATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.customer_advance_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  allocated_amount NUMERIC(14, 2) NOT NULL CHECK (allocated_amount > 0),
  allocation_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REVERSED')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS customer_advance_allocations_business_idx ON public.customer_advance_allocations (business_id);
CREATE INDEX IF NOT EXISTS customer_advance_allocations_customer_idx ON public.customer_advance_allocations (business_id, customer_id);
CREATE INDEX IF NOT EXISTS customer_advance_allocations_order_idx ON public.customer_advance_allocations (business_id, order_id);
CREATE INDEX IF NOT EXISTS customer_advance_allocations_payment_idx ON public.customer_advance_allocations (business_id, payment_id);
CREATE INDEX IF NOT EXISTS customer_advance_allocations_status_idx ON public.customer_advance_allocations (business_id, status);

-- Enable RLS
ALTER TABLE public.customer_advance_allocations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'customer_advance_allocations' AND policyname = 'customer_advance_allocations_select'
  ) THEN
    CREATE POLICY customer_advance_allocations_select ON public.customer_advance_allocations
      FOR SELECT
      USING (
        auth.uid() IS NULL OR (
          public.is_business_member(business_id) AND (
            public.has_business_permission(business_id, 'orders.view') OR
            public.has_business_permission(business_id, 'payments.view')
          )
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'customer_advance_allocations' AND policyname = 'customer_advance_allocations_insert'
  ) THEN
    CREATE POLICY customer_advance_allocations_insert ON public.customer_advance_allocations
      FOR INSERT
      WITH CHECK (
        auth.uid() IS NULL OR (
          public.is_business_member(business_id) AND (
            public.has_business_permission(business_id, 'orders.create') OR
            public.has_business_permission(business_id, 'orders.edit') OR
            public.has_business_permission(business_id, 'payments.add')
          )
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'customer_advance_allocations' AND policyname = 'customer_advance_allocations_update'
  ) THEN
    CREATE POLICY customer_advance_allocations_update ON public.customer_advance_allocations
      FOR UPDATE
      USING (
        auth.uid() IS NULL OR (
          public.is_business_member(business_id) AND (
            public.has_business_permission(business_id, 'orders.cancel') OR
            public.has_business_permission(business_id, 'orders.edit') OR
            public.has_business_permission(business_id, 'payments.edit')
          )
        )
      );
  END IF;
END $$;

-- ============================================
-- 3. FUNCTION: GET_CUSTOMER_ADVANCE_BALANCE
-- ============================================
CREATE OR REPLACE FUNCTION public.get_customer_advance_balance(
  p_business_id UUID,
  p_customer_id UUID
)
RETURNS TABLE (
  available_advance NUMERIC,
  total_advance_received NUMERIC,
  total_advance_allocated NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_received NUMERIC := 0;
  v_allocated NUMERIC := 0;
BEGIN
  -- Authorize caller when in user session context
  IF auth.uid() IS NOT NULL AND NOT public.is_business_member(p_business_id) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- Total advance payments received for this customer (payments with no initial linked order and status SUCCESS)
  SELECT COALESCE(SUM(amount), 0) INTO v_received
  FROM public.payments
  WHERE business_id = p_business_id
    AND customer_id = p_customer_id
    AND order_id IS NULL
    AND status = 'SUCCESS';

  -- Total advance already allocated to orders
  SELECT COALESCE(SUM(allocated_amount), 0) INTO v_allocated
  FROM public.customer_advance_allocations
  WHERE business_id = p_business_id
    AND customer_id = p_customer_id
    AND status = 'ACTIVE';

  RETURN QUERY SELECT
    GREATEST(0, v_received - v_allocated) AS available_advance,
    v_received AS total_advance_received,
    v_allocated AS total_advance_allocated;
END;
$$;

-- ============================================
-- 4. FUNCTION: ALLOCATE_CUSTOMER_ADVANCE_TO_ORDER
-- ============================================
CREATE OR REPLACE FUNCTION public.allocate_customer_advance_to_order(
  p_business_id UUID,
  p_customer_id UUID,
  p_order_id UUID,
  p_amount NUMERIC,
  p_user_id UUID DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_actor_id UUID := p_user_id;
  v_order_rec RECORD;
  v_pay RECORD;
  v_total_avail NUMERIC := 0;
  v_needed NUMERIC := p_amount;
  v_pay_allocated NUMERIC := 0;
  v_pay_avail NUMERIC := 0;
  v_this_alloc NUMERIC := 0;
  v_alloc_count INT := 0;
  v_alloc_ids UUID[] := ARRAY[]::UUID[];
BEGIN
  -- Authorize caller when in user session context
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
    LIMIT 1;
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_ADVANCE_AMOUNT' USING ERRCODE = '23514';
  END IF;

  -- Lock customer
  PERFORM 1 FROM public.customers
  WHERE id = p_customer_id AND business_id = p_business_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CUSTOMER_NOT_FOUND' USING ERRCODE = '23503';
  END IF;

  -- Lock and validate order
  SELECT * INTO v_order_rec
  FROM public.orders
  WHERE id = p_order_id AND business_id = p_business_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = '23503';
  END IF;

  IF v_order_rec.customer_id != p_customer_id THEN
    RAISE EXCEPTION 'ORDER_CUSTOMER_MISMATCH' USING ERRCODE = '23514';
  END IF;

  IF v_order_rec.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'CANNOT_APPLY_TO_CANCELLED_ORDER' USING ERRCODE = '23514';
  END IF;

  IF p_amount > v_order_rec.total_amount THEN
    RAISE EXCEPTION 'ADVANCE_EXCEEDS_ORDER_TOTAL' USING ERRCODE = '23514';
  END IF;

  -- Verify total available advance across customer unallocated payments
  SELECT COALESCE(SUM(
    p.amount - COALESCE(allocs.used, 0)
  ), 0) INTO v_total_avail
  FROM public.payments p
  LEFT JOIN (
    SELECT payment_id, SUM(allocated_amount) as used
    FROM public.customer_advance_allocations
    WHERE business_id = p_business_id AND status = 'ACTIVE'
    GROUP BY payment_id
  ) allocs ON allocs.payment_id = p.id
  WHERE p.business_id = p_business_id
    AND p.customer_id = p_customer_id
    AND p.order_id IS NULL
    AND p.status = 'SUCCESS';

  IF v_total_avail < p_amount THEN
    RAISE EXCEPTION 'INSUFFICIENT_ADVANCE_BALANCE: Requested %, Available %', p_amount, v_total_avail
      USING ERRCODE = '23514';
  END IF;

  -- Iterate through unallocated advance payments in FIFO order (by payment_date, created_at)
  FOR v_pay IN
    SELECT p.id, p.payment_number, p.amount
    FROM public.payments p
    WHERE p.business_id = p_business_id
      AND p.customer_id = p_customer_id
      AND p.order_id IS NULL
      AND p.status = 'SUCCESS'
    ORDER BY p.payment_date ASC, p.created_at ASC
    FOR UPDATE OF p
  LOOP
    -- Calculate already allocated for this payment
    SELECT COALESCE(SUM(allocated_amount), 0) INTO v_pay_allocated
    FROM public.customer_advance_allocations
    WHERE payment_id = v_pay.id AND status = 'ACTIVE';

    v_pay_avail := GREATEST(0, v_pay.amount - v_pay_allocated);

    IF v_pay_avail > 0 THEN
      v_this_alloc := LEAST(v_needed, v_pay_avail);

      DECLARE
        v_new_alloc_id UUID;
      BEGIN
        INSERT INTO public.customer_advance_allocations (
          business_id, customer_id, order_id, payment_id,
          allocated_amount, allocation_date, status, notes, created_by
        ) VALUES (
          p_business_id, p_customer_id, p_order_id, v_pay.id,
          v_this_alloc, CURRENT_DATE, 'ACTIVE',
          COALESCE(p_notes, 'Advance applied to order ' || v_order_rec.order_number),
          v_actor_id
        ) RETURNING id INTO v_new_alloc_id;

        v_alloc_ids := array_append(v_alloc_ids, v_new_alloc_id);
        v_alloc_count := v_alloc_count + 1;
      END;

      v_needed := v_needed - v_this_alloc;

      IF v_needed <= 0 THEN
        EXIT;
      END IF;
    END IF;
  END LOOP;

  -- Update order totals to reflect advance applied
  UPDATE public.orders
  SET advance_applied = advance_applied + p_amount,
      paid_amount = paid_amount + p_amount,
      due_amount = GREATEST(0, total_amount - (paid_amount + p_amount)),
      updated_at = NOW()
  WHERE id = p_order_id AND business_id = p_business_id;

  -- Audit log entry
  INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, new_data)
  VALUES (
    p_business_id,
    v_actor_id,
    'ADVANCE_ALLOCATED_TO_ORDER',
    'order',
    p_order_id,
    jsonb_build_object(
      'order_id', p_order_id,
      'order_number', v_order_rec.order_number,
      'customer_id', p_customer_id,
      'allocated_amount', p_amount,
      'allocation_count', v_alloc_count,
      'allocation_ids', v_alloc_ids
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'allocated_amount', p_amount,
    'allocations_count', v_alloc_count,
    'allocation_ids', v_alloc_ids
  );
END;
$$;

-- ============================================
-- 5. FUNCTION: REVERSE_ORDER_ADVANCE_ALLOCATIONS
-- ============================================
CREATE OR REPLACE FUNCTION public.reverse_order_advance_allocations(
  p_business_id UUID,
  p_order_id UUID,
  p_user_id UUID DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_actor_id UUID := p_user_id;
  v_order_rec RECORD;
  v_reversed_sum NUMERIC := 0;
  v_count INT := 0;
BEGIN
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
    LIMIT 1;
  END IF;

  -- Lock order
  SELECT * INTO v_order_rec
  FROM public.orders
  WHERE id = p_order_id AND business_id = p_business_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = '23503';
  END IF;

  -- Sum active allocations to reverse
  SELECT COALESCE(SUM(allocated_amount), 0), COUNT(*)
  INTO v_reversed_sum, v_count
  FROM public.customer_advance_allocations
  WHERE business_id = p_business_id
    AND order_id = p_order_id
    AND status = 'ACTIVE';

  IF v_count > 0 THEN
    UPDATE public.customer_advance_allocations
    SET status = 'REVERSED',
        notes = CASE WHEN notes IS NOT NULL THEN notes || ' | ' ELSE '' END || COALESCE(p_reason, 'Reversed on order cancellation'),
        updated_at = NOW()
    WHERE business_id = p_business_id
      AND order_id = p_order_id
      AND status = 'ACTIVE';

    -- Adjust order paid and due amounts
    UPDATE public.orders
    SET advance_applied = 0,
        paid_amount = GREATEST(0, paid_amount - v_reversed_sum),
        due_amount = LEAST(total_amount, total_amount - GREATEST(0, paid_amount - v_reversed_sum)),
        updated_at = NOW()
    WHERE id = p_order_id AND business_id = p_business_id;

    -- Audit log
    INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (
      p_business_id,
      v_actor_id,
      'ADVANCE_ALLOCATION_REVERSED',
      'order',
      p_order_id,
      jsonb_build_object(
        'order_id', p_order_id,
        'reversed_amount', v_reversed_sum,
        'count', v_count,
        'reason', p_reason
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'reversed_amount', v_reversed_sum,
    'count', v_count
  );
END;
$$;

COMMIT;
