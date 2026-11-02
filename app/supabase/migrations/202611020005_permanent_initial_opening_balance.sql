-- ====================================================================
-- MIGRATION: 202611020005_permanent_initial_opening_balance.sql
-- PURPOSE:
--   1. Ensure Customer Opening Balance summary metrics ALWAYS display the
--      permanent original saved values (initial_amount, initial_balance_type, initial_as_on_date).
--   2. Keep Opening Balance strictly independent from running ledger balances,
--      payments, orders, deliveries, or advance calculations.
--   3. Ensure get_customer_period_balance never returns a negative opening_balance.
-- ====================================================================

-- 1. DROP and RECREATE get_customer_summary() with permanent original opening balance fields
DROP FUNCTION IF EXISTS public.get_customer_summary(UUID, UUID);

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
  last_payment_amount NUMERIC,
  initial_opening_balance_amount NUMERIC,
  initial_opening_balance_type TEXT,
  initial_opening_balance_date DATE,
  effective_opening_balance_amount NUMERIC,
  effective_opening_balance_type TEXT,
  effective_opening_balance_date DATE,
  is_opening_balance_corrected BOOLEAN
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
  v_init_ob_amount NUMERIC := 0;
  v_init_ob_type TEXT := NULL;
  v_init_ob_date DATE := NULL;
  v_eff_ob_amount NUMERIC := 0;
  v_eff_ob_type TEXT := NULL;
  v_eff_ob_date DATE := NULL;
  v_is_corrected BOOLEAN := FALSE;
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

  -- 1. Retrieve Opening Balance record (Original baseline & Effective corrected)
  SELECT * INTO v_ob
  FROM public.customer_opening_balances
  WHERE business_id = p_business_id
    AND customer_id = p_customer_id
  ORDER BY as_on_date DESC, created_at DESC
  LIMIT 1;

  IF FOUND THEN
    -- Permanent Original Baseline Values
    v_init_ob_amount := COALESCE(v_ob.initial_amount, v_ob.amount);
    v_init_ob_type   := COALESCE(v_ob.initial_balance_type, v_ob.balance_type);
    v_init_ob_date   := COALESCE(v_ob.initial_as_on_date, v_ob.as_on_date);

    -- Effective Values (Post-correction)
    v_eff_ob_amount  := v_ob.amount;
    v_eff_ob_type    := v_ob.balance_type;
    v_eff_ob_date    := v_ob.as_on_date;
    v_is_corrected   := COALESCE(v_ob.is_corrected, FALSE);
  END IF;

  -- 2. Total Invoiced Purchases from Ledger:
  -- Sum of invoice debits minus compensating reversal adjustments
  SELECT GREATEST(0, COALESCE(
    SUM(CASE WHEN cl.entry_type = 'INVOICE' THEN cl.debit ELSE 0 END) -
    SUM(CASE WHEN cl.entry_type = 'ADJUSTMENT' AND (cl.order_id IS NOT NULL OR cl.delivery_id IS NOT NULL) THEN cl.credit ELSE 0 END),
    0
  )) INTO v_purchases
  FROM public.customer_ledger cl
  WHERE cl.business_id = p_business_id
    AND cl.customer_id = p_customer_id;

  -- 3. Total Cleared Payments Received
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

  -- 4. Advance calculations from payments
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

  -- 5. Net closing ledger balance (Closing Receivable vs Available Advance)
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

  -- 6. Last payment info
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
    v_init_ob_amount,    -- opening_balance_amount is ALWAYS the permanent original baseline
    v_init_ob_type,      -- opening_balance_type is ALWAYS the permanent original baseline
    v_init_ob_date,      -- opening_balance_date is ALWAYS the permanent original baseline
    v_warning,
    v_last_date,
    v_last_amount,
    v_init_ob_amount,    -- initial_opening_balance_amount
    v_init_ob_type,      -- initial_opening_balance_type
    v_init_ob_date,      -- initial_opening_balance_date
    v_eff_ob_amount,     -- effective_opening_balance_amount
    v_eff_ob_type,       -- effective_opening_balance_type
    v_eff_ob_date,       -- effective_opening_balance_date
    v_is_corrected;      -- is_opening_balance_corrected
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_summary(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_summary(UUID, UUID) TO authenticated, service_role;


-- 2. UPDATE get_customer_period_balance() TO NEVER RETURN NEGATIVE opening_balance
CREATE OR REPLACE FUNCTION public.get_customer_period_balance(
  p_business_id UUID,
  p_customer_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  customer_id UUID,
  period_start_date DATE,
  period_end_date DATE,
  day_before_start DATE,
  opening_balance NUMERIC,
  opening_balance_type TEXT,
  period_sales NUMERIC,
  period_payments NUMERIC,
  period_credits_adjustments NUMERIC,
  period_debits_adjustments NUMERIC,
  period_net_change NUMERIC,
  closing_balance NUMERIC,
  closing_balance_type TEXT,
  closing_due NUMERIC,
  closing_advance NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_day_before DATE;
  v_opening NUMERIC := 0;
  v_sales NUMERIC := 0;
  v_payments NUMERIC := 0;
  v_credit_adj NUMERIC := 0;
  v_debit_adj NUMERIC := 0;
  v_closing NUMERIC := 0;
  v_closing_due NUMERIC := 0;
  v_closing_adv NUMERIC := 0;
BEGIN
  IF p_start_date > p_end_date THEN
    RAISE EXCEPTION 'INVALID_DATE_RANGE: start_date cannot be greater than end_date';
  END IF;

  v_day_before := p_start_date - 1;

  -- 1. Calculate opening balance as of the day before the start date
  IF EXISTS (
    SELECT 1 FROM public.customer_opening_balances
    WHERE business_id = p_business_id AND customer_id = p_customer_id AND as_on_date = p_start_date
  ) THEN
    SELECT 
      CASE WHEN balance_type = 'RECEIVABLE' THEN amount ELSE -amount END
    INTO v_opening
    FROM public.customer_opening_balances
    WHERE business_id = p_business_id AND customer_id = p_customer_id AND as_on_date = p_start_date
    ORDER BY created_at DESC LIMIT 1;
  ELSE
    v_opening := public.calculate_customer_balance_as_of(p_business_id, p_customer_id, v_day_before);
  END IF;

  -- 2. Transactions strictly within the period [p_start_date, p_end_date]
  -- A. Sales / Invoices
  SELECT COALESCE(SUM(debit), 0) INTO v_sales
  FROM public.customer_ledger
  WHERE business_id = p_business_id
    AND customer_id = p_customer_id
    AND entry_date >= p_start_date
    AND entry_date <= p_end_date
    AND entry_type = 'INVOICE';

  -- B. Payments received
  SELECT COALESCE(SUM(credit), 0) INTO v_payments
  FROM public.customer_ledger
  WHERE business_id = p_business_id
    AND customer_id = p_customer_id
    AND entry_date >= p_start_date
    AND entry_date <= p_end_date
    AND entry_type = 'PAYMENT';

  -- C. Credit notes and negative adjustments (reduces customer receivable)
  SELECT COALESCE(SUM(credit), 0) INTO v_credit_adj
  FROM public.customer_ledger
  WHERE business_id = p_business_id
    AND customer_id = p_customer_id
    AND entry_date >= p_start_date
    AND entry_date <= p_end_date
    AND entry_type IN ('CREDIT_NOTE', 'ADJUSTMENT');

  -- D. Debit notes and positive adjustments (increases customer receivable)
  SELECT COALESCE(SUM(debit), 0) INTO v_debit_adj
  FROM public.customer_ledger
  WHERE business_id = p_business_id
    AND customer_id = p_customer_id
    AND entry_date >= p_start_date
    AND entry_date <= p_end_date
    AND entry_type = 'DEBIT_NOTE';

  -- 3. Calculate closing balance:
  v_closing := v_opening + v_sales + v_debit_adj - v_payments - v_credit_adj;

  -- 4. Distinguish advance from due:
  IF v_closing > 0 THEN
    v_closing_due := v_closing;
    v_closing_adv := 0;
  ELSIF v_closing < 0 THEN
    v_closing_due := 0;
    v_closing_adv := ABS(v_closing);
  ELSE
    v_closing_due := 0;
    v_closing_adv := 0;
  END IF;

  RETURN QUERY SELECT
    p_customer_id,
    p_start_date,
    p_end_date,
    v_day_before,
    ABS(v_opening), -- ALWAYS non-negative magnitude
    (CASE WHEN v_opening >= 0 THEN 'RECEIVABLE' ELSE 'PAYABLE' END)::TEXT,
    v_sales,
    v_payments,
    v_credit_adj,
    v_debit_adj,
    (v_sales + v_debit_adj - v_payments - v_credit_adj),
    v_closing,
    (CASE WHEN v_closing >= 0 THEN 'RECEIVABLE' ELSE 'PAYABLE' END)::TEXT,
    v_closing_due,
    v_closing_adv;
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_period_balance(UUID, UUID, DATE, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_period_balance(UUID, UUID, DATE, DATE) TO authenticated, service_role;

