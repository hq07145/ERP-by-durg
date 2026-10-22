BEGIN;

-- ============================================
-- ADMIN DASHBOARD RPC FUNCTIONS
-- ============================================

-- Dashboard Summary - Aggregated metrics from all modules
CREATE OR REPLACE FUNCTION public.get_dashboard_summary(
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
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'reports.view') THEN
    RAISE EXCEPTION 'FORBIDDEN: reports.view' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH sales_data AS (
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
      AND o.status = 'CONFIRMED'
      AND (p_start_date IS NULL OR o.order_date >= p_start_date)
      AND (p_end_date IS NULL OR o.order_date <= p_end_date)
  ),
  expense_data AS (
    SELECT
      COALESCE(SUM(e.amount), 0) as total_expenses,
      COUNT(e.id) as expense_count
    FROM public.expenses e
    WHERE e.business_id = p_business_id
      AND e.status = 'POSTED'
      AND (p_start_date IS NULL OR e.expense_date >= p_start_date)
      AND (p_end_date IS NULL OR e.expense_date <= p_end_date)
  ),
  order_status AS (
    SELECT
      COUNT(*) FILTER (WHERE status = 'CONFIRMED') as pending_orders
    FROM public.orders
    WHERE business_id = p_business_id
      AND (p_start_date IS NULL OR order_date >= p_start_date)
      AND (p_end_date IS NULL OR order_date <= p_end_date)
  ),
  production_status AS (
    SELECT
      COUNT(*) FILTER (WHERE status IN ('SCHEDULED', 'MATERIAL_READY', 'IN_PRODUCTION', 'QUALITY_CHECK')) as in_production,
      COUNT(*) FILTER (WHERE status = 'READY_FOR_DISPATCH') as ready_for_dispatch,
      COUNT(*) FILTER (WHERE status = 'COMPLETED') as delivered
    FROM public.production_orders
    WHERE business_id = p_business_id
      AND (p_start_date IS NULL OR created_at::DATE >= p_start_date)
      AND (p_end_date IS NULL OR created_at::DATE <= p_end_date)
  ),
  inventory_status AS (
    SELECT COUNT(*) as low_stock_items
    FROM public.inventory i
    JOIN public.raw_materials rm ON rm.id = i.item_id AND rm.business_id = p_business_id
    WHERE i.business_id = p_business_id
      AND i.item_type = 'raw_material'
      AND i.available_stock <= rm.reorder_level
  ),
  delivery_status AS (
    SELECT COUNT(*) as overdue_deliveries
    FROM public.deliveries d
    WHERE d.business_id = p_business_id
      AND d.status IN ('DISPATCHED', 'IN_TRANSIT')
      AND d.expected_delivery_date < CURRENT_DATE
  )
  SELECT
    sd.net_sales as total_sales,
    sd.payments_received,
    sd.outstanding as outstanding_due,
    ed.total_expenses,
    (sd.net_sales - ed.total_expenses) as profit,
    sd.order_count as total_orders,
    os.pending_orders,
    ps.in_production,
    ps.ready_for_dispatch,
    ps.delivered,
    i.low_stock_items,
    ds.overdue_deliveries
  FROM sales_data sd
  CROSS JOIN expense_data ed
  CROSS JOIN order_status os
  CROSS JOIN production_status ps
  CROSS JOIN inventory_status i
  CROSS JOIN delivery_status ds;
END;
$$;

-- Sales Trend - Daily sales data for chart
CREATE OR REPLACE FUNCTION public.get_sales_trend(
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
  start_d DATE;
  end_d DATE;
BEGIN
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'reports.view') THEN
    RAISE EXCEPTION 'FORBIDDEN: reports.view' USING ERRCODE = '42501';
  END IF;

  start_d := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '6 days');
  end_d := COALESCE(p_end_date, CURRENT_DATE);

  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series(start_d, end_d, INTERVAL '1 day')::DATE as date
  ),
  sales_by_date AS (
    SELECT
      o.order_date as date,
      COALESCE(SUM(o.subtotal), 0) as gross_sales,
      COALESCE(SUM(o.total_amount), 0) as net_sales,
      COALESCE(SUM(o.paid_amount), 0) as payments_received,
      COALESCE(SUM(o.due_amount), 0) as outstanding
    FROM public.orders o
    WHERE o.business_id = p_business_id
      AND o.status = 'CONFIRMED'
      AND o.order_date >= start_d
      AND o.order_date <= end_d
    GROUP BY o.order_date
  )
  SELECT
    ds.date,
    COALESCE(sbd.gross_sales, 0) as gross_sales,
    COALESCE(sbd.net_sales, 0) as net_sales,
    COALESCE(sbd.payments_received, 0) as payments_received,
    COALESCE(sbd.outstanding, 0) as outstanding
  FROM date_series ds
  LEFT JOIN sales_by_date sbd ON sbd.date = ds.date
  ORDER BY ds.date;
