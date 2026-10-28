-- ====================================================================
-- MIGRATION: 202610280007_payment_number_and_idempotency.sql
-- Description: Step 8 - Unique Payment Number and Duplicate Payment Protection
-- Features:
-- 1. Add idempotency_key, transaction_id, and utr_number columns to payments
-- 2. Create payment_sequences table for atomic counter per business & year
-- 3. Implement generate_next_payment_number (PAY-YYYY-000001)
-- 4. Implement duplicate detection (transaction_id, electronic UTR/reference)
-- 5. Preserve genuine separate payments (CASH, same date/amount with distinct references)
-- 6. Guarantee exactly-once ledger and order due impact
-- ====================================================================

-- 1. Add new columns to public.payments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'idempotency_key'
  ) THEN
    ALTER TABLE public.payments ADD COLUMN idempotency_key TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'transaction_id'
  ) THEN
    ALTER TABLE public.payments ADD COLUMN transaction_id TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'utr_number'
  ) THEN
    ALTER TABLE public.payments ADD COLUMN utr_number TEXT;
  END IF;
END $$;

-- 2. Indexes for idempotency and duplicate detection
CREATE UNIQUE INDEX IF NOT EXISTS payments_idempotency_key_idx 
ON public.payments (business_id, idempotency_key) 
WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS payments_transaction_id_idx 
ON public.payments (business_id, transaction_id) 
WHERE transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS payments_utr_number_idx 
ON public.payments (business_id, utr_number) 
WHERE utr_number IS NOT NULL;

-- 3. Atomic payment sequences table per business and year
CREATE TABLE IF NOT EXISTS public.payment_sequences (
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  year INT NOT NULL,
  prefix TEXT NOT NULL DEFAULT 'PAY-',
  next_val BIGINT NOT NULL DEFAULT 1,
  padding INT NOT NULL DEFAULT 6,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (business_id, year)
);

ALTER TABLE public.payment_sequences ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payment_sequences' AND policyname = 'payment_sequences_business_member_all'
  ) THEN
    CREATE POLICY payment_sequences_business_member_all ON public.payment_sequences
      FOR ALL
      TO authenticated
      USING (public.is_business_member(business_id))
      WITH CHECK (public.is_business_member(business_id));
  END IF;
END $$;

-- 4. Atomic function to generate next payment number: PAY-YYYY-000001
CREATE OR REPLACE FUNCTION public.generate_next_payment_number(
  p_business_id UUID,
  p_year INT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_year INT;
  v_seq RECORD;
  v_num BIGINT;
  v_result TEXT;
  v_padding INT := 6;
BEGIN
  v_year := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::INT);

  -- Lock sequence row for update to ensure atomic serialisation under concurrency
  SELECT * INTO v_seq
  FROM public.payment_sequences
  WHERE business_id = p_business_id AND year = v_year
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Initialize next_val from any existing payments for this year
    SELECT COALESCE(
      MAX(NULLIF(SUBSTRING(payment_number FROM '^PAY-[0-9]{4}-0*([0-9]+)$'), '')::BIGINT),
      0
    ) + 1 INTO v_num
    FROM public.payments
    WHERE business_id = p_business_id AND payment_number ~ ('^PAY-' || v_year::TEXT || '-[0-9]+$');

    v_num := GREATEST(COALESCE(v_num, 1), 1);

    INSERT INTO public.payment_sequences (business_id, year, prefix, next_val, padding, updated_at)
    VALUES (p_business_id, v_year, 'PAY-', v_num + 1, v_padding, NOW())
    ON CONFLICT (business_id, year) DO UPDATE
      SET next_val = GREATEST(payment_sequences.next_val, EXCLUDED.next_val),
          updated_at = NOW();

    v_result := 'PAY-' || v_year::TEXT || '-' || LPAD(v_num::TEXT, v_padding, '0');
    RETURN v_result;
  END IF;

  v_num := v_seq.next_val;
  v_padding := v_seq.padding;

  UPDATE public.payment_sequences
  SET next_val = v_num + 1,
      updated_at = NOW()
  WHERE business_id = p_business_id AND year = v_year;

  v_result := 'PAY-' || v_year::TEXT || '-' || LPAD(v_num::TEXT, v_padding, '0');
  RETURN v_result;
END;
$$;

