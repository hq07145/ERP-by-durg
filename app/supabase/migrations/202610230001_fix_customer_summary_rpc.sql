-- Migration: 202610230001_fix_customer_summary_rpc.sql
-- Fix PostgreSQL error 0A000 ("materialize mode required, but it is not allowed in this context")
-- on get_customer_summary RPC by replacing "RETURNS SETOF record" with explicit "RETURNS TABLE (...)"
-- and explicitly qualify table columns to prevent 42702 ("column reference ambiguous") errors.

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
  v_last_date DATE;
  v_last_amount NUMERIC;
BEGIN
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'payments.view') THEN
    RAISE EXCEPTION 'FORBIDDEN: payments.view' USING ERRCODE = '42501';
  END IF;

  -- Get customer identity
  SELECT c.name, c.company_name INTO v_name, v_company
  FROM public.customers c
  WHERE c.id = p_customer_id AND c.business_id = p_business_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CUSTOMER_NOT_FOUND';
  END IF;

  -- Total purchases (sum of invoices in ledger)
  SELECT COALESCE(SUM(cl.debit), 0) INTO v_purchases
  FROM public.customer_ledger cl
  WHERE cl.business_id = p_business_id
    AND cl.customer_id = p_customer_id
    AND cl.entry_type = 'INVOICE';

  -- Total paid (sum of payments in ledger)
  SELECT COALESCE(SUM(cl.credit), 0) INTO v_paid
  FROM public.customer_ledger cl
  WHERE cl.business_id = p_business_id
    AND cl.customer_id = p_customer_id
    AND cl.entry_type = 'PAYMENT';

  -- Last payment info
  SELECT cl.entry_date, cl.credit INTO v_last_date, v_last_amount
  FROM public.customer_ledger cl
  WHERE cl.business_id = p_business_id
    AND cl.customer_id = p_customer_id
    AND cl.entry_type = 'PAYMENT'
  ORDER BY cl.entry_date DESC, cl.created_at DESC
  LIMIT 1;

  RETURN QUERY SELECT
    p_customer_id,
    v_name::text,
    v_company::text,
    v_purchases,
    v_paid,
    (v_purchases - v_paid),
    v_last_date,
    v_last_amount;
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_summary(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_summary(uuid, uuid) TO authenticated, service_role;
