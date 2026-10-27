CREATE OR REPLACE FUNCTION public.reset_all_business_data(
  p_business_id UUID,
  p_operator_id UUID,
  p_backup_token TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_operator_role TEXT;
  v_backup_exists BOOLEAN;
  v_backup_time TIMESTAMPTZ;
  v_counts JSONB;
  
  -- Record counts before deletion
  v_del_adv_alloc BIGINT := 0;
  v_del_prod_cons BIGINT := 0;
  v_del_prod_out BIGINT := 0;
  v_del_qc BIGINT := 0;
  v_del_prod_logs BIGINT := 0;
  v_del_prod_sched BIGINT := 0;
  v_del_prod_ord BIGINT := 0;
  v_del_deliv_hist BIGINT := 0;
  v_del_deliv_items BIGINT := 0;
  v_del_deliv BIGINT := 0;
  v_del_ord_hist BIGINT := 0;
  v_del_ord_items BIGINT := 0;
  v_del_ledger BIGINT := 0;
  v_del_payments BIGINT := 0;
  v_del_orders BIGINT := 0;
  v_del_po_receipts BIGINT := 0;
  v_del_po_items BIGINT := 0;
  v_del_pos BIGINT := 0;
  v_del_inv_tx BIGINT := 0;
  v_inv_reset BIGINT := 0;
  v_del_expenses BIGINT := 0;
  v_del_imports BIGINT := 0;
  v_del_notifs BIGINT := 0;
BEGIN
  -- 1. Strictly verify the operator is Super Admin
  SELECT lower(r.name) INTO v_operator_role
  FROM public.users u
  JOIN public.user_roles ur ON u.id = ur.user_id
  JOIN public.roles r ON ur.role_id = r.id
  WHERE u.id = p_operator_id AND u.business_id = p_business_id;

  IF v_operator_role IS NULL OR (v_operator_role NOT LIKE '%super%' AND v_operator_role <> 'super_admin') THEN
    RAISE EXCEPTION 'Access Denied: Reset All Data can strictly be executed only by Super Admin.';
  END IF;

  -- 2. Verify that a verified completed backup exists within the last 48 hours
  SELECT TRUE, verified_at INTO v_backup_exists, v_backup_time
  FROM public.data_backup_log
  WHERE business_id = p_business_id
    AND backup_token = p_backup_token
    AND status = 'COMPLETED'
    AND verified_at >= NOW() - INTERVAL '48 hours'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_backup_exists IS NOT TRUE THEN
    RAISE EXCEPTION 'Safety Violation: No verified backup found for token "%" within the last 48 hours. A fresh complete backup must be downloaded before reset.', p_backup_token;
  END IF;

  -- Disable background cascading recalculation triggers during bulk reset
  BEGIN
    SET LOCAL session_replication_role = 'replica';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- 3. Execute transactional deletion in reverse foreign-key dependency order
  -- A. Customer advance allocations
  DELETE FROM public.customer_advance_allocations WHERE business_id = p_business_id;
  GET DIAGNOSTICS v_del_adv_alloc = ROW_COUNT;

  -- B. Production child tables
  DELETE FROM public.production_material_consumption WHERE business_id = p_business_id;
  GET DIAGNOSTICS v_del_prod_cons = ROW_COUNT;

  DELETE FROM public.production_output WHERE business_id = p_business_id;
  GET DIAGNOSTICS v_del_prod_out = ROW_COUNT;

  DELETE FROM public.quality_checks WHERE business_id = p_business_id;
  GET DIAGNOSTICS v_del_qc = ROW_COUNT;

  DELETE FROM public.production_logs WHERE business_id = p_business_id;
  GET DIAGNOSTICS v_del_prod_logs = ROW_COUNT;

  DELETE FROM public.production_schedules WHERE business_id = p_business_id;
  GET DIAGNOSTICS v_del_prod_sched = ROW_COUNT;

  DELETE FROM public.production_orders WHERE business_id = p_business_id;
  GET DIAGNOSTICS v_del_prod_ord = ROW_COUNT;

  -- C. Delivery child tables
  DELETE FROM public.delivery_status_history
  WHERE delivery_id IN (SELECT id FROM public.deliveries WHERE business_id = p_business_id);
  GET DIAGNOSTICS v_del_deliv_hist = ROW_COUNT;

  DELETE FROM public.delivery_items WHERE business_id = p_business_id;
  GET DIAGNOSTICS v_del_deliv_items = ROW_COUNT;

  DELETE FROM public.deliveries WHERE business_id = p_business_id;
  GET DIAGNOSTICS v_del_deliv = ROW_COUNT;

  -- D. Order child tables & orders
  DELETE FROM public.order_status_history
  WHERE order_id IN (SELECT id FROM public.orders WHERE business_id = p_business_id);
  GET DIAGNOSTICS v_del_ord_hist = ROW_COUNT;

  DELETE FROM public.order_items WHERE business_id = p_business_id;
  GET DIAGNOSTICS v_del_ord_items = ROW_COUNT;

  -- E. Customer ledger & payments & orders
  DELETE FROM public.customer_ledger WHERE business_id = p_business_id;
  GET DIAGNOSTICS v_del_ledger = ROW_COUNT;

  DELETE FROM public.payments WHERE business_id = p_business_id;
  GET DIAGNOSTICS v_del_payments = ROW_COUNT;

  DELETE FROM public.orders WHERE business_id = p_business_id;
  GET DIAGNOSTICS v_del_orders = ROW_COUNT;

  -- F. Purchase orders, items, receipts
  DELETE FROM public.purchase_receipts WHERE business_id = p_business_id;
  GET DIAGNOSTICS v_del_po_receipts = ROW_COUNT;

  DELETE FROM public.purchase_order_items WHERE business_id = p_business_id;
  GET DIAGNOSTICS v_del_po_items = ROW_COUNT;

  DELETE FROM public.purchase_orders WHERE business_id = p_business_id;
  GET DIAGNOSTICS v_del_pos = ROW_COUNT;

  -- G. Inventory transactions & reset stock balances
  DELETE FROM public.inventory_transactions WHERE business_id = p_business_id;
  GET DIAGNOSTICS v_del_inv_tx = ROW_COUNT;

  UPDATE public.inventory
  SET current_stock = 0,
      reserved_stock = 0,
      available_stock = 0,
      updated_at = NOW()
  WHERE business_id = p_business_id;
  GET DIAGNOSTICS v_inv_reset = ROW_COUNT;

  -- H. Expenses
  DELETE FROM public.expenses WHERE business_id = p_business_id;
  GET DIAGNOSTICS v_del_expenses = ROW_COUNT;

  -- I. Import jobs history
  DELETE FROM public.import_jobs WHERE business_id = p_business_id;
  GET DIAGNOSTICS v_del_imports = ROW_COUNT;

  -- J. Notifications
  DELETE FROM public.notifications WHERE user_id IN (SELECT id FROM public.users WHERE business_id = p_business_id);
  GET DIAGNOSTICS v_del_notifs = ROW_COUNT;

  -- K. Reset atomic order sequence to 1
  UPDATE public.order_sequences
  SET next_val = 1, updated_at = NOW()
  WHERE business_id = p_business_id;

  UPDATE public.business_settings
  SET value = jsonb_build_object('prefix', 'ORD-', 'next_number', 1), updated_at = NOW()
  WHERE business_id = p_business_id AND key = 'order_number_sequence';

  -- Restore normal session replication role
  BEGIN
    SET LOCAL session_replication_role = 'origin';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- 4. Build affected counts JSON
  v_counts := jsonb_build_object(
    'orders', v_del_orders,
    'order_items', v_del_ord_items,
    'order_status_history', v_del_ord_hist,
    'payments', v_del_payments,
    'customer_ledger', v_del_ledger,
    'customer_advance_allocations', v_del_adv_alloc,
    'deliveries', v_del_deliv,
    'delivery_items', v_del_deliv_items,
    'production_orders', v_del_prod_ord,
    'production_schedules', v_del_prod_sched,
    'purchase_orders', v_del_pos,
    'purchase_order_items', v_del_po_items,
    'inventory_transactions', v_del_inv_tx,
    'inventory_records_reset', v_inv_reset,
    'expenses', v_del_expenses,
    'import_jobs', v_del_imports,
    'notifications', v_del_notifs
  );

  -- 5. Write definitive audit log entry
  INSERT INTO public.audit_logs (
    business_id,
    user_id,
    action,
    entity_type,
    entity_id,
    new_data
  ) VALUES (
    p_business_id,
    p_operator_id,
    'SYSTEM_DATA_RESET',
    'business',
    p_business_id,
    jsonb_build_object(
      'verified_backup_token', p_backup_token,
      'backup_timestamp', v_backup_time,
      'cleared_counts', v_counts,
      'status', 'SUCCESS',
      'executed_at', NOW()
    )
  );

  RETURN jsonb_build_object(
    'success', TRUE,
    'message', 'All transactional data successfully reset in safe foreign-key order. Master data, accounts, and configurations preserved.',
    'cleared_counts', v_counts,
    'timestamp', NOW()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_all_business_data(UUID, UUID, TEXT) TO authenticated, service_role;
