-- Migration: 202611010001_target_invoice_rate_snapshot_and_audit.sql
-- Step 7: Persist Adjusted Invoice Rate Snapshot and Immutable Audit Trail

BEGIN;

-- 1. Upgrade order_items.unit_price precision to NUMERIC(20, 10) for high-precision rates
ALTER TABLE public.order_items 
  ALTER COLUMN unit_price TYPE NUMERIC(20, 10);

-- 2. Add line-level adjustment snapshot columns to order_items
ALTER TABLE public.order_items 
  ADD COLUMN IF NOT EXISTS original_unit_price NUMERIC(20, 10),
  ADD COLUMN IF NOT EXISTS adjusted_rate_inclusive NUMERIC(20, 10),
  ADD COLUMN IF NOT EXISTS is_rate_adjusted BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Add invoice-level target adjustment snapshot columns to orders
ALTER TABLE public.orders 
  ADD COLUMN IF NOT EXISTS is_target_adjusted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS target_total_amount NUMERIC(16, 2),
  ADD COLUMN IF NOT EXISTS original_total_amount NUMERIC(16, 2),
  ADD COLUMN IF NOT EXISTS adjustment_strategy TEXT CHECK (adjustment_strategy IS NULL OR adjustment_strategy IN ('SINGLE_PRODUCT', 'PROPORTIONAL')),
  ADD COLUMN IF NOT EXISTS rounding_residual NUMERIC(8, 4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adjustment_confirmed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS adjusted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS adjusted_at TIMESTAMPTZ;

-- 4. Create immutable audit trail table for invoice target rate adjustments
CREATE TABLE IF NOT EXISTS public.order_target_adjustment_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL,
  adjustment_event_type TEXT NOT NULL DEFAULT 'INVOICE_CREATE' CHECK (adjustment_event_type IN ('INVOICE_CREATE', 'INVOICE_UPDATE')),
  adjustment_strategy TEXT NOT NULL CHECK (adjustment_strategy IN ('SINGLE_PRODUCT', 'PROPORTIONAL')),
  original_invoice_total NUMERIC(16, 2) NOT NULL,
  target_invoice_total NUMERIC(16, 2) NOT NULL,
  final_invoice_total NUMERIC(16, 2) NOT NULL,
  taxable_amount NUMERIC(16, 2) NOT NULL,
  cgst_amount NUMERIC(16, 2) NOT NULL DEFAULT 0,
  sgst_amount NUMERIC(16, 2) NOT NULL DEFAULT 0,
  igst_amount NUMERIC(16, 2) NOT NULL DEFAULT 0,
  rounding_residual NUMERIC(8, 4) NOT NULL DEFAULT 0,
  is_exact_match BOOLEAN NOT NULL DEFAULT TRUE,
  confirmation_status BOOLEAN NOT NULL DEFAULT TRUE,
  adjusted_items_count INTEGER NOT NULL DEFAULT 1,
  items_snapshot JSONB NOT NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Create item-level immutable audit records for granular historical inspection
CREATE TABLE IF NOT EXISTS public.order_item_target_adjustment_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  audit_id UUID NOT NULL REFERENCES public.order_target_adjustment_audit(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name TEXT,
  quantity NUMERIC(14, 3) NOT NULL,
  old_unit_price NUMERIC(20, 10) NOT NULL,
  adjusted_unit_price NUMERIC(20, 10) NOT NULL,
  adjusted_inclusive_rate NUMERIC(20, 10),
  gst_rate NUMERIC(5, 2) NOT NULL,
  discount_rate NUMERIC(5, 2) NOT NULL DEFAULT 0,
  taxable_amount NUMERIC(16, 2) NOT NULL,
  line_total NUMERIC(16, 2) NOT NULL,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Add indexes
CREATE INDEX IF NOT EXISTS idx_target_adj_audit_order ON public.order_target_adjustment_audit(order_id);
CREATE INDEX IF NOT EXISTS idx_target_adj_audit_business ON public.order_target_adjustment_audit(business_id);
CREATE INDEX IF NOT EXISTS idx_item_target_adj_audit ON public.order_item_target_adjustment_audit(audit_id);
CREATE INDEX IF NOT EXISTS idx_item_target_adj_product ON public.order_item_target_adjustment_audit(product_id);

-- 7. Enable RLS and setup policies
ALTER TABLE public.order_target_adjustment_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_target_adjustment_audit ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'order_target_adjustment_audit' AND policyname = 'order_target_adj_audit_business_all'
  ) THEN
    CREATE POLICY order_target_adj_audit_business_all ON public.order_target_adjustment_audit
      FOR ALL
      TO authenticated
      USING (public.is_business_member(business_id))
      WITH CHECK (public.is_business_member(business_id));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'order_item_target_adjustment_audit' AND policyname = 'order_item_target_adj_audit_business_all'
  ) THEN
    CREATE POLICY order_item_target_adj_audit_business_all ON public.order_item_target_adjustment_audit
      FOR ALL
      TO authenticated
      USING (public.is_business_member(business_id))
      WITH CHECK (public.is_business_member(business_id));
  END IF;
END $$;

COMMIT;