END;
$$;

-- Payment Trend - Daily payments received
CREATE OR REPLACE FUNCTION public.get_payment_trend(
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
  start_d DATE;
  end_d DATE;
BEGIN
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'reports.view') THEN
    RAISE EXCEPTION 'FORBIDDEN: reports.view' USING ERRCODE = '42501';
  END IF;

  start_d := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '6 days');
  end_d := COALESCE(p_end_date, CURRENT_DATE);

  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series(start_d, end_d, INTERVAL '1 day')::DATE as date
  ),
  payments_by_date AS (
    SELECT
      p.payment_date as date,
      COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'SUCCESS'), 0) as received,
      COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'PENDING'), 0) as pending
    FROM public.payments p
    WHERE p.business_id = p_business_id
      AND p.payment_date >= start_d
      AND p.payment_date <= end_d
    GROUP BY p.payment_date
  )
  SELECT
    ds.date,
    COALESCE(pbd.received, 0) as received,
    COALESCE(pbd.pending, 0) as pending
  FROM date_series ds
  LEFT JOIN payments_by_date pbd ON pbd.date = ds.date
  ORDER BY ds.date;
END;
$$;

-- Expense Trend - Daily expenses
CREATE OR REPLACE FUNCTION public.get_expense_trend(
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
  start_d DATE;
  end_d DATE;
BEGIN
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'reports.view') THEN
    RAISE EXCEPTION 'FORBIDDEN: reports.view' USING ERRCODE = '42501';
  END IF;

  start_d := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '6 days');
  end_d := COALESCE(p_end_date, CURRENT_DATE);

  RETURN QUERY
  WITH date_series AS (
    SELECT generate_series(start_d, end_d, INTERVAL '1 day')::DATE as date
  ),
  expenses_by_date AS (
    SELECT
      e.expense_date as date,
      COALESCE(SUM(e.amount), 0) as amount
    FROM public.expenses e
    WHERE e.business_id = p_business_id
      AND e.status = 'POSTED'
      AND e.expense_date >= start_d
      AND e.expense_date <= end_d
    GROUP BY e.expense_date
  )
  SELECT
    ds.date,
    COALESCE(ebd.amount, 0) as amount
  FROM date_series ds
  LEFT JOIN expenses_by_date ebd ON ebd.date = ds.date
  ORDER BY ds.date;
END;
$$;

-- Order Status Breakdown
CREATE OR REPLACE FUNCTION public.get_order_status_breakdown(
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
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'orders.view') THEN
    RAISE EXCEPTION 'FORBIDDEN: orders.view' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    o.status,
    COUNT(*) as count,
    COALESCE(SUM(o.total_amount), 0) as total_amount
  FROM public.orders o
  WHERE o.business_id = p_business_id
    AND (p_start_date IS NULL OR o.order_date >= p_start_date)
    AND (p_end_date IS NULL OR o.order_date <= p_end_date)
  GROUP BY o.status
  ORDER BY count DESC;
END;
$$;

-- Production Status Breakdown
CREATE OR REPLACE FUNCTION public.get_production_status_breakdown(
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
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'production.view') THEN
    RAISE EXCEPTION 'FORBIDDEN: production.view' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    po.status,
    COUNT(*) as count,
    COALESCE(SUM(po.quantity), 0) as total_quantity
  FROM public.production_orders po
  WHERE po.business_id = p_business_id
    AND (p_start_date IS NULL OR po.created_at::DATE >= p_start_date)
    AND (p_end_date IS NULL OR po.created_at::DATE <= p_end_date)
  GROUP BY po.status
  ORDER BY count DESC;
END;
$$;

