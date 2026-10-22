BEGIN;

-- ============================================
-- BUSINESS CALENDAR (Working Days / Holidays)
-- ============================================
CREATE TABLE public.business_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  calendar_date DATE NOT NULL,
  is_working_day BOOLEAN NOT NULL DEFAULT TRUE,
  note TEXT CHECK (note IS NULL OR length(note) <= 200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT business_calendar_business_date_unique UNIQUE (business_id, calendar_date)
);

CREATE INDEX business_calendar_business_date_idx ON public.business_calendar (business_id, calendar_date);
CREATE INDEX business_calendar_business_working_idx ON public.business_calendar (business_id, is_working_day);

-- ============================================
-- PRODUCTION ORDERS
-- ============================================
CREATE TABLE public.production_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  order_id UUID NOT NULL,
  order_item_id UUID NOT NULL,
  product_id UUID NOT NULL,
  quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  scheduled_start_date DATE,
  scheduled_end_date DATE,
  actual_start_date DATE,
  actual_end_date DATE,
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT production_orders_business_order_item_unique UNIQUE (business_id, order_item_id)
);

CREATE INDEX production_orders_business_idx ON public.production_orders (business_id);
CREATE INDEX production_orders_business_status_idx ON public.production_orders (business_id, status);
CREATE INDEX production_orders_business_priority_idx ON public.production_orders (business_id, priority, created_at);
CREATE INDEX production_orders_business_schedule_idx ON public.production_orders (business_id, scheduled_start_date, scheduled_end_date);

-- ============================================
-- PRODUCTION SCHEDULES (Daily capacity allocations)
-- ============================================
CREATE TABLE public.production_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  production_order_id UUID NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  schedule_date DATE NOT NULL,
  allocated_quantity NUMERIC(14, 3) NOT NULL CHECK (allocated_quantity > 0),
  sequence_number INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT production_schedules_business_date_order_unique UNIQUE (business_id, schedule_date, production_order_id)
);

CREATE INDEX production_schedules_business_date_idx ON public.production_schedules (business_id, schedule_date);
CREATE INDEX production_schedules_business_order_idx ON public.production_schedules (business_id, production_order_id);
CREATE INDEX production_schedules_date_sequence_idx ON public.production_schedules (schedule_date, sequence_number);

-- ============================================
-- TRIGGERS
-- ============================================
CREATE TRIGGER business_calendar_touch_updated_at
BEFORE UPDATE ON public.business_calendar
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER production_orders_touch_updated_at
BEFORE UPDATE ON public.production_orders
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============================================
-- AUDIT LOGGING
-- ============================================
CREATE OR REPLACE FUNCTION public.audit_production_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_business_id UUID;
  row_id UUID;
  actor_id UUID;
  old_record JSONB;
  new_record JSONB;
