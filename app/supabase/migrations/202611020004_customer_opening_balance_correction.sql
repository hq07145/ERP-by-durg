-- ====================================================================
-- Migration: 202611020004_customer_opening_balance_correction.sql
-- Description: Customer Opening Balance Edit / Correction Module
--   1. Schema enhancements on customer_opening_balances (initial tracking, correction tracking)
--   2. Dedicated customer_opening_balance_history table for immutable correction auditing
--   3. Updated recalculate_customer_ledger to start from initial opening position
--   4. Atomic RPC correct_customer_opening_balance
--   5. RPC get_customer_opening_balance_history
-- ====================================================================

-- 1. ENHANCE customer_opening_balances TABLE
-- --------------------------------------------------------------------
ALTER TABLE public.customer_opening_balances
  ADD COLUMN IF NOT EXISTS initial_amount NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS initial_balance_type TEXT,
  ADD COLUMN IF NOT EXISTS initial_as_on_date DATE,
  ADD COLUMN IF NOT EXISTS is_corrected BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS correction_count INT NOT NULL DEFAULT 0;

-- Backfill initial columns for existing historical records
UPDATE public.customer_opening_balances
SET initial_amount = amount,
    initial_balance_type = balance_type,
    initial_as_on_date = as_on_date
WHERE initial_amount IS NULL;

