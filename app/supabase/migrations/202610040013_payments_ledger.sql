BEGIN;

-- ============================================
-- PAYMENTS & CUSTOMER LEDGER
-- ============================================

-- Payments table
CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  payment_number TEXT NOT NULL CHECK (payment_number = upper(btrim(payment_number)) AND length(payment_number) BETWEEN 1 AND 64),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'UPI', 'CARD', 'OTHER')),
  reference TEXT CHECK (reference IS NULL OR length(reference) <= 128),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 2000),
  status TEXT NOT NULL DEFAULT 'SUCCESS' CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT payments_business_number_unique UNIQUE (business_id, payment_number)
);

CREATE INDEX payments_business_id_idx ON public.payments (business_id);
CREATE INDEX payments_business_customer_idx ON public.payments (business_id, customer_id);
CREATE INDEX payments_business_order_idx ON public.payments (business_id, order_id);
CREATE INDEX payments_business_date_idx ON public.payments (business_id, payment_date DESC);
CREATE INDEX payments_business_status_idx ON public.payments (business_id, status);
CREATE UNIQUE INDEX payments_business_number_unique_idx ON public.payments (business_id, upper(btrim(payment_number)));

-- Customer Ledger table
CREATE TABLE public.customer_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('INVOICE', 'PAYMENT', 'CREDIT_NOTE', 'DEBIT_NOTE', 'ADJUSTMENT', 'ADVANCE')),
  description TEXT NOT NULL,
  debit NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
  credit NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
  balance NUMERIC(14, 2) NOT NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT
);

CREATE INDEX customer_ledger_business_id_idx ON public.customer_ledger (business_id);
CREATE INDEX customer_ledger_business_customer_idx ON public.customer_ledger (business_id, customer_id);
CREATE INDEX customer_ledger_business_order_idx ON public.customer_ledger (business_id, order_id);
CREATE INDEX customer_ledger_business_payment_idx ON public.customer_ledger (business_id, payment_id);
CREATE INDEX customer_ledger_business_date_idx ON public.customer_ledger (business_id, entry_date DESC);

