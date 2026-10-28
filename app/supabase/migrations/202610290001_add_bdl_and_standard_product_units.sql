-- Migration: Add BDL and standard product units (PCS, KG, MTR, BOX, SET, PAIR, LTR, BDL) to products table
-- Preserves all existing product records and allows both standard abbreviations and legacy unit names.

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_unit_check;
ALTER TABLE public.products ADD CONSTRAINT products_unit_check
  CHECK (unit IN ('Piece', 'Bundle', 'Box', 'Kg', 'Meter', 'Set', 'BDL', 'PCS', 'KG', 'MTR', 'BOX', 'SET', 'PAIR', 'LTR'));

ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_production_unit_check;
ALTER TABLE public.products ADD CONSTRAINT products_production_unit_check
  CHECK (production_unit IN ('Piece', 'Bundle', 'Box', 'Kg', 'Meter', 'Set', 'BDL', 'PCS', 'KG', 'MTR', 'BOX', 'SET', 'PAIR', 'LTR'));
