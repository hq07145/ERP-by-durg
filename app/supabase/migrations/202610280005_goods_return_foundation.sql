-- ====================================================================
-- MIGRATION: 202610280005_goods_return_foundation.sql
-- Description: Goods Return Database Foundation for SANKALP IRRIGATION ERP
-- Features:
-- 1. Atomic return sequence generator: RET-YYYY-000001
-- 2. goods_returns header table linked to customer, order, delivery, invoice, and SKU
-- 3. goods_return_items table for multi-item return breakdown
-- 4. Linking return_id on customer_ledger
-- 5. Stored Procedures:
--    - generate_next_return_number(business_id, year)
--    - create_goods_return(...)
--    - approve_goods_return(...)
--    - reject_goods_return(...)
--    - post_goods_return(...) [atomic, idempotent, stock & financial adjustments]
--    - cancel_goods_return(...) [atomic, traceable reversal, preserves history]
--    - create_return_replacement_delivery(...) [uses existing DEL-YYYY-000001 sequence]
-- 6. Row-Level Security and Indexing
-- ====================================================================

-- 1. Create atomic return sequence counter table per business and year
CREATE TABLE IF NOT EXISTS public.return_sequences (
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE,
  year INT NOT NULL,
  prefix TEXT NOT NULL DEFAULT 'RET-',
  next_val BIGINT NOT NULL DEFAULT 1,
  padding INT NOT NULL DEFAULT 6,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (business_id, year)
);

ALTER TABLE public.return_sequences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'return_sequences' AND policyname = 'return_sequences_business_member_all'
  ) THEN
    CREATE POLICY return_sequences_business_member_all ON public.return_sequences
      FOR ALL
      TO authenticated
      USING (public.is_business_member(business_id))
      WITH CHECK (public.is_business_member(business_id));
  END IF;
END $$;

-- 2. Atomic function to generate return number: RET-YYYY-000001
CREATE OR REPLACE FUNCTION public.generate_next_return_number(
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

  -- Lock sequence row for update to serialize concurrent requests
  SELECT * INTO v_seq
  FROM public.return_sequences
  WHERE business_id = p_business_id AND year = v_year
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT COALESCE(
      MAX(NULLIF(SUBSTRING(return_number FROM '^RET-[0-9]{4}-0*([0-9]+)$'), '')::BIGINT),
      0
    ) + 1 INTO v_num
    FROM public.goods_returns
    WHERE business_id = p_business_id AND return_number ~ ('^RET-' || v_year::TEXT || '-[0-9]+$');

    v_num := GREATEST(COALESCE(v_num, 1), 1);

    INSERT INTO public.return_sequences (business_id, year, prefix, next_val, padding, updated_at)
    VALUES (p_business_id, v_year, 'RET-', v_num + 1, v_padding, NOW())
    ON CONFLICT (business_id, year) DO UPDATE
      SET next_val = GREATEST(return_sequences.next_val, EXCLUDED.next_val),
          updated_at = NOW()
    RETURNING * INTO v_seq;

    v_result := 'RET-' || v_year::TEXT || '-' || LPAD(v_num::TEXT, v_padding, '0');
    RETURN v_result;
  END IF;

  v_num := v_seq.next_val;
  v_padding := COALESCE(v_seq.padding, 6);

  -- Collision avoidance loop
  LOOP
    v_result := 'RET-' || v_year::TEXT || '-' || LPAD(v_num::TEXT, v_padding, '0');
    IF NOT EXISTS (
      SELECT 1 FROM public.goods_returns
      WHERE business_id = p_business_id AND return_number = v_result
    ) THEN
      EXIT;
    END IF;
    v_num := v_num + 1;
  END LOOP;

  -- Advance sequence
  UPDATE public.return_sequences
  SET next_val = v_num + 1, updated_at = NOW()
  WHERE business_id = p_business_id AND year = v_year;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_next_return_number(UUID, INT) TO authenticated, service_role;

-- 3. Create goods_returns header table
CREATE TABLE IF NOT EXISTS public.goods_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  return_number TEXT NOT NULL CHECK (return_number = upper(btrim(return_number))),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  order_id UUID REFERENCES public.orders(id) ON DELETE RESTRICT,
  delivery_id UUID REFERENCES public.deliveries(id) ON DELETE RESTRICT,
  invoice_number TEXT,
  return_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'PENDING_INSPECTION'
    CHECK (status IN ('PENDING_INSPECTION', 'APPROVED', 'REJECTED', 'POSTED', 'CANCELLED')),
  product_condition TEXT NOT NULL DEFAULT 'SALEABLE'
    CHECK (product_condition IN ('SALEABLE', 'DAMAGED', 'REWORK', 'SCRAP')),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) > 0),
  notes TEXT,
  adjustment_type TEXT
    CHECK (adjustment_type IS NULL OR adjustment_type IN ('CREDIT_NOTE', 'REFUND', 'REPLACEMENT', 'OTHER_ADJUSTMENT')),
  adjustment_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (adjustment_amount >= 0),
  
  -- Item Rollup / Single SKU reference
  product_id UUID REFERENCES public.products(id) ON DELETE RESTRICT,
  order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
  returned_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (returned_quantity >= 0),

  -- Linkages to adjustments
  replacement_delivery_id UUID REFERENCES public.deliveries(id) ON DELETE SET NULL,
  credit_note_ledger_id UUID REFERENCES public.customer_ledger(id) ON DELETE SET NULL,
  refund_payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,

  -- Inspection, Approval, Rejection & Posting Audits
  inspection_notes TEXT,
  inspected_by UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  inspected_at TIMESTAMPTZ,
  approved_by UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  approved_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  posted_by UUID REFERENCES public.users(id) ON DELETE RESTRICT,
  posted_at TIMESTAMPTZ,

  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT goods_returns_business_number_unique UNIQUE (business_id, return_number)
);

