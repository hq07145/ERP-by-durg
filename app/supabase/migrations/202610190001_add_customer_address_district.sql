BEGIN;

-- 1. Add district column to customer_addresses table safely
ALTER TABLE public.customer_addresses 
  ADD COLUMN IF NOT EXISTS district TEXT CHECK (district IS NULL OR length(district) <= 120);

-- 2. Add index for district searches and group-by aggregations
CREATE INDEX IF NOT EXISTS customer_addresses_district_idx 
  ON public.customer_addresses (district);

-- 3. Update create_customer_with_address to support district (with backward compatible 12-param overload)
CREATE OR REPLACE FUNCTION public.create_customer_with_address(
  target_business_id UUID,
  target_name TEXT,
  target_company_name TEXT,
  target_phone TEXT,
  target_email TEXT,
  target_gst_number TEXT,
  target_payment_terms TEXT,
  target_credit_limit NUMERIC,
  target_address TEXT,
  target_city TEXT,
  target_state TEXT,
  target_postal_code TEXT,
  target_district TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  customer_id UUID;
BEGIN
  IF NOT public.is_business_member(target_business_id)
     OR NOT public.has_business_permission(target_business_id, 'customers.create') THEN
    RAISE EXCEPTION 'FORBIDDEN: customers.create' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.customers (
    business_id, name, company_name, phone, email, gst_number, payment_terms, credit_limit
  ) VALUES (
    target_business_id,
    btrim(target_name),
    NULLIF(btrim(target_company_name), ''),
    NULLIF(btrim(target_phone), ''),
    NULLIF(lower(btrim(target_email)), ''),
    NULLIF(upper(btrim(target_gst_number)), ''),
    NULLIF(btrim(target_payment_terms), ''),
    target_credit_limit
  ) RETURNING id INTO customer_id;

  IF NULLIF(btrim(target_address), '') IS NOT NULL
     OR NULLIF(btrim(target_city), '') IS NOT NULL
     OR NULLIF(btrim(target_state), '') IS NOT NULL
     OR NULLIF(btrim(target_postal_code), '') IS NOT NULL
     OR NULLIF(btrim(target_district), '') IS NOT NULL THEN
    INSERT INTO public.customer_addresses (
      customer_id, address_type, address, city, state, postal_code, district
    ) VALUES (
      customer_id, 'PRIMARY', NULLIF(btrim(target_address), ''), NULLIF(btrim(target_city), ''),
      NULLIF(btrim(target_state), ''), NULLIF(btrim(target_postal_code), ''),
      NULLIF(btrim(target_district), '')
    );
  END IF;

  RETURN customer_id;
END;
$$;

-- Backward-compatible 12-param wrapper
CREATE OR REPLACE FUNCTION public.create_customer_with_address(
  target_business_id UUID,
  target_name TEXT,
  target_company_name TEXT,
  target_phone TEXT,
  target_email TEXT,
  target_gst_number TEXT,
  target_payment_terms TEXT,
  target_credit_limit NUMERIC,
  target_address TEXT,
  target_city TEXT,
  target_state TEXT,
  target_postal_code TEXT
)
RETURNS UUID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.create_customer_with_address(
    target_business_id, target_name, target_company_name, target_phone, target_email,
    target_gst_number, target_payment_terms, target_credit_limit,
    target_address, target_city, target_state, target_postal_code, NULL
  );
$$;

-- 4. Update update_customer_with_address to support district (with backward compatible 14-param overload)
CREATE OR REPLACE FUNCTION public.update_customer_with_address(
  target_business_id UUID,
  target_customer_id UUID,
  target_address_id UUID,
  target_name TEXT,
  target_company_name TEXT,
  target_phone TEXT,
  target_email TEXT,
  target_gst_number TEXT,
  target_payment_terms TEXT,
  target_credit_limit NUMERIC,
  target_address TEXT,
  target_city TEXT,
  target_state TEXT,
  target_postal_code TEXT,
  target_district TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_business_member(target_business_id)
     OR NOT public.has_business_permission(target_business_id, 'customers.edit') THEN
    RAISE EXCEPTION 'FORBIDDEN: customers.edit' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.customers
  WHERE id = target_customer_id AND business_id = target_business_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'CUSTOMER_NOT_FOUND';
  END IF;

  UPDATE public.customers SET
    name = btrim(target_name),
    company_name = NULLIF(btrim(target_company_name), ''),
    phone = NULLIF(btrim(target_phone), ''),
    email = NULLIF(lower(btrim(target_email)), ''),
    gst_number = NULLIF(upper(btrim(target_gst_number)), ''),
    payment_terms = NULLIF(btrim(target_payment_terms), ''),
    credit_limit = target_credit_limit
  WHERE id = target_customer_id AND business_id = target_business_id;

  IF target_address_id IS NOT NULL THEN
    UPDATE public.customer_addresses SET
      address = NULLIF(btrim(target_address), ''),
      city = NULLIF(btrim(target_city), ''),
      state = NULLIF(btrim(target_state), ''),
      postal_code = NULLIF(btrim(target_postal_code), ''),
      district = NULLIF(btrim(target_district), '')
    WHERE id = target_address_id AND customer_id = target_customer_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'CUSTOMER_ADDRESS_NOT_FOUND';
    END IF;
  ELSIF NULLIF(btrim(target_address), '') IS NOT NULL
     OR NULLIF(btrim(target_city), '') IS NOT NULL
     OR NULLIF(btrim(target_state), '') IS NOT NULL
     OR NULLIF(btrim(target_postal_code), '') IS NOT NULL
     OR NULLIF(btrim(target_district), '') IS NOT NULL THEN
    INSERT INTO public.customer_addresses (
      customer_id, address_type, address, city, state, postal_code, district
    ) VALUES (
      target_customer_id, 'PRIMARY', NULLIF(btrim(target_address), ''), NULLIF(btrim(target_city), ''),
      NULLIF(btrim(target_state), ''), NULLIF(btrim(target_postal_code), ''),
      NULLIF(btrim(target_district), '')
    );
  END IF;
END;
$$;

-- Backward-compatible 14-param wrapper
CREATE OR REPLACE FUNCTION public.update_customer_with_address(
  target_business_id UUID,
  target_customer_id UUID,
  target_address_id UUID,
  target_name TEXT,
  target_company_name TEXT,
  target_phone TEXT,
  target_email TEXT,
  target_gst_number TEXT,
  target_payment_terms TEXT,
  target_credit_limit NUMERIC,
  target_address TEXT,
  target_city TEXT,
  target_state TEXT,
  target_postal_code TEXT
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.update_customer_with_address(
    target_business_id, target_customer_id, target_address_id, target_name,
    target_company_name, target_phone, target_email, target_gst_number,
    target_payment_terms, target_credit_limit, target_address, target_city,
    target_state, target_postal_code, NULL
  );
$$;

COMMIT;
