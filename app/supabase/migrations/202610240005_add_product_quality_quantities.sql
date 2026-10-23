BEGIN;

-- Add 5 quality standard quantity columns to products table
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS qty_is_4985 NUMERIC(14, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qty_is_12786 NUMERIC(14, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qty_is_13487 NUMERIC(14, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qty_is_13488 NUMERIC(14, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qty_is_12785 NUMERIC(14, 2) DEFAULT 0;

COMMENT ON COLUMN public.products.qty_is_4985 IS 'Quantity for IS:4985 PVC Pipe';
COMMENT ON COLUMN public.products.qty_is_12786 IS 'Quantity for IS:12786 Plain Lateral';
COMMENT ON COLUMN public.products.qty_is_13487 IS 'Quantity for IS:13487 Emitter';
COMMENT ON COLUMN public.products.qty_is_13488 IS 'Quantity for IS:13488 Emitting Pipe';
COMMENT ON COLUMN public.products.qty_is_12785 IS 'Quantity for IS:12785 Filters';

-- Also add to order_items table for order snapshotting and reporting
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS qty_is_4985 NUMERIC(14, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qty_is_12786 NUMERIC(14, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qty_is_13487 NUMERIC(14, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qty_is_13488 NUMERIC(14, 2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS qty_is_12785 NUMERIC(14, 2) DEFAULT 0;

COMMIT;
