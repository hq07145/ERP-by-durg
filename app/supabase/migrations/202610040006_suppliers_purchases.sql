BEGIN;

-- Suppliers table
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (name = btrim(name) AND length(name) BETWEEN 1 AND 160),
  phone TEXT CHECK (phone IS NULL OR length(phone) <= 40),
  email TEXT CHECK (email IS NULL OR (length(email) <= 254 AND email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')),
  address TEXT CHECK (address IS NULL OR length(address) <= 500),
  gst_number TEXT CHECK (gst_number IS NULL OR length(gst_number) <= 32),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT suppliers_id_business_unique UNIQUE (id, business_id)
);

-- Purchase Orders table
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  po_number TEXT NOT NULL CHECK (po_number = upper(btrim(po_number)) AND length(po_number) BETWEEN 1 AND 64),
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_date DATE,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ORDERED', 'PARTIAL', 'RECEIVED', 'CANCELLED')),
  subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  tax_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT purchase_orders_business_po_unique UNIQUE (business_id, po_number)
);

-- Purchase Order Items table
CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  raw_material_id UUID NOT NULL REFERENCES public.raw_materials(id) ON DELETE RESTRICT,
  ordered_quantity NUMERIC(14, 3) NOT NULL CHECK (ordered_quantity > 0),
  received_quantity NUMERIC(14, 3) NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  unit_cost NUMERIC(14, 2) NOT NULL CHECK (unit_cost >= 0),
  tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (tax_rate BETWEEN 0 AND 100),
  line_total NUMERIC(14, 2) NOT NULL CHECK (line_total >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT purchase_order_items_received_not_exceed CHECK (received_quantity <= ordered_quantity)
);

-- Purchase Receipts table (tracks receiving events)
CREATE TABLE IF NOT EXISTS public.purchase_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE RESTRICT,
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  raw_material_id UUID NOT NULL REFERENCES public.raw_materials(id) ON DELETE RESTRICT,
  received_quantity NUMERIC(14, 3) NOT NULL CHECK (received_quantity > 0),
  unit_cost NUMERIC(14, 2) NOT NULL CHECK (unit_cost >= 0),
  tax_rate NUMERIC(5, 2) NOT NULL DEFAULT 0 CHECK (tax_rate BETWEEN 0 AND 100),
  notes TEXT CHECK (notes IS NULL OR length(notes) <= 500),
  received_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS suppliers_business_id_idx ON public.suppliers (business_id);
CREATE INDEX IF NOT EXISTS suppliers_business_status_idx ON public.suppliers (business_id, status);
CREATE INDEX IF NOT EXISTS suppliers_business_name_idx ON public.suppliers (business_id, lower(name));

CREATE INDEX IF NOT EXISTS purchase_orders_business_id_idx ON public.purchase_orders (business_id);
CREATE INDEX IF NOT EXISTS purchase_orders_business_supplier_idx ON public.purchase_orders (business_id, supplier_id);
CREATE INDEX IF NOT EXISTS purchase_orders_business_status_idx ON public.purchase_orders (business_id, status);
CREATE INDEX IF NOT EXISTS purchase_orders_business_order_date_idx ON public.purchase_orders (business_id, order_date DESC);
CREATE UNIQUE INDEX IF NOT EXISTS purchase_orders_business_po_number_unique ON public.purchase_orders (business_id, upper(btrim(po_number)));

CREATE INDEX IF NOT EXISTS purchase_order_items_business_po_idx ON public.purchase_order_items (business_id, purchase_order_id);
CREATE INDEX IF NOT EXISTS purchase_order_items_business_material_idx ON public.purchase_order_items (business_id, raw_material_id);

CREATE INDEX IF NOT EXISTS purchase_receipts_business_po_idx ON public.purchase_receipts (business_id, purchase_order_id);
CREATE INDEX IF NOT EXISTS purchase_receipts_business_material_idx ON public.purchase_receipts (business_id, raw_material_id);
CREATE INDEX IF NOT EXISTS purchase_receipts_business_received_at_idx ON public.purchase_receipts (business_id, received_at DESC);

