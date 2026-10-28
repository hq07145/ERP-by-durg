-- Migration: 202610280008_import_job_rows_and_protection.sql
-- Table for tracking row-level import execution, duplicate classification, and resumable retries

CREATE TABLE IF NOT EXISTS public.import_job_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  identifier TEXT,
  classification TEXT NOT NULL CHECK (classification IN ('NEW', 'DUPLICATE', 'INVALID', 'REJECTED')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IMPORTED', 'SKIPPED_DUPLICATE', 'FAILED', 'REJECTED')),
  reason TEXT,
  error_message TEXT,
  raw_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  imported_record_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient lookups and batch retries
CREATE INDEX IF NOT EXISTS import_job_rows_job_status_idx ON public.import_job_rows (job_id, status);
CREATE INDEX IF NOT EXISTS import_job_rows_biz_id_idx ON public.import_job_rows (business_id, identifier);
CREATE INDEX IF NOT EXISTS import_job_rows_job_row_idx ON public.import_job_rows (job_id, row_number);

-- Enable RLS
ALTER TABLE public.import_job_rows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "import_job_rows_business_isolation_select" ON public.import_job_rows;
CREATE POLICY "import_job_rows_business_isolation_select" ON public.import_job_rows
  FOR SELECT
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "import_job_rows_business_isolation_insert" ON public.import_job_rows;
CREATE POLICY "import_job_rows_business_isolation_insert" ON public.import_job_rows
  FOR INSERT
  WITH CHECK (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "import_job_rows_business_isolation_update" ON public.import_job_rows;
CREATE POLICY "import_job_rows_business_isolation_update" ON public.import_job_rows
  FOR UPDATE
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "import_job_rows_business_isolation_delete" ON public.import_job_rows;
CREATE POLICY "import_job_rows_business_isolation_delete" ON public.import_job_rows
  FOR DELETE
  USING (
    business_id = (SELECT business_id FROM public.users WHERE id = auth.uid())
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_job_rows TO authenticated;
