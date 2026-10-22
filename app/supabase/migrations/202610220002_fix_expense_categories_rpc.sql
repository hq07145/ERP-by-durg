-- Migration: 202610220002_fix_expense_categories_rpc.sql
-- Fix PostgreSQL error 0A000 ("materialize mode required, but it is not allowed in this context")
-- on get_expense_categories and list_expenses RPCs by specifying explicit RETURNS TABLE signatures

-- 1. Fix get_expense_categories
DROP FUNCTION IF EXISTS public.get_expense_categories(uuid);

CREATE OR REPLACE FUNCTION public.get_expense_categories(
  p_business_id UUID
)
RETURNS TABLE (
  category TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'expenses.view') THEN
    RAISE EXCEPTION 'FORBIDDEN: expenses.view' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT DISTINCT e.category::text
  FROM public.expenses e
  WHERE e.business_id = p_business_id
    AND e.status != 'VOIDED'
  ORDER BY e.category::text;
END;
$$;

-- 2. Fix list_expenses
DROP FUNCTION IF EXISTS public.list_expenses(uuid, text, text, date, date, integer, integer);

CREATE OR REPLACE FUNCTION public.list_expenses(
  p_business_id UUID,
  p_category TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  business_id UUID,
  category TEXT,
  amount NUMERIC,
  expense_date DATE,
  description TEXT,
  reference TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  created_by_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'expenses.view') THEN
    RAISE EXCEPTION 'FORBIDDEN: expenses.view' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.business_id,
    e.category::text,
    e.amount,
    e.expense_date,
    e.description::text,
    e.reference::text,
    e.status::text,
    e.created_at,
    e.updated_at,
    u.name::text as created_by_name
  FROM public.expenses e
  LEFT JOIN public.users u ON u.id = e.created_by
  WHERE e.business_id = p_business_id
    AND (p_category IS NULL OR e.category = p_category)
    AND (p_status IS NULL OR e.status = p_status)
    AND (p_start_date IS NULL OR e.expense_date >= p_start_date)
    AND (p_end_date IS NULL OR e.expense_date <= p_end_date)
  ORDER BY e.expense_date DESC, e.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;
