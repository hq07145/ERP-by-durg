BEGIN;

-- Add invoice_number column to deliveries table
ALTER TABLE public.deliveries 
ADD COLUMN IF NOT EXISTS invoice_number TEXT;

COMMENT ON COLUMN public.deliveries.invoice_number IS 'Invoice number associated with the delivery (e.g. SAN/26-27/154)';

-- Index for invoice lookups by business
CREATE INDEX IF NOT EXISTS deliveries_business_invoice_idx 
ON public.deliveries (business_id, invoice_number);

COMMIT;