-- Backward compatible alias
CREATE OR REPLACE FUNCTION public.get_next_payment_number(
  p_business_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.generate_next_payment_number(p_business_id, EXTRACT(YEAR FROM CURRENT_DATE)::INT);
END;
$$;

-- 5. Drop obsolete create_payment overloads
DROP FUNCTION IF EXISTS public.create_payment(UUID, UUID, NUMERIC, DATE, TEXT, UUID, TEXT, TEXT, TEXT);

-- 6. Upgraded create_payment with atomic idempotency, duplicate checks, and ledger updates
CREATE OR REPLACE FUNCTION public.create_payment(
  p_business_id UUID,
  p_customer_id UUID,
  p_amount NUMERIC,
  p_payment_date DATE,
  p_payment_method TEXT,
  p_order_id UUID DEFAULT NULL,
  p_reference TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_status TEXT DEFAULT 'SUCCESS',
  p_idempotency_key TEXT DEFAULT NULL,
  p_transaction_id TEXT DEFAULT NULL,
  p_utr_number TEXT DEFAULT NULL,
  p_allow_duplicate_reference BOOLEAN DEFAULT FALSE,
  p_operator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment_id UUID;
  v_payment_number TEXT;
  v_actor_id UUID;
  v_customer_rec RECORD;
  v_order_rec RECORD;
  v_current_balance NUMERIC;
  v_ledger_balance NUMERIC;
  v_payment_desc TEXT;
  v_clean_ref TEXT;
  v_clean_txn TEXT;
  v_clean_idemp TEXT;
  v_clean_method TEXT;
  v_matched_pay RECORD;
  v_existing_idemp RECORD;
  v_year INT;
BEGIN
  -- Permission check
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_business_member(p_business_id) OR NOT public.has_business_permission(p_business_id, 'payments.add') THEN
      RAISE EXCEPTION 'FORBIDDEN: payments.add' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Resolve operator / actor
  v_actor_id := p_operator_id;
  IF v_actor_id IS NULL AND auth.uid() IS NOT NULL THEN
    SELECT id INTO v_actor_id
    FROM public.users
    WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE';
  END IF;
  IF v_actor_id IS NULL THEN
    SELECT id INTO v_actor_id
    FROM public.users
    WHERE business_id = p_business_id AND status = 'ACTIVE'
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  -- Validate amount
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT: Payment amount must be greater than zero' USING ERRCODE = '23514';
  END IF;

  v_clean_idemp := NULLIF(btrim(p_idempotency_key), '');
  v_clean_txn := NULLIF(btrim(p_transaction_id), '');
  v_clean_ref := NULLIF(btrim(COALESCE(p_utr_number, p_reference, '')), '');
  v_clean_method := UPPER(btrim(p_payment_method));

  -- Idempotency check: if request with this idempotency key was already posted, return original
  IF v_clean_idemp IS NOT NULL THEN
    SELECT * INTO v_existing_idemp
    FROM public.payments
    WHERE business_id = p_business_id AND idempotency_key = v_clean_idemp;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'already_processed', true,
        'payment_id', v_existing_idemp.id,
        'payment_number', v_existing_idemp.payment_number,
        'status', v_existing_idemp.status,
        'amount', v_existing_idemp.amount
      );
    END IF;
  END IF;

  -- Lock and validate customer
  SELECT * INTO v_customer_rec
  FROM public.customers
  WHERE id = p_customer_id AND business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CUSTOMER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- If linked to order, lock and validate order
  IF p_order_id IS NOT NULL THEN
    SELECT * INTO v_order_rec
    FROM public.orders
    WHERE id = p_order_id AND business_id = p_business_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ORDER_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;
    IF v_order_rec.customer_id != p_customer_id THEN
      RAISE EXCEPTION 'ORDER_CUSTOMER_MISMATCH: Order does not belong to the selected customer' USING ERRCODE = '23514';
    END IF;
    IF v_order_rec.status = 'CANCELLED' THEN
      RAISE EXCEPTION 'CANNOT_PAY_CANCELLED_ORDER' USING ERRCODE = '23514';
    END IF;

    -- Strict overpayment check for order payments
    IF p_status = 'SUCCESS' AND p_amount > (v_order_rec.due_amount + 0.001) THEN
      RAISE EXCEPTION 'OVERPAYMENT_NOT_ALLOWED: Payment amount (₹%) exceeds order due balance (₹%)',
        p_amount, v_order_rec.due_amount USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Duplicate Detection 1: External Transaction ID check
  IF v_clean_txn IS NOT NULL THEN
    SELECT * INTO v_matched_pay
    FROM public.payments
    WHERE business_id = p_business_id 
      AND transaction_id = v_clean_txn
      AND status IN ('SUCCESS', 'PENDING');

    IF FOUND THEN
      RAISE EXCEPTION 'DUPLICATE_TRANSACTION: External Transaction ID "%" has already been recorded for payment %',
        v_clean_txn, v_matched_pay.payment_number USING ERRCODE = '23505';
    END IF;
  END IF;

  -- Duplicate Detection 2: Electronic Bank UTR / Reference check
  -- CASH payments or empty references are never blocked as duplicate UTRs
  IF v_clean_method <> 'CASH' AND v_clean_ref IS NOT NULL AND NOT p_allow_duplicate_reference THEN
    SELECT * INTO v_matched_pay
    FROM public.payments
    WHERE business_id = p_business_id 
      AND (utr_number = v_clean_ref OR reference = v_clean_ref)
      AND status IN ('SUCCESS', 'PENDING');

    IF FOUND THEN
      RAISE EXCEPTION 'DUPLICATE_REFERENCE: Bank UTR/Reference "%" has already been recorded for payment % on %',
        v_clean_ref, v_matched_pay.payment_number, v_matched_pay.payment_date USING ERRCODE = '23505';
    END IF;
  END IF;

  -- Generate atomic unique Payment Number (PAY-YYYY-000001)
  v_year := EXTRACT(YEAR FROM COALESCE(p_payment_date, CURRENT_DATE))::INT;
  v_payment_number := public.generate_next_payment_number(p_business_id, v_year);

  -- Get current customer running balance
  v_current_balance := public.get_customer_balance(p_business_id, p_customer_id);

  -- Insert payment record atomically
  INSERT INTO public.payments (
    business_id, customer_id, order_id, payment_number,
    amount, payment_date, payment_method, reference, notes, status,
    idempotency_key, transaction_id, utr_number
  ) VALUES (
    p_business_id, p_customer_id, p_order_id, v_payment_number,
    p_amount, COALESCE(p_payment_date, CURRENT_DATE), v_clean_method, v_clean_ref, p_notes, p_status,
    v_clean_idemp, v_clean_txn, v_clean_ref
  ) RETURNING id INTO v_payment_id;

  -- Process ledger entry and order dues if SUCCESS
  IF p_status = 'SUCCESS' THEN
    v_ledger_balance := v_current_balance - p_amount;
    
    IF p_order_id IS NOT NULL THEN
      v_payment_desc := 'Payment received for order ' || v_order_rec.order_number;
    ELSE
      v_payment_desc := 'Payment received (Customer Advance)';
    END IF;

    IF v_clean_ref IS NOT NULL THEN
      v_payment_desc := v_payment_desc || ' (Ref: ' || v_clean_ref || ')';
    END IF;

    -- Insert into customer ledger
    INSERT INTO public.customer_ledger (
      business_id, customer_id, order_id, payment_id,
      entry_type, description, debit, credit, balance, entry_date, created_by
    ) VALUES (
      p_business_id, p_customer_id, p_order_id, v_payment_id,
      'PAYMENT', v_payment_desc, 0, p_amount, v_ledger_balance, COALESCE(p_payment_date, CURRENT_DATE), v_actor_id
    );

    -- Adjust order paid_amount and due_amount
    IF p_order_id IS NOT NULL THEN
      UPDATE public.orders
      SET paid_amount = paid_amount + p_amount,
          due_amount = GREATEST(0, due_amount - p_amount),
          updated_at = NOW()
      WHERE id = p_order_id AND business_id = p_business_id;
    END IF;
  END IF;

  -- Audit log: PAYMENT_CREATED
  INSERT INTO public.audit_logs (
    business_id, user_id, action, entity_type, entity_id, new_data
  ) VALUES (
    p_business_id, v_actor_id, 'PAYMENT_CREATED', 'payment', v_payment_id,
    jsonb_build_object(
      'payment_number', v_payment_number,
      'customer_id', p_customer_id,
      'order_id', p_order_id,
      'amount', p_amount,
      'payment_date', COALESCE(p_payment_date, CURRENT_DATE),
      'payment_method', v_clean_method,
      'reference', v_clean_ref,
      'transaction_id', v_clean_txn,
      'idempotency_key', v_clean_idemp,
      'status', p_status
    )
  );

  IF p_allow_duplicate_reference AND v_matched_pay.payment_number IS NOT NULL THEN
    INSERT INTO public.audit_logs (
      business_id, user_id, action, entity_type, entity_id, new_data
    ) VALUES (
      p_business_id, v_actor_id, 'PAYMENT_DUPLICATE_REFERENCE_OVERRIDE', 'payment', v_payment_id,
      jsonb_build_object(
        'payment_number', v_payment_number,
        'reference', v_clean_ref,
        'matched_prior_payment', v_matched_pay.payment_number
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'already_processed', false,
    'payment_id', v_payment_id,
    'payment_number', v_payment_number,
    'status', p_status,
    'amount', p_amount
  );
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.generate_next_payment_number(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_next_payment_number(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_payment(UUID, UUID, NUMERIC, DATE, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN, UUID) TO authenticated;
