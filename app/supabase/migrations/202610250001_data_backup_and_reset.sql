-- Migration: 202610250001_data_backup_and_reset.sql
-- Description: Schema and RPC functions for Super Admin Data Backup & Reset module

-- 1. Fix delivery date calculation function typing for untyped NULLs
CREATE OR REPLACE FUNCTION public.calculate_order_delivery_dates(
  p_business_id UUID,
  p_order_id UUID
)
RETURNS TABLE (
  order_id UUID,
  earliest_delivery_date DATE,
  latest_delivery_date DATE,
  expected_delivery_date DATE,
  delivery_calculation_version INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_rec RECORD;
  item_delivery RECORD;
  order_earliest DATE := NULL;
  order_latest DATE := NULL;
  order_expected DATE := NULL;
  has_production_orders BOOLEAN := FALSE;
  current_version INTEGER := 0;
BEGIN
  -- Verify order exists and is confirmed
  SELECT id, status INTO order_rec
  FROM public.orders
  WHERE id = p_order_id AND business_id = p_business_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF order_rec.status != 'CONFIRMED' THEN
    RETURN QUERY SELECT p_order_id, NULL::DATE, NULL::DATE, NULL::DATE, 1;
    RETURN;
  END IF;

  -- Check if production orders exist for this order
  SELECT EXISTS(
    SELECT 1 FROM public.production_orders
    WHERE order_id = p_order_id AND business_id = p_business_id
  ) INTO has_production_orders;

  IF NOT has_production_orders THEN
    RETURN QUERY SELECT p_order_id, NULL::DATE, NULL::DATE, NULL::DATE, 1;
    RETURN;
  END IF;

  -- Calculate delivery dates for each order item
  FOR item_delivery IN
    SELECT cd.*
    FROM public.order_items oi
    CROSS JOIN LATERAL public.calculate_order_item_delivery_dates(p_business_id, p_order_id, oi.id) cd
    WHERE oi.order_id = p_order_id AND oi.business_id = p_business_id
  LOOP
    IF item_delivery.earliest_delivery_date IS NOT NULL THEN
      IF order_earliest IS NULL OR item_delivery.earliest_delivery_date > order_earliest THEN
        order_earliest := item_delivery.earliest_delivery_date;
      END IF;
    END IF;
    IF item_delivery.latest_delivery_date IS NOT NULL THEN
      IF order_latest IS NULL OR item_delivery.latest_delivery_date > order_latest THEN
        order_latest := item_delivery.latest_delivery_date;
      END IF;
    END IF;
    IF item_delivery.expected_delivery_date IS NOT NULL THEN
      IF order_expected IS NULL OR item_delivery.expected_delivery_date > order_expected THEN
        order_expected := item_delivery.expected_delivery_date;
      END IF;
    END IF;
  END LOOP;

  SELECT COALESCE(delivery_calculation_version, 0) INTO current_version
  FROM public.orders WHERE id = p_order_id AND business_id = p_business_id;

  RETURN QUERY SELECT p_order_id, order_earliest, order_latest, order_expected, current_version + 1;
END;
$$;

-- 2. Backup Log Table to track verified complete backups
CREATE TABLE IF NOT EXISTS public.data_backup_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  operator_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  backup_token TEXT NOT NULL UNIQUE,
  backup_type TEXT NOT NULL CHECK (backup_type IN ('import_format', 'reports_format', 'full_database')),
  format TEXT NOT NULL DEFAULT 'zip',
  filename TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  checksum_sha256 TEXT,
  record_counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_data_backup_log_business ON public.data_backup_log(business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_data_backup_log_token ON public.data_backup_log(backup_token);

ALTER TABLE public.data_backup_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "data_backup_log_select" ON public.data_backup_log;
CREATE POLICY "data_backup_log_select" ON public.data_backup_log
  FOR SELECT
  USING (
    business_id = (SELECT business_id FROM public.users WHERE auth_user_id = auth.uid())
  );

DROP POLICY IF EXISTS "data_backup_log_insert" ON public.data_backup_log;
CREATE POLICY "data_backup_log_insert" ON public.data_backup_log
  FOR INSERT
  WITH CHECK (
    business_id = (SELECT business_id FROM public.users WHERE auth_user_id = auth.uid())
  );

GRANT SELECT, INSERT ON public.data_backup_log TO authenticated;

-- 3. RPC to get system data summary (live counts of preserved vs transactional records)
CREATE OR REPLACE FUNCTION public.get_system_data_summary(p_business_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_summary JSONB;
  v_orders_count BIGINT := 0;
  v_order_items_count BIGINT := 0;
  v_payments_count BIGINT := 0;
  v_customer_ledger_count BIGINT := 0;
  v_production_orders_count BIGINT := 0;
  v_deliveries_count BIGINT := 0;
  v_inventory_transactions_count BIGINT := 0;
  v_purchase_orders_count BIGINT := 0;
  v_expenses_count BIGINT := 0;
  v_import_jobs_count BIGINT := 0;
  
  -- Master data counts (preserved)
  v_customers_count BIGINT := 0;
  v_suppliers_count BIGINT := 0;
  v_products_count BIGINT := 0;
  v_categories_count BIGINT := 0;
  v_raw_materials_count BIGINT := 0;
  v_users_count BIGINT := 0;
  v_business_settings_count BIGINT := 0;
  v_last_backup RECORD;
BEGIN
  -- Transactional row counts
  SELECT COUNT(*) INTO v_orders_count FROM public.orders WHERE business_id = p_business_id;
  SELECT COUNT(*) INTO v_order_items_count FROM public.order_items WHERE business_id = p_business_id;
  SELECT COUNT(*) INTO v_payments_count FROM public.payments WHERE business_id = p_business_id;
  SELECT COUNT(*) INTO v_customer_ledger_count FROM public.customer_ledger WHERE business_id = p_business_id;
  SELECT COUNT(*) INTO v_production_orders_count FROM public.production_orders WHERE business_id = p_business_id;
  SELECT COUNT(*) INTO v_deliveries_count FROM public.deliveries WHERE business_id = p_business_id;
  SELECT COUNT(*) INTO v_inventory_transactions_count FROM public.inventory_transactions WHERE business_id = p_business_id;
  SELECT COUNT(*) INTO v_purchase_orders_count FROM public.purchase_orders WHERE business_id = p_business_id;
  SELECT COUNT(*) INTO v_expenses_count FROM public.expenses WHERE business_id = p_business_id;
  SELECT COUNT(*) INTO v_import_jobs_count FROM public.import_jobs WHERE business_id = p_business_id;

  -- Master data row counts
  SELECT COUNT(*) INTO v_customers_count FROM public.customers WHERE business_id = p_business_id;
  SELECT COUNT(*) INTO v_suppliers_count FROM public.suppliers WHERE business_id = p_business_id;
  SELECT COUNT(*) INTO v_products_count FROM public.products WHERE business_id = p_business_id;
  SELECT COUNT(*) INTO v_categories_count FROM public.categories WHERE business_id = p_business_id;
  SELECT COUNT(*) INTO v_raw_materials_count FROM public.raw_materials WHERE business_id = p_business_id;
  SELECT COUNT(*) INTO v_users_count FROM public.users WHERE business_id = p_business_id;
  SELECT COUNT(*) INTO v_business_settings_count FROM public.business_settings WHERE business_id = p_business_id;

  -- Most recent verified backup
  SELECT backup_token, backup_type, verified_at, filename
  INTO v_last_backup
  FROM public.data_backup_log
  WHERE business_id = p_business_id AND status = 'COMPLETED'
  ORDER BY created_at DESC
  LIMIT 1;

  v_summary := jsonb_build_object(
    'business_id', p_business_id,
    'timestamp', NOW(),
    'transactional', jsonb_build_object(
      'orders', v_orders_count,
      'order_items', v_order_items_count,
      'payments', v_payments_count,
      'customer_ledger', v_customer_ledger_count,
      'production_orders', v_production_orders_count,
      'deliveries', v_deliveries_count,
      'inventory_transactions', v_inventory_transactions_count,
      'purchase_orders', v_purchase_orders_count,
      'expenses', v_expenses_count,
      'import_jobs', v_import_jobs_count,
      'total_transactional_records', (
        v_orders_count + v_order_items_count + v_payments_count +
        v_customer_ledger_count + v_production_orders_count + v_deliveries_count +
        v_inventory_transactions_count + v_purchase_orders_count + v_expenses_count + v_import_jobs_count
      )
    ),
    'master_data', jsonb_build_object(
      'customers', v_customers_count,
      'suppliers', v_suppliers_count,
      'products', v_products_count,
      'categories', v_categories_count,
      'raw_materials', v_raw_materials_count,
      'users', v_users_count,
      'business_settings', v_business_settings_count
    ),
    'last_verified_backup', CASE
      WHEN v_last_backup.backup_token IS NOT NULL THEN jsonb_build_object(
        'backup_token', v_last_backup.backup_token,
        'backup_type', v_last_backup.backup_type,
        'verified_at', v_last_backup.verified_at,
        'filename', v_last_backup.filename
      )
      ELSE NULL
    END
  );

  RETURN v_summary;
END;
$$;

-- 4. Atomic RPC to reset all transactional business data in correct foreign-key order
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

  -- 2. Verify that a verified backup exists within the last 2 hours
  SELECT TRUE, verified_at INTO v_backup_exists, v_backup_time
  FROM public.data_backup_log
  WHERE business_id = p_business_id
    AND backup_token = p_backup_token
    AND status = 'COMPLETED'
    AND verified_at >= NOW() - INTERVAL '2 hours'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_backup_exists IS NOT TRUE THEN
    RAISE EXCEPTION 'Safety Violation: No verified backup found for token "%" within the last 2 hours. A verified complete backup must be downloaded before reset.', p_backup_token;
  END IF;

  -- Disable background cascading recalculation triggers during bulk reset
  BEGIN
    SET LOCAL session_replication_role = 'replica';
  EXCEPTION WHEN OTHERS THEN
    -- In environments where superuser is restricted, proceed with standard execution
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