-- Constraints validation
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.suppliers'::regclass AND conname = 'suppliers_name_valid') THEN
    ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_name_valid CHECK (name = btrim(name) AND length(name) BETWEEN 1 AND 160);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.suppliers'::regclass AND conname = 'suppliers_email_valid') THEN
    ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_email_valid CHECK (email IS NULL OR (length(email) <= 254 AND email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.suppliers'::regclass AND conname = 'suppliers_status_valid') THEN
    ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_status_valid CHECK (status IN ('ACTIVE', 'INACTIVE'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.purchase_orders'::regclass AND conname = 'purchase_orders_po_number_valid') THEN
    ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_po_number_valid CHECK (po_number = upper(btrim(po_number)) AND length(po_number) BETWEEN 1 AND 64);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.purchase_orders'::regclass AND conname = 'purchase_orders_status_valid') THEN
    ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_status_valid CHECK (status IN ('DRAFT', 'ORDERED', 'PARTIAL', 'RECEIVED', 'CANCELLED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.purchase_orders'::regclass AND conname = 'purchase_orders_amounts_valid') THEN
    ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_amounts_valid CHECK (subtotal >= 0 AND tax_amount >= 0 AND total_amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.purchase_order_items'::regclass AND conname = 'purchase_order_items_quantities_valid') THEN
    ALTER TABLE public.purchase_order_items ADD CONSTRAINT purchase_order_items_quantities_valid CHECK (ordered_quantity > 0 AND received_quantity >= 0 AND received_quantity <= ordered_quantity);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.purchase_order_items'::regclass AND conname = 'purchase_order_items_costs_valid') THEN
    ALTER TABLE public.purchase_order_items ADD CONSTRAINT purchase_order_items_costs_valid CHECK (unit_cost >= 0 AND tax_rate BETWEEN 0 AND 100 AND line_total >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.purchase_receipts'::regclass AND conname = 'purchase_receipts_quantities_valid') THEN
    ALTER TABLE public.purchase_receipts ADD CONSTRAINT purchase_receipts_quantities_valid CHECK (received_quantity > 0 AND unit_cost >= 0 AND tax_rate BETWEEN 0 AND 100);
  END IF;
END;
$$;

-- Triggers for updated_at
CREATE TRIGGER suppliers_touch_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER purchase_orders_touch_updated_at BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER purchase_order_items_touch_updated_at BEFORE UPDATE ON public.purchase_order_items FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Permissions enforcement triggers
CREATE OR REPLACE FUNCTION public.guard_supplier_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id OR OLD.business_id IS DISTINCT FROM NEW.business_id OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'SUPPLIER_IDENTITY_IMMUTABLE' USING ERRCODE = '42501';
  END IF;
  IF (to_jsonb(OLD) - 'status' - 'updated_at') IS DISTINCT FROM (to_jsonb(NEW) - 'status' - 'updated_at')
     AND NOT public.has_business_permission(OLD.business_id, 'suppliers.edit') THEN
    RAISE EXCEPTION 'FORBIDDEN: suppliers.edit' USING ERRCODE = '42501';
  END IF;
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'INACTIVE' AND NOT public.has_business_permission(OLD.business_id, 'suppliers.delete') THEN
      RAISE EXCEPTION 'FORBIDDEN: suppliers.delete' USING ERRCODE = '42501';
    END IF;
    IF NEW.status = 'ACTIVE' AND NOT public.has_business_permission(OLD.business_id, 'suppliers.edit') THEN
      RAISE EXCEPTION 'FORBIDDEN: suppliers.edit' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_purchase_order_permissions()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.id IS DISTINCT FROM NEW.id OR OLD.business_id IS DISTINCT FROM NEW.business_id OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'PO_IDENTITY_IMMUTABLE' USING ERRCODE = '42501';
  END IF;
  IF (to_jsonb(OLD) - 'status' - 'updated_at') IS DISTINCT FROM (to_jsonb(NEW) - 'status' - 'updated_at')
     AND NOT public.has_business_permission(OLD.business_id, 'purchases.edit') THEN
    RAISE EXCEPTION 'FORBIDDEN: purchases.edit' USING ERRCODE = '42501';
  END IF;
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'CANCELLED' AND NOT public.has_business_permission(OLD.business_id, 'purchases.delete') THEN
      RAISE EXCEPTION 'FORBIDDEN: purchases.delete' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER suppliers_guard_permissions BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_permissions();
CREATE TRIGGER purchase_orders_guard_permissions BEFORE UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.guard_purchase_order_permissions();

-- Audit triggers
CREATE OR REPLACE FUNCTION public.audit_supplier_change()
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
    VALUES (NEW.business_id, actor_id, 'SUPPLIER_CREATED', 'supplier', NEW.id, to_jsonb(NEW));
    RETURN NEW;
  END IF;

  IF (to_jsonb(OLD) - 'status' - 'updated_at') IS DISTINCT FROM (to_jsonb(NEW) - 'status' - 'updated_at') THEN
    INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, old_data, new_data)
    VALUES (
      NEW.business_id, actor_id,
      CASE WHEN OLD.status = 'ACTIVE' AND NEW.status = 'INACTIVE' THEN 'SUPPLIER_DEACTIVATED'
           WHEN OLD.status = 'INACTIVE' AND NEW.status = 'ACTIVE' THEN 'SUPPLIER_ACTIVATED'
           ELSE 'SUPPLIER_EDITED' END,
      'supplier', NEW.id, to_jsonb(OLD), to_jsonb(NEW)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_purchase_order_change()
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
    VALUES (NEW.business_id, actor_id, 'PURCHASE_ORDER_CREATED', 'purchase_order', NEW.id, to_jsonb(NEW));
    RETURN NEW;
  END IF;

  INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (
    NEW.business_id, actor_id,
    CASE WHEN OLD.status = 'DRAFT' AND NEW.status = 'ORDERED' THEN 'PURCHASE_ORDER_ORDERED'
         WHEN OLD.status = 'ORDERED' AND NEW.status IN ('PARTIAL', 'RECEIVED') THEN 'PURCHASE_ORDER_RECEIVING'
         WHEN NEW.status = 'CANCELLED' THEN 'PURCHASE_ORDER_CANCELLED'
         ELSE 'PURCHASE_ORDER_EDITED' END,
    'purchase_order', NEW.id, to_jsonb(OLD), to_jsonb(NEW)
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_purchase_receipt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE actor_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT id INTO actor_id FROM public.users WHERE auth_user_id = auth.uid() AND business_id = NEW.business_id;
    INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, new_data)
    VALUES (NEW.business_id, actor_id, 'PURCHASE_RECEIPT_RECORDED', 'purchase_receipt', NEW.id, to_jsonb(NEW));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER suppliers_audit_change AFTER INSERT OR UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.audit_supplier_change();
CREATE TRIGGER purchase_orders_audit_change AFTER INSERT OR UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION public.audit_purchase_order_change();
CREATE TRIGGER purchase_receipts_audit AFTER INSERT ON public.purchase_receipts FOR EACH ROW EXECUTE FUNCTION public.audit_purchase_receipt();

-- RLS
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_receipts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON public.suppliers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.purchase_orders TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.purchase_order_items TO authenticated;
GRANT SELECT, INSERT ON public.purchase_receipts TO authenticated;
REVOKE DELETE ON public.suppliers, public.purchase_orders, public.purchase_order_items, public.purchase_receipts FROM anon, authenticated;
GRANT ALL ON public.suppliers, public.purchase_orders, public.purchase_order_items, public.purchase_receipts TO service_role;

DO $$
DECLARE policy_record RECORD;
BEGIN
  FOR policy_record IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('suppliers', 'purchase_orders', 'purchase_order_items', 'purchase_receipts')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', policy_record.policyname, policy_record.tablename);
  END LOOP;
END;
$$;

-- Suppliers policies
CREATE POLICY suppliers_select_business ON public.suppliers FOR SELECT USING (
  public.is_business_member(business_id) AND public.has_business_permission(business_id, 'suppliers.view')
);
CREATE POLICY suppliers_insert_business ON public.suppliers FOR INSERT WITH CHECK (
  public.is_business_member(business_id) AND public.has_business_permission(business_id, 'suppliers.create')
);
CREATE POLICY suppliers_update_business ON public.suppliers FOR UPDATE USING (
  public.is_business_member(business_id) AND (public.has_business_permission(business_id, 'suppliers.edit') OR public.has_business_permission(business_id, 'suppliers.delete'))
) WITH CHECK (
  public.is_business_member(business_id) AND (public.has_business_permission(business_id, 'suppliers.edit') OR public.has_business_permission(business_id, 'suppliers.delete'))
);

-- Purchase Orders policies
CREATE POLICY purchase_orders_select_business ON public.purchase_orders FOR SELECT USING (
  public.is_business_member(business_id) AND public.has_business_permission(business_id, 'purchases.view')
);
CREATE POLICY purchase_orders_insert_business ON public.purchase_orders FOR INSERT WITH CHECK (
  public.is_business_member(business_id) AND public.has_business_permission(business_id, 'purchases.create')
);
CREATE POLICY purchase_orders_update_business ON public.purchase_orders FOR UPDATE USING (
  public.is_business_member(business_id) AND public.has_business_permission(business_id, 'purchases.edit')
) WITH CHECK (
  public.is_business_member(business_id) AND public.has_business_permission(business_id, 'purchases.edit')
);

-- Purchase Order Items policies
CREATE POLICY purchase_order_items_select_business ON public.purchase_order_items FOR SELECT USING (
  public.is_business_member(business_id) AND public.has_business_permission(business_id, 'purchases.view')
);
CREATE POLICY purchase_order_items_insert_business ON public.purchase_order_items FOR INSERT WITH CHECK (
  public.is_business_member(business_id) AND public.has_business_permission(business_id, 'purchases.edit')
);
CREATE POLICY purchase_order_items_update_business ON public.purchase_order_items FOR UPDATE USING (
  public.is_business_member(business_id) AND public.has_business_permission(business_id, 'purchases.edit')
) WITH CHECK (
  public.is_business_member(business_id) AND public.has_business_permission(business_id, 'purchases.edit')
);

-- Purchase Receipts policies
CREATE POLICY purchase_receipts_select_business ON public.purchase_receipts FOR SELECT USING (
  public.is_business_member(business_id) AND public.has_business_permission(business_id, 'purchases.view')
);
CREATE POLICY purchase_receipts_insert_business ON public.purchase_receipts FOR INSERT WITH CHECK (
  public.is_business_member(business_id) AND public.has_business_permission(business_id, 'purchases.receive')
);

-- Permissions
INSERT INTO public.permissions (module, action, description) VALUES
  ('suppliers', 'view', 'View suppliers'),
  ('suppliers', 'create', 'Create suppliers'),
  ('suppliers', 'edit', 'Edit supplier details'),
  ('suppliers', 'delete', 'Deactivate suppliers'),
  ('purchases', 'view', 'View purchase orders'),
  ('purchases', 'create', 'Create purchase orders'),
  ('purchases', 'edit', 'Edit purchase orders and items'),
  ('purchases', 'delete', 'Cancel purchase orders'),
  ('purchases', 'receive', 'Receive goods against purchase orders')
ON CONFLICT (module, action) DO UPDATE SET description = EXCLUDED.description;

-- Role assignments
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r JOIN public.permissions p ON p.module = 'suppliers'
WHERE replace(lower(trim(r.name)), ' ', '_') IN ('super_admin', 'admin', 'manager') AND p.action = 'view'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r JOIN public.permissions p ON p.module = 'suppliers'
WHERE replace(lower(trim(r.name)), ' ', '_') IN ('super_admin', 'admin') AND p.action IN ('create', 'edit')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r JOIN public.permissions p ON p.module = 'suppliers' AND p.action = 'delete'
WHERE replace(lower(trim(r.name)), ' ', '_') = 'super_admin'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r JOIN public.permissions p ON p.module = 'purchases'
WHERE replace(lower(trim(r.name)), ' ', '_') = 'super_admin'
  AND p.action IN ('view', 'create', 'edit', 'delete', 'receive')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r JOIN public.permissions p ON p.module = 'purchases'
WHERE replace(lower(trim(r.name)), ' ', '_') = 'admin'
  AND p.action IN ('view', 'create', 'edit', 'receive')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r JOIN public.permissions p ON p.module = 'purchases' AND p.action = 'view'
WHERE replace(lower(trim(r.name)), ' ', '_') = 'manager'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- RPC: Create PO with items
CREATE OR REPLACE FUNCTION public.create_purchase_order_with_items(
  target_business_id UUID,
  target_supplier_id UUID,
  target_po_number TEXT,
  target_order_date DATE,
  target_expected_date DATE,
  target_notes TEXT,
  target_items JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  po_id UUID;
  item_record RECORD;
  subtotal NUMERIC(14, 2) := 0;
  tax_amount NUMERIC(14, 2) := 0;
BEGIN
  IF NOT public.is_business_member(target_business_id) OR NOT public.has_business_permission(target_business_id, 'purchases.create') THEN
    RAISE EXCEPTION 'FORBIDDEN: purchases.create' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.suppliers WHERE id = target_supplier_id AND business_id = target_business_id AND status = 'ACTIVE';
  IF NOT FOUND THEN RAISE EXCEPTION 'SUPPLIER_NOT_FOUND_OR_INACTIVE'; END IF;

  IF EXISTS (SELECT 1 FROM public.purchase_orders WHERE business_id = target_business_id AND upper(btrim(po_number)) = upper(btrim(target_po_number))) THEN
    RAISE EXCEPTION 'DUPLICATE_PO_NUMBER' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.purchase_orders (business_id, supplier_id, po_number, order_date, expected_date, notes, status)
  VALUES (target_business_id, target_supplier_id, upper(btrim(target_po_number)), target_order_date, target_expected_date, target_notes, 'DRAFT')
  RETURNING id INTO po_id;

  FOR item_record IN SELECT * FROM jsonb_array_elements(target_items) AS item LOOP
    DECLARE
      material_id UUID := (item_record->>'raw_material_id')::UUID;
      ordered_qty NUMERIC(14, 3) := (item_record->>'ordered_quantity')::NUMERIC(14, 3);
      unit_cst NUMERIC(14, 2) := (item_record->>'unit_cost')::NUMERIC(14, 2);
      tax_rt NUMERIC(5, 2) := COALESCE((item_record->>'tax_rate')::NUMERIC(5, 2), 0);
      line_tot NUMERIC(14, 2);
    BEGIN
      PERFORM 1 FROM public.raw_materials WHERE id = material_id AND business_id = target_business_id AND status = 'ACTIVE';
      IF NOT FOUND THEN RAISE EXCEPTION 'RAW_MATERIAL_NOT_FOUND_OR_INACTIVE'; END IF;
      IF ordered_qty <= 0 OR unit_cst < 0 OR tax_rt < 0 OR tax_rt > 100 THEN
        RAISE EXCEPTION 'INVALID_PO_ITEM_VALUES' USING ERRCODE = '23514';
      END IF;
      line_tot := ordered_qty * unit_cst * (1 + tax_rt / 100);
      INSERT INTO public.purchase_order_items (business_id, purchase_order_id, raw_material_id, ordered_quantity, unit_cost, tax_rate, line_total)
      VALUES (target_business_id, po_id, material_id, ordered_qty, unit_cst, tax_rt, line_tot);
      subtotal := subtotal + (ordered_qty * unit_cst);
      tax_amount := tax_amount + (ordered_qty * unit_cst * tax_rt / 100);
    END;
  END LOOP;

  UPDATE public.purchase_orders SET subtotal = subtotal, tax_amount = tax_amount, total_amount = subtotal + tax_amount WHERE id = po_id;
  RETURN po_id;
END;
$$;

-- RPC: Receive purchase order items (with duplicate protection)
CREATE OR REPLACE FUNCTION public.receive_purchase_order_items(
  target_business_id UUID,
  target_po_id UUID,
  target_items JSONB,
  target_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item_record RECORD;
  po_status TEXT;
  po_supplier_id UUID;
  receipt_id UUID;
  actor_id UUID;
  remaining_qty NUMERIC(14, 3);
  new_received_qty NUMERIC(14, 3);
  ordered_qty NUMERIC(14, 3);
  current_received NUMERIC(14, 3);
  material_id UUID;
BEGIN
  IF NOT public.is_business_member(target_business_id) OR NOT public.has_business_permission(target_business_id, 'purchases.receive') THEN
    RAISE EXCEPTION 'FORBIDDEN: purchases.receive' USING ERRCODE = '42501';
  END IF;

  SELECT status, supplier_id INTO po_status, po_supplier_id FROM public.purchase_orders
  WHERE id = target_po_id AND business_id = target_business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PO_NOT_FOUND'; END IF;
  IF po_status = 'CANCELLED' THEN RAISE EXCEPTION 'PO_CANCELLED'; END IF;
  IF po_status = 'RECEIVED' THEN RAISE EXCEPTION 'PO_ALREADY_RECEIVED'; END IF;

  SELECT id INTO actor_id FROM public.users WHERE auth_user_id = auth.uid() AND business_id = target_business_id AND status = 'ACTIVE';
  IF actor_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;

  FOR item_record IN SELECT * FROM jsonb_array_elements(target_items) AS item LOOP
    DECLARE
      item_id UUID := (item_record->>'purchase_order_item_id')::UUID;
      recv_qty NUMERIC(14, 3) := (item_record->>'received_quantity')::NUMERIC(14, 3);
      unit_cst NUMERIC(14, 2) := (item_record->>'unit_cost')::NUMERIC(14, 2);
      tax_rt NUMERIC(5, 2) := COALESCE((item_record->>'tax_rate')::NUMERIC(5, 2), 0);
      notes TEXT := item_record->>'notes';
    BEGIN
      IF recv_qty <= 0 OR unit_cst < 0 OR tax_rt < 0 OR tax_rt > 100 THEN
        RAISE EXCEPTION 'INVALID_RECEIPT_VALUES' USING ERRCODE = '23514';
      END IF;

      SELECT ordered_quantity, received_quantity, raw_material_id INTO ordered_qty, current_received, material_id
      FROM public.purchase_order_items
      WHERE id = item_id AND business_id = target_business_id AND purchase_order_id = target_po_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'PO_ITEM_NOT_FOUND'; END IF;

      remaining_qty := ordered_qty - current_received;
      IF recv_qty > remaining_qty THEN RAISE EXCEPTION 'RECEIVED_EXCEEDS_ORDERED' USING ERRCODE = '23514'; END IF;

      new_received_qty := current_received + recv_qty;
      UPDATE public.purchase_order_items SET received_quantity = new_received_qty WHERE id = item_id AND business_id = target_business_id;

      -- Record purchase receipt
      INSERT INTO public.purchase_receipts (business_id, purchase_order_id, raw_material_id, received_quantity, unit_cost, tax_rate, notes, received_by)
      VALUES (target_business_id, target_po_id, material_id, recv_qty, unit_cst, tax_rt, notes, actor_id)
      RETURNING id INTO receipt_id;

      -- Add to inventory via existing RPC (creates STOCK_IN transaction + audit)
      PERFORM public.record_raw_material_stock_in(target_business_id, material_id, recv_qty,
        'PO Receipt: ' || target_po_id || ' - ' || COALESCE(notes, ''));
    END;
  END LOOP;

  -- Update PO status
  SELECT CASE
    WHEN SUM(received_quantity) = SUM(ordered_quantity) THEN 'RECEIVED'
    WHEN SUM(received_quantity) > 0 THEN 'PARTIAL'
    ELSE 'ORDERED'
  END INTO po_status
  FROM public.purchase_order_items WHERE purchase_order_id = target_po_id AND business_id = target_business_id;

  UPDATE public.purchase_orders SET status = po_status WHERE id = target_po_id AND business_id = target_business_id;
END;
$$;

-- RPC: Manual stock addition (STOCK_IN with reason)
CREATE OR REPLACE FUNCTION public.add_raw_material_stock_manual(
  target_business_id UUID,
  target_raw_material_id UUID,
  target_quantity NUMERIC,
  target_reason TEXT,
  target_reference TEXT DEFAULT NULL,
  target_notes TEXT DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed_reasons TEXT[] := ARRAY['Opening Stock', 'Direct Receipt', 'Initial Setup', 'Stock Correction', 'Other'];
  actor_id UUID;
  old_stock NUMERIC(14, 3);
  new_stock NUMERIC(14, 3);
BEGIN
  IF NOT public.is_business_member(target_business_id) OR NOT public.has_business_permission(target_business_id, 'inventory.add_stock') THEN
    RAISE EXCEPTION 'FORBIDDEN: inventory.add_stock' USING ERRCODE = '42501';
  END IF;
  IF target_quantity IS NULL OR target_quantity <= 0 THEN RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE = '23514'; END IF;
  IF target_reason IS NULL OR NOT (target_reason = ANY(allowed_reasons)) THEN RAISE EXCEPTION 'INVALID_REASON' USING ERRCODE = '23514'; END IF;
  IF target_notes IS NOT NULL AND length(target_notes) > 500 THEN RAISE EXCEPTION 'NOTES_TOO_LONG' USING ERRCODE = '23514'; END IF;

  SELECT current_stock INTO old_stock FROM public.inventory
  WHERE business_id = target_business_id AND item_type = 'raw_material' AND item_id = target_raw_material_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'RAW_MATERIAL_NOT_FOUND'; END IF;

  SELECT id INTO actor_id FROM public.users WHERE auth_user_id = auth.uid() AND business_id = target_business_id AND status = 'ACTIVE';
  IF actor_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = '42501'; END IF;

  new_stock := old_stock + target_quantity;
  UPDATE public.inventory SET current_stock = new_stock, available_stock = new_stock - reserved_stock
  WHERE business_id = target_business_id AND item_type = 'raw_material' AND item_id = target_raw_material_id;

  INSERT INTO public.inventory_transactions (business_id, item_type, item_id, transaction_type, quantity, reference_type, reference_id, notes, created_by)
  VALUES (target_business_id, 'raw_material', target_raw_material_id, 'STOCK_IN', target_quantity,
    'manual_stock_in', NULLIF(target_reference, ''), target_notes, actor_id);

  INSERT INTO public.audit_logs (business_id, user_id, action, entity_type, entity_id, old_data, new_data)
  VALUES (target_business_id, actor_id, 'RAW_MATERIAL_STOCK_ADDED', 'raw_material', target_raw_material_id,
    jsonb_build_object('current_stock', old_stock),
    jsonb_build_object('current_stock', new_stock, 'quantity_added', target_quantity, 'reason', target_reason, 'reference', target_reference, 'notes', target_notes));

  RETURN new_stock;
END;
$$;

-- RPC: Update PO status (DRAFT -> ORDERED, etc.)
CREATE OR REPLACE FUNCTION public.update_purchase_order_status(
  target_business_id UUID,
  target_po_id UUID,
  target_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed_transitions JSONB := '{
    "DRAFT": ["ORDERED", "CANCELLED"],
    "ORDERED": ["PARTIAL", "RECEIVED", "CANCELLED"],
    "PARTIAL": ["RECEIVED", "CANCELLED"],
    "RECEIVED": [],
    "CANCELLED": []
  }'::JSONB;
  current_status TEXT;
  required_permission TEXT;
BEGIN
  IF NOT public.is_business_member(target_business_id) THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501'; END IF;

  SELECT status INTO current_status FROM public.purchase_orders WHERE id = target_po_id AND business_id = target_business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PO_NOT_FOUND'; END IF;
  IF current_status = target_status THEN RAISE EXCEPTION 'STATUS_UNCHANGED'; END IF;

  IF NOT (target_status = ANY(SELECT jsonb_array_elements_text(allowed_transitions->current_status))) THEN
    RAISE EXCEPTION 'INVALID_STATUS_TRANSITION' USING ERRCODE = '23514';
  END IF;

  IF target_status = 'CANCELLED' THEN required_permission := 'purchases.delete';
  ELSE required_permission := 'purchases.edit'; END IF;

  IF NOT public.has_business_permission(target_business_id, required_permission) THEN
    RAISE EXCEPTION 'FORBIDDEN: %', required_permission USING ERRCODE = '42501';
  END IF;

  UPDATE public.purchase_orders SET status = target_status WHERE id = target_po_id AND business_id = target_business_id;
END;
$$;

-- Grants for RPCs
REVOKE ALL ON FUNCTION public.create_purchase_order_with_items(UUID, UUID, TEXT, DATE, DATE, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_purchase_order_with_items(UUID, UUID, TEXT, DATE, DATE, TEXT, JSONB) TO authenticated;

REVOKE ALL ON FUNCTION public.receive_purchase_order_items(UUID, UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order_items(UUID, UUID, JSONB, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.add_raw_material_stock_manual(UUID, UUID, NUMERIC, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_raw_material_stock_manual(UUID, UUID, NUMERIC, TEXT, TEXT, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.update_purchase_order_status(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_purchase_order_status(UUID, UUID, TEXT) TO authenticated;

COMMIT;