CREATE INDEX IF NOT EXISTS goods_returns_business_id_idx ON public.goods_returns (business_id);
CREATE INDEX IF NOT EXISTS goods_returns_business_customer_idx ON public.goods_returns (business_id, customer_id);
CREATE INDEX IF NOT EXISTS goods_returns_business_order_idx ON public.goods_returns (business_id, order_id);
CREATE INDEX IF NOT EXISTS goods_returns_business_delivery_idx ON public.goods_returns (business_id, delivery_id);
CREATE INDEX IF NOT EXISTS goods_returns_business_status_idx ON public.goods_returns (business_id, status);
CREATE INDEX IF NOT EXISTS goods_returns_business_date_idx ON public.goods_returns (business_id, return_date DESC);
CREATE INDEX IF NOT EXISTS goods_returns_business_product_idx ON public.goods_returns (business_id, product_id);

ALTER TABLE public.goods_returns ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'goods_returns' AND policyname = 'goods_returns_business_member_all'
  ) THEN
    CREATE POLICY goods_returns_business_member_all ON public.goods_returns
      FOR ALL
      TO authenticated
      USING (public.is_business_member(business_id))
      WITH CHECK (public.is_business_member(business_id));
  END IF;
END $$;

-- 4. Create goods_return_items table for line-item breakdown
CREATE TABLE IF NOT EXISTS public.goods_return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  goods_return_id UUID NOT NULL REFERENCES public.goods_returns(id) ON DELETE CASCADE,
  order_item_id UUID REFERENCES public.order_items(id) ON DELETE SET NULL,
  delivery_item_id UUID REFERENCES public.delivery_items(id) ON DELETE SET NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  returned_quantity NUMERIC(14, 3) NOT NULL CHECK (returned_quantity > 0),
  product_condition TEXT NOT NULL DEFAULT 'SALEABLE'
    CHECK (product_condition IN ('SALEABLE', 'DAMAGED', 'REWORK', 'SCRAP')),
  reason TEXT,
  unit_price NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  inventory_transaction_id UUID REFERENCES public.inventory_transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS goods_return_items_business_return_idx ON public.goods_return_items (business_id, goods_return_id);
CREATE INDEX IF NOT EXISTS goods_return_items_business_product_idx ON public.goods_return_items (business_id, product_id);
CREATE INDEX IF NOT EXISTS goods_return_items_order_item_idx ON public.goods_return_items (order_item_id);

ALTER TABLE public.goods_return_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'goods_return_items' AND policyname = 'goods_return_items_business_member_all'
  ) THEN
    CREATE POLICY goods_return_items_business_member_all ON public.goods_return_items
      FOR ALL
      TO authenticated
      USING (public.is_business_member(business_id))
      WITH CHECK (public.is_business_member(business_id));
  END IF;
END $$;

