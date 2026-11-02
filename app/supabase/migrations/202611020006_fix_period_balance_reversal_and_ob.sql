-- ====================================================================
-- MIGRATION: 202611020006_fix_period_balance_reversal_and_ob.sql
-- PURPOSE:
--   1. Reconcile get_customer_period_balance() with get_customer_summary() (All Time vs Fiscal Year):
--      - Net Period Sales: Subtract compensating reversal adjustments (undelivered/cancelled orders)
--        from invoice debits so undelivered orders (e.g. ORD-000007) do not inflate net sales.
--      - Ensure reversal credits are not counted as cash payments.
--      - Ensure customer opening balance established within or prior to the period
--        is properly incorporated into period opening balance and closing advance.
--      - Ensure closing balance uses true ledger position calculate_customer_balance_as_of(p_end_date).
-- ====================================================================

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
  v_bal_before NUMERIC := 0;
  v_opening NUMERIC := 0;
  v_ob RECORD;
  v_inv_debits NUMERIC := 0;
  v_inv_reversals NUMERIC := 0;
  v_sales NUMERIC := 0;
  v_excess_reversals NUMERIC := 0;
  v_payments NUMERIC := 0;
  v_other_credits NUMERIC := 0;
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

  -- 1. Calculate opening balance as of the start of the period
  v_bal_before := public.calculate_customer_balance_as_of(p_business_id, p_customer_id, v_day_before);

  IF v_bal_before != 0 THEN
    v_opening := v_bal_before;
  ELSE
    SELECT * INTO v_ob
    FROM public.customer_opening_balances
    WHERE business_id = p_business_id
      AND customer_id = p_customer_id
      AND as_on_date >= p_start_date
      AND as_on_date <= p_end_date
    ORDER BY as_on_date ASC, created_at ASC
    LIMIT 1;

    IF FOUND THEN
      v_opening := CASE
        WHEN COALESCE(v_ob.initial_balance_type, v_ob.balance_type) = 'RECEIVABLE'
          THEN COALESCE(v_ob.initial_amount, v_ob.amount)
        ELSE
          -COALESCE(v_ob.initial_amount, v_ob.amount)
      END;
    ELSE
      SELECT * INTO v_ob
      FROM public.customer_opening_balances
      WHERE business_id = p_business_id
        AND customer_id = p_customer_id
        AND as_on_date = p_start_date
      ORDER BY created_at DESC
      LIMIT 1;

      IF FOUND THEN
        v_opening := CASE
          WHEN COALESCE(v_ob.initial_balance_type, v_ob.balance_type) = 'RECEIVABLE'
            THEN COALESCE(v_ob.initial_amount, v_ob.amount)
          ELSE
            -COALESCE(v_ob.initial_amount, v_ob.amount)
        END;
      ELSE
        v_opening := 0;
      END IF;
    END IF;
  END IF;

  -- 2. Transactions strictly within the period [p_start_date, p_end_date]
  -- A. Invoices & compensating reversals
  SELECT COALESCE(SUM(debit), 0) INTO v_inv_debits
  FROM public.customer_ledger
  WHERE business_id = p_business_id
    AND customer_id = p_customer_id
    AND entry_date >= p_start_date
    AND entry_date <= p_end_date
    AND entry_type = 'INVOICE';

  SELECT COALESCE(SUM(credit), 0) INTO v_inv_reversals
  FROM public.customer_ledger
  WHERE business_id = p_business_id
    AND customer_id = p_customer_id
    AND entry_date >= p_start_date
    AND entry_date <= p_end_date
    AND entry_type = 'ADJUSTMENT'
    AND (order_id IS NOT NULL OR delivery_id IS NOT NULL);

  IF v_inv_debits >= v_inv_reversals THEN
    v_sales := v_inv_debits - v_inv_reversals;
    v_excess_reversals := 0;
  ELSE
    v_sales := 0;
    v_excess_reversals := v_inv_reversals - v_inv_debits;
  END IF;

  -- B. Payments received
  SELECT COALESCE(SUM(credit), 0) INTO v_payments
  FROM public.customer_ledger
  WHERE business_id = p_business_id
    AND customer_id = p_customer_id
    AND entry_date >= p_start_date
    AND entry_date <= p_end_date
    AND entry_type = 'PAYMENT';

  -- C. Other credits (Credit notes, non-invoice adjustments, and any excess reversals)
  SELECT COALESCE(SUM(credit), 0) INTO v_other_credits
  FROM public.customer_ledger cl
  WHERE cl.business_id = p_business_id
    AND cl.customer_id = p_customer_id
    AND cl.entry_date >= p_start_date
    AND cl.entry_date <= p_end_date
    AND (
      cl.entry_type = 'CREDIT_NOTE'
      OR (cl.entry_type = 'ADJUSTMENT' AND cl.order_id IS NULL AND cl.delivery_id IS NULL)
    );

  v_credit_adj := v_other_credits + v_excess_reversals;

  -- D. Other debit adjustments
  SELECT COALESCE(SUM(debit), 0) INTO v_debit_adj
  FROM public.customer_ledger cl
  WHERE cl.business_id = p_business_id
    AND cl.customer_id = p_customer_id
    AND cl.entry_date >= p_start_date
    AND cl.entry_date <= p_end_date
    AND cl.entry_type = 'DEBIT_NOTE';

  -- 3. Closing balance calculation as of p_end_date
  v_closing := public.calculate_customer_balance_as_of(p_business_id, p_customer_id, p_end_date);

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
    ABS(v_opening),
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
