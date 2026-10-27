-- Migration: 202610270001_customer_opening_balance.sql
-- Description: Customer Opening Balance foundation for SANKALP IRRIGATION ERP.
-- Enforces:
-- 1. One opening balance per customer for a specific as-on date (database unique constraint).
-- 2. Opening balance represents net balance on as-on date, NOT lifetime sales.
-- 3. Never recorded as a new order, sale, payment or receipt.
-- 4. Closing balance = Opening balance + new sales - payments - credits/adjustments.
-- 5. Date-based period calculations (opening balance as of day before start date, closing at end date).
-- 6. Audit logging on insert/update/delete.
-- 7. RLS and role-based permissions.

BEGIN;

-- ====================================================================
-- 1. TABLE: customer_opening_balances
-- ====================================================================
CREATE TABLE IF NOT EXISTS public.customer_opening_balances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount >= 0),
  balance_type TEXT NOT NULL CHECK (balance_type IN ('RECEIVABLE', 'PAYABLE')),
  as_on_date DATE NOT NULL,
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 2000),
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT customer_opening_balances_cust_date_uniq UNIQUE (customer_id, as_on_date),
  CONSTRAINT customer_opening_balances_biz_cust_date_uniq UNIQUE (business_id, customer_id, as_on_date)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS customer_opening_balances_business_id_idx 
  ON public.customer_opening_balances (business_id);

CREATE INDEX IF NOT EXISTS customer_opening_balances_customer_id_idx 
  ON public.customer_opening_balances (customer_id);

CREATE INDEX IF NOT EXISTS customer_opening_balances_date_idx 
  ON public.customer_opening_balances (business_id, customer_id, as_on_date DESC);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS customer_opening_balances_touch_updated_at ON public.customer_opening_balances;
CREATE TRIGGER customer_opening_balances_touch_updated_at
  BEFORE UPDATE ON public.customer_opening_balances
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ====================================================================
-- 2. ROW LEVEL SECURITY & GRANTS
-- ====================================================================
ALTER TABLE public.customer_opening_balances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_opening_balances_select_policy ON public.customer_opening_balances;
CREATE POLICY customer_opening_balances_select_policy ON public.customer_opening_balances
  FOR SELECT USING (
    public.is_business_member(business_id) AND (
      public.has_business_permission(business_id, 'customers.view') OR
      public.has_business_permission(business_id, 'payments.view')
    )
  );

DROP POLICY IF EXISTS customer_opening_balances_insert_policy ON public.customer_opening_balances;
CREATE POLICY customer_opening_balances_insert_policy ON public.customer_opening_balances
  FOR INSERT WITH CHECK (
    public.is_business_member(business_id) AND (
      public.has_business_permission(business_id, 'customers.edit') OR
      public.has_business_permission(business_id, 'payments.create')
    )
  );

DROP POLICY IF EXISTS customer_opening_balances_update_policy ON public.customer_opening_balances;
CREATE POLICY customer_opening_balances_update_policy ON public.customer_opening_balances
  FOR UPDATE USING (
    public.is_business_member(business_id) AND (
      public.has_business_permission(business_id, 'customers.edit') OR
      public.has_business_permission(business_id, 'payments.edit')
    )
  );

DROP POLICY IF EXISTS customer_opening_balances_delete_policy ON public.customer_opening_balances;
CREATE POLICY customer_opening_balances_delete_policy ON public.customer_opening_balances
  FOR DELETE USING (
    public.is_business_member(business_id) AND (
      public.has_business_permission(business_id, 'customers.edit')
    )
  );

GRANT ALL ON public.customer_opening_balances TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_opening_balances TO authenticated;

