-- Migration: Allow 'customer_opening_balances' in import_jobs.module
ALTER TABLE public.import_jobs
  DROP CONSTRAINT IF EXISTS import_jobs_module_check;

ALTER TABLE public.import_jobs
  ADD CONSTRAINT import_jobs_module_check
  CHECK (module = ANY (ARRAY[
    'customers'::text,
    'suppliers'::text,
    'products'::text,
    'opening_finished_goods'::text,
    'opening_raw_materials'::text,
    'historical_orders'::text,
    'historical_payments'::text,
    'purchases'::text,
    'expenses'::text,
    'customer_opening_balances'::text
  ]));
