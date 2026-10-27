-- 1. Create table for atomic order sequences per business
CREATE TABLE IF NOT EXISTS public.order_sequences (
  business_id UUID PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  prefix TEXT NOT NULL DEFAULT 'ORD-',
  next_val BIGINT NOT NULL DEFAULT 1,
  padding INT NOT NULL DEFAULT 6,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.order_sequences ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'order_sequences' AND policyname = 'order_sequences_business_member_all'
  ) THEN
    CREATE POLICY order_sequences_business_member_all ON public.order_sequences
      FOR ALL
      TO authenticated
      USING (public.is_business_member(business_id))
      WITH CHECK (public.is_business_member(business_id));
  END IF;
END $$;

-- 2. Populate order_sequences from existing orders and business_settings
INSERT INTO public.order_sequences (business_id, prefix, next_val, padding, updated_at)
SELECT 
  b.id AS business_id,
  'ORD-' AS prefix,
  GREATEST(
    COALESCE(
      (SELECT NULLIF(TRIM(bs.value->>'next_number'), '')::BIGINT 
       FROM public.business_settings bs 
       WHERE bs.business_id = b.id AND bs.key = 'order_number_sequence'), 
      1
    ),
    COALESCE(
      (SELECT MAX(NULLIF(SUBSTRING(o.order_number FROM '^ORD-0*([0-9]+)$'), '')::BIGINT) 
       FROM public.orders o 
       WHERE o.business_id = b.id AND o.order_number ~ '^ORD-[0-9]+$'),
      0
    ) + 1,
    1
  ) AS next_val,
  6 AS padding,
  NOW() AS updated_at
FROM public.businesses b
ON CONFLICT (business_id) DO UPDATE
  SET next_val = GREATEST(order_sequences.next_val, EXCLUDED.next_val),
      updated_at = NOW();

-- 3. Atomic function: generate_next_order_number
CREATE OR REPLACE FUNCTION public.generate_next_order_number(p_business_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_seq RECORD;
  v_num BIGINT;
  v_prefix TEXT;
  v_padding INT;
  v_result TEXT;
  v_max_existing BIGINT := 0;
BEGIN
  -- 1. Lock sequence row for this business FOR UPDATE to serialize concurrent requests
  SELECT * INTO v_seq
  FROM public.order_sequences
  WHERE business_id = p_business_id
  FOR UPDATE;

  -- If sequence row doesn't exist yet, initialize it dynamically
  IF NOT FOUND THEN
    SELECT COALESCE(
      (SELECT NULLIF(TRIM(value->>'next_number'), '')::BIGINT
       FROM public.business_settings
       WHERE business_id = p_business_id AND key = 'order_number_sequence'),
      1
    ) INTO v_max_existing;

    SELECT COALESCE(
      MAX(NULLIF(SUBSTRING(order_number FROM '^ORD-0*([0-9]+)$'), '')::BIGINT),
      0
    ) + 1 INTO v_num
    FROM public.orders
    WHERE business_id = p_business_id AND order_number ~ '^ORD-[0-9]+$';

    v_num := GREATEST(COALESCE(v_max_existing, 1), COALESCE(v_num, 1), 1);
    v_prefix := 'ORD-';
    v_padding := 6;

    INSERT INTO public.order_sequences (business_id, prefix, next_val, padding, updated_at)
    VALUES (p_business_id, v_prefix, v_num + 1, v_padding, NOW())
    ON CONFLICT (business_id) DO UPDATE
      SET next_val = GREATEST(order_sequences.next_val, EXCLUDED.next_val)
    RETURNING * INTO v_seq;

    v_result := v_prefix || LPAD(v_num::TEXT, v_padding, '0');

    -- Keep business_settings synced
    INSERT INTO public.business_settings (business_id, key, value, updated_at)
    VALUES (p_business_id, 'order_number_sequence', jsonb_build_object('prefix', v_prefix, 'next_number', v_num + 1), NOW())
    ON CONFLICT (business_id, key) DO UPDATE
      SET value = jsonb_build_object('prefix', v_prefix, 'next_number', v_num + 1), updated_at = NOW();

    RETURN v_result;
  END IF;

  v_num := v_seq.next_val;
  v_prefix := COALESCE(v_seq.prefix, 'ORD-');
  v_padding := COALESCE(v_seq.padding, 6);

  -- Ensure v_num does not collide with any existing order (e.g. manually entered historical order)
  LOOP
    v_result := v_prefix || LPAD(v_num::TEXT, v_padding, '0');
    IF NOT EXISTS (
      SELECT 1 FROM public.orders
      WHERE business_id = p_business_id AND order_number = v_result
    ) THEN
      EXIT;
    END IF;
    v_num := v_num + 1;
  END LOOP;

  -- Advance sequence atomically
  UPDATE public.order_sequences
  SET next_val = v_num + 1,
      updated_at = NOW()
  WHERE business_id = p_business_id;

  -- Keep business_settings synced for backward compatibility
  INSERT INTO public.business_settings (business_id, key, value, updated_at)
  VALUES (p_business_id, 'order_number_sequence', jsonb_build_object('prefix', v_prefix, 'next_number', v_num + 1), NOW())
  ON CONFLICT (business_id, key) DO UPDATE
    SET value = jsonb_build_object('prefix', v_prefix, 'next_number', v_num + 1), updated_at = NOW();

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_next_order_number(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_next_order_number(UUID) TO authenticated, service_role;

-- 4. Trigger to ensure any order inserted without an order_number automatically receives the sequential number
CREATE OR REPLACE FUNCTION public.assign_order_number_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.order_number IS NULL OR TRIM(NEW.order_number) = '' OR NEW.order_number = 'AUTO' OR NEW.order_number LIKE 'AUTO-%' THEN
    NEW.order_number := public.generate_next_order_number(NEW.business_id);
  END IF;

  NEW.order_number := UPPER(TRIM(NEW.order_number));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_order_number ON public.orders;
CREATE TRIGGER trg_assign_order_number
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.assign_order_number_trigger();
