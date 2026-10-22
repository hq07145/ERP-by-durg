-- Migration: 202610220003_create_import_jobs.sql
-- Create table for tracking Excel/CSV bulk import jobs and historical data imports

CREATE TABLE IF NOT EXISTS public.import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  module TEXT NOT NULL CHECK (module IN (
    'customers',
    'suppliers',
    'products',
    'opening_finished_goods',
    'opening_raw_materials',
    'historical_orders',
    'historical_payments',
    'purchases',
    'expenses'
  )),
  filename TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  total_rows INTEGER NOT NULL DEFAULT 0,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  failed_rows INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'PARTIAL')),
  error_summary TEXT,
  errors JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS import_jobs_business_module_idx ON public.import_jobs (business_id, module, created_at DESC);
CREATE INDEX IF NOT EXISTS import_jobs_business_hash_idx ON public.import_jobs (business_id, file_hash);
CREATE INDEX IF NOT EXISTS import_jobs_business_status_idx ON public.import_jobs (business_id, status);

-- Enable Row Level Security
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "import_jobs_business_isolation_select" ON public.import_jobs;
CREATE POLICY "import_jobs_business_isolation_select" ON public.import_jobs
  FOR SELECT
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "import_jobs_business_isolation_insert" ON public.import_jobs;
CREATE POLICY "import_jobs_business_isolation_insert" ON public.import_jobs
  FOR INSERT
  WITH CHECK (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "import_jobs_business_isolation_update" ON public.import_jobs;
CREATE POLICY "import_jobs_business_isolation_update" ON public.import_jobs
  FOR UPDATE
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

GRANT SELECT, INSERT, UPDATE ON public.import_jobs TO authenticated;
