-- ============================================
-- STEP 17: Business Settings + Working Calendar
-- ============================================

BEGIN;

-- Extend business_settings with structured keys for settings
-- Settings keys:
-- - business_details: { name, legal_name, gst_number, address, phone, email }
-- - currency: { code, symbol, locale }
-- - timezone: { timezone }
-- - default_tax: { rate, tax_type }
-- - working_hours: { start_time, end_time, break_start, break_end }
-- - working_days: { mon, tue, wed, thu, fri, sat, sun } (boolean)
-- - default_order_settings: { default_priority, auto_confirm, require_payment }
-- - default_delivery_settings: { default_lead_time_days, delivery_window_start, delivery_window_end }

-- Add default business settings if not exist
INSERT INTO public.business_settings (business_id, key, value)
SELECT b.id, 'business_details', jsonb_build_object(
  'name', b.name,
  'legal_name', b.legal_name,
  'gst_number', b.gst_number,
  'address', b.address,
  'phone', b.phone,
  'email', b.email
)
FROM public.businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM public.business_settings bs WHERE bs.business_id = b.id AND bs.key = 'business_details'
);

INSERT INTO public.business_settings (business_id, key, value)
SELECT b.id, 'currency', '{"code": "INR", "symbol": "₹", "locale": "en-IN"}'
FROM public.businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM public.business_settings bs WHERE bs.business_id = b.id AND bs.key = 'currency'
);

INSERT INTO public.business_settings (business_id, key, value)
SELECT b.id, 'timezone', jsonb_build_object('timezone', b.timezone)
FROM public.businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM public.business_settings bs WHERE bs.business_id = b.id AND bs.key = 'timezone'
);

INSERT INTO public.business_settings (business_id, key, value)
SELECT b.id, 'default_tax', '{"rate": 18, "tax_type": "GST"}'
FROM public.businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM public.business_settings bs WHERE bs.business_id = b.id AND bs.key = 'default_tax'
);

INSERT INTO public.business_settings (business_id, key, value)
SELECT b.id, 'working_hours', '{"start_time": "09:00", "end_time": "18:00", "break_start": "13:00", "break_end": "14:00"}'
FROM public.businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM public.business_settings bs WHERE bs.business_id = b.id AND bs.key = 'working_hours'
);

INSERT INTO public.business_settings (business_id, key, value)
SELECT b.id, 'working_days', '{"mon": true, "tue": true, "wed": true, "thu": true, "fri": true, "sat": false, "sun": false}'
FROM public.businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM public.business_settings bs WHERE bs.business_id = b.id AND bs.key = 'working_days'
);

INSERT INTO public.business_settings (business_id, key, value)
SELECT b.id, 'default_order_settings', '{"default_priority": "NORMAL", "auto_confirm": false, "require_payment": false}'
FROM public.businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM public.business_settings bs WHERE bs.business_id = b.id AND bs.key = 'default_order_settings'
);

INSERT INTO public.business_settings (business_id, key, value)
SELECT b.id, 'default_delivery_settings', '{"default_lead_time_days": 3, "delivery_window_start": "09:00", "delivery_window_end": "18:00"}'
FROM public.businesses b
WHERE NOT EXISTS (
  SELECT 1 FROM public.business_settings bs WHERE bs.business_id = b.id AND bs.key = 'default_delivery_settings'
);

-- ============================================
-- BUSINESS CALENDAR ENHANCEMENTS
-- ============================================
-- business_calendar already exists from production migration
-- Add constraints and triggers for calendar management

-- Ensure business_calendar has proper audit trigger (already exists from production migration)

