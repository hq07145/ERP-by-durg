-- Migration: 202610190003_add_order_district.sql
-- Description: Add district column to orders table to store customer order district separately from place_of_supply (state).

ALTER TABLE orders ADD COLUMN IF NOT EXISTS district TEXT;

CREATE INDEX IF NOT EXISTS orders_district_idx ON orders (district);