-- ============================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================
CREATE TRIGGER payments_touch_updated_at BEFORE UPDATE ON public.payments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================
-- HELPER: Get current customer balance (running total)
-- ============================================
CREATE OR REPLACE FUNCTION public.get_customer_balance(
  p_business_id UUID,
  p_customer_id UUID,
  p_before_date DATE DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  balance NUMERIC := 0;
BEGIN
  SELECT COALESCE(SUM(debit - credit), 0) INTO balance
  FROM public.customer_ledger
  WHERE business_id = p_business_id
    AND customer_id = p_customer_id
    AND (p_before_date IS NULL OR entry_date < p_before_date);

  RETURN balance;
END;
$$;

-- ============================================
-- HELPER: Get next payment number
-- ============================================
CREATE OR REPLACE FUNCTION public.get_next_payment_number(
  p_business_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_num INTEGER;
  payment_num TEXT;
BEGIN
  SELECT COALESCE(MAX(
    CASE
      WHEN payment_number ~ '^PAY-\d+$' THEN substring(payment_number FROM '^PAY-(\d+)$')::INTEGER
      ELSE NULL
    END
  ), 0) + 1 INTO next_num
  FROM public.payments
  WHERE business_id = p_business_id;

  payment_num := 'PAY-' || lpad(next_num::TEXT, 6, '0');
  RETURN payment_num;
END;
$$;

-- ============================================
-- CORE: Create payment with atomic ledger update
-- ============================================
CREATE OR REPLACE FUNCTION public.create_payment(
  p_business_id UUID,
  p_customer_id UUID,
  p_amount NUMERIC,
  p_payment_date DATE,
  p_payment_method TEXT,
  p_order_id UUID DEFAULT NULL,
  p_reference TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'SUCCESS'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payment_id UUID;
  payment_number TEXT;
  actor_id UUID;
  customer_rec RECORD;
  order_rec RECORD;
  current_balance NUMERIC;
  order_due NUMERIC := 0;
  ledger_balance NUMERIC;
  payment_desc TEXT;
BEGIN
  -- Check permissions
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'payments.add') THEN
    RAISE EXCEPTION 'FORBIDDEN: payments.add' USING ERRCODE = '42501';
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

  -- Get and lock customer
  SELECT * INTO customer_rec
  FROM public.customers
  WHERE id = p_customer_id AND business_id = p_business_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CUSTOMER_NOT_FOUND';
  END IF;

  -- If order_id provided, get and lock order
  IF p_order_id IS NOT NULL THEN
    SELECT * INTO order_rec
    FROM public.orders
    WHERE id = p_order_id AND business_id = p_business_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'ORDER_NOT_FOUND';
    END IF;
    IF order_rec.customer_id != p_customer_id THEN
      RAISE EXCEPTION 'ORDER_CUSTOMER_MISMATCH';
    END IF;
    order_due := order_rec.due_amount;
  END IF;

  -- Check overpayment (unless advance/adjustment)
  IF p_order_id IS NOT NULL AND p_status = 'SUCCESS' AND p_amount > order_due THEN
    RAISE EXCEPTION 'OVERPAYMENT_NOT_ALLOWED' USING ERRCODE = '23514';
  END IF;

  -- Generate payment number
  payment_number := public.get_next_payment_number(p_business_id);

  -- Get current ledger balance for this customer
  current_balance := public.get_customer_balance(p_business_id, p_customer_id);

  -- Create payment
  INSERT INTO public.payments (
    business_id, customer_id, order_id, payment_number,
    amount, payment_date, payment_method, reference, notes, status
  ) VALUES (
    p_business_id, p_customer_id, p_order_id, payment_number,
    p_amount, p_payment_date, p_payment_method, p_reference, p_notes, p_status
  ) RETURNING id INTO payment_id;

  -- Calculate new ledger balance
  IF p_status = 'SUCCESS' THEN
    ledger_balance := current_balance - p_amount; -- Payment reduces customer balance (credit)
    payment_desc := 'Payment received';
    IF p_order_id IS NOT NULL THEN
      payment_desc := payment_desc || ' for order ' || order_rec.order_number;
    END IF;
    IF p_reference IS NOT NULL THEN
      payment_desc := payment_desc || ' (Ref: ' || p_reference || ')';
    END IF;

    -- Create ledger entry for payment (credit)
    INSERT INTO public.customer_ledger (
      business_id, customer_id, order_id, payment_id,
      entry_type, description, debit, credit, balance, entry_date, created_by
    ) VALUES (
      p_business_id, p_customer_id, p_order_id, payment_id,
      'PAYMENT', payment_desc, 0, p_amount, ledger_balance, p_payment_date, actor_id
    );
  ELSE
    ledger_balance := current_balance;
  END IF;

  -- Update order paid/due amounts if linked to order and successful
  IF p_order_id IS NOT NULL AND p_status = 'SUCCESS' THEN
    UPDATE public.orders
    SET paid_amount = paid_amount + p_amount,
        due_amount = GREATEST(total_amount - (paid_amount + p_amount), 0),
        updated_at = NOW()
    WHERE id = p_order_id AND business_id = p_business_id;
  END IF;

  -- Audit log
  INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, new_data)
  VALUES (p_business_id, actor_id, 'PAYMENT_CREATED', 'payment', payment_id,
    jsonb_build_object(
      'payment_number', payment_number,
      'customer_id', p_customer_id,
      'order_id', p_order_id,
      'amount', p_amount,
      'payment_date', p_payment_date,
      'payment_method', p_payment_method,
      'reference', p_reference,
      'status', p_status
    ));

  RETURN payment_id;
END;
$$;

-- ============================================
-- UPDATE: Update payment with ledger recalculation
-- ============================================
CREATE OR REPLACE FUNCTION public.update_payment(
  p_business_id UUID,
  p_payment_id UUID,
  p_amount NUMERIC DEFAULT NULL,
  p_payment_date DATE DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL,
  p_reference TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payment_rec RECORD;
  actor_id UUID;
  old_amount NUMERIC;
  old_status TEXT;
  new_amount NUMERIC;
  new_status TEXT;
  amount_diff NUMERIC;
  customer_balance_before NUMERIC;
  ledger_balance NUMERIC;
  payment_desc TEXT;
BEGIN
  -- Check permissions
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'payments.edit') THEN
    RAISE EXCEPTION 'FORBIDDEN: payments.edit' USING ERRCODE = '42501';
  END IF;

  -- Get actor
  SELECT id INTO actor_id
  FROM public.users
  WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE';
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  -- Get and lock payment
  SELECT * INTO payment_rec
  FROM public.payments
  WHERE id = p_payment_id AND business_id = p_business_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND';
  END IF;

  old_amount := payment_rec.amount;
  old_status := payment_rec.status;
  new_amount := COALESCE(p_amount, old_amount);
  new_status := COALESCE(p_status, old_status);

  -- Validate amount
  IF new_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = '23514';
  END IF;

  -- If order linked, check overpayment
  IF payment_rec.order_id IS NOT NULL AND new_status = 'SUCCESS' AND new_amount > old_amount THEN
    -- Check current order due
    DECLARE
      order_due NUMERIC;
    BEGIN
      SELECT due_amount + old_amount INTO order_due
      FROM public.orders
      WHERE id = payment_rec.order_id AND business_id = p_business_id;
      IF new_amount > order_due THEN
        RAISE EXCEPTION 'OVERPAYMENT_NOT_ALLOWED' USING ERRCODE = '23514';
      END IF;
    END;
  END IF;

  -- Calculate balance before this payment in ledger
  customer_balance_before := public.get_customer_balance(p_business_id, payment_rec.customer_id, payment_rec.payment_date);

  -- Update payment
  UPDATE public.payments SET
    amount = new_amount,
    payment_date = COALESCE(p_payment_date, payment_date),
    payment_method = COALESCE(p_payment_method, payment_method),
    reference = COALESCE(p_reference, reference),
    notes = COALESCE(p_notes, notes),
    status = new_status,
    updated_at = NOW()
  WHERE id = p_payment_id AND business_id = p_business_id;

  -- Handle ledger changes based on status transitions
  IF old_status = 'SUCCESS' AND new_status != 'SUCCESS' THEN
    -- Payment was successful, now failed/refunded/pending - remove credit from ledger
    DELETE FROM public.customer_ledger
    WHERE payment_id = p_payment_id AND business_id = p_business_id;

    -- Update order if linked
    IF payment_rec.order_id IS NOT NULL THEN
      UPDATE public.orders
      SET paid_amount = paid_amount - old_amount,
          due_amount = LEAST(total_amount - (paid_amount - old_amount), total_amount),
          updated_at = NOW()
      WHERE id = payment_rec.order_id AND business_id = p_business_id;
    END IF;

  ELSIF old_status != 'SUCCESS' AND new_status = 'SUCCESS' THEN
    -- Payment was failed/pending, now successful - add credit to ledger
    ledger_balance := customer_balance_before - new_amount;
    payment_desc := 'Payment received';
    IF payment_rec.order_id IS NOT NULL THEN
      DECLARE order_rec RECORD;
      BEGIN
        SELECT order_number INTO order_rec
        FROM public.orders
        WHERE id = payment_rec.order_id AND business_id = p_business_id;
        payment_desc := payment_desc || ' for order ' || order_rec.order_number;
      END;
    END IF;
    IF COALESCE(p_reference, payment_rec.reference) IS NOT NULL THEN
      payment_desc := payment_desc || ' (Ref: ' || COALESCE(p_reference, payment_rec.reference) || ')';
    END IF;

    INSERT INTO public.customer_ledger (
      business_id, customer_id, order_id, payment_id,
      entry_type, description, debit, credit, balance, entry_date, created_by
    ) VALUES (
      p_business_id, payment_rec.customer_id, payment_rec.order_id, p_payment_id,
      'PAYMENT', payment_desc, 0, new_amount, ledger_balance,
      COALESCE(p_payment_date, payment_rec.payment_date), actor_id
    );

    -- Update order if linked
    IF payment_rec.order_id IS NOT NULL THEN
      UPDATE public.orders
      SET paid_amount = paid_amount + new_amount,
          due_amount = GREATEST(total_amount - (paid_amount + new_amount), 0),
          updated_at = NOW()
      WHERE id = payment_rec.order_id AND business_id = p_business_id;
    END IF;

  ELSIF old_status = 'SUCCESS' AND new_status = 'SUCCESS' AND new_amount != old_amount THEN
    -- Amount changed for successful payment - update ledger entry
    amount_diff := new_amount - old_amount;
    ledger_balance := customer_balance_before - new_amount;

    UPDATE public.customer_ledger SET
      credit = new_amount,
      balance = ledger_balance,
      entry_date = COALESCE(p_payment_date, payment_rec.payment_date),
      description = CASE
        WHEN payment_rec.order_id IS NOT NULL THEN
          'Payment received for order ' || (SELECT order_number FROM public.orders WHERE id = payment_rec.order_id)
        ELSE 'Payment received'
      END || CASE WHEN COALESCE(p_reference, payment_rec.reference) IS NOT NULL THEN ' (Ref: ' || COALESCE(p_reference, payment_rec.reference) || ')' ELSE '' END
    WHERE payment_id = p_payment_id AND business_id = p_business_id;

    -- Update order if linked
    IF payment_rec.order_id IS NOT NULL THEN
      UPDATE public.orders
      SET paid_amount = paid_amount + amount_diff,
          due_amount = GREATEST(total_amount - (paid_amount + amount_diff), 0),
          updated_at = NOW()
      WHERE id = payment_rec.order_id AND business_id = p_business_id;
    END IF;
  END IF;

  -- Audit log
  INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (p_business_id, actor_id, 'PAYMENT_UPDATED', 'payment', p_payment_id,
    jsonb_build_object(
      'amount', old_amount,
      'payment_date', payment_rec.payment_date,
      'payment_method', payment_rec.payment_method,
      'reference', payment_rec.reference,
      'status', old_status
    ),
    jsonb_build_object(
      'amount', new_amount,
      'payment_date', COALESCE(p_payment_date, payment_rec.payment_date),
      'payment_method', COALESCE(p_payment_method, payment_rec.payment_method),
      'reference', COALESCE(p_reference, payment_rec.reference),
      'status', new_status
    ));
END;
$$;

-- ============================================
-- DELETE: Delete payment with ledger reversal
-- ============================================
CREATE OR REPLACE FUNCTION public.delete_payment(
  p_business_id UUID,
  p_payment_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payment_rec RECORD;
  actor_id UUID;
  customer_balance_before NUMERIC;
BEGIN
  -- Check permissions
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'payments.delete') THEN
    RAISE EXCEPTION 'FORBIDDEN: payments.delete' USING ERRCODE = '42501';
  END IF;

  -- Get actor
  SELECT id INTO actor_id
  FROM public.users
  WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE';
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  -- Get and lock payment
  SELECT * INTO payment_rec
  FROM public.payments
  WHERE id = p_payment_id AND business_id = p_business_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAYMENT_NOT_FOUND';
  END IF;

  -- If payment was successful, reverse it
  IF payment_rec.status = 'SUCCESS' THEN
    -- Calculate balance before this payment
    customer_balance_before := public.get_customer_balance(p_business_id, payment_rec.customer_id, payment_rec.payment_date);

    -- Remove ledger entry
    DELETE FROM public.customer_ledger
    WHERE payment_id = p_payment_id AND business_id = p_business_id;

    -- Update order if linked
    IF payment_rec.order_id IS NOT NULL THEN
      UPDATE public.orders
      SET paid_amount = paid_amount - payment_rec.amount,
          due_amount = LEAST(total_amount - (paid_amount - payment_rec.amount), total_amount),
          updated_at = NOW()
      WHERE id = payment_rec.order_id AND business_id = p_business_id;
    END IF;
  END IF;

  -- Soft delete payment by setting status to REFUNDED (preserve history)
  UPDATE public.payments
  SET status = 'REFUNDED',
      notes = COALESCE(notes, '') || ' [DELETED: ' || p_reason || ']',
      updated_at = NOW()
  WHERE id = p_payment_id AND business_id = p_business_id;

  -- Audit log
  INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (p_business_id, actor_id, 'PAYMENT_DELETED', 'payment', p_payment_id,
    jsonb_build_object(
      'payment_number', payment_rec.payment_number,
      'amount', payment_rec.amount,
      'status', payment_rec.status,
      'reason', p_reason
    ),
    jsonb_build_object('status', 'REFUNDED', 'deleted', true));
END;
$$;

-- ============================================
-- TRIGGER: Create ledger entry when order is confirmed (INVOICE)
-- ============================================
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
  -- Only on status change to CONFIRMED
  IF OLD.status = 'CONFIRMED' OR NEW.status != 'CONFIRMED' THEN
    RETURN NEW;
  END IF;

  -- Get actor
  SELECT id INTO actor_id
  FROM public.users
  WHERE auth_user_id = auth.uid() AND business_id = NEW.business_id AND status = 'ACTIVE';

  -- Get current customer balance
  customer_balance := public.get_customer_balance(NEW.business_id, NEW.customer_id);
  ledger_balance := customer_balance + NEW.total_amount;

  -- Create ledger entry for invoice (debit - increases customer balance)
  INSERT INTO public.customer_ledger (
    business_id, customer_id, order_id,
    entry_type, description, debit, credit, balance, entry_date, created_by
  ) VALUES (
    NEW.business_id, NEW.customer_id, NEW.id,
    'INVOICE', 'Invoice ' || NEW.order_number, NEW.total_amount, 0, ledger_balance, NEW.order_date, actor_id
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER order_invoice_ledger
AFTER UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.create_invoice_ledger_entry();

-- ============================================
-- FUNCTION: Recalculate customer ledger balances (for data integrity)
-- ============================================
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
BEGIN
  -- Check permissions
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'payments.edit') THEN
    RAISE EXCEPTION 'FORBIDDEN: payments.edit' USING ERRCODE = '42501';
  END IF;

  -- Update balances in chronological order
  FOR ledger_rec IN
    SELECT id, debit, credit
    FROM public.customer_ledger
    WHERE business_id = p_business_id AND customer_id = p_customer_id
    ORDER BY entry_date, created_at
  LOOP
    running_balance := running_balance + ledger_rec.debit - ledger_rec.credit;
    UPDATE public.customer_ledger
    SET balance = running_balance
    WHERE id = ledger_rec.id;
  END LOOP;
END;
$$;

-- ============================================
-- RPC: List payments with filters
-- ============================================
CREATE OR REPLACE FUNCTION public.list_payments(
  p_business_id UUID,
  p_status TEXT DEFAULT NULL,
  p_customer_id UUID DEFAULT NULL,
  p_order_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS SETOF record
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
    c.name as customer_name,
    c.company_name as customer_company,
    p.order_id,
    o.order_number,
    p.payment_number,
    p.amount,
    p.payment_date,
    p.payment_method,
    p.reference,
    p.status,
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

-- ============================================
-- RPC: Get payment with details
-- ============================================
CREATE OR REPLACE FUNCTION public.get_payment_with_details(
  p_business_id UUID,
  p_payment_id UUID
)
RETURNS SETOF record
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
    c.name as customer_name,
    c.company_name as customer_company,
    p.order_id,
    o.order_number,
    p.payment_number,
    p.amount,
    p.payment_date,
    p.payment_method,
    p.reference,
    p.notes,
    p.status,
    p.created_at,
    p.updated_at
  FROM public.payments p
  JOIN public.customers c ON c.id = p.customer_id AND c.business_id = p_business_id
  LEFT JOIN public.orders o ON o.id = p.order_id AND o.business_id = p_business_id
  WHERE p.id = p_payment_id AND p.business_id = p_business_id;
END;
$$;

-- ============================================
-- RPC: Get customer ledger
-- ============================================
CREATE OR REPLACE FUNCTION public.get_customer_ledger(
  p_business_id UUID,
  p_customer_id UUID,
  p_limit INTEGER DEFAULT 100,
  p_offset INTEGER DEFAULT 0
)
RETURNS SETOF record
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
    c.name as customer_name,
    cl.order_id,
    o.order_number,
    cl.payment_id,
    p.payment_number,
    cl.entry_type,
    cl.description,
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

-- ============================================
-- RPC: Get customer summary (totals)
-- ============================================
CREATE OR REPLACE FUNCTION public.get_customer_summary(
  p_business_id UUID,
  p_customer_id UUID
)
RETURNS SETOF record
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_purchases NUMERIC := 0;
  total_paid NUMERIC := 0;
  last_payment_date DATE;
  last_payment_amount NUMERIC;
BEGIN
  IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'payments.view') THEN
    RAISE EXCEPTION 'FORBIDDEN: payments.view' USING ERRCODE = '42501';
  END IF;

  -- Get customer name
  DECLARE
    customer_name TEXT;
    customer_company TEXT;
  BEGIN
    SELECT name, company_name INTO customer_name, customer_company
    FROM public.customers
    WHERE id = p_customer_id AND business_id = p_business_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CUSTOMER_NOT_FOUND';
    END IF;

    -- Total purchases (sum of invoices)
    SELECT COALESCE(SUM(debit), 0) INTO total_purchases
    FROM public.customer_ledger
    WHERE business_id = p_business_id
      AND customer_id = p_customer_id
      AND entry_type = 'INVOICE';

    -- Total paid (sum of successful payments)
    SELECT COALESCE(SUM(credit), 0) INTO total_paid
    FROM public.customer_ledger
    WHERE business_id = p_business_id
      AND customer_id = p_customer_id
      AND entry_type = 'PAYMENT';

    -- Last payment info
    SELECT entry_date, credit INTO last_payment_date, last_payment_amount
    FROM public.customer_ledger
    WHERE business_id = p_business_id
      AND customer_id = p_customer_id
      AND entry_type = 'PAYMENT'
    ORDER BY entry_date DESC, created_at DESC
    LIMIT 1;

    RETURN QUERY SELECT
      p_customer_id as customer_id,
      customer_name,
      customer_company,
      total_purchases,
      total_paid,
      (total_purchases - total_paid) as total_due,
      last_payment_date,
      last_payment_amount;
  END;
END;
$$;

-- ============================================
-- PERMISSIONS
-- ============================================
INSERT INTO public.permissions (module, action, description) VALUES
  ('payments', 'view', 'View business payments'),
  ('payments', 'add', 'Create payments'),
  ('payments', 'edit', 'Edit payments and reverse entries'),
  ('payments', 'delete', 'Delete/refund payments')
ON CONFLICT (module, action) DO UPDATE SET description = EXCLUDED.description;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.module = 'payments'
WHERE replace(lower(trim(r.name)), ' ', '_') IN ('super_admin', 'admin', 'manager')
  AND p.action IN ('view', 'add')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.module = 'payments' AND p.action = 'edit'
WHERE replace(lower(trim(r.name)), ' ', '_') IN ('super_admin', 'admin', 'manager')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.module = 'payments' AND p.action = 'delete'
WHERE replace(lower(trim(r.name)), ' ', '_') = 'super_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_ledger ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.payments TO authenticated;
GRANT SELECT ON public.customer_ledger TO authenticated;
REVOKE DELETE ON public.payments FROM anon, authenticated;
REVOKE DELETE ON public.customer_ledger FROM anon, authenticated;
GRANT ALL ON public.payments, public.customer_ledger TO service_role;

DO $$
DECLARE policy_record RECORD;
BEGIN
  FOR policy_record IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('payments', 'customer_ledger')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', policy_record.policyname, policy_record.tablename);
  END LOOP;
END;
$$;

-- Payments policies
CREATE POLICY payments_select_business ON public.payments
FOR SELECT USING (
  public.is_business_member(business_id)
  AND public.has_business_permission(business_id, 'payments.view')
);

CREATE POLICY payments_insert_business ON public.payments
FOR INSERT WITH CHECK (
  public.is_business_member(business_id)
  AND public.has_business_permission(business_id, 'payments.add')
);

CREATE POLICY payments_update_business ON public.payments
FOR UPDATE USING (
  public.is_business_member(business_id)
  AND public.has_business_permission(business_id, 'payments.edit')
)
WITH CHECK (
  public.is_business_member(business_id)
  AND public.has_business_permission(business_id, 'payments.edit')
);

-- Customer Ledger policies (view only through payments module)
CREATE POLICY customer_ledger_select_business ON public.customer_ledger
FOR SELECT USING (
  public.is_business_member(business_id)
  AND public.has_business_permission(business_id, 'payments.view')
);

COMMIT;