-- Function to initialize calendar from working_days settings
CREATE OR REPLACE FUNCTION public.initialize_business_calendar(
  p_business_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  working_days JSONB;
  v_current_date DATE := p_start_date;
  dow INTEGER;
  day_key TEXT;
  is_working BOOLEAN;
  note TEXT;
BEGIN
  -- Get working days from settings
  SELECT value INTO working_days
  FROM public.business_settings
  WHERE business_id = p_business_id AND key = 'working_days';

  IF working_days IS NULL THEN
    working_days := '{"mon": true, "tue": true, "wed": true, "thu": true, "fri": true, "sat": false, "sun": false}'::JSONB;
  END IF;

  WHILE v_current_date <= p_end_date LOOP
    dow := EXTRACT(DOW FROM v_current_date)::INTEGER;
    day_key := CASE dow
      WHEN 0 THEN 'sun' WHEN 1 THEN 'mon' WHEN 2 THEN 'tue'
      WHEN 3 THEN 'wed' WHEN 4 THEN 'thu' WHEN 5 THEN 'fri' WHEN 6 THEN 'sat'
    END;

    is_working := COALESCE(working_days->>day_key, 'false')::BOOLEAN;
    note := CASE WHEN NOT is_working THEN 'Weekly holiday (' || upper(day_key) || ')' ELSE NULL END;

    INSERT INTO public.business_calendar (business_id, calendar_date, is_working_day, note)
    VALUES (p_business_id, v_current_date, is_working, note)
    ON CONFLICT (business_id, calendar_date) DO UPDATE SET
      is_working_day = EXCLUDED.is_working_day,
      note = EXCLUDED.note,
      updated_at = NOW();

    v_current_date := v_current_date + INTERVAL '1 day';
  END LOOP;
END;
$$;

-- Function to add/update a specific holiday/non-working day
CREATE OR REPLACE FUNCTION public.set_calendar_day(
  p_business_id UUID,
  p_date DATE,
  p_is_working_day BOOLEAN,
  p_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.business_calendar (business_id, calendar_date, is_working_day, note)
  VALUES (p_business_id, p_date, p_is_working_day, p_note)
  ON CONFLICT (business_id, calendar_date) DO UPDATE SET
    is_working_day = EXCLUDED.is_working_day,
    note = EXCLUDED.note,
    updated_at = NOW();
END;
$$;

-- Function to remove a calendar entry (revert to default from working_days)
CREATE OR REPLACE FUNCTION public.remove_calendar_day(
  p_business_id UUID,
  p_date DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  working_days JSONB;
  dow INTEGER;
  day_key TEXT;
  is_working BOOLEAN;
BEGIN
  SELECT value INTO working_days
  FROM public.business_settings
  WHERE business_id = p_business_id AND key = 'working_days';

  IF working_days IS NULL THEN
    working_days := '{"mon": true, "tue": true, "wed": true, "thu": true, "fri": true, "sat": false, "sun": false}'::JSONB;
  END IF;

  dow := EXTRACT(DOW FROM p_date)::INTEGER;
  day_key := CASE dow
    WHEN 0 THEN 'sun' WHEN 1 THEN 'mon' WHEN 2 THEN 'tue'
    WHEN 3 THEN 'wed' WHEN 4 THEN 'thu' WHEN 5 THEN 'fri' WHEN 6 THEN 'sat'
  END;

  is_working := COALESCE(working_days->>day_key, 'false')::BOOLEAN;

  IF is_working THEN
    DELETE FROM public.business_calendar
    WHERE business_id = p_business_id AND calendar_date = p_date;
  ELSE
    UPDATE public.business_calendar
    SET is_working_day = true, note = 'Overridden to working day', updated_at = NOW()
    WHERE business_id = p_business_id AND calendar_date = p_date;
  END IF;
END;
$$;

-- Function to get calendar for a date range with default fallback
CREATE OR REPLACE FUNCTION public.get_business_calendar(
  p_business_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE (
  calendar_date DATE,
  is_working_day BOOLEAN,
  note TEXT,
  is_override BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  working_days JSONB;
  cal RECORD;
BEGIN
  SELECT value INTO working_days
  FROM public.business_settings
  WHERE business_id = p_business_id AND key = 'working_days';

  IF working_days IS NULL THEN
    working_days := '{"mon": true, "tue": true, "wed": true, "thu": true, "fri": true, "sat": false, "sun": false}'::JSONB;
  END IF;

  FOR cal IN
    SELECT calendar_date, is_working_day, note
    FROM public.business_calendar
    WHERE business_id = p_business_id
      AND calendar_date BETWEEN p_start_date AND p_end_date
    ORDER BY calendar_date
  LOOP
    RETURN QUERY SELECT cal.calendar_date, cal.is_working_day, cal.note, TRUE;
  END LOOP;

  -- Fill in missing dates with defaults
  RETURN QUERY
  SELECT
    gs::DATE as calendar_date,
    CASE EXTRACT(DOW FROM gs)::INTEGER
      WHEN 0 THEN COALESCE((working_days->>'sun')::BOOLEAN, FALSE)
      WHEN 1 THEN COALESCE((working_days->>'mon')::BOOLEAN, TRUE)
      WHEN 2 THEN COALESCE((working_days->>'tue')::BOOLEAN, TRUE)
      WHEN 3 THEN COALESCE((working_days->>'wed')::BOOLEAN, TRUE)
      WHEN 4 THEN COALESCE((working_days->>'thu')::BOOLEAN, TRUE)
      WHEN 5 THEN COALESCE((working_days->>'fri')::BOOLEAN, TRUE)
      WHEN 6 THEN COALESCE((working_days->>'sat')::BOOLEAN, FALSE)
    END as is_working_day,
    NULL as note,
    FALSE as is_override
  FROM generate_series(p_start_date, p_end_date, INTERVAL '1 day') gs
  WHERE gs::DATE NOT IN (
    SELECT calendar_date FROM public.business_calendar
    WHERE business_id = p_business_id
      AND calendar_date BETWEEN p_start_date AND p_end_date
  )
  ORDER BY calendar_date;
END;
$$;

-- ============================================
-- TRIGGER: Recalculate production schedules when calendar changes
-- ============================================
CREATE OR REPLACE FUNCTION public.trigger_production_reschedule_on_calendar_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_orders RECORD;
BEGIN
  IF OLD.is_working_day IS DISTINCT FROM NEW.is_working_day THEN
    FOR affected_orders IN
      SELECT DISTINCT po.id, po.business_id
      FROM public.production_orders po
      WHERE po.business_id = NEW.business_id
        AND po.status IN ('PENDING', 'SCHEDULED')
        AND (
          (OLD.is_working_day = TRUE AND NEW.is_working_day = FALSE AND NEW.calendar_date >= CURRENT_DATE)
          OR (OLD.is_working_day = FALSE AND NEW.is_working_day = TRUE)
        )
    LOOP
      -- Reschedule affected production orders
      PERFORM public.run_scheduling_engine(affected_orders.business_id, CURRENT_DATE);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS business_calendar_production_reschedule ON public.business_calendar;
CREATE TRIGGER business_calendar_production_reschedule
AFTER UPDATE ON public.business_calendar
FOR EACH ROW EXECUTE FUNCTION public.trigger_production_reschedule_on_calendar_change();

-- ============================================
-- TRIGGER: Recalculate production schedules when working_days setting changes
-- ============================================
CREATE OR REPLACE FUNCTION public.trigger_production_reschedule_on_settings_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.key = 'working_days' AND OLD.value IS DISTINCT FROM NEW.value THEN
    PERFORM public.run_scheduling_engine(NEW.business_id, CURRENT_DATE);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS business_settings_production_reschedule ON public.business_settings;
CREATE TRIGGER business_settings_production_reschedule
AFTER UPDATE ON public.business_settings
FOR EACH ROW EXECUTE FUNCTION public.trigger_production_reschedule_on_settings_change();

-- ============================================
-- TRIGGER: Recalculate delivery dates when calendar changes (already exists from delivery migration)
-- Also need to handle working_days setting change
-- ============================================
CREATE OR REPLACE FUNCTION public.trigger_delivery_recalc_on_settings_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_orders RECORD;
BEGIN
  IF NEW.key = 'working_days' AND OLD.value IS DISTINCT FROM NEW.value THEN
    FOR affected_orders IN
      SELECT DISTINCT o.id, o.business_id
      FROM public.orders o
      JOIN public.production_orders po ON po.order_id = o.id AND po.business_id = o.business_id
      WHERE o.business_id = NEW.business_id
        AND o.status = 'CONFIRMED'
        AND po.status IN ('SCHEDULED', 'IN_PROGRESS')
    LOOP
      PERFORM public.update_order_delivery_dates(affected_orders.business_id, affected_orders.id, 'working_days_changed');
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS business_settings_delivery_recalc ON public.business_settings;
CREATE TRIGGER business_settings_delivery_recalc
AFTER UPDATE ON public.business_settings
FOR EACH ROW EXECUTE FUNCTION public.trigger_delivery_recalc_on_settings_change();

-- ============================================
-- AUDIT LOGGING FOR SETTINGS CHANGES
-- ============================================
CREATE OR REPLACE FUNCTION public.audit_business_settings_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id UUID;
BEGIN
  SELECT id INTO actor_id
  FROM public.users
  WHERE auth_user_id = auth.uid() AND business_id = NEW.business_id;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (NEW.business_id, actor_id, 'SETTING_CREATED', 'business_setting', NEW.id, to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, old_data, new_data)
    VALUES (NEW.business_id, actor_id, 'SETTING_UPDATED', 'business_setting', NEW.id, to_jsonb(OLD), to_jsonb(NEW));
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, old_data)
    VALUES (OLD.business_id, actor_id, 'SETTING_DELETED', 'business_setting', OLD.id, to_jsonb(OLD));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS business_settings_audit ON public.business_settings;
CREATE TRIGGER business_settings_audit
AFTER INSERT OR UPDATE OR DELETE ON public.business_settings
FOR EACH ROW EXECUTE FUNCTION public.audit_business_settings_change();

-- ============================================
-- GRANT PERMISSIONS
-- ============================================
GRANT EXECUTE ON FUNCTION public.initialize_business_calendar(UUID, DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_calendar_day(UUID, DATE, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_calendar_day(UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_business_calendar(UUID, DATE, DATE) TO authenticated;

-- Add permissions for settings and calendar
INSERT INTO public.permissions (module, action, description) VALUES
  ('settings', 'view', 'View business settings'),
  ('settings', 'edit', 'Edit business settings'),
  ('calendar', 'view', 'View business calendar'),
  ('calendar', 'edit', 'Edit business calendar (holidays, working days)')
ON CONFLICT (module, action) DO UPDATE SET description = EXCLUDED.description;

-- Assign to roles
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.module IN ('settings', 'calendar')
WHERE replace(lower(trim(r.name)), ' ', '_') IN ('admin', 'super_admin')
  AND p.action IN ('view', 'edit')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.module IN ('settings', 'calendar') AND p.action = 'view'
WHERE replace(lower(trim(r.name)), ' ', '_') = 'manager'
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;