-- Top Products by Revenue
CREATE OR REPLACE FUNCTION public.get_top_products(
  p_business_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_limit INTEGER DEFAULT 10
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
    p.id as product_id,
    p.name as product_name,
    p.sku as product_sku,
    COALESCE(SUM(oi.quantity), 0) as total_quantity,
    COALESCE(SUM(oi.line_total), 0) as total_revenue,
    COUNT(DISTINCT oi.order_id) as order_count
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id AND o.business_id = p_business_id
  JOIN public.products p ON p.id = oi.product_id AND p.business_id = p_business_id
  WHERE o.status = 'CONFIRMED'
    AND (p_start_date IS NULL OR o.order_date >= p_start_date)
    AND (p_end_date IS NULL OR o.order_date <= p_end_date)
  GROUP BY p.id, p.name, p.sku
  ORDER BY total_revenue DESC
  LIMIT p_limit;
END;
$$;

-- Top Customers by Revenue
CREATE OR REPLACE FUNCTION public.get_top_customers(
  p_business_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_limit INTEGER DEFAULT 10
)
RETURNS SETOF record
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'customers.view') THEN
    RAISE EXCEPTION 'FORBIDDEN: customers.view' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    c.id as customer_id,
    c.name as customer_name,
    c.company_name,
    COUNT(DISTINCT o.id) as total_orders,
    COALESCE(SUM(o.total_amount), 0) as total_revenue,
    COALESCE(SUM(o.paid_amount), 0) as total_paid,
    COALESCE(SUM(o.due_amount), 0) as total_due
  FROM public.customers c
  JOIN public.orders o ON o.customer_id = c.id AND o.business_id = p_business_id
  WHERE o.status = 'CONFIRMED'
    AND (p_start_date IS NULL OR o.order_date >= p_start_date)
    AND (p_end_date IS NULL OR o.order_date <= p_end_date)
  GROUP BY c.id, c.name, c.company_name
  ORDER BY total_revenue DESC
  LIMIT p_limit;
END;
$$;

-- Low Stock Items
CREATE OR REPLACE FUNCTION public.get_low_stock_items(
  p_business_id UUID
)
RETURNS SETOF record
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'inventory.view') THEN
    RAISE EXCEPTION 'FORBIDDEN: inventory.view' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    rm.id as raw_material_id,
    rm.code,
    rm.name,
    rm.unit,
    i.current_stock,
    i.reserved_stock,
    i.available_stock,
    rm.reorder_level
  FROM public.inventory i
  JOIN public.raw_materials rm ON rm.id = i.item_id AND rm.business_id = p_business_id
  WHERE i.business_id = p_business_id
    AND i.item_type = 'raw_material'
    AND i.available_stock <= rm.reorder_level
  ORDER BY (i.available_stock / NULLIF(rm.reorder_level, 0)) ASC
  LIMIT 20;
END;
$$;

-- Upcoming Deliveries
CREATE OR REPLACE FUNCTION public.get_upcoming_deliveries(
  p_business_id UUID,
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL,
  p_limit INTEGER DEFAULT 10
)
RETURNS SETOF record
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'delivery.view') THEN
    RAISE EXCEPTION 'FORBIDDEN: delivery.view' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    d.id as delivery_id,
    d.delivery_number,
    o.order_number,
    c.name as customer_name,
    d.expected_delivery_date,
    d.status,
    d.vehicle,
    d.driver
  FROM public.deliveries d
  JOIN public.orders o ON o.id = d.order_id AND o.business_id = p_business_id
  JOIN public.customers c ON c.id = o.customer_id AND c.business_id = p_business_id
  WHERE d.business_id = p_business_id
    AND d.status IN ('PACKED', 'DISPATCHED', 'IN_TRANSIT')
    AND (p_start_date IS NULL OR d.expected_delivery_date >= p_start_date)
    AND (p_end_date IS NULL OR d.expected_delivery_date <= p_end_date)
  ORDER BY d.expected_delivery_date ASC
  LIMIT p_limit;
END;
$$;

-- Add reports permissions
INSERT INTO public.permissions (module, action, description) VALUES
  ('reports', 'view', 'View business reports and dashboard'),
  ('reports', 'export', 'Export business reports')
ON CONFLICT (module, action) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.module = 'reports' AND p.action = 'view'
WHERE replace(lower(trim(r.name)), ' ', '_') IN ('super_admin', 'admin', 'manager')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.module = 'reports' AND p.action = 'export'
WHERE replace(lower(trim(r.name)), ' ', '_') IN ('super_admin', 'admin')
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;