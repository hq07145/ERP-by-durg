BEGIN;

-- Orders table
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  order_number TEXT NOT NULL CHECK (order_number = upper(btrim(order_number)) AND length(order_number) BETWEEN 1 AND 64),
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  priority TEXT NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'CONFIRMED', 'CANCELLED')),
  subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  paid_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  due_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (due_amount >= 0),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT orders_business_order_unique UNIQUE (business_id, order_number)
);

-- Order Items table
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity NUMERIC(14, 3) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(14, 2) NOT NULL CHECK (unit_price >= 0),
  discount_rate NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (discount_rate BETWEEN 0 AND 100),
  tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (tax_rate BETWEEN 0 AND 100),
  line_total NUMERIC(14, 2) NOT NULL CHECK (line_total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Order Status History table (audit trail for status/priority changes)
CREATE TABLE IF NOT EXISTS public.order_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  old_status TEXT,
  new_status TEXT NOT NULL,
  old_priority TEXT,
  new_priority TEXT NOT NULL,
  changed_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  reason TEXT CHECK (reason IS NULL OR length(reason) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS orders_business_id_idx ON public.orders (business_id);
CREATE INDEX IF NOT EXISTS orders_business_customer_idx ON public.orders (business_id, customer_id);
CREATE INDEX IF NOT EXISTS orders_business_status_idx ON public.orders (business_id, status);
CREATE INDEX IF NOT EXISTS orders_business_priority_idx ON public.orders (business_id, priority);
CREATE INDEX IF NOT EXISTS orders_business_order_date_idx ON public.orders (business_id, order_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS orders_business_order_number_unique ON public.orders (business_id, upper(btrim(order_number)));

CREATE INDEX IF NOT EXISTS order_items_business_order_idx ON public.order_items (business_id, order_id);
CREATE INDEX IF NOT EXISTS order_items_business_product_idx ON public.order_items (business_id, product_id);

CREATE INDEX IF NOT EXISTS order_status_history_business_order_idx ON public.order_status_history (business_id, order_id);
CREATE INDEX IF NOT EXISTS order_status_history_business_created_idx ON public.order_status_history (business_id, created_at DESC);

-- Constraints validation
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orders'::regclass AND conname = 'orders_order_number_valid') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_order_number_valid CHECK (order_number = upper(btrim(order_number)) AND length(order_number) BETWEEN 1 AND 64);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orders'::regclass AND conname = 'orders_priority_valid') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_priority_valid CHECK (priority IN ('LOW', 'NORMAL', 'HIGH', 'URGENT'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orders'::regclass AND conname = 'orders_status_valid') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_status_valid CHECK (status IN ('DRAFT', 'CONFIRMED', 'CANCELLED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.orders'::regclass AND conname = 'orders_amounts_valid') THEN
    ALTER TABLE public.orders ADD CONSTRAINT orders_amounts_valid CHECK (subtotal >= 0 AND discount_amount >= 0 AND tax_amount >= 0 AND total_amount >= 0 AND paid_amount >= 0 AND due_amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.order_items'::regclass AND conname = 'order_items_quantities_valid') THEN
    ALTER TABLE public.order_items ADD CONSTRAINT order_items_quantities_valid CHECK (quantity > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.order_items'::regclass AND conname = 'order_items_prices_valid') THEN
    ALTER TABLE public.order_items ADD CONSTRAINT order_items_prices_valid CHECK (unit_price >= 0 AND discount_rate BETWEEN 0 AND 100 AND tax_rate BETWEEN 0 AND 100 AND line_total >= 0);
  END IF;
END;
$$;

-- Triggers for updated_at
CREATE TRIGGER orders_touch_updated_at BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER order_items_touch_updated_at BEFORE UPDATE ON public.order_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Permissions enforcement triggers
CREATE OR REPLACE FUNCTION public.guard_order_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id OR OLD.business_id IS DISTINCT FROM NEW.business_id OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'ORDER_IDENTITY_IMMUTABLE' USING ERRCODE = '42501';
  END IF;
  IF (to_jsonb(OLD) - 'status' - 'priority' - 'paid_amount' - 'due_amount' - 'updated_at') IS DISTINCT FROM (to_jsonb(NEW) - 'status' - 'priority' - 'paid_amount' - 'due_amount' - 'updated_at')
     AND NOT public.has_business_permission(OLD.business_id, 'orders.edit') THEN
    RAISE EXCEPTION 'FORBIDDEN: orders.edit' USING ERRCODE = '42501';
  END IF;
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'CANCELLED' AND NOT public.has_business_permission(OLD.business_id, 'orders.cancel') THEN
      RAISE EXCEPTION 'FORBIDDEN: orders.cancel' USING ERRCODE = '42501';
    END IF;
    IF NEW.status = 'CONFIRMED' AND NOT public.has_business_permission(OLD.business_id, 'orders.approve') THEN
      RAISE EXCEPTION 'FORBIDDEN: orders.approve' USING ERRCODE = '42501';
    END IF;
    IF NEW.status = 'DRAFT' AND NOT public.has_business_permission(OLD.business_id, 'orders.edit') THEN
      RAISE EXCEPTION 'FORBIDDEN: orders.edit' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF OLD.priority IS DISTINCT FROM NEW.priority AND NOT public.has_business_permission(OLD.business_id, 'orders.change_priority') THEN
    RAISE EXCEPTION 'FORBIDDEN: orders.change_priority' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_guard_permissions BEFORE UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.guard_order_permissions();

-- Audit triggers
CREATE OR REPLACE FUNCTION public.audit_order_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE actor_id UUID;
BEGIN
  SELECT id INTO actor_id FROM public.users WHERE auth_user_id = auth.uid() AND business_id = COALESCE(NEW.business_id, OLD.business_id);

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (NEW.business_id, actor_id, 'ORDER_CREATED', 'order', NEW.id, to_jsonb(NEW));
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status OR OLD.priority IS DISTINCT FROM NEW.priority THEN
    INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, old_data, new_data)
    VALUES (
      NEW.business_id, actor_id,
      CASE
        WHEN OLD.status = 'DRAFT' AND NEW.status = 'CONFIRMED' THEN 'ORDER_CONFIRMED'
        WHEN NEW.status = 'CANCELLED' THEN 'ORDER_CANCELLED'
        WHEN OLD.priority IS DISTINCT FROM NEW.priority THEN 'ORDER_PRIORITY_CHANGED'
        ELSE 'ORDER_EDITED' END,
      'order', NEW.id, to_jsonb(OLD), to_jsonb(NEW)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_order_status_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE actor_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT id INTO actor_id FROM public.users WHERE auth_user_id = auth.uid() AND business_id = NEW.business_id;

    INSERT INTO public.order_status_history (business_id, order_id, old_status, new_status, old_priority, new_priority, changed_by, reason)
    VALUES (
      NEW.business_id, NEW.order_id,
      COALESCE(NEW.old_status, ''), NEW.new_status,
      COALESCE(NEW.old_priority, ''), NEW.new_priority,
      actor_id, NEW.reason
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_audit_change AFTER INSERT OR UPDATE ON public.orders FOR EACH ROW EXECUTE FUNCTION public.audit_order_change();
CREATE TRIGGER order_status_history_audit AFTER INSERT ON public.order_status_history FOR EACH ROW EXECUTE FUNCTION public.audit_order_status_history();

-- RLS
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.order_items TO authenticated;
GRANT SELECT ON public.order_status_history TO authenticated;
REVOKE DELETE ON public.orders, public.order_items, public.order_status_history FROM anon, authenticated;
GRANT ALL ON public.orders, public.order_items, public.order_status_history TO service_role;

DO $$
DECLARE policy_record RECORD;
BEGIN
  FOR policy_record IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('orders', 'order_items', 'order_status_history')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', policy_record.policyname, policy_record.tablename);
  END LOOP;
END;
$$;

-- Orders policies
CREATE POLICY orders_select_business ON public.orders FOR SELECT USING (
  public.is_business_member(business_id) AND public.has_business_permission(business_id, 'orders.view')
);
CREATE POLICY orders_insert_business ON public.orders FOR INSERT WITH CHECK (
  public.is_business_member(business_id) AND public.has_business_permission(business_id, 'orders.create')
);
CREATE POLICY orders_update_business ON public.orders FOR UPDATE USING (
  public.is_business_member(business_id) AND (public.has_business_permission(business_id, 'orders.edit') OR public.has_business_permission(business_id, 'orders.cancel') OR public.has_business_permission(business_id, 'orders.approve') OR public.has_business_permission(business_id, 'orders.change_priority'))
) WITH CHECK (
  public.is_business_member(business_id) AND (public.has_business_permission(business_id, 'orders.edit') OR public.has_business_permission(business_id, 'orders.cancel') OR public.has_business_permission(business_id, 'orders.approve') OR public.has_business_permission(business_id, 'orders.change_priority'))
);

-- Order Items policies
CREATE POLICY order_items_select_business ON public.order_items FOR SELECT USING (
  public.is_business_member(business_id) AND public.has_business_permission(business_id, 'orders.view')
);
CREATE POLICY order_items_insert_business ON public.order_items FOR INSERT WITH CHECK (
  public.is_business_member(business_id) AND public.has_business_permission(business_id, 'orders.edit')
);
CREATE POLICY order_items_update_business ON public.order_items FOR UPDATE USING (
  public.is_business_member(business_id) AND public.has_business_permission(business_id, 'orders.edit')
) WITH CHECK (
  public.is_business_member(business_id) AND public.has_business_permission(business_id, 'orders.edit')
);

-- Order Status History policies
CREATE POLICY order_status_history_select_business ON public.order_status_history FOR SELECT USING (
  public.is_business_member(business_id) AND public.has_business_permission(business_id, 'orders.view')
);

-- Permissions
INSERT INTO public.permissions (module, action, description) VALUES
  ('orders', 'view', 'View orders'),
  ('orders', 'create', 'Create orders'),
  ('orders', 'edit', 'Edit order details and items'),
  ('orders', 'cancel', 'Cancel orders'),
  ('orders', 'approve', 'Confirm/approve orders'),
  ('orders', 'change_priority', 'Change order priority')
ON CONFLICT (module, action) DO UPDATE SET description = EXCLUDED.description;

-- Role assignments
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r JOIN public.permissions p ON p.module = 'orders'
WHERE replace(lower(trim(r.name)), ' ', '_') IN ('super_admin', 'admin', 'manager') AND p.action = 'view'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r JOIN public.permissions p ON p.module = 'orders'
WHERE replace(lower(trim(r.name)), ' ', '_') IN ('super_admin', 'admin') AND p.action IN ('create', 'edit')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r JOIN public.permissions p ON p.module = 'orders'
WHERE replace(lower(trim(r.name)), ' ', '_') = 'super_admin' AND p.action IN ('cancel', 'approve', 'change_priority')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r JOIN public.permissions p ON p.module = 'orders'
WHERE replace(lower(trim(r.name)), ' ', '_') = 'admin' AND p.action IN ('cancel', 'approve', 'change_priority')
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- RPC: Create order with items
CREATE OR REPLACE FUNCTION public.create_order_with_items(
  target_business_id UUID,
  target_customer_id UUID,
  target_order_number TEXT,
  target_order_date DATE,
  target_priority TEXT,
  target_notes TEXT,
  target_items JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  order_id UUID;
  item_record RECORD;
  subtotal NUMERIC(14, 2) := 0;
  discount_amount NUMERIC(14, 2) := 0;
  tax_amount NUMERIC(14, 2) := 0;
  total_amount NUMERIC(14, 2) := 0;
BEGIN
  IF NOT public.is_business_member(target_business_id) OR NOT public.has_business_permission(target_business_id, 'orders.create') THEN
    RAISE EXCEPTION 'FORBIDDEN: orders.create' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.customers WHERE id = target_customer_id AND business_id = target_business_id AND status = 'ACTIVE';
  IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND_OR_INACTIVE'; END IF;

  IF EXISTS (SELECT 1 FROM public.orders WHERE business_id = target_business_id AND upper(btrim(order_number)) = upper(btrim(target_order_number))) THEN
    RAISE EXCEPTION 'DUPLICATE_ORDER_NUMBER' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.orders (business_id, customer_id, order_number, order_date, priority, notes, status)
  VALUES (target_business_id, target_customer_id, upper(btrim(target_order_number)), target_order_date, target_priority, target_notes, 'DRAFT')
  RETURNING id INTO order_id;

  FOR item_record IN SELECT * FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(target_items) = 'string' THEN (target_items #>> '{}')::jsonb ELSE target_items END
  ) AS item LOOP
    DECLARE
      prod_id UUID := (item_record.value->>'product_id')::UUID;
      qty NUMERIC(14, 3) := (item_record.value->>'quantity')::NUMERIC(14, 3);
      unit_prc NUMERIC(14, 2) := (item_record.value->>'unit_price')::NUMERIC(14, 2);
      disc_rt NUMERIC(5, 2) := COALESCE((item_record.value->>'discount_rate')::NUMERIC(5, 2), 0);
      tax_rt NUMERIC(5, 2) := COALESCE((item_record.value->>'tax_rate')::NUMERIC(5, 2), 0);
      line_tot NUMERIC(14, 2);
    BEGIN
      PERFORM 1 FROM public.products WHERE id = prod_id AND business_id = target_business_id AND active = TRUE;
      IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND_OR_INACTIVE'; END IF;
      IF qty <= 0 OR unit_prc < 0 OR disc_rt < 0 OR disc_rt > 100 OR tax_rt < 0 OR tax_rt > 100 THEN
        RAISE EXCEPTION 'INVALID_ORDER_ITEM_VALUES' USING ERRCODE = '23514';
      END IF;
      line_tot := qty * unit_prc * (1 - disc_rt / 100) * (1 + tax_rt / 100);
      INSERT INTO public.order_items (business_id, order_id, product_id, quantity, unit_price, discount_rate, tax_rate, line_total)
      VALUES (target_business_id, order_id, prod_id, qty, unit_prc, disc_rt, tax_rt, line_tot);
      subtotal := subtotal + (qty * unit_prc);
      discount_amount := discount_amount + (qty * unit_prc * disc_rt / 100);
      tax_amount := tax_amount + (qty * unit_prc * (1 - disc_rt / 100) * tax_rt / 100);
    END;
  END LOOP;

  total_amount := subtotal - discount_amount + tax_amount;
  UPDATE public.orders SET subtotal = subtotal, discount_amount = discount_amount, tax_amount = tax_amount, total_amount = total_amount, paid_amount = 0, due_amount = total_amount WHERE id = order_id;
  RETURN order_id;
END;
$$;

-- RPC: Update order status (DRAFT -> CONFIRMED, CANCELLED)
CREATE OR REPLACE FUNCTION public.update_order_status(
  target_business_id UUID,
  target_order_id UUID,
  target_status TEXT,
  target_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed_transitions JSONB := '{
    "DRAFT": ["CONFIRMED", "CANCELLED"],
    "CONFIRMED": ["CANCELLED"],
    "CANCELLED": []
  }'::JSONB;
  current_status TEXT;
  current_priority TEXT;
  required_permission TEXT;
BEGIN
  IF NOT public.is_business_member(target_business_id) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;

  SELECT status, priority INTO current_status, current_priority FROM public.orders WHERE id = target_order_id AND business_id = target_business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF current_status = target_status THEN RAISE EXCEPTION 'STATUS_UNCHANGED'; END IF;

  IF NOT (target_status = ANY(SELECT jsonb_array_elements_text(allowed_transitions->current_status))) THEN
    RAISE EXCEPTION 'INVALID_STATUS_TRANSITION' USING ERRCODE = '23514';
  END IF;

  IF target_status = 'CANCELLED' THEN required_permission := 'orders.cancel';
  ELSIF target_status = 'CONFIRMED' THEN required_permission := 'orders.approve';
  ELSE required_permission := 'orders.edit'; END IF;

  IF NOT public.has_business_permission(target_business_id, required_permission) THEN
    RAISE EXCEPTION 'FORBIDDEN: %', required_permission USING ERRCODE = '42501';
  END IF;

  UPDATE public.orders SET status = target_status WHERE id = target_order_id AND business_id = target_business_id;

  -- Log to order_status_history
  INSERT INTO public.order_status_history (business_id, order_id, old_status, new_status, old_priority, new_priority, changed_by, reason)
  SELECT target_business_id, target_order_id, current_status, target_status, current_priority, current_priority, u.id, target_reason
  FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.business_id = target_business_id AND u.status = 'ACTIVE';
END;
$$;

-- RPC: Change order priority
CREATE OR REPLACE FUNCTION public.change_order_priority(
  target_business_id UUID,
  target_order_id UUID,
  target_priority TEXT,
  target_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_status TEXT;
  current_priority TEXT;
BEGIN
  IF NOT public.is_business_member(target_business_id) OR NOT public.has_business_permission(target_business_id, 'orders.change_priority') THEN
    RAISE EXCEPTION 'FORBIDDEN: orders.change_priority' USING ERRCODE = '42501';
  END IF;

  IF target_priority NOT IN ('LOW', 'NORMAL', 'HIGH', 'URGENT') THEN
    RAISE EXCEPTION 'INVALID_PRIORITY' USING ERRCODE = '23514';
  END IF;

  SELECT status, priority INTO current_status, current_priority FROM public.orders WHERE id = target_order_id AND business_id = target_business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
  IF current_priority = target_priority THEN RAISE EXCEPTION 'PRIORITY_UNCHANGED'; END IF;

  UPDATE public.orders SET priority = target_priority WHERE id = target_order_id AND business_id = target_business_id;

  -- Log to order_status_history
  INSERT INTO public.order_status_history (business_id, order_id, old_status, new_status, old_priority, new_priority, changed_by, reason)
  SELECT target_business_id, target_order_id, current_status, current_status, current_priority, target_priority, u.id, target_reason
  FROM public.users u WHERE u.auth_user_id = auth.uid() AND u.business_id = target_business_id AND u.status = 'ACTIVE';
END;
$$;

-- Grants for RPCs
REVOKE ALL ON FUNCTION public.create_order_with_items(UUID, UUID, TEXT, DATE, TEXT, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_with_items(UUID, UUID, TEXT, DATE, TEXT, TEXT, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.update_order_status(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_order_status(UUID, UUID, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.change_order_priority(UUID, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_order_priority(UUID, UUID, TEXT, TEXT) TO authenticated;

COMMIT;