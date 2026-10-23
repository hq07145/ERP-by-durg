BEGIN;

-- Add driver_phone column to deliveries table if it doesn't already exist
ALTER TABLE public.deliveries 
ADD COLUMN IF NOT EXISTS driver_phone TEXT;

COMMENT ON COLUMN public.deliveries.driver_phone IS 'Driver mobile or contact phone number for delivery dispatch and verification';

COMMIT;
