"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { isProcurementAuthorized } from "@/lib/permissions/procurement";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  type PurchaseOrderFormValues,
  type PurchaseOrderItemFormValues,
  type ReceiveItemFormValues,
  type ManualStockFormValues,
} from "@/types/supplier";

export type PurchaseActionState = { error?: string };

function validAmount(value: string, wholeDigits: number, decimalDigits: number): boolean {
  return new RegExp(`^\\d{1,${wholeDigits}}(?:\\.\\d{1,${decimalDigits}})?$`).test(value);
}

function poValues(formData: FormData): PurchaseOrderFormValues {
  const itemsJson = String(formData.get("items") ?? "[]");
  let items: PurchaseOrderItemFormValues[] = [];
  try {
    items = JSON.parse(itemsJson);
  } catch {
    items = [];
  }
  const expectedDate = String(formData.get("expected_date") ?? "").trim();
  return {
    supplier_id: String(formData.get("supplier_id") ?? ""),
    po_number: String(formData.get("po_number") ?? "").trim().toUpperCase(),
    order_date: String(formData.get("order_date") ?? ""),
    expected_date: expectedDate || "",
    notes: String(formData.get("notes") ?? "").trim(),
    items,
  };
}

function validatePo(values: PurchaseOrderFormValues): string | null {
  if (!values.supplier_id) return "invalid_supplier";
  if (!values.po_number || values.po_number.length > 64) return "invalid_po_number";
  if (!values.order_date) return "invalid_order_date";
  if (values.items.length === 0) return "no_items";
  for (const item of values.items) {
    if (!item.raw_material_id) return "invalid_material";
    if (!validAmount(item.ordered_quantity, 11, 3) || Number(item.ordered_quantity) <= 0) return "invalid_quantity";
    if (!validAmount(item.unit_cost, 12, 2) || Number(item.unit_cost) < 0) return "invalid_unit_cost";
    if (!validAmount(item.tax_rate, 5, 2) || Number(item.tax_rate) < 0 || Number(item.tax_rate) > 100) return "invalid_tax_rate";
  }
  if (values.notes.length > 1000) return "notes_too_long";
  return null;
}

async function authorized(permission: string) {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!isProcurementAuthorized(context, permission)) {
    const isManager = context.roleKey === "manager" || context.role?.name?.toLowerCase().includes("manager");
    redirect(isManager ? "/manager/dashboard?error=forbidden" : "/purchases?error=forbidden");
  }
  const supabase = await createServerSupabaseClient();
  return supabase ? { context, supabase } : null;
}

export async function createPurchaseOrderAction(
  _previousState: PurchaseActionState,
  formData: FormData,
): Promise<PurchaseActionState> {
  const actionContext = await authorized("purchases.create");
  if (!actionContext) return { error: "auth_unconfigured" };
  const { context, supabase } = actionContext;
  const values = poValues(formData);
  const validationError = validatePo(values);
  if (validationError) return { error: validationError };

  const { data: poId, error } = await supabase.rpc("create_purchase_order_with_items", {
    target_business_id: context.user.business_id,
    target_supplier_id: values.supplier_id,
    target_po_number: values.po_number,
    target_order_date: values.order_date,
    target_expected_date: values.expected_date,
    target_notes: values.notes || null,
    target_items: JSON.stringify(values.items),
  });

  if (error) {
    if (error.code === "42501") return { error: "forbidden" };
    if (error.code === "23505") return { error: "duplicate_po_number" };
    return { error: "create_failed" };
  }

  revalidatePath("/purchases");
  redirect(`/purchases/${poId}?notice=po_created`);
}

export async function updatePurchaseOrderStatusAction(formData: FormData): Promise<never> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  const poId = String(formData.get("purchase_order_id") ?? "");
  const status = String(formData.get("status") ?? "");
  const requiredPermission = status === "CANCELLED" ? "purchases.delete" : "purchases.edit";
  if (!isProcurementAuthorized(context, requiredPermission)) {
    const isManager = context.roleKey === "manager" || context.role?.name?.toLowerCase().includes("manager");
    redirect(isManager ? "/manager/dashboard?error=forbidden" : "/purchases?error=forbidden");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/purchases?error=auth_unconfigured");

  const { error } = await supabase.rpc("update_purchase_order_status", {
    target_business_id: context.user.business_id,
    target_po_id: poId,
    target_status: status,
  });

  if (error) redirect(`/purchases?error=${error.code === "42501" ? "forbidden" : "status_failed"}`);

  revalidatePath("/purchases");
  revalidatePath(`/purchases/${poId}`);
  redirect(`/purchases/${poId}?notice=po_status_updated`);
}

