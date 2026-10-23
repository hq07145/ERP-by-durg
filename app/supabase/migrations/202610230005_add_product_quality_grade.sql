BEGIN;

-- 1. Add quality_grade column to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS quality_grade TEXT;

-- 2. Add quality_grade column to product_variants
ALTER TABLE public.product_variants ADD COLUMN IF NOT EXISTS quality_grade TEXT;

-- 3. Add quality_grade and variant_id columns to order_items
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS quality_grade TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_items_variant_fk'
  ) THEN
    ALTER TABLE public.order_items
      ADD COLUMN IF NOT EXISTS variant_id UUID,
      ADD CONSTRAINT order_items_variant_fk
      FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS products_quality_grade_idx ON public.products (business_id, quality_grade);
CREATE INDEX IF NOT EXISTS order_items_variant_idx ON public.order_items (business_id, variant_id);

COMMIT;
