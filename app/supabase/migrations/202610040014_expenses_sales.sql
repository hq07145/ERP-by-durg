BEGIN;

-- ============================================
-- EXPENSES & SALES REPORTING
-- ============================================

-- Expenses table
CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  category TEXT NOT NULL CHECK (length(category) BETWEEN 1 AND 128),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  description TEXT CHECK (description IS NULL OR length(description) <= 2000),
  reference TEXT CHECK (reference IS NULL OR length(reference) <= 128),
  status TEXT NOT NULL DEFAULT 'POSTED' CHECK (status IN ('DRAFT', 'POSTED', 'VOIDED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT
);

CREATE INDEX expenses_business_id_idx ON public.expenses (business_id);
CREATE INDEX expenses_business_category_idx ON public.expenses (business_id, category);
CREATE INDEX expenses_business_date_idx ON public.expenses (business_id, expense_date DESC);
CREATE INDEX expenses_business_status_idx ON public.expenses (business_id, status);

-- ============================================
-- TRIGGER FOR UPDATED_AT
-- ============================================
CREATE TRIGGER expenses_touch_updated_at BEFORE UPDATE ON public.expenses FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================
-- PERMISSIONS
-- ============================================
INSERT INTO public.permissions (module, action, description) VALUES
  ('expenses', 'view', 'View business expenses'),
  ('expenses', 'create', 'Create expenses'),
  ('expenses', 'edit', 'Edit expenses'),
  ('expenses', 'delete', 'Delete/void expenses')
ON CONFLICT (module, action) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.module = 'expenses'
WHERE replace(lower(trim(r.name)), ' ', '_') IN ('super_admin', 'admin', 'manager')
  AND p.action IN ('view', 'create')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.module = 'expenses' AND p.action = 'edit'
WHERE replace(lower(trim(r.name)), ' ', '_') IN ('super_admin', 'admin', 'manager')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.module = 'expenses' AND p.action = 'delete'
WHERE replace(lower(trim(r.name)), ' ', '_') = 'super_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.expenses TO authenticated;
REVOKE DELETE ON public.expenses FROM anon, authenticated;
GRANT ALL ON public.expenses TO service_role;

DO $$
DECLARE policy_record RECORD;
BEGIN
  FOR policy_record IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'expenses'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', policy_record.policyname, policy_record.tablename);
  END LOOP;
END;
$$;

CREATE POLICY expenses_select_business ON public.expenses
FOR SELECT USING (
  public.is_business_member(business_id)
  AND public.has_business_permission(business_id, 'expenses.view')
);

CREATE POLICY expenses_insert_business ON public.expenses
FOR INSERT WITH CHECK (
  public.is_business_member(business_id)
  AND public.has_business_permission(business_id, 'expenses.create')
);

CREATE POLICY expenses_update_business ON public.expenses
FOR UPDATE USING (
  public.is_business_member(business_id)
  AND public.has_business_permission(business_id, 'expenses.edit')
)
WITH CHECK (
  public.is_business_member(business_id)
  AND public.has_business_permission(business_id, 'expenses.edit')
);

-- ============================================
-- RPC: Create expense
-- ============================================
CREATE OR REPLACE FUNCTION public.create_expense(
  p_business_id UUID,
  p_category TEXT,
  p_amount NUMERIC,
  p_expense_date DATE,
  p_description TEXT DEFAULT NULL,
  p_reference TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'POSTED'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expense_id UUID;
  actor_id UUID;
BEGIN
  -- Check permissions
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'expenses.create') THEN
    RAISE EXCEPTION 'FORBIDDEN: expenses.create' USING ERRCODE = '42501';
  END IF;

  -- Get actor
  SELECT id INTO actor_id
  FROM public.users
  WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE';
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  -- Validate amount
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = '23514';
  END IF;

  -- Create expense
  INSERT INTO public.expenses (
    business_id, category, amount, expense_date, description, reference, status, created_by
  ) VALUES (
    p_business_id, p_category, p_amount, p_expense_date, p_description, p_reference, p_status, actor_id
  ) RETURNING id INTO expense_id;

  -- Audit log
  INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, new_data)
  VALUES (p_business_id, actor_id, 'EXPENSE_CREATED', 'expense', expense_id,
    jsonb_build_object(
      'category', p_category,
      'amount', p_amount,
      'expense_date', p_expense_date,
      'description', p_description,
      'reference', p_reference,
      'status', p_status
    ));

  RETURN expense_id;
END;
$$;

