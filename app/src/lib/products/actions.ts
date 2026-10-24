"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { productToFormValues } from "@/lib/products/form-values";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  PRODUCT_UNITS,
  QUALITY_STANDARDS,
  QUALITY_STANDARD_MAP,
  type Product,
  type ProductFormValues,
} from "@/types/product";

export type ProductActionState = {
  success?: boolean;
  productId?: string;
  error?: string;
};

export type CategoryActionState = {
  error?: string;
  name?: string;
  parent_id?: string;
};

function hasProductPermission(permissions: string[], permission: string): boolean {
  return hasPermission({ permissions }, permission);
}

async function authorizeProductAction(permission: string) {
  const context = await getAuthContext();
  if (!context) return { error: "account_unavailable" as const };
  if (!hasProductPermission(context.permissions, permission)) {
    return { error: "forbidden" as const };
  }
  const supabase = await createServerSupabaseClient();
  if (!supabase) return { error: "auth_unconfigured" as const };
  return { context, supabase };
}

function getString(formData: FormData, key: string, fallback: string): string {
  const value = formData.get(key);
  return value === null ? fallback : String(value);
}

function productValues(formData: FormData, product?: Product): ProductFormValues {
  const defaults = productToFormValues(product);

  const value = (key: keyof ProductFormValues) => getString(formData, key, defaults[key] ?? "");
  return {
    name: value("name"),
    sku: value("sku"),
    quality_grade: value("quality_grade"),
    quality_standard: value("quality_standard"),
    qty_is_4985: value("qty_is_4985"),
    qty_is_12786: value("qty_is_12786"),
    qty_is_13487: value("qty_is_13487"),
    qty_is_13488: value("qty_is_13488"),
    qty_is_12785: value("qty_is_12785"),
    category_id: value("category_id"),
    subcategory_id: value("subcategory_id"),
    description: value("description"),
    unit: value("unit"),
    selling_price: value("selling_price"),
    tax_rate: value("tax_rate"),
    daily_capacity: value("daily_capacity"),
    production_unit: value("production_unit"),
    production_min_days: value("production_min_days"),
    production_max_days: value("production_max_days"),
    setup_minutes: value("setup_minutes"),
    delivery_min_days: value("delivery_min_days"),
    delivery_max_days: value("delivery_max_days"),
    min_stock: value("min_stock"),
    reorder_level: value("reorder_level"),
    status: value("status"),
  };
}

function decimalValue(value: string, wholeDigits: number, decimalDigits: number): string | null {
  const pattern = new RegExp(`^\\d{1,${wholeDigits}}(?:\\.\\d{1,${decimalDigits}})?$`);
  return pattern.test(value) ? value : null;
}

