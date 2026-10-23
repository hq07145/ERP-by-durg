-- Migration: 202610230003_fix_customer_ledger_and_summary.sql
-- 1. Ensure trigger order_invoice_ledger fires on both INSERT and UPDATE of orders
-- 2. Heal missing INVOICE ledger entry for HIST-ORD-101
-- 3. Recalculate customer_ledger balances
-- 4. Overhaul get_customer_summary RPC to calculate non-negative Outstanding Due and Available Advance separately

-- 1. Update trigger function to handle both INSERT and UPDATE
CREATE OR REPLACE FUNCTION public.create_invoice_ledger_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id UUID;
  customer_balance NUMERIC;
  ledger_balance NUMERIC;
BEGIN
  -- Trigger when status is CONFIRMED (on INSERT if inserted as CONFIRMED, or on UPDATE when transition to CONFIRMED)
  IF NEW.status != 'CONFIRMED' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status = 'CONFIRMED' THEN
    RETURN NEW;
  END IF;

  -- Prevent duplicate INVOICE ledger entries for the same order
  IF EXISTS (
    SELECT 1 FROM public.customer_ledger
    WHERE order_id = NEW.id AND entry_type = 'INVOICE'
  ) THEN
    RETURN NEW;
  END IF;

  -- Get actor if available
  SELECT id INTO actor_id
  FROM public.users
  WHERE auth_user_id = auth.uid() AND business_id = NEW.business_id AND status = 'ACTIVE';

  IF actor_id IS NULL THEN
    -- Fallback to system admin user for the business if background or system process
    SELECT id INTO actor_id
    FROM public.users
    WHERE business_id = NEW.business_id AND status = 'ACTIVE'
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  -- Calculate new ledger balance
  customer_balance := public.get_customer_balance(NEW.business_id, NEW.customer_id);
  ledger_balance := customer_balance + NEW.total_amount;

  -- Create ledger entry for invoice (debit)
  INSERT INTO public.customer_ledger (
    business_id, customer_id, order_id,
    entry_type, description, debit, credit, balance, entry_date, created_by, created_at
  ) VALUES (
    NEW.business_id, NEW.customer_id, NEW.id,
    'INVOICE', 'Invoice ' || NEW.order_number, NEW.total_amount, 0, ledger_balance, NEW.order_date, actor_id, NEW.created_at
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_invoice_ledger ON public.orders;
CREATE TRIGGER order_invoice_ledger
AFTER INSERT OR UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.create_invoice_ledger_entry();

-- 2. Heal missing INVOICE ledger entry for HIST-ORD-101 if not already present
INSERT INTO public.customer_ledger (
  business_id, customer_id, order_id, entry_type, description, debit, credit, balance, entry_date, created_by, created_at
)
SELECT 
  o.business_id, 
  o.customer_id, 
  o.id, 
  'INVOICE', 
  'Invoice ' || o.order_number, 
  o.total_amount, 
  0, 
  0, 
  o.order_date, 
  (SELECT id FROM public.users WHERE business_id = o.business_id AND status = 'ACTIVE' LIMIT 1), 
  o.created_at
FROM public.orders o
WHERE o.order_number = 'HIST-ORD-101'
  AND NOT EXISTS (
    SELECT 1 FROM public.customer_ledger cl
    WHERE cl.order_id = o.id AND cl.entry_type = 'INVOICE'
  );

-- 3. Recalculate ledger running balances for SAMARTH AGENCIES
DO $$
DECLARE
  v_cust RECORD;
  v_entry RECORD;
  v_running NUMERIC := 0;
BEGIN
  FOR v_cust IN SELECT DISTINCT customer_id, business_id FROM public.customer_ledger LOOP
    v_running := 0;
    FOR v_entry IN
      SELECT id, debit, credit
      FROM public.customer_ledger
      WHERE business_id = v_cust.business_id AND customer_id = v_cust.customer_id
      ORDER BY entry_date ASC, created_at ASC
    LOOP
      v_running := v_running + v_entry.debit - v_entry.credit;
      UPDATE public.customer_ledger
      SET balance = v_running
      WHERE id = v_entry.id;
    END LOOP;
  END LOOP;
END;
$$;

-- 4. Overhaul get_customer_summary RPC with separate non-negative Outstanding Due & Available Advance
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

  -- 2. Total Invoiced Purchases from Orders (Authoritative)
  SELECT COALESCE(SUM(o.total_amount), 0) INTO v_orders_sum
  FROM public.orders o
  WHERE o.business_id = p_business_id
    AND o.customer_id = p_customer_id
    AND o.status NOT IN ('CANCELLED');

  -- Also check ledger INVOICE debits
  SELECT COALESCE(SUM(cl.debit), 0) INTO v_ledger_invoices
  FROM public.customer_ledger cl
  WHERE cl.business_id = p_business_id
    AND cl.customer_id = p_customer_id
    AND cl.entry_type = 'INVOICE';

  v_purchases := GREATEST(v_orders_sum, v_ledger_invoices);

  -- 3. Total Cleared Payments Received
  SELECT COALESCE(SUM(p.amount), 0) INTO v_paid
  FROM public.payments p
  WHERE p.business_id = p_business_id
    AND p.customer_id = p_customer_id
    AND p.status = 'SUCCESS';

  -- 4. Outstanding Due: Unpaid balance on eligible orders (strictly >= 0)
  SELECT COALESCE(SUM(o.due_amount), 0) INTO v_due
  FROM public.orders o
  WHERE o.business_id = p_business_id
    AND o.customer_id = p_customer_id
    AND o.status IN ('CONFIRMED', 'DELIVERED', 'PENDING', 'DRAFT')
    AND o.due_amount > 0;

  IF v_due < 0 THEN
    v_due := 0;
  END IF;

  -- 5. Customer Advance Calculations
  -- Total advance received (unallocated payments initially received with order_id IS NULL)
  SELECT COALESCE(SUM(p.amount), 0) INTO v_adv_received
  FROM public.payments p
  WHERE p.business_id = p_business_id
    AND p.customer_id = p_customer_id
    AND p.status = 'SUCCESS'
    AND p.order_id IS NULL;

  -- Total active advance allocated to orders
  SELECT COALESCE(SUM(caa.allocated_amount), 0) INTO v_adv_allocated
  FROM public.customer_advance_allocations caa
  WHERE caa.business_id = p_business_id
    AND caa.customer_id = p_customer_id
    AND caa.status = 'ACTIVE';

  v_avail_adv := GREATEST(0, v_adv_received - v_adv_allocated);

  -- 6. Check for reconciliation discrepancies
  -- Discrepancy occurs if: (Total Purchases - Total Paid) != (Outstanding Due - Available Advance)
  IF ABS((v_purchases - v_paid) - (v_due - v_avail_adv)) > 0.01 THEN
    v_warning := 'Reconciliation note: Ledger purchases (' || v_purchases::text || ') less payments (' || v_paid::text || ') differs from net dues (' || (v_due - v_avail_adv)::text || '). Verify manual ledger adjustments or legacy records.';
  END IF;

  -- 7. Last payment info
  SELECT p.payment_date, p.amount INTO v_last_date, v_last_amount
  FROM public.payments p
  WHERE p.business_id = p_business_id
    AND p.customer_id = p_customer_id
    AND p.status = 'SUCCESS'
  ORDER BY p.payment_date DESC, p.created_at DESC
  LIMIT 1;

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
    v_warning,
    v_last_date,
    v_last_amount;
END;
$$;

REVOKE ALL ON FUNCTION public.get_customer_summary(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_summary(uuid, uuid) TO authenticated, service_role;
