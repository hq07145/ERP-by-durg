-- Migration: Update business profile and settings to SANKALP IRRIGATION
UPDATE public.businesses
SET 
  name = 'SANKALP IRRIGATION',
  legal_name = 'SANKALP IRRIGATION',
  gst_number = '23AAMPQ5857F1ZE',
  address = 'Icchapur Road, Shahpur, Dist. Burhanpur (M.P.) 450-445',
  email = 'sankalpirrigation80@gmail.com',
  updated_at = NOW()
WHERE id = '11111111-1111-4111-8111-111111111111';

INSERT INTO public.business_settings (business_id, key, value, created_at, updated_at)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'business_details',
  jsonb_build_object(
    'name', 'SANKALP IRRIGATION',
    'legal_name', 'SANKALP IRRIGATION',
    'tagline', 'ISI CERTIFIED COMPANY',
    'business_type', 'INLINE-ONLINE DRIP MAKER',
    'gst_number', '23AAMPQ5857F1ZE',
    'address', 'Icchapur Road, Shahpur, Dist. Burhanpur (M.P.) 450-445',
    'email', 'sankalpirrigation80@gmail.com',
    'phone', '+91 98765 43210',
    'state', 'Madhya Pradesh'
  ),
  NOW(),
  NOW()
)
ON CONFLICT (business_id, key) DO UPDATE
SET 
  value = EXCLUDED.value,
  updated_at = NOW();