BEGIN
  IF TG_OP = 'DELETE' THEN
    row_business_id := OLD.business_id;
    row_id := OLD.id;
    old_record := to_jsonb(OLD);
  ELSE
    row_business_id := NEW.business_id;
    row_id := NEW.id;
    new_record := to_jsonb(NEW);
    IF TG_OP = 'UPDATE' THEN
      old_record := to_jsonb(OLD);
    END IF;
  END IF;

  SELECT id INTO actor_id
  FROM public.users
  WHERE auth_user_id = auth.uid() AND business_id = row_business_id;

  IF TG_TABLE_NAME = 'business_calendar' THEN
    INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, old_data, new_data)
    VALUES (
      row_business_id,
      actor_id,
      CASE
        WHEN TG_OP = 'INSERT' THEN 'CALENDAR_DAY_CREATED'
        WHEN OLD.is_working_day IS DISTINCT FROM NEW.is_working_day THEN 'CALENDAR_DAY_TYPE_CHANGED'
        ELSE 'CALENDAR_DAY_UPDATED'
      END,
      'calendar_day',
      row_id,
      old_record,
      new_record
    );
  ELSIF TG_TABLE_NAME = 'production_orders' THEN
    INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, old_data, new_data)
    VALUES (
      row_business_id,
      actor_id,
      CASE
        WHEN TG_OP = 'INSERT' THEN 'PRODUCTION_ORDER_CREATED'
        WHEN OLD.status IS DISTINCT FROM NEW.status THEN 'PRODUCTION_ORDER_STATUS_CHANGED'
        WHEN OLD.priority IS DISTINCT FROM NEW.priority THEN 'PRODUCTION_ORDER_PRIORITY_CHANGED'
        WHEN OLD.scheduled_start_date IS DISTINCT FROM NEW.scheduled_start_date
          OR OLD.scheduled_end_date IS DISTINCT FROM NEW.scheduled_end_date THEN 'PRODUCTION_ORDER_RESCHEDULED'
        ELSE 'PRODUCTION_ORDER_UPDATED'
      END,
      'production_order',
      row_id,
      old_record,
      new_record
    );
  ELSE
    INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, old_data, new_data)
    VALUES (
      row_business_id,
      actor_id,
      CASE WHEN TG_OP = 'INSERT' THEN 'PRODUCTION_SCHEDULE_CREATED' ELSE 'PRODUCTION_SCHEDULE_UPDATED' END,
      'production_schedule',
      row_id,
      old_record,
      new_record
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER business_calendar_audit_change
AFTER INSERT OR UPDATE ON public.business_calendar
FOR EACH ROW EXECUTE FUNCTION public.audit_production_change();

CREATE TRIGGER production_orders_audit_change
AFTER INSERT OR UPDATE ON public.production_orders
FOR EACH ROW EXECUTE FUNCTION public.audit_production_change();

CREATE TRIGGER production_schedules_audit_change
AFTER INSERT OR UPDATE ON public.production_schedules
FOR EACH ROW EXECUTE FUNCTION public.audit_production_change();

-- ============================================
-- RLS POLICIES
-- ============================================
ALTER TABLE public.business_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_schedules ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE
  ON public.business_calendar, public.production_orders, public.production_schedules
  TO authenticated;
GRANT ALL
  ON public.business_calendar, public.production_orders, public.production_schedules
  TO service_role;

-- Business Calendar policies
CREATE POLICY business_calendar_select ON public.business_calendar
FOR SELECT USING (
  public.is_business_member(business_id)
  AND public.has_business_permission(business_id, 'production.view')
);
CREATE POLICY business_calendar_insert ON public.business_calendar
FOR INSERT WITH CHECK (
  public.is_business_member(business_id)
  AND public.has_business_permission(business_id, 'production.create')
);
CREATE POLICY business_calendar_update ON public.business_calendar
FOR UPDATE USING (
  public.is_business_member(business_id)
  AND public.has_business_permission(business_id, 'production.edit')
)
WITH CHECK (
  public.is_business_member(business_id)
  AND public.has_business_permission(business_id, 'production.edit')
);

-- Production Orders policies
CREATE POLICY production_orders_select ON public.production_orders
FOR SELECT USING (
  public.is_business_member(business_id)
  AND public.has_business_permission(business_id, 'production.view')
);
CREATE POLICY production_orders_insert ON public.production_orders
FOR INSERT WITH CHECK (
  public.is_business_member(business_id)
  AND public.has_business_permission(business_id, 'production.create')
);
CREATE POLICY production_orders_update ON public.production_orders
FOR UPDATE USING (
  public.is_business_member(business_id)
  AND public.has_business_permission(business_id, 'production.edit')
)
WITH CHECK (
  public.is_business_member(business_id)
  AND public.has_business_permission(business_id, 'production.edit')
);

-- Production Schedules policies
CREATE POLICY production_schedules_select ON public.production_schedules
FOR SELECT USING (
  public.is_business_member(business_id)
  AND public.has_business_permission(business_id, 'production.view')
);
CREATE POLICY production_schedules_insert ON public.production_schedules
FOR INSERT WITH CHECK (
  public.is_business_member(business_id)
  AND public.has_business_permission(business_id, 'production.schedule')
);
CREATE POLICY production_schedules_update ON public.production_schedules
FOR UPDATE USING (
  public.is_business_member(business_id)
  AND public.has_business_permission(business_id, 'production.schedule')
)
WITH CHECK (
  public.is_business_member(business_id)
  AND public.has_business_permission(business_id, 'production.schedule')
);

-- ============================================
-- PERMISSIONS
-- ============================================
INSERT INTO public.permissions (module, action, description) VALUES
  ('production', 'view', 'View production orders and schedules'),
  ('production', 'create', 'Create production orders from confirmed orders'),
  ('production', 'edit', 'Edit production order details and status'),
  ('production', 'schedule', 'Run scheduling engine and manage production schedule'),
  ('production', 'cancel', 'Cancel production orders and reschedule')
ON CONFLICT (module, action) DO UPDATE
SET description = EXCLUDED.description;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.module = 'production'
WHERE replace(lower(trim(r.name)), ' ', '_') IN ('admin', 'super_admin')
  AND p.action IN ('view', 'create', 'edit')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.module = 'production'
WHERE replace(lower(trim(r.name)), ' ', '_') = 'super_admin'
  AND p.action IN ('schedule', 'cancel')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.module = 'production' AND p.action = 'view'
WHERE replace(lower(trim(r.name)), ' ', '_') = 'manager'
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;