-- 5. Add return_id to customer_ledger if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'customer_ledger' AND column_name = 'return_id'
  ) THEN
    ALTER TABLE public.customer_ledger ADD COLUMN return_id UUID REFERENCES public.goods_returns(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS customer_ledger_business_return_idx ON public.customer_ledger (business_id, return_id);
  END IF;
END $$;

-- 6. Trigger for updated_at on goods_returns
CREATE OR REPLACE TRIGGER goods_returns_touch_updated_at
  BEFORE UPDATE ON public.goods_returns
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

-- ====================================================================
-- STORED PROCEDURES & BUSINESS LOGIC
-- ====================================================================

-- 7. CREATE GOODS RETURN RPC
CREATE OR REPLACE FUNCTION public.create_goods_return(
  p_business_id UUID,
  p_customer_id UUID,
  p_order_id UUID DEFAULT NULL,
  p_delivery_id UUID DEFAULT NULL,
  p_invoice_number TEXT DEFAULT NULL,
  p_product_id UUID DEFAULT NULL,
  p_order_item_id UUID DEFAULT NULL,
  p_returned_quantity NUMERIC DEFAULT NULL,
  p_product_condition TEXT DEFAULT 'SALEABLE',
  p_reason TEXT DEFAULT 'Customer Return',
  p_notes TEXT DEFAULT NULL,
  p_adjustment_type TEXT DEFAULT NULL,
  p_adjustment_amount NUMERIC DEFAULT 0,
  p_return_date DATE DEFAULT CURRENT_DATE,
  p_items JSONB DEFAULT NULL, -- Array of items: [{"product_id": UUID, "order_item_id": UUID, "delivery_item_id": UUID, "returned_quantity": NUMERIC, "product_condition": TEXT, "unit_price": NUMERIC, "reason": TEXT}]
  p_operator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_actor_id UUID;
  v_ret_number TEXT;
  v_return_id UUID;
  v_condition TEXT;
  v_total_qty NUMERIC := 0;
  v_total_amt NUMERIC := 0;
  v_item JSONB;
  v_item_pid UUID;
  v_item_oi_id UUID;
  v_item_di_id UUID;
  v_item_qty NUMERIC;
  v_item_cond TEXT;
  v_item_price NUMERIC;
  v_item_total NUMERIC;
  v_prev_returned NUMERIC;
  v_oi RECORD;
  v_cust RECORD;
BEGIN
  -- Validate business membership if authenticated
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_business_member(p_business_id) THEN
      RAISE EXCEPTION 'FORBIDDEN: Access denied' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Validate customer exists
  SELECT * INTO v_cust FROM public.customers WHERE id = p_customer_id AND business_id = p_business_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CUSTOMER_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Resolve actor
  v_actor_id := p_operator_id;
  IF v_actor_id IS NULL AND auth.uid() IS NOT NULL THEN
    SELECT id INTO v_actor_id
    FROM public.users
    WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE'
    LIMIT 1;
  END IF;
  IF v_actor_id IS NULL THEN
    SELECT id INTO v_actor_id
    FROM public.users
    WHERE business_id = p_business_id AND status = 'ACTIVE'
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'NO_VALID_USER_IN_BUSINESS' USING ERRCODE = '23503';
  END IF;

  -- Validate return reason
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'REASON_REQUIRED: A valid return reason is mandatory' USING ERRCODE = '23514';
  END IF;

  -- Normalize condition
  v_condition := UPPER(COALESCE(p_product_condition, 'SALEABLE'));
  IF v_condition NOT IN ('SALEABLE', 'DAMAGED', 'REWORK', 'SCRAP') THEN
    RAISE EXCEPTION 'INVALID_PRODUCT_CONDITION: %', v_condition USING ERRCODE = '23514';
  END IF;

  -- Generate atomic return number
  v_ret_number := public.generate_next_return_number(p_business_id);

  -- Process line items or single item
  IF p_items IS NOT NULL AND jsonb_array_length(p_items) > 0 THEN
    -- Header record inserted first with 0 initial quantity, updated after looping
    INSERT INTO public.goods_returns (
      business_id, return_number, customer_id, order_id, delivery_id, invoice_number,
      return_date, status, product_condition, reason, notes, adjustment_type, adjustment_amount,
      product_id, order_item_id, returned_quantity, created_by
    ) VALUES (
      p_business_id, v_ret_number, p_customer_id, p_order_id, p_delivery_id, p_invoice_number,
      COALESCE(p_return_date, CURRENT_DATE), 'PENDING_INSPECTION', v_condition, btrim(p_reason), p_notes,
      p_adjustment_type, COALESCE(p_adjustment_amount, 0),
      p_product_id, p_order_item_id, 0, v_actor_id
    ) RETURNING id INTO v_return_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
      v_item_pid := (v_item->>'product_id')::UUID;
      v_item_qty := COALESCE((v_item->>'returned_quantity')::NUMERIC, (v_item->>'quantity')::NUMERIC, 0);
      v_item_oi_id := NULLIF(v_item->>'order_item_id', '')::UUID;
      v_item_di_id := NULLIF(v_item->>'delivery_item_id', '')::UUID;
      v_item_cond := UPPER(COALESCE(v_item->>'product_condition', v_condition));
      v_item_price := COALESCE((v_item->>'unit_price')::NUMERIC, 0);
      v_item_total := v_item_qty * v_item_price;

      IF v_item_qty <= 0 THEN
        RAISE EXCEPTION 'INVALID_QUANTITY: Returned quantity must be greater than zero' USING ERRCODE = '23514';
      END IF;

      -- Quantity validation against order item if provided
      IF v_item_oi_id IS NOT NULL THEN
        SELECT * INTO v_oi FROM public.order_items WHERE id = v_item_oi_id;
        IF FOUND THEN
          SELECT COALESCE(SUM(gri.returned_quantity), 0) INTO v_prev_returned
          FROM public.goods_return_items gri
          JOIN public.goods_returns gr ON gri.goods_return_id = gr.id
          WHERE gri.order_item_id = v_item_oi_id AND gr.status NOT IN ('CANCELLED', 'REJECTED');

          IF (v_prev_returned + v_item_qty) > COALESCE(v_oi.delivered_quantity, v_oi.dispatched_quantity, v_oi.quantity) THEN
            RAISE EXCEPTION 'RETURN_QUANTITY_EXCEEDS_DELIVERED: Total return quantity % exceeds delivered quantity % for order item %',
              (v_prev_returned + v_item_qty), COALESCE(v_oi.delivered_quantity, v_oi.dispatched_quantity, v_oi.quantity), v_item_oi_id
              USING ERRCODE = '23514';
          END IF;
        END IF;
      END IF;

      INSERT INTO public.goods_return_items (
        business_id, goods_return_id, order_item_id, delivery_item_id, product_id,
        returned_quantity, product_condition, reason, unit_price, total_amount
      ) VALUES (
        p_business_id, v_return_id, v_item_oi_id, v_item_di_id, v_item_pid,
        v_item_qty, v_item_cond, COALESCE(v_item->>'reason', p_reason), v_item_price, v_item_total
      );

      v_total_qty := v_total_qty + v_item_qty;
      v_total_amt := v_total_amt + v_item_total;
      IF p_product_id IS NULL THEN
        p_product_id := v_item_pid;
      END IF;
      IF p_order_item_id IS NULL THEN
        p_order_item_id := v_item_oi_id;
      END IF;
    END LOOP;

    -- Update header rollup
    UPDATE public.goods_returns
    SET returned_quantity = v_total_qty,
        adjustment_amount = CASE WHEN COALESCE(p_adjustment_amount, 0) > 0 THEN p_adjustment_amount ELSE v_total_amt END,
        product_id = p_product_id,
        order_item_id = p_order_item_id
    WHERE id = v_return_id;
  ELSE
    -- Single SKU return validation
    IF p_product_id IS NULL THEN
      RAISE EXCEPTION 'PRODUCT_REQUIRED: Product ID is required for return' USING ERRCODE = '23514';
    END IF;
    IF COALESCE(p_returned_quantity, 0) <= 0 THEN
      RAISE EXCEPTION 'INVALID_QUANTITY: Returned quantity must be greater than zero' USING ERRCODE = '23514';
    END IF;

    -- Validate against order item if provided
    IF p_order_item_id IS NOT NULL THEN
      SELECT * INTO v_oi FROM public.order_items WHERE id = p_order_item_id;
      IF FOUND THEN
        SELECT COALESCE(SUM(returned_quantity), 0) INTO v_prev_returned
        FROM public.goods_returns
        WHERE order_item_id = p_order_item_id AND status NOT IN ('CANCELLED', 'REJECTED');

        IF (v_prev_returned + p_returned_quantity) > COALESCE(v_oi.delivered_quantity, v_oi.dispatched_quantity, v_oi.quantity) THEN
          RAISE EXCEPTION 'RETURN_QUANTITY_EXCEEDS_DELIVERED: Total return quantity % exceeds delivered quantity % for order item %',
            (v_prev_returned + p_returned_quantity), COALESCE(v_oi.delivered_quantity, v_oi.dispatched_quantity, v_oi.quantity), p_order_item_id
            USING ERRCODE = '23514';
        END IF;
      END IF;
    END IF;

    v_total_qty := p_returned_quantity;
    v_total_amt := COALESCE(p_adjustment_amount, 0);

    INSERT INTO public.goods_returns (
      business_id, return_number, customer_id, order_id, delivery_id, invoice_number,
      return_date, status, product_condition, reason, notes, adjustment_type, adjustment_amount,
      product_id, order_item_id, returned_quantity, created_by
    ) VALUES (
      p_business_id, v_ret_number, p_customer_id, p_order_id, p_delivery_id, p_invoice_number,
      COALESCE(p_return_date, CURRENT_DATE), 'PENDING_INSPECTION', v_condition, btrim(p_reason), p_notes,
      p_adjustment_type, v_total_amt,
      p_product_id, p_order_item_id, v_total_qty, v_actor_id
    ) RETURNING id INTO v_return_id;

    -- Also insert line item for uniform queries
    INSERT INTO public.goods_return_items (
      business_id, goods_return_id, order_item_id, product_id,
      returned_quantity, product_condition, reason, unit_price, total_amount
    ) VALUES (
      p_business_id, v_return_id, p_order_item_id, p_product_id,
      v_total_qty, v_condition, btrim(p_reason),
      CASE WHEN v_total_qty > 0 THEN v_total_amt / v_total_qty ELSE 0 END,
      v_total_amt
    );
  END IF;

  -- Audit log: GOODS_RETURN_CREATED
  INSERT INTO public.audit_logs (
    business_id, user_id, action, entity_type, entity_id, new_data
  ) VALUES (
    p_business_id, v_actor_id, 'GOODS_RETURN_CREATED', 'goods_returns', v_return_id,
    jsonb_build_object(
      'return_number', v_ret_number,
      'customer_id', p_customer_id,
      'order_id', p_order_id,
      'delivery_id', p_delivery_id,
      'returned_quantity', v_total_qty,
      'product_condition', v_condition,
      'status', 'PENDING_INSPECTION'
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'return_id', v_return_id,
    'return_number', v_ret_number,
    'status', 'PENDING_INSPECTION',
    'returned_quantity', v_total_qty
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_goods_return(
  UUID, UUID, UUID, UUID, TEXT, UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, NUMERIC, DATE, JSONB, UUID
) TO authenticated, service_role;

-- 8. APPROVE GOODS RETURN RPC (Does NOT post stock or financial changes)
CREATE OR REPLACE FUNCTION public.approve_goods_return(
  p_business_id UUID,
  p_return_id UUID,
  p_product_condition TEXT DEFAULT NULL,
  p_adjustment_type TEXT DEFAULT NULL,
  p_adjustment_amount NUMERIC DEFAULT NULL,
  p_inspection_notes TEXT DEFAULT NULL,
  p_operator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_ret RECORD;
  v_actor_id UUID;
  v_condition TEXT;
  v_adj_type TEXT;
  v_adj_amt NUMERIC;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_business_member(p_business_id) THEN
      RAISE EXCEPTION 'FORBIDDEN: Access denied' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_ret
  FROM public.goods_returns
  WHERE id = p_return_id AND business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GOODS_RETURN_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_ret.status = 'APPROVED' THEN
    RETURN jsonb_build_object('success', true, 'already_approved', true, 'return_id', v_ret.id, 'status', 'APPROVED');
  END IF;

  IF v_ret.status <> 'PENDING_INSPECTION' THEN
    RAISE EXCEPTION 'CANNOT_APPROVE_NON_PENDING_RETURN: Return status is %', v_ret.status USING ERRCODE = '23514';
  END IF;

  -- Resolve actor
  v_actor_id := p_operator_id;
  IF v_actor_id IS NULL AND auth.uid() IS NOT NULL THEN
    SELECT id INTO v_actor_id
    FROM public.users
    WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE'
    LIMIT 1;
  END IF;
  IF v_actor_id IS NULL THEN
    SELECT id INTO v_actor_id
    FROM public.users
    WHERE business_id = p_business_id AND status = 'ACTIVE'
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  v_condition := UPPER(COALESCE(p_product_condition, v_ret.product_condition, 'SALEABLE'));
  v_adj_type := UPPER(COALESCE(p_adjustment_type, v_ret.adjustment_type));
  v_adj_amt := COALESCE(p_adjustment_amount, v_ret.adjustment_amount, 0);

  UPDATE public.goods_returns
  SET status = 'APPROVED',
      product_condition = v_condition,
      adjustment_type = v_adj_type,
      adjustment_amount = v_adj_amt,
      inspection_notes = COALESCE(p_inspection_notes, inspection_notes),
      inspected_by = v_actor_id,
      inspected_at = NOW(),
      approved_by = v_actor_id,
      approved_at = NOW(),
      updated_at = NOW()
  WHERE id = p_return_id;

  -- If line items condition updated
  IF p_product_condition IS NOT NULL THEN
    UPDATE public.goods_return_items
    SET product_condition = v_condition
    WHERE goods_return_id = p_return_id;
  END IF;

  -- Audit log: GOODS_RETURN_APPROVED
  INSERT INTO public.audit_logs (
    business_id, user_id, action, entity_type, entity_id, old_data, new_data
  ) VALUES (
    p_business_id, v_actor_id, 'GOODS_RETURN_APPROVED', 'goods_returns', p_return_id,
    jsonb_build_object('status', v_ret.status),
    jsonb_build_object('status', 'APPROVED', 'product_condition', v_condition, 'adjustment_type', v_adj_type, 'adjustment_amount', v_adj_amt)
  );

  RETURN jsonb_build_object(
    'success', true,
    'return_id', p_return_id,
    'return_number', v_ret.return_number,
    'status', 'APPROVED',
    'product_condition', v_condition,
    'adjustment_type', v_adj_type,
    'adjustment_amount', v_adj_amt
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_goods_return(
  UUID, UUID, TEXT, TEXT, NUMERIC, TEXT, UUID
) TO authenticated, service_role;

-- 9. REJECT GOODS RETURN RPC (Does NOT post stock or financial changes)
CREATE OR REPLACE FUNCTION public.reject_goods_return(
  p_business_id UUID,
  p_return_id UUID,
  p_rejection_reason TEXT,
  p_operator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_ret RECORD;
  v_actor_id UUID;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_business_member(p_business_id) THEN
      RAISE EXCEPTION 'FORBIDDEN: Access denied' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_ret
  FROM public.goods_returns
  WHERE id = p_return_id AND business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GOODS_RETURN_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_ret.status = 'REJECTED' THEN
    RETURN jsonb_build_object('success', true, 'already_rejected', true, 'return_id', v_ret.id, 'status', 'REJECTED');
  END IF;

  IF v_ret.status IN ('POSTED', 'CANCELLED') THEN
    RAISE EXCEPTION 'CANNOT_REJECT_PROCESSED_RETURN: Status is %', v_ret.status USING ERRCODE = '23514';
  END IF;

  IF p_rejection_reason IS NULL OR length(btrim(p_rejection_reason)) = 0 THEN
    RAISE EXCEPTION 'REJECTION_REASON_REQUIRED' USING ERRCODE = '23514';
  END IF;

  -- Resolve actor
  v_actor_id := p_operator_id;
  IF v_actor_id IS NULL AND auth.uid() IS NOT NULL THEN
    SELECT id INTO v_actor_id
    FROM public.users
    WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE'
    LIMIT 1;
  END IF;
  IF v_actor_id IS NULL THEN
    SELECT id INTO v_actor_id
    FROM public.users
    WHERE business_id = p_business_id AND status = 'ACTIVE'
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  UPDATE public.goods_returns
  SET status = 'REJECTED',
      rejected_by = v_actor_id,
      rejected_at = NOW(),
      rejection_reason = btrim(p_rejection_reason),
      updated_at = NOW()
  WHERE id = p_return_id;

  -- Audit log: GOODS_RETURN_REJECTED
  INSERT INTO public.audit_logs (
    business_id, user_id, action, entity_type, entity_id, old_data, new_data
  ) VALUES (
    p_business_id, v_actor_id, 'GOODS_RETURN_REJECTED', 'goods_returns', p_return_id,
    jsonb_build_object('status', v_ret.status),
    jsonb_build_object('status', 'REJECTED', 'rejection_reason', btrim(p_rejection_reason))
  );

  RETURN jsonb_build_object(
    'success', true,
    'return_id', p_return_id,
    'return_number', v_ret.return_number,
    'status', 'REJECTED'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_goods_return(
  UUID, UUID, TEXT, UUID
) TO authenticated, service_role;

-- 10. POST GOODS RETURN RPC (Atomic, Idempotent Stock & Ledger adjustments)
CREATE OR REPLACE FUNCTION public.post_goods_return(
  p_business_id UUID,
  p_return_id UUID,
  p_adjustment_type TEXT DEFAULT NULL,
  p_adjustment_amount NUMERIC DEFAULT NULL,
  p_operator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_ret RECORD;
  v_actor_id UUID;
  v_item RECORD;
  v_inv RECORD;
  v_tx_id UUID;
  v_ledger_id UUID;
  v_adj_type TEXT;
  v_adj_amt NUMERIC;
  v_cust_bal NUMERIC;
  v_items_count INT := 0;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_business_member(p_business_id) THEN
      RAISE EXCEPTION 'FORBIDDEN: Access denied' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 1. Lock return record to serialize concurrent posting
  SELECT * INTO v_ret
  FROM public.goods_returns
  WHERE id = p_return_id AND business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GOODS_RETURN_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotency check: if already posted, return success without duplicate entries
  IF v_ret.status = 'POSTED' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_posted', true,
      'return_id', v_ret.id,
      'return_number', v_ret.return_number,
      'status', 'POSTED',
      'credit_note_ledger_id', v_ret.credit_note_ledger_id,
      'replacement_delivery_id', v_ret.replacement_delivery_id
    );
  END IF;

  -- Posting requires prior approval
  IF v_ret.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'CANNOT_POST_UNAPPROVED_RETURN: Current status is %', v_ret.status USING ERRCODE = '23514';
  END IF;

  -- Resolve actor
  v_actor_id := p_operator_id;
  IF v_actor_id IS NULL AND auth.uid() IS NOT NULL THEN
    SELECT id INTO v_actor_id
    FROM public.users
    WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE'
    LIMIT 1;
  END IF;
  IF v_actor_id IS NULL THEN
    SELECT id INTO v_actor_id
    FROM public.users
    WHERE business_id = p_business_id AND status = 'ACTIVE'
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  v_adj_type := UPPER(COALESCE(p_adjustment_type, v_ret.adjustment_type));
  v_adj_amt := COALESCE(p_adjustment_amount, v_ret.adjustment_amount, 0);

  -- 2. Process stock movements for each line item
  FOR v_item IN
    SELECT * FROM public.goods_return_items
    WHERE goods_return_id = p_return_id
    FOR UPDATE
  LOOP
    v_items_count := v_items_count + 1;

    -- Only Saleable goods are returned to active finished goods inventory
    IF UPPER(v_item.product_condition) = 'SALEABLE' THEN
      SELECT * INTO v_inv
      FROM public.inventory
      WHERE business_id = p_business_id AND item_type = 'product' AND item_id = v_item.product_id
      FOR UPDATE;

      IF NOT FOUND THEN
        INSERT INTO public.inventory (business_id, item_type, item_id, current_stock, reserved_stock, available_stock, updated_at)
        VALUES (p_business_id, 'product', v_item.product_id, v_item.returned_quantity, 0, v_item.returned_quantity, NOW())
        RETURNING * INTO v_inv;
      ELSE
        UPDATE public.inventory
        SET current_stock = current_stock + v_item.returned_quantity,
            available_stock = available_stock + v_item.returned_quantity,
            updated_at = NOW()
        WHERE id = v_inv.id;
      END IF;

      -- Traceable inventory transaction record
      INSERT INTO public.inventory_transactions (
        business_id, item_type, item_id, transaction_type, quantity, reference_type, reference_id, notes, created_by, created_at
      ) VALUES (
        p_business_id, 'product', v_item.product_id, 'STOCK_IN', v_item.returned_quantity,
        'goods_return_posting', p_return_id,
        'Finished goods restocked from return ' || v_ret.return_number,
        v_actor_id, NOW()
      ) RETURNING id INTO v_tx_id;

      UPDATE public.goods_return_items
      SET inventory_transaction_id = v_tx_id
      WHERE id = v_item.id;
    END IF;
  END LOOP;

  -- Fallback if no items in goods_return_items but header has product and qty
  IF v_items_count = 0 AND v_ret.product_id IS NOT NULL AND v_ret.returned_quantity > 0 THEN
    IF UPPER(v_ret.product_condition) = 'SALEABLE' THEN
      SELECT * INTO v_inv
      FROM public.inventory
      WHERE business_id = p_business_id AND item_type = 'product' AND item_id = v_ret.product_id
      FOR UPDATE;

      IF NOT FOUND THEN
        INSERT INTO public.inventory (business_id, item_type, item_id, current_stock, reserved_stock, available_stock, updated_at)
        VALUES (p_business_id, 'product', v_ret.product_id, v_ret.returned_quantity, 0, v_ret.returned_quantity, NOW());
      ELSE
        UPDATE public.inventory
        SET current_stock = current_stock + v_ret.returned_quantity,
            available_stock = available_stock + v_ret.returned_quantity,
            updated_at = NOW()
        WHERE id = v_inv.id;
      END IF;

      INSERT INTO public.inventory_transactions (
        business_id, item_type, item_id, transaction_type, quantity, reference_type, reference_id, notes, created_by, created_at
      ) VALUES (
        p_business_id, 'product', v_ret.product_id, 'STOCK_IN', v_ret.returned_quantity,
        'goods_return_posting', p_return_id,
        'Finished goods restocked from return ' || v_ret.return_number,
        v_actor_id, NOW()
      );
    END IF;
  END IF;

  -- 3. Process financial adjustment if CREDIT_NOTE requested
  IF v_adj_type = 'CREDIT_NOTE' AND v_adj_amt > 0 THEN
    v_cust_bal := public.get_customer_balance(p_business_id, v_ret.customer_id);

    INSERT INTO public.customer_ledger (
      business_id, customer_id, order_id, return_id, entry_type, description,
      debit, credit, balance, entry_date, created_by
    ) VALUES (
      p_business_id, v_ret.customer_id, v_ret.order_id, p_return_id,
      'CREDIT_NOTE', 'Credit Note for Return ' || v_ret.return_number,
      0, v_adj_amt, v_cust_bal - v_adj_amt, CURRENT_DATE, v_actor_id
    ) RETURNING id INTO v_ledger_id;
  END IF;

  -- 4. Mark return record as POSTED
  UPDATE public.goods_returns
  SET status = 'POSTED',
      posted_by = v_actor_id,
      posted_at = NOW(),
      adjustment_type = v_adj_type,
      adjustment_amount = v_adj_amt,
      credit_note_ledger_id = COALESCE(v_ledger_id, credit_note_ledger_id),
      updated_at = NOW()
  WHERE id = p_return_id;

  -- Audit log: GOODS_RETURN_POSTED
  INSERT INTO public.audit_logs (
    business_id, user_id, action, entity_type, entity_id, old_data, new_data
  ) VALUES (
    p_business_id, v_actor_id, 'GOODS_RETURN_POSTED', 'goods_returns', p_return_id,
    jsonb_build_object('status', v_ret.status),
    jsonb_build_object('status', 'POSTED', 'adjustment_type', v_adj_type, 'adjustment_amount', v_adj_amt, 'credit_note_ledger_id', v_ledger_id)
  );

  RETURN jsonb_build_object(
    'success', true,
    'return_id', p_return_id,
    'return_number', v_ret.return_number,
    'status', 'POSTED',
    'credit_note_ledger_id', v_ledger_id,
    'adjustment_type', v_adj_type,
    'adjustment_amount', v_adj_amt
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_goods_return(
  UUID, UUID, TEXT, NUMERIC, UUID
) TO authenticated, service_role;

-- 11. CANCEL GOODS RETURN RPC (Traceable Reversal without deleting history)
CREATE OR REPLACE FUNCTION public.cancel_goods_return(
  p_business_id UUID,
  p_return_id UUID,
  p_reason TEXT,
  p_operator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_ret RECORD;
  v_actor_id UUID;
  v_item RECORD;
  v_cust_bal NUMERIC;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_business_member(p_business_id) THEN
      RAISE EXCEPTION 'FORBIDDEN: Access denied' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_ret
  FROM public.goods_returns
  WHERE id = p_return_id AND business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GOODS_RETURN_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  -- Idempotency check: if already cancelled, return success
  IF v_ret.status = 'CANCELLED' THEN
    RETURN jsonb_build_object('success', true, 'already_cancelled', true, 'return_id', v_ret.id, 'status', 'CANCELLED');
  END IF;

  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'CANCELLATION_REASON_REQUIRED' USING ERRCODE = '23514';
  END IF;

  -- Resolve actor
  v_actor_id := p_operator_id;
  IF v_actor_id IS NULL AND auth.uid() IS NOT NULL THEN
    SELECT id INTO v_actor_id
    FROM public.users
    WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE'
    LIMIT 1;
  END IF;
  IF v_actor_id IS NULL THEN
    SELECT id INTO v_actor_id
    FROM public.users
    WHERE business_id = p_business_id AND status = 'ACTIVE'
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  -- If return was POSTED, reverse the posted transactions with offsetting records
  IF v_ret.status = 'POSTED' THEN
    -- 1. Reverse stock movements
    FOR v_item IN
      SELECT * FROM public.goods_return_items
      WHERE goods_return_id = p_return_id
    LOOP
      IF UPPER(v_item.product_condition) = 'SALEABLE' THEN
        UPDATE public.inventory
        SET current_stock = GREATEST(0, current_stock - v_item.returned_quantity),
            available_stock = GREATEST(0, available_stock - v_item.returned_quantity),
            updated_at = NOW()
        WHERE business_id = p_business_id AND item_type = 'product' AND item_id = v_item.product_id;

        INSERT INTO public.inventory_transactions (
          business_id, item_type, item_id, transaction_type, quantity, reference_type, reference_id, notes, created_by, created_at
        ) VALUES (
          p_business_id, 'product', v_item.product_id, 'STOCK_OUT', v_item.returned_quantity,
          'goods_return_reversal', p_return_id,
          'Reversal of return ' || v_ret.return_number || ': ' || btrim(p_reason),
          v_actor_id, NOW()
        );
      END IF;
    END LOOP;

    -- 2. Reverse customer ledger credit note if one was posted
    IF v_ret.credit_note_ledger_id IS NOT NULL AND v_ret.adjustment_amount > 0 THEN
      v_cust_bal := public.get_customer_balance(p_business_id, v_ret.customer_id);

      INSERT INTO public.customer_ledger (
        business_id, customer_id, order_id, return_id, entry_type, description,
        debit, credit, balance, entry_date, created_by
      ) VALUES (
        p_business_id, v_ret.customer_id, v_ret.order_id, p_return_id,
        'DEBIT_NOTE', 'Reversal of Credit Note for Return ' || v_ret.return_number || ': ' || btrim(p_reason),
        v_ret.adjustment_amount, 0, v_cust_bal + v_ret.adjustment_amount, CURRENT_DATE, v_actor_id
      );
    END IF;
  END IF;

  -- Mark return as CANCELLED with audit notes
  UPDATE public.goods_returns
  SET status = 'CANCELLED',
      notes = COALESCE(notes || E'\n', '') || 'Cancelled: ' || btrim(p_reason),
      updated_at = NOW()
  WHERE id = p_return_id;

  -- Audit log: GOODS_RETURN_CANCELLED
  INSERT INTO public.audit_logs (
    business_id, user_id, action, entity_type, entity_id, old_data, new_data
  ) VALUES (
    p_business_id, v_actor_id, 'GOODS_RETURN_CANCELLED', 'goods_returns', p_return_id,
    jsonb_build_object('status', v_ret.status),
    jsonb_build_object('status', 'CANCELLED', 'reason', btrim(p_reason))
  );

  RETURN jsonb_build_object(
    'success', true,
    'return_id', p_return_id,
    'return_number', v_ret.return_number,
    'status', 'CANCELLED'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_goods_return(
  UUID, UUID, TEXT, UUID
) TO authenticated, service_role;

-- 12. CREATE REPLACEMENT DELIVERY RPC (Uses separate DEL-YYYY-000001 sequence)
CREATE OR REPLACE FUNCTION public.create_return_replacement_delivery(
  p_business_id UUID,
  p_return_id UUID,
  p_vehicle TEXT DEFAULT NULL,
  p_driver TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_operator_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_ret RECORD;
  v_actor_id UUID;
  v_del_number TEXT;
  v_delivery_id UUID;
  v_item RECORD;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_business_member(p_business_id) THEN
      RAISE EXCEPTION 'FORBIDDEN: Access denied' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT * INTO v_ret
  FROM public.goods_returns
  WHERE id = p_return_id AND business_id = p_business_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GOODS_RETURN_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_ret.status NOT IN ('APPROVED', 'POSTED') THEN
    RAISE EXCEPTION 'CANNOT_CREATE_REPLACEMENT_FOR_STATUS: %', v_ret.status USING ERRCODE = '23514';
  END IF;

  -- If replacement delivery already created, return it idempotently
  IF v_ret.replacement_delivery_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_created', true,
      'return_id', v_ret.id,
      'delivery_id', v_ret.replacement_delivery_id
    );
  END IF;

  -- Resolve actor
  v_actor_id := p_operator_id;
  IF v_actor_id IS NULL AND auth.uid() IS NOT NULL THEN
    SELECT id INTO v_actor_id
    FROM public.users
    WHERE auth_user_id = auth.uid() AND business_id = p_business_id AND status = 'ACTIVE'
    LIMIT 1;
  END IF;
  IF v_actor_id IS NULL THEN
    SELECT id INTO v_actor_id
    FROM public.users
    WHERE business_id = p_business_id AND status = 'ACTIVE'
    ORDER BY created_at ASC
    LIMIT 1;
  END IF;

  -- Generate distinct delivery number using delivery sequence system
  v_del_number := public.generate_next_delivery_number(p_business_id);

  -- Insert delivery record
  INSERT INTO public.deliveries (
    business_id, order_id, customer_id, delivery_number, delivery_date,
    status, vehicle, driver, notes, created_by
  ) VALUES (
    p_business_id, v_ret.order_id, v_ret.customer_id, v_del_number, CURRENT_DATE,
    'PENDING', p_vehicle, p_driver,
    COALESCE(p_notes, 'Replacement delivery for return ' || v_ret.return_number),
    v_actor_id
  ) RETURNING id INTO v_delivery_id;

  -- Insert delivery items
  FOR v_item IN
    SELECT * FROM public.goods_return_items
    WHERE goods_return_id = p_return_id
  LOOP
    INSERT INTO public.delivery_items (
      business_id, delivery_id, order_item_id, product_id, ordered_quantity, delivered_quantity
    ) VALUES (
      p_business_id, v_delivery_id, v_item.order_item_id, v_item.product_id, v_item.returned_quantity, v_item.returned_quantity
    );
  END LOOP;

  -- Link replacement delivery on goods return
  UPDATE public.goods_returns
  SET replacement_delivery_id = v_delivery_id,
      adjustment_type = 'REPLACEMENT',
      updated_at = NOW()
  WHERE id = p_return_id;

  -- Audit log: RETURN_REPLACEMENT_DELIVERY_CREATED
  INSERT INTO public.audit_logs (
    business_id, user_id, action, entity_type, entity_id, new_data
  ) VALUES (
    p_business_id, v_actor_id, 'RETURN_REPLACEMENT_DELIVERY_CREATED', 'deliveries', v_delivery_id,
    jsonb_build_object(
      'delivery_number', v_del_number,
      'return_id', p_return_id,
      'return_number', v_ret.return_number
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'return_id', p_return_id,
    'delivery_id', v_delivery_id,
    'delivery_number', v_del_number
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_return_replacement_delivery(
  UUID, UUID, TEXT, TEXT, TEXT, UUID
) TO authenticated, service_role;
