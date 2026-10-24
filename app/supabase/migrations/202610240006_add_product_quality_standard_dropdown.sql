BEGIN;

-- 1. Add quality_standard column to products table
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS quality_standard TEXT;

COMMENT ON COLUMN public.products.quality_standard IS 'Selected IS Quality Standard (e.g. IS:4985 PVC Pipe, IS:12786 Plain Lateral, IS:13487 Emitter, IS:13488 Emitting Pipe, IS:12785 Filters)';

-- 2. Add quality_standard column to order_items table for order snapshotting and reporting
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS quality_standard TEXT;

COMMENT ON COLUMN public.order_items.quality_standard IS 'Selected IS Quality Standard snapshot for order item';

-- 3. Backfill quality_standard on products based on existing non-zero quality quantities
UPDATE public.products
SET quality_standard = CASE
  WHEN COALESCE(qty_is_4985, 0) > 0 THEN 'IS:4985 PVC Pipe'
  WHEN COALESCE(qty_is_12786, 0) > 0 THEN 'IS:12786 Plain Lateral'
  WHEN COALESCE(qty_is_13487, 0) > 0 THEN 'IS:13487 Emitter'
  WHEN COALESCE(qty_is_13488, 0) > 0 THEN 'IS:13488 Emitting Pipe'
  WHEN COALESCE(qty_is_12785, 0) > 0 THEN 'IS:12785 Filters'
  ELSE NULL
END
WHERE quality_standard IS NULL;

-- 4. Backfill quality_standard on order_items based on existing non-zero quality quantities or product reference
UPDATE public.order_items oi
SET quality_standard = CASE
  WHEN COALESCE(oi.qty_is_4985, 0) > 0 THEN 'IS:4985 PVC Pipe'
  WHEN COALESCE(oi.qty_is_12786, 0) > 0 THEN 'IS:12786 Plain Lateral'
  WHEN COALESCE(oi.qty_is_13487, 0) > 0 THEN 'IS:13487 Emitter'
  WHEN COALESCE(oi.qty_is_13488, 0) > 0 THEN 'IS:13488 Emitting Pipe'
  WHEN COALESCE(oi.qty_is_12785, 0) > 0 THEN 'IS:12785 Filters'
  ELSE p.quality_standard
END
FROM public.products p
WHERE oi.product_id = p.id AND oi.quality_standard IS NULL;

COMMIT;