function integerValue(value: string, max: number): number | null {
  if (!/^\d+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= max ? parsed : null;
}

function areDecimalsEqual(
  val1: string | number | null | undefined,
  val2: string | number | null | undefined,
  precision = 2,
): boolean {
  if (val1 === val2) return true;
  const n1 = Number(val1);
  const n2 = Number(val2);
  if (isNaN(n1) && isNaN(n2)) return true;
  if (isNaN(n1) || isNaN(n2)) return false;
  return Math.abs(n1 - n2) < Math.pow(10, -precision) / 2;
}

function validateProductValues(values: ProductFormValues): string | null {
  values.name = values.name.trim();
  values.sku = values.sku.trim().toUpperCase();
  values.quality_grade = (values.quality_grade || "").trim();
  values.description = values.description.trim();
  values.selling_price = values.selling_price.trim();
  values.tax_rate = values.tax_rate.trim();
  values.min_stock = values.min_stock.trim();
  values.reorder_level = values.reorder_level.trim();

  if (!values.name || values.name.length > 160) return "invalid_name";
  if (!values.sku || values.sku.length > 64) return "invalid_sku";
  if (values.description.length > 2000) return "invalid_description";
  if (!PRODUCT_UNITS.includes(values.unit as (typeof PRODUCT_UNITS)[number])) return "invalid_unit";
  if (!PRODUCT_UNITS.includes(values.production_unit as (typeof PRODUCT_UNITS)[number])) {
    return "invalid_production_unit";
  }
  if (values.status !== "ACTIVE" && values.status !== "INACTIVE") return "invalid_status";

  const price = decimalValue(values.selling_price, 12, 2);
  const tax = decimalValue(values.tax_rate, 3, 2);
  const minStock = decimalValue(values.min_stock, 11, 3);
  const reorderLevel = decimalValue(values.reorder_level, 11, 3);
  if (price === null) return "invalid_price";
  if (tax === null || Number(tax) > 100) return "invalid_tax_rate";
  if (minStock === null) return "invalid_min_stock";
  if (reorderLevel === null) return "invalid_reorder_level";

  const capacity = integerValue(values.daily_capacity, 2147483647);
  const productionMin = integerValue(values.production_min_days, 10000);
  const productionMax = integerValue(values.production_max_days, 10000);
  const setup = integerValue(values.setup_minutes, 2147483647);
  const deliveryMin = integerValue(values.delivery_min_days, 10000);
  const deliveryMax = integerValue(values.delivery_max_days, 10000);
  if (capacity === null || capacity <= 0) return "invalid_capacity";
  if (productionMin === null || productionMax === null || productionMax < productionMin) {
    return "invalid_production_range";
  }
  if (setup === null) return "invalid_setup_time";
  if (deliveryMin === null || deliveryMax === null || deliveryMax < deliveryMin) {
    return "invalid_delivery_range";
  }
  if (values.subcategory_id && !values.category_id) return "invalid_category";
  if (!values.quality_standard || !QUALITY_STANDARDS.includes(values.quality_standard as any)) {
    return "invalid_quality_standard";
  }
  const stdMap = QUALITY_STANDARD_MAP[values.quality_standard as (typeof QUALITY_STANDARDS)[number]];
  const stdQty = stdMap ? values[stdMap.key] : undefined;
  if (stdQty !== undefined && stdQty !== "") {
    const parsedQty = decimalValue(stdQty, 12, 2);
    if (parsedQty === null || Number(parsedQty) < 0) {
      return "invalid_quality_quantity";
    }
  }
  return null;
}

async function validateCategoryAssignment(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>>,
  businessId: string,
  categoryId: string,
  subcategoryId: string,
): Promise<string | null> {
  if (!categoryId) return subcategoryId ? "invalid_category" : null;

  const { data: category, error: categoryError } = await supabase
    .from("categories")
    .select("id, parent_id, status")
    .eq("id", categoryId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (categoryError || !category || category.parent_id || category.status !== "ACTIVE") {
    return "invalid_category";
  }

  if (!subcategoryId) return null;
  const { data: subcategory, error: subcategoryError } = await supabase
    .from("categories")
    .select("id, parent_id, status")
    .eq("id", subcategoryId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (
    subcategoryError ||
    !subcategory ||
    subcategory.parent_id !== categoryId ||
    subcategory.status !== "ACTIVE"
  ) {
    return "invalid_category";
  }

  return null;
}

function hasChangedSensitiveValues(
  permissions: string[],
  product: Product,
  values: ProductFormValues,
): string | null {
  if (
    (!areDecimalsEqual(product.selling_price, values.selling_price, 2) ||
      !areDecimalsEqual(product.tax_rate, values.tax_rate, 2)) &&
    !hasProductPermission(permissions, "products.change_price")
  ) return "price_permission_required";

  if (
    Number(product.daily_capacity) !== Number(values.daily_capacity) &&
    !hasProductPermission(permissions, "products.change_capacity")
  ) return "capacity_permission_required";

  const productionChanged =
    product.production_unit !== values.production_unit ||
    Number(product.production_min_days) !== Number(values.production_min_days) ||
    Number(product.production_max_days) !== Number(values.production_max_days) ||
    Number(product.setup_minutes) !== Number(values.setup_minutes);
  if (productionChanged && !hasProductPermission(permissions, "products.change_production_time")) {
    return "production_permission_required";
  }

  const deliveryChanged =
    Number(product.delivery_min_days) !== Number(values.delivery_min_days) ||
    Number(product.delivery_max_days) !== Number(values.delivery_max_days);
  if (deliveryChanged && !hasProductPermission(permissions, "products.change_delivery_time")) {
    return "delivery_permission_required";
  }

  return null;
}

function mapProductError(error: { code?: string; message?: string }): string {
  if (error.code === "23505") return "duplicate_sku";
  if (error.code === "23503") return "invalid_category";
  if (error.code === "23514") return "invalid_values";
  if (error.code === "42501" || error.message?.includes("FORBIDDEN:")) return "field_permission_required";
  return "product_save_failed";
}

export async function saveProductAction(
  _previousState: ProductActionState,
  formData: FormData,
): Promise<ProductActionState> {
  const productId = String(formData.get("product_id") ?? "");
  const actionPermission = productId ? "products.edit" : "products.create";
  const authResult = await authorizeProductAction(actionPermission);
  if ("error" in authResult) return { error: authResult.error };
  const { context, supabase } = authResult;

  let existingProduct: Product | undefined;
  if (productId) {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", productId)
      .eq("business_id", context.user.business_id)
      .maybeSingle();
    if (error || !data) return { error: "product_not_found" };
    existingProduct = data as Product;
  }

  const values = productValues(formData, existingProduct);
  const validationError = validateProductValues(values);
  if (validationError) return { error: validationError };

  if (existingProduct) {
    const permissionError = hasChangedSensitiveValues(context.permissions, existingProduct, values);
    if (permissionError) return { error: permissionError };
  }

  const categoryChanged = !existingProduct ||
    existingProduct.category_id !== (values.category_id || null) ||
    existingProduct.subcategory_id !== (values.subcategory_id || null);
  if (categoryChanged && values.category_id) {
    const categoryError = await validateCategoryAssignment(
      supabase,
      context.user.business_id,
      values.category_id,
      values.subcategory_id,
    );
    if (categoryError) return { error: categoryError };
  }

  const selectedStd = values.quality_standard;
  const payload = {
    business_id: context.user.business_id,
    name: values.name,
    sku: values.sku,
    quality_grade: values.quality_grade || null,
    quality_standard: selectedStd || null,
    qty_is_4985: selectedStd === "IS:4985 PVC Pipe" ? (values.qty_is_4985 ? Number(values.qty_is_4985) : 0) : 0,
    qty_is_12786: selectedStd === "IS:12786 Plain Lateral" ? (values.qty_is_12786 ? Number(values.qty_is_12786) : 0) : 0,
    qty_is_13487: selectedStd === "IS:13487 Emitter" ? (values.qty_is_13487 ? Number(values.qty_is_13487) : 0) : 0,
    qty_is_13488: selectedStd === "IS:13488 Emitting Pipe" ? (values.qty_is_13488 ? Number(values.qty_is_13488) : 0) : 0,
    qty_is_12785: selectedStd === "IS:12785 Filters" ? (values.qty_is_12785 ? Number(values.qty_is_12785) : 0) : 0,
    category_id: values.category_id || null,
    subcategory_id: values.subcategory_id || null,
    description: values.description || null,
    unit: values.unit,
    selling_price: values.selling_price,
    tax_rate: values.tax_rate,
    daily_capacity: Number(values.daily_capacity),
    production_unit: values.production_unit,
    production_min_days: Number(values.production_min_days),
    production_max_days: Number(values.production_max_days),
    setup_minutes: Number(values.setup_minutes),
    delivery_min_days: Number(values.delivery_min_days),
    delivery_max_days: Number(values.delivery_max_days),
    min_stock: values.min_stock,
    reorder_level: values.reorder_level,
    active: values.status === "ACTIVE",
  };

  const result = existingProduct
    ? await supabase
        .from("products")
        .update(payload)
        .eq("id", existingProduct.id)
        .eq("business_id", context.user.business_id)
        .select("id")
        .maybeSingle()
    : await supabase
        .from("products")
        .insert(payload)
        .select("id")
        .single();

  if (result.error) return { error: mapProductError(result.error) };
  const savedId = result.data?.id;
  if (!savedId) return { error: "product_not_found" };

  if (existingProduct) {
    const capacityOrTimingChanged =
      String(existingProduct.daily_capacity) !== values.daily_capacity ||
      String(existingProduct.production_min_days) !== values.production_min_days ||
      String(existingProduct.production_max_days) !== values.production_max_days ||
      String(existingProduct.setup_minutes) !== values.setup_minutes;

    if (capacityOrTimingChanged) {
      try {
        const { scheduleProductionQueue } = await import("@/lib/production/scheduler");
        await Promise.race([
          scheduleProductionQueue(supabase, context.user.business_id),
          new Promise((_, reject) => setTimeout(() => reject(new Error("scheduler_timeout")), 1500)),
        ]);
      } catch {
        // Non-fatal if queue is empty or timed out
      }
    }
  }

  revalidatePath("/products");
  revalidatePath(`/products/${savedId}`);
  return { success: true, productId: savedId };
}

export async function toggleProductStatusAction(formData: FormData): Promise<never> {
  const actionContext = await authorizeProductAction("products.edit");
  if (!actionContext || "error" in actionContext) redirect("/products?error=auth_unconfigured");
  const { context, supabase } = actionContext;
  const productId = String(formData.get("product_id") ?? "");
  const { data: product, error: fetchError } = await supabase
    .from("products")
    .select("id, active")
    .eq("id", productId)
    .eq("business_id", context.user.business_id)
    .maybeSingle();
  if (fetchError || !product) redirect("/products?error=product_not_found");

  const { error } = await supabase
    .from("products")
    .update({ active: !product.active })
    .eq("id", productId)
    .eq("business_id", context.user.business_id);
  if (error) redirect("/products?error=product_update_failed");

  revalidatePath("/products");
  revalidatePath(`/products/${productId}`);
  redirect(`/products?notice=${product.active ? "product_deactivated" : "product_activated"}`);
}

export async function createCategoryAction(
  _previousState: CategoryActionState,
  formData: FormData,
): Promise<CategoryActionState> {
  const actionContext = await authorizeProductAction("products.create");
  if (!actionContext || "error" in actionContext) return { error: "auth_unconfigured" };
  const { context, supabase } = actionContext;
  const name = String(formData.get("name") ?? "").trim();
  const parentId = String(formData.get("parent_id") ?? "");
  if (!name || name.length > 80) return { error: "invalid_category_name", name, parent_id: parentId };

  if (parentId) {
    const { data: parent, error } = await supabase
      .from("categories")
      .select("id, parent_id, status")
      .eq("id", parentId)
      .eq("business_id", context.user.business_id)
      .maybeSingle();
    if (error || !parent || parent.parent_id || parent.status !== "ACTIVE") {
      return { error: "invalid_category_parent", name, parent_id: parentId };
    }
  }

  const { error } = await supabase.from("categories").insert({
    business_id: context.user.business_id,
    parent_id: parentId || null,
    name,
  });
  if (error) {
    return {
      error: error.code === "23505" ? "duplicate_category" : "category_create_failed",
      name,
      parent_id: parentId,
    };
  }

  revalidatePath("/categories");
  revalidatePath("/products");
  redirect("/categories?notice=category_created");
}

export async function toggleCategoryStatusAction(formData: FormData): Promise<never> {
  const actionContext = await authorizeProductAction("products.edit");
  if (!actionContext || "error" in actionContext) redirect("/categories?error=auth_unconfigured");
  const { context, supabase } = actionContext;
  const categoryId = String(formData.get("category_id") ?? "");
  const { data: category, error: fetchError } = await supabase
    .from("categories")
    .select("id, status")
    .eq("id", categoryId)
    .eq("business_id", context.user.business_id)
    .maybeSingle();
  if (fetchError || !category) redirect("/categories?error=category_not_found");

  const { error } = await supabase
    .from("categories")
    .update({ status: category.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" })
    .eq("id", categoryId)
    .eq("business_id", context.user.business_id);
  if (error) redirect("/categories?error=category_update_failed");

  revalidatePath("/categories");
  revalidatePath("/products");
  redirect(`/categories?notice=${category.status === "ACTIVE" ? "category_deactivated" : "category_activated"}`);
}