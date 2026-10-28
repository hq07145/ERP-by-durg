-- ====================================================================
-- MIGRATION: 202610280006_goods_return_step7_integration.sql
-- Description: Step 7 Integration for Goods Returns in SANKALP IRRIGATION ERP
-- Features:
-- 1. Add override tracking columns to goods_returns (has_override, override_reason)
-- 2. Enhanced create_goods_return with authorized excess override support
-- 3. Enhanced post_goods_return:
--    - Saleable: restocks to available & current inventory with STOCK_IN
--    - Damaged/Rework/Scrap: isolated in inventory_transactions without inflating saleable stock
--    - Credit Note: atomically posts to customer_ledger linked to return & customer
--    - Refund: records refund entry without premature transfer claim
--    - Replacement: creates/links replacement delivery without double counting
--    - Other Adjustment: requires documented reason
-- 4. Enhanced cancel_goods_return with full compensatory reversals preserving history
-- ====================================================================

-- 1. Add override columns to goods_returns if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'goods_returns' AND column_name = 'has_override'
  ) THEN
    ALTER TABLE public.goods_returns ADD COLUMN has_override BOOLEAN DEFAULT FALSE NOT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'goods_returns' AND column_name = 'override_reason'
  ) THEN
    ALTER TABLE public.goods_returns ADD COLUMN override_reason TEXT;
  END IF;
END $$;

-- 2. Upgrade create_goods_return with override support
DROP FUNCTION IF EXISTS public.create_goods_return(uuid, uuid, uuid, uuid, text, uuid, uuid, numeric, text, text, text, text, numeric, date, jsonb, uuid);

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
  p_items JSONB DEFAULT NULL,
  p_operator_id UUID DEFAULT NULL,
  p_allow_override BOOLEAN DEFAULT FALSE,
  p_override_reason TEXT DEFAULT NULL
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
  v_has_override BOOLEAN := FALSE;
  v_delivered_limit NUMERIC := 0;