export async function receivePurchaseOrderItemsAction(formData: FormData): Promise<never> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!isProcurementAuthorized(context, "purchases.receive")) {
    const isManager = context.roleKey === "manager" || context.role?.name?.toLowerCase().includes("manager");
    redirect(isManager ? "/manager/dashboard?error=forbidden" : "/purchases?error=forbidden");
  }

  const poId = String(formData.get("purchase_order_id") ?? "");
  const itemsJson = String(formData.get("items") ?? "[]");
  const notes = String(formData.get("notes") ?? "").trim();

  let items: ReceiveItemFormValues[] = [];
  try {
    items = JSON.parse(itemsJson);
  } catch {
    redirect("/purchases?error=invalid_receipt_data");
  }

  if (items.length === 0) redirect("/purchases?error=no_items_to_receive");

  for (const item of items) {
    if (!item.purchase_order_item_id || !validAmount(item.received_quantity, 11, 3) || Number(item.received_quantity) <= 0) {
      redirect("/purchases?error=invalid_receipt_quantity");
    }
    if (!validAmount(item.unit_cost, 12, 2) || Number(item.unit_cost) < 0) {
      redirect("/purchases?error=invalid_receipt_unit_cost");
    }
    if (!validAmount(item.tax_rate, 5, 2) || Number(item.tax_rate) < 0 || Number(item.tax_rate) > 100) {
      redirect("/purchases?error=invalid_receipt_tax_rate");
    }
    if (item.notes && item.notes.length > 500) {
      redirect("/purchases?error=notes_too_long");
    }
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/purchases?error=auth_unconfigured");

  const { error } = await supabase.rpc("receive_purchase_order_items", {
    target_business_id: context.user.business_id,
    target_po_id: poId,
    target_items: JSON.stringify(items),
    target_notes: notes || null,
  });

  if (error) redirect(`/purchases?error=${error.code === "42501" ? "forbidden" : "receive_failed"}`);

  revalidatePath("/purchases");
  revalidatePath(`/purchases/${poId}`);
  revalidatePath("/inventory");
  revalidatePath("/inventory/transactions");
  redirect(`/purchases/${poId}?notice=goods_received`);
}

export async function addRawMaterialStockManualAction(formData: FormData): Promise<never> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "inventory.add_stock")) redirect("/inventory?error=forbidden");

  const values: ManualStockFormValues = {
    raw_material_id: String(formData.get("raw_material_id") ?? ""),
    quantity: String(formData.get("quantity") ?? "").trim(),
    reason: String(formData.get("reason") ?? ""),
    reference: String(formData.get("reference") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
  };

  if (!values.raw_material_id) redirect("/inventory?error=invalid_material");
  if (!validAmount(values.quantity, 11, 3) || Number(values.quantity) <= 0) redirect("/inventory?error=invalid_quantity");

  const allowedReasons = ["Opening Stock", "Direct Receipt", "Initial Setup", "Stock Correction", "Other"];
  if (!allowedReasons.includes(values.reason)) redirect("/inventory?error=invalid_reason");

  if (values.reference.length > 100) redirect("/inventory?error=reference_too_long");
  if (values.notes.length > 500) redirect("/inventory?error=notes_too_long");

  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/inventory?error=auth_unconfigured");

  const { error } = await supabase.rpc("add_raw_material_stock_manual", {
    target_business_id: context.user.business_id,
    target_raw_material_id: values.raw_material_id,
    target_quantity: values.quantity,
    target_reason: values.reason,
    target_reference: values.reference || null,
    target_notes: values.notes || null,
  });

  if (error) redirect(`/inventory?error=${error.code === "42501" ? "forbidden" : "manual_stock_failed"}`);

  revalidatePath("/inventory");
  revalidatePath("/inventory/transactions");
  revalidatePath("/raw-materials");
  redirect("/inventory?notice=manual_stock_added");
}