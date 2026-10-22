-- Migration: 202610220001_fix_payment_details_rpc.sql
-- Fix PostgreSQL error 0A000 ("materialize mode required, but it is not allowed in this context")
-- Caused by functions declared as "RETURNS SETOF record" invoked via PostgREST RPC.
-- Replace with explicit "RETURNS TABLE (...)" return signatures.

-- 1. Fix get_payment_with_details
DROP FUNCTION IF EXISTS public.get_payment_with_details(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_payment_with_details(
  p_business_id UUID,
  p_payment_id UUID
)
RETURNS TABLE (
  id UUID,
  business_id UUID,
  customer_id UUID,
  customer_name TEXT,
  customer_company TEXT,
  order_id UUID,
  order_number TEXT,
  payment_number TEXT,
  amount NUMERIC,
  payment_date DATE,
  payment_method TEXT,
  reference TEXT,
  notes TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
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
    p.id,
    p.business_id,
    p.customer_id,
    c.name::text as customer_name,
    c.company_name::text as customer_company,
    p.order_id,
    o.order_number::text,
    p.payment_number::text,
    p.amount,
    p.payment_date,
    p.payment_method::text,
    p.reference::text,
    p.notes::text,
    p.status::text,
    p.created_at,
    p.updated_at
  FROM public.payments p
  JOIN public.customers c ON c.id = p.customer_id AND c.business_id = p_business_id
  LEFT JOIN public.orders o ON o.id = p.order_id AND o.business_id = p_business_id
  WHERE p.id = p_payment_id AND p.business_id = p_business_id;
END;
$$;

-- 2. Fix list_payments
DROP FUNCTION IF EXISTS public.list_payments(uuid, text, uuid, uuid, integer, integer);

CREATE OR REPLACE FUNCTION public.list_payments(
  p_business_id UUID,
  p_status TEXT DEFAULT NULL,
  p_customer_id UUID DEFAULT NULL,
  p_order_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  business_id UUID,
  customer_id UUID,
  customer_name TEXT,
  customer_company TEXT,
  order_id UUID,
  order_number TEXT,
  payment_number TEXT,
  amount NUMERIC,
  payment_date DATE,
  payment_method TEXT,
  reference TEXT,
  status TEXT,
  created_at TIMESTAMPTZ
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
    p.id,
    p.business_id,
    p.customer_id,
    c.name::text as customer_name,
    c.company_name::text as customer_company,
    p.order_id,
    o.order_number::text,
    p.payment_number::text,
    p.amount,
    p.payment_date,
    p.payment_method::text,
    p.reference::text,
    p.status::text,
    p.created_at
  FROM public.payments p
  JOIN public.customers c ON c.id = p.customer_id AND c.business_id = p_business_id
  LEFT JOIN public.orders o ON o.id = p.order_id AND o.business_id = p_business_id
  WHERE p.business_id = p_business_id
    AND (p_status IS NULL OR p.status = p_status)
    AND (p_customer_id IS NULL OR p.customer_id = p_customer_id)
    AND (p_order_id IS NULL OR p.order_id = p_order_id)
  ORDER BY p.payment_date DESC, p.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- 3. Fix get_customer_ledger
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
  ORDER BY cl.entry_date DESC, cl.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;
