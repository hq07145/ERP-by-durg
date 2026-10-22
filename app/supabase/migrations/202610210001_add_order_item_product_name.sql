-- Migration: Add product_name snapshot column to order_items
ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS product_name TEXT;

-- Backfill product_name from products table for all existing order items
UPDATE public.order_items oi
SET product_name = p.name
FROM public.products p
WHERE oi.product_id = p.id AND (oi.product_name IS NULL OR oi.product_name = '');
