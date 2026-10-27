-- Migration: Fix ambiguous order_id reference in calculate_order_delivery_dates
-- Description: Adds #variable_conflict use_column and qualifies table columns to prevent PostgreSQL runtime ambiguous column reference errors.

CREATE OR REPLACE FUNCTION public.calculate_order_item_delivery_dates(
  p_business_id UUID,
  p_order_id UUID,
  p_order_item_id UUID
)
RETURNS TABLE (
  order_item_id UUID,
  production_completion_date DATE,
  earliest_delivery_date DATE,
  latest_delivery_date DATE,
  expected_delivery_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  po RECORD;
  product RECORD;
  prod_completion DATE;
  earliest_del DATE;
  latest_del DATE;
  expected_del DATE;
BEGIN
  -- Get production order and product delivery times
  SELECT po_sub.*
  INTO po
  FROM public.production_orders po_sub
  WHERE po_sub.id = (
    SELECT po_inner.id FROM public.production_orders po_inner
    WHERE po_inner.order_item_id = p_order_item_id AND po_inner.business_id = p_business_id
    ORDER BY po_inner.created_at DESC LIMIT 1
  );

  IF NOT FOUND THEN
    RETURN QUERY SELECT p_order_item_id, NULL::DATE, NULL::DATE, NULL::DATE, NULL::DATE;
    RETURN;
  END IF;

  SELECT p_row.*
  INTO product
  FROM public.products p_row
  WHERE p_row.id = po.product_id AND p_row.business_id = po.business_id;

  -- Use actual completion date if available, otherwise scheduled
  prod_completion := COALESCE(po.actual_end_date, po.scheduled_end_date);

  IF prod_completion IS NULL THEN
    RETURN QUERY SELECT p_order_item_id, NULL::DATE, NULL::DATE, NULL::DATE, NULL::DATE;
    RETURN;
  END IF;

  -- Calculate delivery dates by adding delivery_min/max_days as working days
  earliest_del := public.add_working_days(p_business_id, prod_completion, COALESCE(product.delivery_min_days, 0));
  latest_del := public.add_working_days(p_business_id, prod_completion, COALESCE(product.delivery_max_days, 0));

  -- Expected is midpoint (or earliest if min=max)
  IF product.delivery_min_days = product.delivery_max_days THEN
    expected_del := earliest_del;
  ELSE
    expected_del := public.add_working_days(p_business_id, prod_completion,
      CEIL((COALESCE(product.delivery_min_days, 0) + COALESCE(product.delivery_max_days, 0)) / 2.0)::INT);
  END IF;

  RETURN QUERY SELECT p_order_item_id, prod_completion, earliest_del, latest_del, expected_del;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_order_delivery_dates(
  p_business_id UUID,
  p_order_id UUID
)
RETURNS TABLE (
  order_id UUID,
  earliest_delivery_date DATE,
  latest_delivery_date DATE,
  expected_delivery_date DATE,
  delivery_calculation_version INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  order_rec RECORD;
  item_delivery RECORD;
  order_earliest DATE := NULL;
  order_latest DATE := NULL;
  order_expected DATE := NULL;
  has_production_orders BOOLEAN := FALSE;
  current_version INTEGER := 0;
BEGIN
  -- Verify order exists and is confirmed
  SELECT o.id, o.status INTO order_rec
  FROM public.orders o
  WHERE o.id = p_order_id AND o.business_id = p_business_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF order_rec.status != 'CONFIRMED' THEN
    RETURN QUERY SELECT p_order_id, NULL::DATE, NULL::DATE, NULL::DATE, 1;
    RETURN;
  END IF;

  -- Check if production orders exist for this order
  SELECT EXISTS(
    SELECT 1 FROM public.production_orders po
    WHERE po.order_id = p_order_id AND po.business_id = p_business_id
  ) INTO has_production_orders;

  IF NOT has_production_orders THEN
    RETURN QUERY SELECT p_order_id, NULL::DATE, NULL::DATE, NULL::DATE, 1;
    RETURN;
  END IF;

  -- Calculate delivery dates for each order item
  FOR item_delivery IN
    SELECT cd.*
    FROM public.order_items oi
    CROSS JOIN LATERAL public.calculate_order_item_delivery_dates(p_business_id, p_order_id, oi.id) cd
    WHERE oi.order_id = p_order_id AND oi.business_id = p_business_id
  LOOP
    -- For multi-product orders, use the LATEST required delivery date
    IF item_delivery.earliest_delivery_date IS NOT NULL THEN
      IF order_earliest IS NULL OR item_delivery.earliest_delivery_date > order_earliest THEN
        order_earliest := item_delivery.earliest_delivery_date;
      END IF;
    END IF;
    IF item_delivery.latest_delivery_date IS NOT NULL THEN
      IF order_latest IS NULL OR item_delivery.latest_delivery_date > order_latest THEN
        order_latest := item_delivery.latest_delivery_date;
      END IF;
    END IF;
    IF item_delivery.expected_delivery_date IS NOT NULL THEN
      IF order_expected IS NULL OR item_delivery.expected_delivery_date > order_expected THEN
        order_expected := item_delivery.expected_delivery_date;
      END IF;
    END IF;
  END LOOP;

  -- Get current calculation version
  SELECT COALESCE(o.delivery_calculation_version, 0) INTO current_version
  FROM public.orders o WHERE o.id = p_order_id AND o.business_id = p_business_id;

  RETURN QUERY SELECT p_order_id, order_earliest, order_latest, order_expected, current_version + 1;
END;
$$;
