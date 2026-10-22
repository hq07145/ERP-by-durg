-- ============================================
-- Step 15: Reports + Export
-- Database functions for report data aggregation
-- ============================================

BEGIN;

-- ============================================
-- 1. AUDIT EXPORT LOG TABLE
-- ============================================

create table if not exists export_audit_log (
  id bigserial primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  report_type text not null,
  filters jsonb not null default '{}',
  format text not null,
  row_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index idx_export_audit_log_business_id on export_audit_log(business_id);
create index idx_export_audit_log_user_id on export_audit_log(user_id);
create index idx_export_audit_log_report_type on export_audit_log(report_type);
create index idx_export_audit_log_created_at on export_audit_log(created_at desc);

-- RLS
alter table export_audit_log enable row level security;

create policy "export_audit_log_select_own_business" on export_audit_log
  for select using (business_id = current_setting('app.current_business_id', true)::uuid);

create policy "export_audit_log_insert_own_business" on export_audit_log
  for insert with check (business_id = current_setting('app.current_business_id', true)::uuid);

-- ============================================
-- 2. AUDIT EXPORT RPC FUNCTION
-- ============================================

create or replace function audit_export(
  p_business_id uuid,
  p_user_id uuid,
  p_report_type text,
  p_filters jsonb,
  p_format text,
  p_row_count integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into export_audit_log (
    business_id,
    user_id,
    report_type,
    filters,
    format,
    row_count
  ) values (
    p_business_id,
    p_user_id,
    p_report_type,
    p_filters,
    p_format,
    p_row_count
  );
end;
$$;

-- ============================================
-- 3. PROFIT BY PERIOD RPC FUNCTION
-- ============================================

create or replace function get_profit_by_period(
  p_business_id uuid,
  p_start_date date default null,
  p_end_date date default null,
  p_customer_id uuid default null
) returns table (
  period text,
  gross_sales numeric,
  discounts numeric,
  tax numeric,
  net_sales numeric,
  payments_received numeric,
  outstanding numeric,
  total_expenses numeric,
  profit numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start_date date;
  v_end_date date;
begin
  -- Default to current month if not specified
  if p_start_date is null then
    v_start_date := date_trunc('month', now())::date;
  else
    v_start_date := p_start_date;
  end if;

  if p_end_date is null then
    v_end_date := (date_trunc('month', now()) + interval '1 month' - interval '1 day')::date;
  else
    v_end_date := p_end_date;
  end if;

  return query
  with sales_data as (
    select
      to_char(o.order_date, 'YYYY-MM') as period,
      sum(o.subtotal) as gross_sales,
      sum(o.discount_amount) as discounts,
      sum(o.tax_amount) as tax,
      sum(o.total_amount) as net_sales,
      sum(o.paid_amount) as payments_received,
      sum(o.due_amount) as outstanding
    from orders o
    where o.business_id = p_business_id
      and o.status = 'CONFIRMED'
      and o.order_date between v_start_date and v_end_date
      and (p_customer_id is null or o.customer_id = p_customer_id)
    group by to_char(o.order_date, 'YYYY-MM')
  ),
  expenses_data as (
    select
      to_char(e.expense_date, 'YYYY-MM') as period,
      sum(e.amount) as total_expenses
    from expenses e
    where e.business_id = p_business_id
      and e.expense_date between v_start_date and v_end_date
      and e.status = 'POSTED'
    group by to_char(e.expense_date, 'YYYY-MM')
  )
  select
    coalesce(s.period, e.period) as period,
    coalesce(s.gross_sales, 0) as gross_sales,
    coalesce(s.discounts, 0) as discounts,
    coalesce(s.tax, 0) as tax,
    coalesce(s.net_sales, 0) as net_sales,
    coalesce(s.payments_received, 0) as payments_received,
    coalesce(s.outstanding, 0) as outstanding,
    coalesce(e.total_expenses, 0) as total_expenses,
    (coalesce(s.net_sales, 0) - coalesce(e.total_expenses, 0)) as profit
  from sales_data s
  full outer join expenses_data e on s.period = e.period
  order by coalesce(s.period, e.period);
end;
$$;

-- ============================================
-- 4. SALES REPORT RPC FUNCTION
-- ============================================

create or replace function get_sales_report(
  p_business_id uuid,
  p_start_date date default null,
  p_end_date date default null,
  p_customer_id uuid default null,
  p_product_id uuid default null,
  p_status text default null,
  p_limit integer default 10000,
  p_offset integer default 0
) returns table (
  order_id uuid,
  order_number text,
  order_date date,
  customer_id uuid,
  customer_name text,
  customer_company text,
  product_id uuid,
  product_name text,
  product_sku text,
  quantity numeric,
  unit_price numeric,
  discount_rate numeric,
  tax_rate numeric,
  line_total numeric,
  gross_amount numeric,
  discount_amount numeric,
  tax_amount numeric,
  net_amount numeric,
  paid_amount numeric,
  outstanding_amount numeric,
  order_status text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    o.id as order_id,
    o.order_number,
    o.order_date,
    c.id as customer_id,
    c.name as customer_name,
    c.company_name as customer_company,
    p.id as product_id,
    p.name as product_name,
    p.sku as product_sku,
    oi.quantity,
    oi.unit_price,
    oi.discount_rate,
    oi.tax_rate,
    oi.line_total,
    o.subtotal as gross_amount,
    o.discount_amount,
    o.tax_amount,
    o.total_amount as net_amount,
    o.paid_amount,
    o.due_amount as outstanding_amount,
    o.status as order_status
  from orders o
  inner join customers c on c.id = o.customer_id and c.business_id = p_business_id
  inner join order_items oi on oi.order_id = o.id
  inner join products p on p.id = oi.product_id and p.business_id = p_business_id
  where o.business_id = p_business_id
    and o.status = 'CONFIRMED'
    and (p_start_date is null or o.order_date >= p_start_date)
    and (p_end_date is null or o.order_date <= p_end_date)
    and (p_customer_id is null or o.customer_id = p_customer_id)
    and (p_product_id is null or oi.product_id = p_product_id)
    and (p_status is null or o.status = p_status)
  order by o.order_date desc, o.id, oi.id
  limit p_limit offset p_offset;
end;
$$;

-- ============================================
-- 5. ORDERS REPORT RPC FUNCTION
-- ============================================

create or replace function get_orders_report(
  p_business_id uuid,
  p_start_date date default null,
  p_end_date date default null,
  p_customer_id uuid default null,
  p_status text default null,
  p_priority text default null,
  p_limit integer default 10000,
  p_offset integer default 0
) returns table (
  id uuid,
  order_number text,
  order_date date,
  customer_id uuid,
  customer_name text,
  customer_company text,
  priority text,
  status text,
  subtotal numeric,
  discount_amount numeric,
  tax_amount numeric,
  total_amount numeric,
  paid_amount numeric,
  due_amount numeric,
  earliest_delivery_date date,
  latest_delivery_date date,
  expected_delivery_date date,
  delivery_status text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    o.id,
    o.order_number,
    o.order_date,
    c.id as customer_id,
    c.name as customer_name,
    c.company_name as customer_company,
    o.priority,
    o.status,
    o.subtotal,
    o.discount_amount,
    o.tax_amount,
    o.total_amount,
    o.paid_amount,
    o.due_amount,
    o.earliest_delivery_date,
    o.latest_delivery_date,
    o.expected_delivery_date,
    o.delivery_status
  from orders o
  inner join customers c on c.id = o.customer_id and c.business_id = p_business_id
  where o.business_id = p_business_id
    and (p_start_date is null or o.order_date >= p_start_date)
    and (p_end_date is null or o.order_date <= p_end_date)
    and (p_customer_id is null or o.customer_id = p_customer_id)
    and (p_status is null or o.status = p_status)
    and (p_priority is null or o.priority = p_priority)
  order by o.order_date desc, o.id
  limit p_limit offset p_offset;
end;
$$;

-- ============================================
-- 6. PAYMENTS REPORT RPC FUNCTION
-- ============================================

create or replace function get_payments_report(
  p_business_id uuid,
  p_start_date date default null,
  p_end_date date default null,
  p_customer_id uuid default null,
  p_order_id uuid default null,
  p_status text default null,
  p_payment_method text default null,
  p_limit integer default 10000,
  p_offset integer default 0
) returns table (
  id uuid,
  payment_number text,
  payment_date date,
  customer_id uuid,
  customer_name text,
  customer_company text,
  order_id uuid,
  order_number text,
  amount numeric,
  payment_method text,
  reference text,
  status text,
  notes text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    p.id,
    p.payment_number,
    p.payment_date,
    c.id as customer_id,
    c.name as customer_name,
    c.company_name as customer_company,
    o.id as order_id,
    o.order_number,
    p.amount,
    p.payment_method,
    p.reference,
    p.status,
    p.notes
  from payments p
  inner join customers c on c.id = p.customer_id and c.business_id = p_business_id
  left join orders o on o.id = p.order_id and o.business_id = p_business_id
  where p.business_id = p_business_id
    and (p_start_date is null or p.payment_date >= p_start_date)
    and (p_end_date is null or p.payment_date <= p_end_date)
    and (p_customer_id is null or p.customer_id = p_customer_id)
    and (p_order_id is null or p.order_id = p_order_id)
    and (p_status is null or p.status = p_status)
    and (p_payment_method is null or p.payment_method = p_payment_method)
  order by p.payment_date desc, p.id
  limit p_limit offset p_offset;
end;
$$;

-- ============================================
-- 7. CUSTOMER DUE REPORT RPC FUNCTION
-- ============================================

create or replace function get_customer_due_report(
  p_business_id uuid,
  p_start_date date default null,
  p_end_date date default null,
  p_customer_id uuid default null,
  p_min_due_amount numeric default 0,
  p_limit integer default 10000,
  p_offset integer default 0
) returns table (
  customer_id uuid,
  customer_name text,
  customer_company text,
  customer_phone text,
  customer_email text,
  total_purchases numeric,
  total_paid numeric,
  total_due numeric,
  last_payment_date date,
  last_payment_amount numeric,
  credit_limit numeric,
  payment_terms text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with customer_ledger as (
    select
      c.id as customer_id,
      c.name as customer_name,
      c.company_name as customer_company,
      c.phone as customer_phone,
      c.email as customer_email,
      c.credit_limit,
      c.payment_terms,
      sum(case when cl.entry_type = 'INVOICE' then cl.debit else 0 end) as total_purchases,
      sum(case when cl.entry_type = 'PAYMENT' then cl.credit else 0 end) as total_paid,
      max(case when cl.entry_type = 'PAYMENT' then cl.entry_date end) as last_payment_date,
      max(case when cl.entry_type = 'PAYMENT' then cl.credit end) as last_payment_amount
    from customers c
    left join customer_ledger cl on cl.customer_id = c.id and cl.business_id = p_business_id
      and (p_start_date is null or cl.entry_date >= p_start_date)
      and (p_end_date is null or cl.entry_date <= p_end_date)
    where c.business_id = p_business_id
      and c.status = 'ACTIVE'
      and (p_customer_id is null or c.id = p_customer_id)
    group by c.id, c.name, c.company_name, c.phone, c.email, c.credit_limit, c.payment_terms
  )
  select
    customer_id,
    customer_name,
    customer_company,
    customer_phone,
    customer_email,
    total_purchases,
    total_paid,
    (total_purchases - total_paid) as total_due,
    last_payment_date,
    last_payment_amount,
    credit_limit,
    payment_terms
  from customer_ledger
  where (total_purchases - total_paid) >= p_min_due_amount
  order by (total_purchases - total_paid) desc, customer_name
  limit p_limit offset p_offset;
end;
$$;

-- ============================================
-- 8. EXPENSES REPORT RPC FUNCTION
-- ============================================

create or replace function get_expenses_report(
  p_business_id uuid,
  p_start_date date default null,
  p_end_date date default null,
  p_category text default null,
  p_status text default null,
  p_limit integer default 10000,
  p_offset integer default 0
) returns table (
  id uuid,
  category text,
  amount numeric,
  expense_date date,
  description text,
  reference text,
  status text,
  created_by_name text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    e.id,
    e.category,
    e.amount,
    e.expense_date,
    e.description,
    e.reference,
    e.status,
    u.name as created_by_name,
    e.created_at
  from expenses e
  left join users u on u.id = e.created_by
  where e.business_id = p_business_id
    and (p_start_date is null or e.expense_date >= p_start_date)
    and (p_end_date is null or e.expense_date <= p_end_date)
    and (p_category is null or e.category = p_category)
    and (p_status is null or e.status = p_status)
  order by e.expense_date desc, e.id
  limit p_limit offset p_offset;
end;
$$;

-- ============================================
-- 9. PRODUCTION REPORT RPC FUNCTION
-- ============================================

create or replace function get_production_report(
  p_business_id uuid,
  p_start_date date default null,
  p_end_date date default null,
  p_product_id uuid default null,
  p_status text default null,
  p_priority text default null,
  p_limit integer default 10000,
  p_offset integer default 0
) returns table (
  id uuid,
  order_id uuid,
  order_number text,
  customer_name text,
  product_id uuid,
  product_name text,
  product_sku text,
  quantity numeric,
  status text,
  priority text,
  scheduled_start_date date,
  scheduled_end_date date,
  actual_start_date date,
  actual_end_date date,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    po.id,
    po.order_id,
    o.order_number,
    c.name as customer_name,
    po.product_id,
    p.name as product_name,
    p.sku as product_sku,
    po.quantity,
    po.status,
    po.priority,
    po.scheduled_start_date,
    po.scheduled_end_date,
    po.actual_start_date,
    po.actual_end_date,
    po.created_at
  from production_orders po
  inner join orders o on o.id = po.order_id and o.business_id = p_business_id
  inner join customers c on c.id = o.customer_id and c.business_id = p_business_id
  inner join products p on p.id = po.product_id and p.business_id = p_business_id
  where po.business_id = p_business_id
    and (p_start_date is null or po.created_at::date >= p_start_date)
    and (p_end_date is null or po.created_at::date <= p_end_date)
    and (p_product_id is null or po.product_id = p_product_id)
    and (p_status is null or po.status = p_status)
    and (p_priority is null or po.priority = p_priority)
  order by po.created_at desc, po.id
  limit p_limit offset p_offset;
end;
$$;

-- ============================================
-- 10. INVENTORY REPORT RPC FUNCTION
-- ============================================

create or replace function get_inventory_report(
  p_business_id uuid,
  p_raw_material_id uuid default null,
  p_low_stock_only boolean default false,
  p_limit integer default 10000,
  p_offset integer default 0
) returns table (
  item_id uuid,
  code text,
  name text,
  unit text,
  current_stock numeric,
  reserved_stock numeric,
  available_stock numeric,
  reorder_level numeric,
  min_stock numeric,
  purchase_price numeric,
  is_low_stock boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    i.item_id,
    rm.code,
    rm.name,
    rm.unit,
    i.current_stock,
    i.reserved_stock,
    i.available_stock,
    rm.reorder_level,
    rm.min_stock,
    rm.purchase_price,
    (i.available_stock <= rm.reorder_level) as is_low_stock
  from inventory i
  inner join raw_materials rm on rm.id = i.item_id and rm.business_id = p_business_id
  where i.business_id = p_business_id
    and i.item_type = 'raw_material'
    and (p_raw_material_id is null or i.item_id = p_raw_material_id)
    and (p_low_stock_only = false or i.available_stock <= rm.reorder_level)
  order by (i.available_stock <= rm.reorder_level) desc, rm.code
  limit p_limit offset p_offset;
end;
$$;

-- ============================================
-- 11. DELIVERY REPORT RPC FUNCTION
-- ============================================

create or replace function get_delivery_report(
  p_business_id uuid,
  p_start_date date default null,
  p_end_date date default null,
  p_order_id uuid default null,
  p_status text default null,
  p_limit integer default 10000,
  p_offset integer default 0
) returns table (
  id uuid,
  delivery_number text,
  order_id uuid,
  order_number text,
  customer_name text,
  status text,
  expected_delivery_date date,
  tracking_number text,
  vehicle text,
  driver text,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    d.id,
    d.delivery_number,
    d.order_id,
    o.order_number,
    c.name as customer_name,
    d.status,
    d.expected_delivery_date,
    d.tracking_number,
    d.vehicle,
    d.driver,
    d.dispatched_at,
    d.delivered_at,
    d.created_at
  from deliveries d
  inner join orders o on o.id = d.order_id and o.business_id = p_business_id
  inner join customers c on c.id = o.customer_id and c.business_id = p_business_id
  where d.business_id = p_business_id
    and (p_start_date is null or d.expected_delivery_date >= p_start_date)
    and (p_end_date is null or d.expected_delivery_date <= p_end_date)
    and (p_order_id is null or d.order_id = p_order_id)
    and (p_status is null or d.status = p_status)
  order by d.expected_delivery_date asc, d.id
  limit p_limit offset p_offset;
end;
$$;

-- ============================================
-- GRANT EXECUTE PERMISSIONS
-- ============================================

grant execute on function audit_export to authenticated;
grant execute on function get_profit_by_period to authenticated;
grant execute on function get_sales_report to authenticated;
grant execute on function get_orders_report to authenticated;
grant execute on function get_payments_report to authenticated;
grant execute on function get_customer_due_report to authenticated;
grant execute on function get_expenses_report to authenticated;
grant execute on function get_production_report to authenticated;
grant execute on function get_inventory_report to authenticated;
grant execute on function get_delivery_report to authenticated;

COMMIT;