-- ============================================
-- RPC: Update expense
-- ============================================
CREATE OR REPLACE FUNCTION public.update_expense(
  p_business_id UUID,
  p_expense_id UUID,
  p_category TEXT DEFAULT NULL,
  p_amount NUMERIC DEFAULT NULL,
  p_expense_date DATE DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_reference TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expense_rec RECORD;
  actor_id UUID;
BEGIN
  -- Check permissions
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'expenses.edit') THEN
    RAISE EXCEPTION 'FORBIDDEN: expenses.edit' USING ERRCODE = '42501';
  END IF;

  -- Get actor
  SELECT id INTO actor_id
  FROM public.users
  WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE';
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  -- Get and lock expense
  SELECT * INTO expense_rec
  FROM public.expenses
  WHERE id = p_expense_id AND business_id = p_business_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EXPENSE_NOT_FOUND';
  END IF;

  -- Validate amount
  IF p_amount IS NOT NULL AND p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = '23514';
  END IF;

  -- Update expense
  UPDATE public.expenses SET
    category = COALESCE(p_category, category),
    amount = COALESCE(p_amount, amount),
    expense_date = COALESCE(p_expense_date, expense_date),
    description = COALESCE(p_description, description),
    reference = COALESCE(p_reference, reference),
    status = COALESCE(p_status, status),
    updated_at = NOW()
  WHERE id = p_expense_id AND business_id = p_business_id;

  -- Audit log
  INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (p_business_id, actor_id, 'EXPENSE_UPDATED', 'expense', p_expense_id,
    jsonb_build_object(
      'category', expense_rec.category,
      'amount', expense_rec.amount,
      'expense_date', expense_rec.expense_date,
      'description', expense_rec.description,
      'reference', expense_rec.reference,
      'status', expense_rec.status
    ),
    jsonb_build_object(
      'category', COALESCE(p_category, expense_rec.category),
      'amount', COALESCE(p_amount, expense_rec.amount),
      'expense_date', COALESCE(p_expense_date, expense_rec.expense_date),
      'description', COALESCE(p_description, expense_rec.description),
      'reference', COALESCE(p_reference, expense_rec.reference),
      'status', COALESCE(p_status, expense_rec.status)
    ));
END;
$$;

-- ============================================
-- RPC: Delete/void expense
-- ============================================
CREATE OR REPLACE FUNCTION public.delete_expense(
  p_business_id UUID,
  p_expense_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expense_rec RECORD;
  actor_id UUID;
BEGIN
  -- Check permissions
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'expenses.delete') THEN
    RAISE EXCEPTION 'FORBIDDEN: expenses.delete' USING ERRCODE = '42501';
  END IF;

  -- Get actor
  SELECT id INTO actor_id
  FROM public.users
  WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE';
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  -- Get and lock expense
  SELECT * INTO expense_rec
  FROM public.expenses
  WHERE id = p_expense_id AND business_id = p_business_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'EXPENSE_NOT_FOUND';
  END IF;

  -- Soft delete by setting status to VOIDED
  UPDATE public.expenses
  SET status = 'VOIDED',
      description = COALESCE(description, '') || ' [VOIDED: ' || p_reason || ']',
      updated_at = NOW()
  WHERE id = p_expense_id AND business_id = p_business_id;

  -- Audit log
  INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (p_business_id, actor_id, 'EXPENSE_DELETED', 'expense', p_expense_id,
    jsonb_build_object(
      'category', expense_rec.category,
      'amount', expense_rec.amount,
      'expense_date', expense_rec.expense_date,
      'status', expense_rec.status,
      'reason', p_reason
    ),
    jsonb_build_object('status', 'VOIDED', 'deleted', true));
END;
$$;

-- ============================================
-- RPC: List expenses with filters
-- ============================================
CREATE OR REPLACE FUNCTION public.list_expenses(
  p_business_id UUID,
  p_category TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS SETOF record
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
    e.category,
    e.amount,
    e.expense_date,
    e.description,
    e.reference,
    e.status,
    e.created_at,
    e.updated_at,
    u.name as created_by_name
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

-- ============================================
-- RPC: Get expense categories
-- ============================================
CREATE OR REPLACE FUNCTION public.get_expense_categories(
  p_business_id UUID
)
RETURNS SETOF record
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'expenses.view') THEN
    RAISE EXCEPTION 'FORBIDDEN: expenses.view' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT DISTINCT category
  FROM public.expenses
  WHERE business_id = p_business_id
    AND status != 'VOIDED'
  ORDER BY category;
END;
$$;

