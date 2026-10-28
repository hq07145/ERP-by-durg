-- ============================================================================
-- Migration: 202610280009_goods_return_inventory_posting_fix.sql
-- Description: Fix Goods Return finished goods inventory posting, idempotency,
--              reversal tracking, and auditable reconciliation in SANKALP ERP.
-- ============================================================================

-- 0. Ensure cancellation audit columns exist on goods_returns
ALTER TABLE public.goods_returns ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE public.goods_returns ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES public.users(id);
ALTER TABLE public.goods_returns ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- 1. Ensure unique constraint on inventory_transactions for goods returns to guarantee
--    exactly-once stock posting at the database engine level
CREATE UNIQUE INDEX IF NOT EXISTS uq_inv_tx_goods_return_line
ON public.inventory_transactions (reference_type, reference_id, item_id)
WHERE reference_type IN (
  'goods_return_posting',
  'goods_return_damaged_quarantine',
  'goods_return_rework_quarantine',
  'goods_return_scrap'
);

-- 2. Upgrade public.post_goods_return to target finished goods ('finished_good')
--    inventory, enforce atomicity, and return updated stock balances
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
  v_existing_tx_id UUID;
  v_ledger_id UUID;
  v_payment_id UUID;
  v_adj_type TEXT;
  v_adj_amt NUMERIC;
  v_cust_bal NUMERIC;
  v_items_count INT := 0;
  v_order RECORD;
  v_item_cond TEXT;
  v_quarantine_ref TEXT;
  v_total_posted_qty NUMERIC := 0;
  v_last_product_id UUID := NULL;
  v_last_current_stock NUMERIC := 0;
  v_last_available_stock NUMERIC := 0;
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

  -- Idempotency check: if already posted, return success immediately without modifying stock
  IF v_ret.status = 'POSTED' THEN
    SELECT current_stock, available_stock INTO v_last_current_stock, v_last_available_stock
    FROM public.inventory
    WHERE business_id = p_business_id AND item_type = 'finished_good' AND item_id = v_ret.product_id;

    RETURN jsonb_build_object(
      'success', true,
      'already_posted', true,
      'return_id', v_ret.id,
      'return_number', v_ret.return_number,
      'status', 'POSTED',
      'posted_quantity', v_ret.returned_quantity,
      'product_id', v_ret.product_id,
      'updated_current_stock', COALESCE(v_last_current_stock, 0),
      'updated_available_stock', COALESCE(v_last_available_stock, 0),
      'credit_note_ledger_id', v_ret.credit_note_ledger_id,
      'refund_payment_id', v_ret.refund_payment_id,
      'adjustment_type', v_ret.adjustment_type,
      'adjustment_amount', v_ret.adjustment_amount
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

  v_adj_type := UPPER(COALESCE(p_adjustment_type, v_ret.adjustment_type, 'CREDIT_NOTE'));
  v_adj_amt := COALESCE(p_adjustment_amount, v_ret.adjustment_amount, 0);

  -- Process stock movements for each line item
  FOR v_item IN
    SELECT * FROM public.goods_return_items
    WHERE goods_return_id = p_return_id
    FOR UPDATE
  LOOP
    v_items_count := v_items_count + 1;
    v_item_cond := UPPER(COALESCE(v_item.product_condition, v_ret.product_condition, 'SALEABLE'));
    v_last_product_id := v_item.product_id;

    IF v_item_cond = 'SALEABLE' THEN
      -- Requirement 1: Only Saleable goods are returned to active available finished goods inventory
      SELECT id INTO v_existing_tx_id
      FROM public.inventory_transactions
      WHERE reference_type = 'goods_return_posting'
        AND reference_id = p_return_id
        AND item_id = v_item.product_id;

      IF v_existing_tx_id IS NULL THEN
        SELECT * INTO v_inv
        FROM public.inventory
        WHERE business_id = p_business_id AND item_type = 'finished_good' AND item_id = v_item.product_id
        FOR UPDATE;

        IF NOT FOUND THEN
          INSERT INTO public.inventory (
            business_id, item_type, item_id, current_stock, reserved_stock, available_stock, updated_at
          ) VALUES (
            p_business_id, 'finished_good', v_item.product_id, v_item.returned_quantity, 0, v_item.returned_quantity, NOW()
          ) RETURNING * INTO v_inv;
        ELSE
          UPDATE public.inventory
          SET current_stock = current_stock + v_item.returned_quantity,
              available_stock = available_stock + v_item.returned_quantity,
              updated_at = NOW()
          WHERE id = v_inv.id
          RETURNING * INTO v_inv;
        END IF;

        v_last_current_stock := v_inv.current_stock;
        v_last_available_stock := v_inv.available_stock;
        v_total_posted_qty := v_total_posted_qty + v_item.returned_quantity;

        INSERT INTO public.inventory_transactions (
          business_id, item_type, item_id, transaction_type, quantity, reference_type, reference_id, notes, created_by, created_at
        ) VALUES (
          p_business_id, 'finished_good', v_item.product_id, 'STOCK_IN', v_item.returned_quantity,
          'goods_return_posting', p_return_id,
          'Finished goods restocked from return ' || v_ret.return_number,
          v_actor_id, NOW()
        ) RETURNING id INTO v_tx_id;

        UPDATE public.goods_return_items
        SET inventory_transaction_id = v_tx_id
        WHERE id = v_item.id;
      END IF;

    ELSE
      -- Requirement 2: Damaged, Rework, or Scrap must NOT be added to saleable stock.
      -- Record traceable transaction in inventory_transactions for audit without inflating available_stock
      v_quarantine_ref := CASE 
        WHEN v_item_cond = 'DAMAGED' THEN 'goods_return_damaged_quarantine'
        WHEN v_item_cond = 'REWORK' THEN 'goods_return_rework_quarantine'
        ELSE 'goods_return_scrap'
      END;

      SELECT id INTO v_existing_tx_id
      FROM public.inventory_transactions
      WHERE reference_type = v_quarantine_ref
        AND reference_id = p_return_id
        AND item_id = v_item.product_id;

      IF v_existing_tx_id IS NULL THEN
        INSERT INTO public.inventory_transactions (
          business_id, item_type, item_id, transaction_type, quantity, reference_type, reference_id, notes, created_by, created_at
        ) VALUES (
          p_business_id, 'finished_good', v_item.product_id, 'ADJUSTMENT', v_item.returned_quantity,
          v_quarantine_ref, p_return_id,
          v_item_cond || ' goods received from return ' || v_ret.return_number || ' - held outside saleable stock',
          v_actor_id, NOW()
        ) RETURNING id INTO v_tx_id;

        UPDATE public.goods_return_items
        SET inventory_transaction_id = v_tx_id
        WHERE id = v_item.id;
      END IF;
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
      'posted_quantity', v_total_posted_qty,
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
    'posted_quantity', v_total_posted_qty,
    'product_id', COALESCE(v_last_product_id, v_ret.product_id),
    'updated_current_stock', v_last_current_stock,
    'updated_available_stock', v_last_available_stock,
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


-- 3. Upgrade public.cancel_goods_return to deduct from finished_good inventory
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
  v_inv RECORD;
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
    -- 1. Reverse stock movements in finished_good inventory
    FOR v_item IN
      SELECT * FROM public.goods_return_items
      WHERE goods_return_id = p_return_id
    LOOP
      IF UPPER(v_item.product_condition) = 'SALEABLE' THEN
        SELECT * INTO v_inv
        FROM public.inventory
        WHERE business_id = p_business_id AND item_type = 'finished_good' AND item_id = v_item.product_id
        FOR UPDATE;

        IF FOUND THEN
          UPDATE public.inventory
          SET current_stock = GREATEST(0, current_stock - v_item.returned_quantity),
              available_stock = GREATEST(0, available_stock - v_item.returned_quantity),
              updated_at = NOW()
          WHERE id = v_inv.id;
        END IF;

        INSERT INTO public.inventory_transactions (
          business_id, item_type, item_id, transaction_type, quantity, reference_type, reference_id, notes, created_by, created_at
        ) VALUES (
          p_business_id, 'finished_good', v_item.product_id, 'STOCK_OUT', v_item.returned_quantity,
          'goods_return_reversal', p_return_id,
          'Reversal of return ' || v_ret.return_number || ': ' || btrim(p_reason),
          v_actor_id, NOW()
        );
      ELSE
        INSERT INTO public.inventory_transactions (
          business_id, item_type, item_id, transaction_type, quantity, reference_type, reference_id, notes, created_by, created_at
        ) VALUES (
          p_business_id, 'finished_good', v_item.product_id, 'ADJUSTMENT', v_item.returned_quantity,
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
          notes = notes || ' [CANCELLED: ' || btrim(p_reason) || ']',
          updated_at = NOW()
      WHERE id = v_ret.refund_payment_id;
    END IF;
  END IF;

  -- 4. Mark return record as CANCELLED
  UPDATE public.goods_returns
  SET status = 'CANCELLED',
      cancellation_reason = btrim(p_reason),
      cancelled_by = v_actor_id,
      cancelled_at = NOW(),
      updated_at = NOW()
  WHERE id = p_return_id;

  -- 5. Audit log: GOODS_RETURN_CANCELLED
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
    'status', 'CANCELLED',
    'previous_status', v_ret.status
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_goods_return(
  UUID, UUID, TEXT, UUID
) TO authenticated, service_role;


-- 4. Safe, Auditable Inventory Reconciliation function
--    Identifies discrepancies in posted returns without blindly adding stock twice.
CREATE OR REPLACE FUNCTION public.reconcile_goods_return_inventory(
  p_business_id UUID,
  p_dry_run BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_ret RECORD;
  v_item RECORD;
  v_prod RECORD;
  v_inv RECORD;
  v_tx RECORD;
  v_results JSONB := '[]'::JSONB;
  v_discrepancies_count INT := 0;
  v_repaired_count INT := 0;
  v_line_status TEXT;
  v_action_taken TEXT;
  v_qty NUMERIC;
  v_cond TEXT;
  v_existing_fg_tx RECORD;
  v_existing_legacy_tx RECORD;
  v_actor_id UUID;
BEGIN
  -- Resolve actor
  IF auth.uid() IS NOT NULL THEN
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

  FOR v_ret IN
    SELECT gr.*, p.name as product_name, p.sku
    FROM public.goods_returns gr
    LEFT JOIN public.products p ON p.id = gr.product_id
    WHERE gr.business_id = p_business_id AND gr.status = 'POSTED'
    ORDER BY gr.created_at ASC
  LOOP
    FOR v_item IN
      SELECT gri.*, p.name as line_product_name, p.sku as line_sku
      FROM public.goods_return_items gri
      LEFT JOIN public.products p ON p.id = gri.product_id
      WHERE gri.goods_return_id = v_ret.id
    LOOP
      v_qty := v_item.returned_quantity;
      v_cond := UPPER(COALESCE(v_item.product_condition, v_ret.product_condition, 'SALEABLE'));

      -- Check 1: Does a valid finished_good transaction already exist?
      SELECT * INTO v_existing_fg_tx
      FROM public.inventory_transactions
      WHERE reference_id = v_ret.id
        AND item_type = 'finished_good'
        AND item_id = v_item.product_id
      LIMIT 1;

      -- Check 2: Does a legacy 'product' transaction exist?
      SELECT * INTO v_existing_legacy_tx
      FROM public.inventory_transactions
      WHERE reference_id = v_ret.id
        AND item_type = 'product'
        AND item_id = v_item.product_id
      LIMIT 1;

      IF v_existing_fg_tx.id IS NOT NULL THEN
        -- Perfectly reconciled already
        v_line_status := 'RECONCILED_OK';
        v_action_taken := 'NO_ACTION_REQUIRED';

      ELSIF v_existing_legacy_tx.id IS NOT NULL THEN
        -- Legacy mismatch: recorded under item_type = 'product'
        v_discrepancies_count := v_discrepancies_count + 1;
        v_line_status := 'LEGACY_ITEM_TYPE_MISMATCH';

        IF NOT p_dry_run THEN
          -- 1. Migrate transaction to finished_good
          UPDATE public.inventory_transactions
          SET item_type = 'finished_good',
              notes = notes || ' [RECONCILED: Migrated from legacy product type to finished_good]'
          WHERE id = v_existing_legacy_tx.id;

          -- 2. If saleable, transfer stock into finished_good inventory
          IF v_cond = 'SALEABLE' THEN
            SELECT * INTO v_inv
            FROM public.inventory
            WHERE business_id = p_business_id AND item_type = 'finished_good' AND item_id = v_item.product_id
            FOR UPDATE;

            IF NOT FOUND THEN
              INSERT INTO public.inventory (
                business_id, item_type, item_id, current_stock, reserved_stock, available_stock, updated_at
              ) VALUES (
                p_business_id, 'finished_good', v_item.product_id, v_qty, 0, v_qty, NOW()
              );
            ELSE
              UPDATE public.inventory
              SET current_stock = current_stock + v_qty,
                  available_stock = available_stock + v_qty,
                  updated_at = NOW()
              WHERE id = v_inv.id;
            END IF;

            -- 3. Clean up the erroneous legacy 'product' row in inventory
            DELETE FROM public.inventory
            WHERE business_id = p_business_id AND item_type = 'product' AND item_id = v_item.product_id;
          END IF;

          -- 4. Audit log
          INSERT INTO public.audit_logs (
            business_id, user_id, action, entity_type, entity_id, new_data
          ) VALUES (
            p_business_id, v_actor_id, 'GOODS_RETURN_INVENTORY_RECONCILED', 'goods_returns', v_ret.id,
            jsonb_build_object(
              'repair', 'MIGRATED_LEGACY_TO_FINISHED_GOOD',
              'return_number', v_ret.return_number,
              'product_id', v_item.product_id,
              'quantity', v_qty,
              'condition', v_cond
            )
          );

          v_repaired_count := v_repaired_count + 1;
          v_action_taken := 'MIGRATED_STOCK_TO_FINISHED_GOOD';
        ELSE
          v_action_taken := 'DRY_RUN_NEEDS_MIGRATION_TO_FINISHED_GOOD';
        END IF;

      ELSE
        -- Completely missing transaction for a POSTED return!
        v_discrepancies_count := v_discrepancies_count + 1;
        v_line_status := 'MISSING_STOCK_TRANSACTION';

        IF NOT p_dry_run THEN
          IF v_cond = 'SALEABLE' THEN
            SELECT * INTO v_inv
            FROM public.inventory
            WHERE business_id = p_business_id AND item_type = 'finished_good' AND item_id = v_item.product_id
            FOR UPDATE;

            IF NOT FOUND THEN
              INSERT INTO public.inventory (
                business_id, item_type, item_id, current_stock, reserved_stock, available_stock, updated_at
              ) VALUES (
                p_business_id, 'finished_good', v_item.product_id, v_qty, 0, v_qty, NOW()
              );
            ELSE
              UPDATE public.inventory
              SET current_stock = current_stock + v_qty,
                  available_stock = available_stock + v_qty,
                  updated_at = NOW()
              WHERE id = v_inv.id;
            END IF;

            INSERT INTO public.inventory_transactions (
              business_id, item_type, item_id, transaction_type, quantity, reference_type, reference_id, notes, created_by, created_at
            ) VALUES (
              p_business_id, 'finished_good', v_item.product_id, 'STOCK_IN', v_qty,
              'goods_return_reconciliation', v_ret.id,
              'Audited reconciliation of missing stock-in for return ' || v_ret.return_number,
              v_actor_id, NOW()
            );
          ELSE
            INSERT INTO public.inventory_transactions (
              business_id, item_type, item_id, transaction_type, quantity, reference_type, reference_id, notes, created_by, created_at
            ) VALUES (
              p_business_id, 'finished_good', v_item.product_id, 'ADJUSTMENT', v_qty,
              'goods_return_quarantine_reconciliation', v_ret.id,
              'Audited quarantine reconciliation for return ' || v_ret.return_number,
              v_actor_id, NOW()
            );
          END IF;

          INSERT INTO public.audit_logs (
            business_id, user_id, action, entity_type, entity_id, new_data
          ) VALUES (
            p_business_id, v_actor_id, 'GOODS_RETURN_INVENTORY_RECONCILED', 'goods_returns', v_ret.id,
            jsonb_build_object(
              'repair', 'INSERTED_MISSING_TRANSACTION',
              'return_number', v_ret.return_number,
              'product_id', v_item.product_id,
              'quantity', v_qty,
              'condition', v_cond
            )
          );

          v_repaired_count := v_repaired_count + 1;
          v_action_taken := 'REPAIRED_MISSING_TRANSACTION_AND_STOCK';
        ELSE
          v_action_taken := 'DRY_RUN_NEEDS_STOCK_REPAIR';
        END IF;
      END IF;

      v_results := v_results || jsonb_build_object(
        'return_id', v_ret.id,
        'return_number', v_ret.return_number,
        'product_id', v_item.product_id,
        'sku', COALESCE(v_item.line_sku, v_ret.sku),
        'product_name', COALESCE(v_item.line_product_name, v_ret.product_name),
        'quantity', v_qty,
        'condition', v_cond,
        'status', v_line_status,
        'action_taken', v_action_taken
      );
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run,
    'discrepancies_found', v_discrepancies_count,
    'repaired_count', v_repaired_count,
    'details', v_results
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_goods_return_inventory(
  UUID, BOOLEAN
) TO authenticated, service_role;