-- ====================================================================
-- 3. AUDIT TRIGGER: Log creates, updates and deletes to public.audit_logs
-- ====================================================================
CREATE OR REPLACE FUNCTION public.log_customer_opening_balance_audit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := NULL;
BEGIN
  -- Determine current operator user id
  IF auth.uid() IS NOT NULL THEN
    SELECT id INTO v_user_id
    FROM public.users
    WHERE auth_user_id = auth.uid()
    LIMIT 1;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF v_user_id IS NULL THEN
      v_user_id := NEW.created_by;
    END IF;
    INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (
      NEW.business_id,
      v_user_id,
      'CUSTOMER_OPENING_BALANCE_CREATED',
      'customer_opening_balances',
      NEW.id,
      jsonb_build_object(
        'customer_id', NEW.customer_id,
        'amount', NEW.amount,
        'balance_type', NEW.balance_type,
        'as_on_date', NEW.as_on_date,
        'notes', NEW.notes
      )
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF v_user_id IS NULL THEN
      v_user_id := NEW.created_by;
    END IF;
    INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, old_data, new_data)
    VALUES (
      NEW.business_id,
      v_user_id,
      'CUSTOMER_OPENING_BALANCE_UPDATED',
      'customer_opening_balances',
      NEW.id,
      jsonb_build_object(
        'customer_id', OLD.customer_id,
        'amount', OLD.amount,
        'balance_type', OLD.balance_type,
        'as_on_date', OLD.as_on_date,
        'notes', OLD.notes
      ),
      jsonb_build_object(
        'customer_id', NEW.customer_id,
        'amount', NEW.amount,
        'balance_type', NEW.balance_type,
        'as_on_date', NEW.as_on_date,
        'notes', NEW.notes
      )
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF v_user_id IS NULL THEN
      v_user_id := OLD.created_by;
    END IF;
    INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, old_data)
    VALUES (
      OLD.business_id,
      v_user_id,
      'CUSTOMER_OPENING_BALANCE_DELETED',
      'customer_opening_balances',
      OLD.id,
      jsonb_build_object(
        'customer_id', OLD.customer_id,
        'amount', OLD.amount,
        'balance_type', OLD.balance_type,
        'as_on_date', OLD.as_on_date
      )
    );
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS customer_opening_balances_audit_trg ON public.customer_opening_balances;
CREATE TRIGGER customer_opening_balances_audit_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.customer_opening_balances
  FOR EACH ROW EXECUTE FUNCTION public.log_customer_opening_balance_audit();