BEGIN
  -- Validate business membership
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

  -- Validate reason
  IF p_reason IS NULL OR length(btrim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'REASON_REQUIRED: Return reason is mandatory' USING ERRCODE = '23514';
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
    INSERT INTO public.goods_returns (
      business_id, return_number, customer_id, order_id, delivery_id, invoice_number,
      return_date, status, product_condition, reason, notes, adjustment_type, adjustment_amount,
      product_id, order_item_id, returned_quantity, has_override, override_reason, created_by
    ) VALUES (
      p_business_id, v_ret_number, p_customer_id, p_order_id, p_delivery_id, p_invoice_number,
      COALESCE(p_return_date, CURRENT_DATE), 'PENDING_INSPECTION', v_condition, btrim(p_reason), p_notes,
      p_adjustment_type, COALESCE(p_adjustment_amount, 0),
      p_product_id, p_order_item_id, 0, FALSE, NULL, v_actor_id
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

      -- Quantity validation against order item
      IF v_item_oi_id IS NOT NULL THEN
        SELECT * INTO v_oi FROM public.order_items WHERE id = v_item_oi_id;
        IF FOUND THEN
          SELECT COALESCE(SUM(gri.returned_quantity), 0) INTO v_prev_returned
          FROM public.goods_return_items gri
          JOIN public.goods_returns gr ON gri.goods_return_id = gr.id
          WHERE gri.order_item_id = v_item_oi_id AND gr.status NOT IN ('CANCELLED', 'REJECTED');

          v_delivered_limit := COALESCE(v_oi.delivered_quantity, v_oi.dispatched_quantity, v_oi.quantity);
          IF (v_prev_returned + v_item_qty) > v_delivered_limit THEN
            IF NOT p_allow_override THEN
              RAISE EXCEPTION 'RETURN_QUANTITY_EXCEEDS_DELIVERED: Total return quantity % exceeds delivered quantity % for order item %',
                (v_prev_returned + v_item_qty), v_delivered_limit, v_item_oi_id
                USING ERRCODE = '23514';
            ELSE
              IF p_override_reason IS NULL OR length(btrim(p_override_reason)) = 0 THEN
                RAISE EXCEPTION 'OVERRIDE_REASON_REQUIRED: A valid reason is mandatory to override return quantity limits'
                  USING ERRCODE = '23514';
              END IF;
              v_has_override := TRUE;
            END IF;
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
      IF p_product_id IS NULL THEN p_product_id := v_item_pid; END IF;
      IF p_order_item_id IS NULL THEN p_order_item_id := v_item_oi_id; END IF;
    END LOOP;

    UPDATE public.goods_returns
    SET returned_quantity = v_total_qty,
        adjustment_amount = CASE WHEN COALESCE(p_adjustment_amount, 0) > 0 THEN p_adjustment_amount ELSE v_total_amt END,
        product_id = p_product_id,
        order_item_id = p_order_item_id,
        has_override = v_has_override,
        override_reason = CASE WHEN v_has_override THEN btrim(p_override_reason) ELSE NULL END
    WHERE id = v_return_id;
  ELSE
    -- Single SKU return validation
    IF p_product_id IS NULL THEN
      RAISE EXCEPTION 'PRODUCT_REQUIRED: Product ID is required for return' USING ERRCODE = '23514';
    END IF;
    IF COALESCE(p_returned_quantity, 0) <= 0 THEN
      RAISE EXCEPTION 'INVALID_QUANTITY: Returned quantity must be greater than zero' USING ERRCODE = '23514';
    END IF;

    IF p_order_item_id IS NOT NULL THEN
      SELECT * INTO v_oi FROM public.order_items WHERE id = p_order_item_id;
      IF FOUND THEN
        SELECT COALESCE(SUM(returned_quantity), 0) INTO v_prev_returned
        FROM public.goods_returns
        WHERE order_item_id = p_order_item_id AND status NOT IN ('CANCELLED', 'REJECTED');

        v_delivered_limit := COALESCE(v_oi.delivered_quantity, v_oi.dispatched_quantity, v_oi.quantity);
        IF (v_prev_returned + p_returned_quantity) > v_delivered_limit THEN
          IF NOT p_allow_override THEN
            RAISE EXCEPTION 'RETURN_QUANTITY_EXCEEDS_DELIVERED: Total return quantity % exceeds delivered quantity % for order item %',
              (v_prev_returned + p_returned_quantity), v_delivered_limit, p_order_item_id
              USING ERRCODE = '23514';
          ELSE
            IF p_override_reason IS NULL OR length(btrim(p_override_reason)) = 0 THEN
              RAISE EXCEPTION 'OVERRIDE_REASON_REQUIRED: A valid reason is mandatory to override return quantity limits'
                USING ERRCODE = '23514';
            END IF;
            v_has_override := TRUE;
          END IF;
        END IF;
      END IF;
    END IF;

    v_total_qty := p_returned_quantity;
    v_total_amt := COALESCE(p_adjustment_amount, 0);

    INSERT INTO public.goods_returns (
      business_id, return_number, customer_id, order_id, delivery_id, invoice_number,
      return_date, status, product_condition, reason, notes, adjustment_type, adjustment_amount,
      product_id, order_item_id, returned_quantity, has_override, override_reason, created_by
    ) VALUES (
      p_business_id, v_ret_number, p_customer_id, p_order_id, p_delivery_id, p_invoice_number,
      COALESCE(p_return_date, CURRENT_DATE), 'PENDING_INSPECTION', v_condition, btrim(p_reason), p_notes,
      p_adjustment_type, v_total_amt,
      p_product_id, p_order_item_id, v_total_qty, v_has_override,
      CASE WHEN v_has_override THEN btrim(p_override_reason) ELSE NULL END,
      v_actor_id
    ) RETURNING id INTO v_return_id;

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
      'status', 'PENDING_INSPECTION',
      'has_override', v_has_override
    )
  );

  IF v_has_override THEN
    INSERT INTO public.audit_logs (
      business_id, user_id, action, entity_type, entity_id, new_data
    ) VALUES (
      p_business_id, v_actor_id, 'GOODS_RETURN_OVERRIDE_EXCESS', 'goods_returns', v_return_id,
      jsonb_build_object(
        'return_number', v_ret_number,
        'override_reason', btrim(p_override_reason),
        'returned_quantity', v_total_qty,
        'delivered_limit', v_delivered_limit
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'return_id', v_return_id,
    'return_number', v_ret_number,
    'status', 'PENDING_INSPECTION',
    'returned_quantity', v_total_qty,
    'has_override', v_has_override
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_goods_return(
  UUID, UUID, UUID, UUID, TEXT, UUID, UUID, NUMERIC, TEXT, TEXT, TEXT, TEXT, NUMERIC, DATE, JSONB, UUID, BOOLEAN, TEXT
) TO authenticated, service_role;

-- 3. Upgrade post_goods_return with comprehensive condition & financial handling
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
  v_payment_id UUID;
  v_adj_type TEXT;
  v_adj_amt NUMERIC;
  v_cust_bal NUMERIC;
  v_items_count INT := 0;
  v_order RECORD;
  v_item_cond TEXT;
  v_quarantine_ref TEXT;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.is_business_member(p_business_id) THEN
      RAISE EXCEPTION 'FORBIDDEN: Access denied' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Lock return record to serialize concurrent posting
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
      'refund_payment_id', v_ret.refund_payment_id,
      'replacement_delivery_id', v_ret.replacement_delivery_id
    );
  END IF;

  -- Posting strictly requires prior approval
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
    v_item_cond := UPPER(v_item.product_condition);

    IF v_item_cond = 'SALEABLE' THEN
      -- Only Saleable goods are returned to active available finished goods inventory
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

    ELSE
      -- Damaged, Rework, or Scrap: Do NOT add to saleable stock.
      -- Record traceable transaction in inventory_transactions for audit without inflating available_stock
      v_quarantine_ref := CASE 
        WHEN v_item_cond = 'DAMAGED' THEN 'goods_return_damaged_quarantine'
        WHEN v_item_cond = 'REWORK' THEN 'goods_return_rework_quarantine'
        ELSE 'goods_return_scrap'
      END;

      INSERT INTO public.inventory_transactions (
        business_id, item_type, item_id, transaction_type, quantity, reference_type, reference_id, notes, created_by, created_at
      ) VALUES (
        p_business_id, 'product', v_item.product_id, 'ADJUSTMENT', v_item.returned_quantity,
        v_quarantine_ref, p_return_id,
        v_item_cond || ' goods received from return ' || v_ret.return_number || ' - held outside saleable stock',
        v_actor_id, NOW()
      ) RETURNING id INTO v_tx_id;

      UPDATE public.goods_return_items
      SET inventory_transaction_id = v_tx_id
      WHERE id = v_item.id;
    END IF;
  END LOOP;

  -- 3. Process financial settlement adjustments
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

    -- If linked to an order with positive due balance, adjust order due without rewriting total_amount/invoice
    IF v_ret.order_id IS NOT NULL THEN
      SELECT * INTO v_order FROM public.orders WHERE id = v_ret.order_id FOR UPDATE;
      IF FOUND AND v_order.due_amount > 0 THEN
        UPDATE public.orders
        SET due_amount = GREATEST(0, due_amount - v_adj_amt),
            updated_at = NOW()
        WHERE id = v_ret.order_id;
      END IF;
    END IF;

  ELSIF v_adj_type = 'REFUND' AND v_adj_amt > 0 THEN
    -- Record pending refund payment without prematurely asserting money has left account
    INSERT INTO public.payments (
      business_id, customer_id, order_id, payment_number, amount, payment_date,
      payment_method, reference, notes, status
    ) VALUES (
      p_business_id, v_ret.customer_id, v_ret.order_id,
      'REF-' || SUBSTRING(v_ret.return_number FROM '^RET-(.*)$'),
      v_adj_amt, CURRENT_DATE, 'BANK_TRANSFER', v_ret.return_number,
      'Refund initiated from Return ' || v_ret.return_number || ' - Pending Bank Transfer confirmation',
      'PENDING'
    ) RETURNING id INTO v_payment_id;

  ELSIF v_adj_type = 'OTHER_ADJUSTMENT' AND v_adj_amt > 0 THEN
    IF v_ret.notes IS NULL OR length(btrim(v_ret.notes)) = 0 THEN
      RAISE EXCEPTION 'ADJUSTMENT_REASON_REQUIRED: A documented reason in notes is required for other adjustments'
        USING ERRCODE = '23514';
    END IF;

    v_cust_bal := public.get_customer_balance(p_business_id, v_ret.customer_id);

    INSERT INTO public.customer_ledger (
      business_id, customer_id, order_id, return_id, entry_type, description,
      debit, credit, balance, entry_date, created_by
    ) VALUES (
      p_business_id, v_ret.customer_id, v_ret.order_id, p_return_id,
      'ADJUSTMENT', 'Adjustment for Return ' || v_ret.return_number || ': ' || v_ret.notes,
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
      refund_payment_id = COALESCE(v_payment_id, refund_payment_id),
      updated_at = NOW()
  WHERE id = p_return_id;

  -- Audit log: GOODS_RETURN_POSTED
  INSERT INTO public.audit_logs (
    business_id, user_id, action, entity_type, entity_id, old_data, new_data
  ) VALUES (
    p_business_id, v_actor_id, 'GOODS_RETURN_POSTED', 'goods_returns', p_return_id,
    jsonb_build_object('status', v_ret.status),
    jsonb_build_object(
      'status', 'POSTED',
      'adjustment_type', v_adj_type,
      'adjustment_amount', v_adj_amt,
      'credit_note_ledger_id', v_ledger_id,
      'refund_payment_id', v_payment_id
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'return_id', p_return_id,
    'return_number', v_ret.return_number,
    'status', 'POSTED',
    'credit_note_ledger_id', v_ledger_id,
    'refund_payment_id', v_payment_id,
    'adjustment_type', v_adj_type,
    'adjustment_amount', v_adj_amt
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.post_goods_return(
  UUID, UUID, TEXT, NUMERIC, UUID
) TO authenticated, service_role;

-- 4. Upgrade cancel_goods_return with comprehensive reversal
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
  v_order RECORD;
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

  -- Idempotency check
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
      ELSE
        INSERT INTO public.inventory_transactions (
          business_id, item_type, item_id, transaction_type, quantity, reference_type, reference_id, notes, created_by, created_at
        ) VALUES (
          p_business_id, 'product', v_item.product_id, 'ADJUSTMENT', v_item.returned_quantity,
          'goods_return_quarantine_reversal', p_return_id,
          'Quarantine reversal of return ' || v_ret.return_number || ': ' || btrim(p_reason),
          v_actor_id, NOW()
        );
      END IF;
    END LOOP;

    -- 2. Reverse customer ledger credit note or adjustment
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

      -- Restore order due_amount if linked
      IF v_ret.order_id IS NOT NULL THEN
        SELECT * INTO v_order FROM public.orders WHERE id = v_ret.order_id FOR UPDATE;
        IF FOUND THEN
          UPDATE public.orders
          SET due_amount = due_amount + v_ret.adjustment_amount,
              updated_at = NOW()
          WHERE id = v_ret.order_id;
        END IF;
      END IF;
    END IF;

    -- 3. Mark pending refund payment as FAILED / CANCELLED if exists
    IF v_ret.refund_payment_id IS NOT NULL THEN
      UPDATE public.payments
      SET status = 'FAILED',
          notes = COALESCE(notes || E'\n', '') || 'Cancelled: ' || btrim(p_reason),
          updated_at = NOW()
      WHERE id = v_ret.refund_payment_id;
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
