-- ====================================================================
-- Migration: 202610280008_fix_customer_ledger_and_summary_audit.sql
-- Description:
--   1. Update get_customer_summary to count all cleared receipts, including
--      unlinked/legacy payment credits in customer_ledger (entry_type = 'PAYMENT' AND payment_id IS NULL)
--      and accurately reconcile advance balance with net ledger position.
--   2. Update recalculate_customer_ledger with opening balance incorporation
--      and deterministic tie-breaking (ORDER BY entry_date ASC, created_at ASC, id ASC).
--   3. Update get_customer_ledger with deterministic tie-breaking
--      (ORDER BY cl.entry_date DESC, cl.created_at DESC, cl.id DESC).
-- ====================================================================

-- 1. Overhaul get_customer_summary RPC
DROP FUNCTION IF EXISTS public.get_customer_summary(uuid, uuid);

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
  v_orders_sum NUMERIC := 0;
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

  -- 1. Identity
  SELECT c.name, c.company_name INTO v_name, v_company
  FROM public.customers c
  WHERE c.id = p_customer_id AND c.business_id = p_business_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CUSTOMER_NOT_FOUND';
  END IF;

  -- 2. Fetch configured opening balance (if any)
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

  -- 3. Total Invoiced Purchases from Orders and Ledger
  SELECT COALESCE(SUM(o.total_amount), 0) INTO v_orders_sum
  FROM public.orders o
  WHERE o.business_id = p_business_id
    AND o.customer_id = p_customer_id
    AND o.status NOT IN ('CANCELLED');

  SELECT COALESCE(SUM(cl.debit), 0) INTO v_ledger_invoices
  FROM public.customer_ledger cl
  WHERE cl.business_id = p_business_id
    AND cl.customer_id = p_customer_id
    AND cl.entry_type = 'INVOICE';

  v_purchases := GREATEST(v_orders_sum, v_ledger_invoices);

  -- 4. Total Cleared Payments Received
  -- Payments table (cleared receipts)
  SELECT COALESCE(SUM(p.amount), 0) INTO v_paid_payments
  FROM public.payments p
  WHERE p.business_id = p_business_id
    AND p.customer_id = p_customer_id
    AND p.status = 'SUCCESS';

  -- Plus unlinked payment credits in customer_ledger (legacy / preserved receipts)
  SELECT COALESCE(SUM(cl.credit), 0) INTO v_paid_unlinked
  FROM public.customer_ledger cl
  WHERE cl.business_id = p_business_id
    AND cl.customer_id = p_customer_id
    AND cl.entry_type = 'PAYMENT'
    AND cl.payment_id IS NULL;

  v_paid := v_paid_payments + v_paid_unlinked;

  -- 5. Advance calculations from payments & unlinked advance receipts
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

  -- 6. Outstanding Due & Available Advance Calculation
  -- Net closing ledger balance:
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

  -- 7. Last payment info
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

-- 2. Update recalculate_customer_ledger with opening balance & deterministic tie-breaking
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
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'payments.edit') THEN
    RAISE EXCEPTION 'FORBIDDEN: payments.edit' USING ERRCODE = '42501';
  END IF;

  -- Incorporate opening balance if configured
  SELECT * INTO v_ob
  FROM public.customer_opening_balances
  WHERE business_id = p_business_id AND customer_id = p_customer_id
  ORDER BY as_on_date DESC, created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_ob.balance_type = 'RECEIVABLE' THEN
      running_balance := v_ob.amount;
    ELSE
      running_balance := -v_ob.amount;
    END IF;
  END IF;

  -- Update balances in chronological order with deterministic sort: entry_date, created_at, id
  FOR ledger_rec IN
    SELECT id, debit, credit
    FROM public.customer_ledger
    WHERE business_id = p_business_id AND customer_id = p_customer_id
    ORDER BY entry_date ASC, created_at ASC, id ASC
  LOOP
    running_balance := running_balance + ledger_rec.debit - ledger_rec.credit;
    UPDATE public.customer_ledger
    SET balance = running_balance
    WHERE id = ledger_rec.id;
  END LOOP;
END;
$$;

-- 3. Update get_customer_ledger with stable secondary sort
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
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'payments.view') THEN
    RAISE EXCEPTION 'FORBIDDEN: payments.view' USING ERRCODE = '42501';
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
  WHERE cl.business_id = p_business_id
    AND cl.customer_id = p_customer_id
  ORDER BY cl.entry_date DESC, cl.created_at DESC, cl.id DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_ledger(uuid, uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_ledger(uuid, uuid, integer, integer) TO authenticated, service_role;