-- ====================================================================
-- 4. FUNCTION: calculate_customer_balance_as_of
-- Calculates a customer's net balance as of a specific date (or current date if null).
-- Signed balance:
--   > 0 : Customer owes money (Receivable / Debit balance)
--   < 0 : Business owes money / Customer has excess advance (Payable / Credit balance)
--   = 0 : Balanced
-- ====================================================================
CREATE OR REPLACE FUNCTION public.calculate_customer_balance_as_of(
  p_business_id UUID,
  p_customer_id UUID,
  p_as_of_date DATE DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_as_of DATE;
  v_ob RECORD;
  v_base_balance NUMERIC := 0;
  v_cutoff_date DATE := NULL;
  v_tx_debits NUMERIC := 0;
  v_tx_credits NUMERIC := 0;
BEGIN
  IF p_as_of_date IS NOT NULL THEN
    v_as_of := p_as_of_date;
  ELSE
    SELECT GREATEST(
      CURRENT_DATE,
      COALESCE((SELECT MAX(as_on_date) FROM public.customer_opening_balances WHERE business_id = p_business_id AND customer_id = p_customer_id), CURRENT_DATE),
      COALESCE((SELECT MAX(entry_date) FROM public.customer_ledger WHERE business_id = p_business_id AND customer_id = p_customer_id), CURRENT_DATE)
    ) INTO v_as_of;
  END IF;

  -- 1. Find the latest opening balance record as of or prior to v_as_of
  SELECT * INTO v_ob
  FROM public.customer_opening_balances
  WHERE business_id = p_business_id
    AND customer_id = p_customer_id
    AND as_on_date <= v_as_of
  ORDER BY as_on_date DESC, created_at DESC
  LIMIT 1;

  IF FOUND THEN
    IF v_ob.balance_type = 'RECEIVABLE' THEN
      v_base_balance := v_ob.amount;
    ELSE
      v_base_balance := -v_ob.amount;
    END IF;
    v_cutoff_date := v_ob.as_on_date;
  END IF;

  -- 2. Add ledger debits (invoices, debit notes) and subtract credits (payments, credit notes)
  -- If opening balance exists, only count transactions strictly after as_on_date (since as_on_date represents the opening snapshot)
  IF v_cutoff_date IS NOT NULL THEN
    SELECT 
      COALESCE(SUM(debit), 0),
      COALESCE(SUM(credit), 0)
    INTO v_tx_debits, v_tx_credits
    FROM public.customer_ledger
    WHERE business_id = p_business_id
      AND customer_id = p_customer_id
      AND entry_date > v_cutoff_date
      AND entry_date <= v_as_of;
  ELSE
    -- No opening balance configured: calculate from all ledger transactions up to v_as_of
    SELECT 
      COALESCE(SUM(debit), 0),
      COALESCE(SUM(credit), 0)
    INTO v_tx_debits, v_tx_credits
    FROM public.customer_ledger
    WHERE business_id = p_business_id
      AND customer_id = p_customer_id
      AND entry_date <= v_as_of;
  END IF;

  RETURN (v_base_balance + v_tx_debits - v_tx_credits);
END;
$$;

-- ====================================================================
-- 5. FUNCTION: get_customer_period_balance
-- Requirement 7: For a selected reporting period:
--   - Calculate opening balance as of the day before the start date.
--   - Include only transactions within the period.
--   - Calculate closing balance at the end date.
--   - Correctly distinguish customer advances from amounts receivable without double counting.
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
  -- Check if an opening balance is defined exactly on start_date
  -- If an opening balance is configured on p_start_date, that record defines the customer's balance at the start of p_start_date.
  -- Otherwise, it's the calculated balance as of v_day_before.
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
  -- Closing balance = Opening balance + new sales/orders - payments received - applicable credits/adjustments
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
    v_opening,
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

-- ====================================================================
-- 6. UPDATE: get_customer_summary to seamlessly incorporate Opening Balance
-- while preserving 100% backward compatibility when no opening balance is set.
-- ====================================================================
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

  -- 3. Total Invoiced Purchases from Orders
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
  SELECT COALESCE(SUM(p.amount), 0) INTO v_paid
  FROM public.payments p
  WHERE p.business_id = p_business_id
    AND p.customer_id = p_customer_id
    AND p.status = 'SUCCESS';

  -- 5. Advance calculations from payments
  SELECT COALESCE(SUM(p.amount), 0) INTO v_adv_received
  FROM public.payments p
  WHERE p.business_id = p_business_id
    AND p.customer_id = p_customer_id
    AND p.status = 'SUCCESS'
    AND p.order_id IS NULL;

  SELECT COALESCE(SUM(caa.allocated_amount), 0) INTO v_adv_allocated
  FROM public.customer_advance_allocations caa
  WHERE caa.business_id = p_business_id
    AND caa.customer_id = p_customer_id
    AND caa.status = 'ACTIVE';

  -- 6. Outstanding Due & Available Advance Calculation
  IF v_ob_date IS NOT NULL THEN
    -- When opening balance is present:
    -- Net Closing = (Opening Balance Signed) + (Purchases after as_on_date) - (Payments after as_on_date)
    -- Or lifetime net balance:
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
  ELSE
    -- Backward-compatible default calculation when no opening balance is set
    SELECT COALESCE(SUM(o.due_amount), 0) INTO v_due
    FROM public.orders o
    WHERE o.business_id = p_business_id
      AND o.customer_id = p_customer_id
      AND o.status IN ('CONFIRMED', 'DELIVERED', 'PENDING', 'DRAFT')
      AND o.due_amount > 0;

    IF v_due < 0 THEN
      v_due := 0;
    END IF;

    v_avail_adv := GREATEST(0, v_adv_received - v_adv_allocated);
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
    v_ob_amount,
    v_ob_type,
    v_ob_date,
    v_warning,
    v_last_date,
    v_last_amount;
END;
$$;

REVOKE ALL ON FUNCTION public.calculate_customer_balance_as_of(uuid, uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_customer_balance_as_of(uuid, uuid, date) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_customer_period_balance(uuid, uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_period_balance(uuid, uuid, date, date) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_customer_summary(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_customer_summary(uuid, uuid) TO authenticated, service_role;

COMMIT;