-- ============================================
-- RPC: Get sales summary (derived from orders)
-- ============================================
CREATE OR REPLACE FUNCTION public.get_sales_summary(
  p_business_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_customer_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL
)
RETURNS SETOF record
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'orders.view') THEN
    RAISE EXCEPTION 'FORBIDDEN: orders.view' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(o.subtotal), 0) as gross_sales,
    COALESCE(SUM(o.discount_amount), 0) as discounts,
    COALESCE(SUM(o.tax_amount), 0) as tax,
    COALESCE(SUM(o.total_amount), 0) as net_sales,
    COALESCE(SUM(o.paid_amount), 0) as payments_received,
    COALESCE(SUM(o.due_amount), 0) as outstanding,
    COUNT(o.id) as order_count
  FROM public.orders o
  WHERE o.business_id = p_business_id
    AND (
      CASE
        WHEN p_status IS NOT NULL THEN o.status = p_status
        ELSE o.status = 'CONFIRMED'
      END
    )
    AND (p_start_date IS NULL OR o.order_date >= p_start_date)
    AND (p_end_date IS NULL OR o.order_date <= p_end_date)
    AND (p_customer_id IS NULL OR o.customer_id = p_customer_id);
END;
$$;

-- ============================================
-- RPC: Get expenses summary
-- ============================================
CREATE OR REPLACE FUNCTION public.get_expenses_summary(
  p_business_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_category TEXT DEFAULT NULL
)
RETURNS SETOF record
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
    COALESCE(SUM(e.amount), 0) as total_expenses,
    COUNT(e.id) as expense_count
  FROM public.expenses e
  WHERE e.business_id = p_business_id
    AND e.status = 'POSTED'
    AND (p_start_date IS NULL OR e.expense_date >= p_start_date)
    AND (p_end_date IS NULL OR e.expense_date <= p_end_date)
    AND (p_category IS NULL OR e.category = p_category);
END;
$$;

-- ============================================
-- RPC: Get expenses by category
-- ============================================
CREATE OR REPLACE FUNCTION public.get_expenses_by_category(
  p_business_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS SETOF record
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
    e.category,
    COALESCE(SUM(e.amount), 0) as total_amount,
    COUNT(e.id) as expense_count
  FROM public.expenses e
  WHERE e.business_id = p_business_id
    AND e.status = 'POSTED'
    AND (p_start_date IS NULL OR e.expense_date >= p_start_date)
    AND (p_end_date IS NULL OR e.expense_date <= p_end_date)
  GROUP BY e.category
  ORDER BY total_amount DESC;
END;
$$;

-- ============================================
-- RPC: Get profit summary (sales - expenses)
-- ============================================
CREATE OR REPLACE FUNCTION public.get_profit_summary(
  p_business_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
)
RETURNS SETOF record
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sales_rec RECORD;
  expense_rec RECORD;
BEGIN
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'orders.view') THEN
    RAISE EXCEPTION 'FORBIDDEN: orders.view' USING ERRCODE = '42501';
  END IF;

  -- Get sales summary
  SELECT * INTO sales_rec
  FROM public.get_sales_summary(p_business_id, p_start_date, p_end_date, NULL, NULL)
  LIMIT 1;

  -- Get expenses summary
  SELECT * INTO expense_rec
  FROM public.get_expenses_summary(p_business_id, p_start_date, p_end_date, NULL)
  LIMIT 1;

  RETURN QUERY SELECT
    COALESCE(sales_rec.gross_sales, 0) as gross_sales,
    COALESCE(sales_rec.discounts, 0) as discounts,
    COALESCE(sales_rec.tax, 0) as tax,
    COALESCE(sales_rec.net_sales, 0) as net_sales,
    COALESCE(sales_rec.payments_received, 0) as payments_received,
    COALESCE(sales_rec.outstanding, 0) as outstanding,
    COALESCE(sales_rec.order_count, 0) as order_count,
    COALESCE(expense_rec.total_expenses, 0) as total_expenses,
    COALESCE(expense_rec.expense_count, 0) as expense_count,
    (COALESCE(sales_rec.net_sales, 0) - COALESCE(expense_rec.total_expenses, 0)) as profit;
END;
$$;

-- ============================================
-- RPC: Get sales orders (detailed list derived from orders)
-- ============================================
CREATE OR REPLACE FUNCTION public.get_sales_orders(
  p_business_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_customer_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS SETOF record
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'orders.view') THEN
    RAISE EXCEPTION 'FORBIDDEN: orders.view' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    o.id,
    o.order_number,
    o.order_date,
    o.customer_id,
    c.name as customer_name,
    o.subtotal as gross_amount,
    o.discount_amount,
    o.tax_amount,
    o.total_amount as net_amount,
    o.paid_amount,
    o.due_amount as outstanding_amount,
    o.status
  FROM public.orders o
  LEFT JOIN public.customers c ON c.id = o.customer_id
  WHERE o.business_id = p_business_id
    AND (
      CASE
        WHEN p_status IS NOT NULL THEN o.status = p_status
        ELSE o.status = 'CONFIRMED'
      END
    )
    AND (p_start_date IS NULL OR o.order_date >= p_start_date)
    AND (p_end_date IS NULL OR o.order_date <= p_end_date)
    AND (p_customer_id IS NULL OR o.customer_id = p_customer_id)
  ORDER BY o.order_date DESC, o.created_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

COMMIT;