-- 2. CREATE TABLE customer_opening_balance_history
-- --------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customer_opening_balance_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  opening_balance_id UUID NOT NULL REFERENCES public.customer_opening_balances(id) ON DELETE RESTRICT,
  old_amount NUMERIC(14, 2) NOT NULL CHECK (old_amount >= 0),
  old_balance_type TEXT NOT NULL CHECK (old_balance_type IN ('RECEIVABLE', 'PAYABLE')),
  old_as_on_date DATE NOT NULL,
  new_amount NUMERIC(14, 2) NOT NULL CHECK (new_amount >= 0),
  new_balance_type TEXT NOT NULL CHECK (new_balance_type IN ('RECEIVABLE', 'PAYABLE')),
  new_as_on_date DATE NOT NULL,
  difference_amount NUMERIC(14, 2) NOT NULL, -- Signed difference: S_new - S_old
  adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('DEBIT', 'CREDIT', 'NONE')),
  adjustment_amount NUMERIC(14, 2) NOT NULL CHECK (adjustment_amount >= 0),
  ledger_entry_id UUID REFERENCES public.customer_ledger(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (length(trim(reason)) >= 3 AND length(reason) <= 2000),
  corrected_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cob_history_biz_cust_idx 
  ON public.customer_opening_balance_history (business_id, customer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS cob_history_ob_id_idx 
  ON public.customer_opening_balance_history (opening_balance_id);

ALTER TABLE public.customer_opening_balance_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cob_history_select_policy ON public.customer_opening_balance_history;
CREATE POLICY cob_history_select_policy ON public.customer_opening_balance_history
  FOR SELECT USING (
    business_id IN (SELECT business_id FROM public.users WHERE auth_user_id = auth.uid())
    OR auth.role() = 'service_role'
  );

DROP POLICY IF EXISTS cob_history_insert_policy ON public.customer_opening_balance_history;
CREATE POLICY cob_history_insert_policy ON public.customer_opening_balance_history
  FOR INSERT WITH CHECK (
    business_id IN (SELECT business_id FROM public.users WHERE auth_user_id = auth.uid())
    OR auth.role() = 'service_role'
  );

GRANT ALL ON public.customer_opening_balance_history TO service_role;
GRANT SELECT ON public.customer_opening_balance_history TO authenticated;

-- 3. UPDATE recalculate_customer_ledger TO START FROM INITIAL OPENING POSITION
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
  -- Use initial opening balance if present, because any opening balance correction
  -- has already posted a corresponding ADJUSTMENT entry into customer_ledger.
  SELECT * INTO v_ob
  FROM public.customer_opening_balances
  WHERE business_id = p_business_id AND customer_id = p_customer_id
  ORDER BY as_on_date DESC, created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_ob.initial_amount IS NOT NULL THEN
      running_balance := CASE WHEN v_ob.initial_balance_type = 'RECEIVABLE' THEN v_ob.initial_amount ELSE -v_ob.initial_amount END;
    ELSE
      running_balance := CASE WHEN v_ob.balance_type = 'RECEIVABLE' THEN v_ob.amount ELSE -v_ob.amount END;
    END IF;
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

GRANT EXECUTE ON FUNCTION public.recalculate_customer_ledger(UUID, UUID) TO authenticated, service_role;


-- 4. ATOMIC RPC: correct_customer_opening_balance
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.correct_customer_opening_balance(
  p_business_id UUID,
  p_customer_id UUID,
  p_new_amount NUMERIC,
  p_new_balance_type TEXT,
  p_new_as_on_date DATE,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id UUID;
  v_ob RECORD;
  v_clean_reason TEXT;
  v_old_signed NUMERIC;
  v_new_signed NUMERIC;
  v_delta NUMERIC;
  v_adj_type TEXT;
  v_adj_amount NUMERIC;
  v_debit NUMERIC := 0;
  v_credit NUMERIC := 0;
  v_ledger_id UUID := NULL;
  v_history_id UUID;
  v_new_running NUMERIC := 0;
  v_desc TEXT;
BEGIN
  -- 1. Authorization check
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_business_member(p_business_id) THEN
      RAISE EXCEPTION 'FORBIDDEN: business access denied' USING ERRCODE = '42501';
    END IF;

    IF NOT (
      public.has_business_permission(p_business_id, 'customers.edit')
      OR EXISTS (
        SELECT 1
        FROM public.users u
        JOIN public.user_roles ur ON ur.user_id = u.id
        JOIN public.roles r ON r.id = ur.role_id
        WHERE u.auth_user_id = auth.uid()
          AND u.business_id = p_business_id
          AND (lower(r.name) LIKE '%admin%' OR lower(r.name) LIKE '%super%')
      )
    ) THEN
      RAISE EXCEPTION 'FORBIDDEN: only Admin or Super Admin can correct customer opening balance' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Resolve operator ID
  SELECT id INTO actor_id
  FROM public.users
  WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE';

  IF actor_id IS NULL THEN
    SELECT id INTO actor_id
    FROM public.users
    WHERE business_id = p_business_id AND status = 'ACTIVE'
    ORDER BY created_at ASC
    LIMIT 1;
    IF actor_id IS NULL THEN
      RAISE EXCEPTION 'AUTH_REQUIRED: no active user found in business' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 2. Input validation
  IF p_new_amount IS NULL OR p_new_amount < 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: Opening balance amount must be non-negative, got %', p_new_amount USING ERRCODE = '23514';
  END IF;

  IF p_new_balance_type NOT IN ('RECEIVABLE', 'PAYABLE') THEN
    RAISE EXCEPTION 'INVALID_BALANCE_TYPE: Must be RECEIVABLE or PAYABLE, got %', p_new_balance_type USING ERRCODE = '23514';
  END IF;

  IF p_new_as_on_date IS NULL THEN
    RAISE EXCEPTION 'INVALID_DATE: as_on_date is required' USING ERRCODE = '23514';
  END IF;

  v_clean_reason := NULLIF(TRIM(p_reason), '');
  IF v_clean_reason IS NULL OR LENGTH(v_clean_reason) < 3 THEN
    RAISE EXCEPTION 'MANDATORY_REASON_REQUIRED: A valid correction reason of at least 3 characters is mandatory' USING ERRCODE = '23514';
  END IF;

  -- 3. Lock & Retrieve existing opening balance record
  SELECT * INTO v_ob
  FROM public.customer_opening_balances
  WHERE business_id = p_business_id AND customer_id = p_customer_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OPENING_BALANCE_NOT_FOUND: Customer does not have an opening balance record to correct' USING ERRCODE = 'P0002';
  END IF;

  -- Duplicate / no-op detection
  IF v_ob.amount = p_new_amount AND v_ob.balance_type = p_new_balance_type AND v_ob.as_on_date = p_new_as_on_date THEN
    RETURN jsonb_build_object(
      'success', true,
      'no_change', true,
      'message', 'Opening balance values are identical to current effective values. No adjustment posted.',
      'customer_id', p_customer_id,
      'effective_amount', v_ob.amount,
      'effective_balance_type', v_ob.balance_type,
      'as_on_date', v_ob.as_on_date
    );
  END IF;

  -- 4. Calculate Signed Balances & Difference
  -- In accounting: Receivable is Positive (+), Payable is Negative (-)
  v_old_signed := CASE WHEN v_ob.balance_type = 'RECEIVABLE' THEN v_ob.amount ELSE -v_ob.amount END;
  v_new_signed := CASE WHEN p_new_balance_type = 'RECEIVABLE' THEN p_new_amount ELSE -p_new_amount END;
  v_delta := v_new_signed - v_old_signed;

  IF v_delta > 0 THEN
    -- Customer owes more => DEBIT
    v_adj_type := 'DEBIT';
    v_adj_amount := v_delta;
    v_debit := v_delta;
    v_credit := 0;
  ELSIF v_delta < 0 THEN
    -- Customer owes less / business owes more => CREDIT
    v_adj_type := 'CREDIT';
    v_adj_amount := ABS(v_delta);
    v_debit := 0;
    v_credit := ABS(v_delta);
  ELSE
    -- Amount & type didn't change (only date or notes changed)
    v_adj_type := 'NONE';
    v_adj_amount := 0;
    v_debit := 0;
    v_credit := 0;
  END IF;

  -- 5. Post auditable adjustment entry into customer_ledger if financial difference exists
  IF v_adj_amount > 0 THEN
    v_desc := 'Opening Balance Correction: ' || v_clean_reason || ' (Adjusted from ₹' || 
              TO_CHAR(v_ob.amount, 'FM999,999,990.00') || ' ' || v_ob.balance_type || ' to ₹' || 
              TO_CHAR(p_new_amount, 'FM999,999,990.00') || ' ' || p_new_balance_type || ')';

    INSERT INTO public.customer_ledger (
      business_id,
      customer_id,
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
      p_customer_id,
      'ADJUSTMENT',
      v_desc,
      v_debit,
      v_credit,
      0, -- will be recalculated below
      p_new_as_on_date,
      actor_id,
      NOW()
    )
    RETURNING id INTO v_ledger_id;
  END IF;

  -- 6. Insert into customer_opening_balance_history
  INSERT INTO public.customer_opening_balance_history (
    business_id,
    customer_id,
    opening_balance_id,
    old_amount,
    old_balance_type,
    old_as_on_date,
    new_amount,
    new_balance_type,
    new_as_on_date,
    difference_amount,
    adjustment_type,
    adjustment_amount,
    ledger_entry_id,
    reason,
    corrected_by,
    created_at
  ) VALUES (
    p_business_id,
    p_customer_id,
    v_ob.id,
    v_ob.amount,
    v_ob.balance_type,
    v_ob.as_on_date,
    p_new_amount,
    p_new_balance_type,
    p_new_as_on_date,
    v_delta,
    v_adj_type,
    v_adj_amount,
    v_ledger_id,
    v_clean_reason,
    actor_id,
    NOW()
  )
  RETURNING id INTO v_history_id;

  -- 7. Update customer_opening_balances with the new effective opening balance
  UPDATE public.customer_opening_balances
  SET amount = p_new_amount,
      balance_type = p_new_balance_type,
      as_on_date = p_new_as_on_date,
      initial_amount = COALESCE(v_ob.initial_amount, v_ob.amount),
      initial_balance_type = COALESCE(v_ob.initial_balance_type, v_ob.balance_type),
      initial_as_on_date = COALESCE(v_ob.initial_as_on_date, v_ob.as_on_date),
      is_corrected = TRUE,
      correction_count = COALESCE(v_ob.correction_count, 0) + 1,
      notes = COALESCE(notes, '') || ' | Corrected on ' || CURRENT_DATE || ': ' || v_clean_reason,
      updated_at = NOW()
  WHERE id = v_ob.id;

  -- 8. Recalculate subsequent running balances across the customer ledger
  PERFORM public.recalculate_customer_ledger(p_business_id, p_customer_id);

  -- 9. Fetch the newly recalculated ledger balance
  SELECT balance INTO v_new_running
  FROM public.customer_ledger
  WHERE business_id = p_business_id AND customer_id = p_customer_id
  ORDER BY entry_date DESC, created_at DESC, id DESC
  LIMIT 1;

  IF v_new_running IS NULL THEN
    v_new_running := v_new_signed;
  END IF;

  -- 10. Audit log entry
  INSERT INTO public.audit_logs (
    business_id,
    user_id,
    action,
    entity_type,
    entity_id,
    old_data,
    new_data
  ) VALUES (
    p_business_id,
    actor_id,
    'CUSTOMER_OPENING_BALANCE_CORRECTED',
    'customer_opening_balances',
    v_ob.id,
    jsonb_build_object(
      'amount', v_ob.amount,
      'balance_type', v_ob.balance_type,
      'as_on_date', v_ob.as_on_date
    ),
    jsonb_build_object(
      'amount', p_new_amount,
      'balance_type', p_new_balance_type,
      'as_on_date', p_new_as_on_date,
      'difference_amount', v_delta,
      'adjustment_type', v_adj_type,
      'adjustment_amount', v_adj_amount,
      'reason', v_clean_reason,
      'ledger_entry_id', v_ledger_id,
      'history_id', v_history_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'history_id', v_history_id,
    'ledger_entry_id', v_ledger_id,
    'customer_id', p_customer_id,
    'old_amount', v_ob.amount,
    'old_balance_type', v_ob.balance_type,
    'old_as_on_date', v_ob.as_on_date,
    'new_amount', p_new_amount,
    'new_balance_type', p_new_balance_type,
    'new_as_on_date', p_new_as_on_date,
    'difference_amount', v_delta,
    'adjustment_type', v_adj_type,
    'adjustment_amount', v_adj_amount,
    'effective_opening_balance', p_new_amount,
    'effective_opening_type', p_new_balance_type,
    'new_closing_balance', v_new_running
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.correct_customer_opening_balance(UUID, UUID, NUMERIC, TEXT, DATE, TEXT) TO authenticated, service_role;


-- 5. RPC: get_customer_opening_balance_history
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_customer_opening_balance_history(
  p_business_id UUID,
  p_customer_id UUID DEFAULT NULL
)
RETURNS TABLE (
  history_id UUID,
  business_id UUID,
  customer_id UUID,
  customer_name TEXT,
  customer_company TEXT,
  opening_balance_id UUID,
  old_amount NUMERIC,
  old_balance_type TEXT,
  old_as_on_date DATE,
  new_amount NUMERIC,
  new_balance_type TEXT,
  new_as_on_date DATE,
  difference_amount NUMERIC,
  adjustment_type TEXT,
  adjustment_amount NUMERIC,
  ledger_entry_id UUID,
  reason TEXT,
  corrected_by UUID,
  corrected_by_name TEXT,
  corrected_by_email TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_business_member(p_business_id) THEN
      RAISE EXCEPTION 'FORBIDDEN: business access denied' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT 
    h.id AS history_id,
    h.business_id,
    h.customer_id,
    c.name::TEXT AS customer_name,
    c.company_name::TEXT AS customer_company,
    h.opening_balance_id,
    h.old_amount,
    h.old_balance_type,
    h.old_as_on_date,
    h.new_amount,
    h.new_balance_type,
    h.new_as_on_date,
    h.difference_amount,
    h.adjustment_type,
    h.adjustment_amount,
    h.ledger_entry_id,
    h.reason,
    h.corrected_by,
    COALESCE(u.name, 'Admin')::TEXT AS corrected_by_name,
    u.email::TEXT AS corrected_by_email,
    h.created_at
  FROM public.customer_opening_balance_history h
  JOIN public.customers c ON c.id = h.customer_id
  LEFT JOIN public.users u ON u.id = h.corrected_by
  WHERE h.business_id = p_business_id
    AND (p_customer_id IS NULL OR h.customer_id = p_customer_id)
  ORDER BY h.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_customer_opening_balance_history(UUID, UUID) TO authenticated, service_role;

