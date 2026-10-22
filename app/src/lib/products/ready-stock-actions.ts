"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

export type ReadyStockAdjustmentType =
  | "OPENING_STOCK"
  | "STOCK_ADDITION"
  | "STOCK_CORRECTION"
  | "DAMAGED_STOCK";

export type ReadyStockDirection = "ADD" | "REMOVE";

function validAmount(value: string, wholeDigits: number, decimalDigits: number): boolean {
  return new RegExp(`^\\d{1,${wholeDigits}}(?:\\.\\d{1,${decimalDigits}})?$`).test(value);
}

/**
 * Unified, audited ready stock entry and adjustment action.
 * Supports:
 * - Opening Stock (initial balance or baseline count)
 * - Stock Addition (receiving or surplus physical stock)
 * - Stock Correction (audit count reconciliation)
 * - Damaged / Rejected Stock (write-offs)
 *
 * Enforces:
 * - Strict role authorization (Admin / Super Admin, or explicit permission override)
 * - Positive quantities and unit matching
 * - Removal cannot exceed usable physical stock
 * - Removal cannot violate active reservations for confirmed orders
 * - Immutable inventory transaction and audit log creation
 */
export async function recordReadyStockAdjustmentAction(formData: FormData): Promise<never> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");

  // Check permissions: Manager without explicit adjust/add permission is strictly denied
  const canAdjust = hasPermission({ permissions: context.permissions }, "inventory.adjust");
  const canAdd = hasPermission({ permissions: context.permissions }, "inventory.add_stock");

  if (!canAdjust && !canAdd) {
    redirect("/inventory?tab=ready-stock&error=forbidden");
  }

  const productId = String(formData.get("product_id") ?? "").trim();
  const adjustmentType = String(formData.get("adjustment_type") ?? "").trim() as ReadyStockAdjustmentType;
  const direction = String(formData.get("direction") ?? "").trim() as ReadyStockDirection;
  const quantityStr = String(formData.get("quantity") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim();

  // Removals or damage write-offs strictly require inventory.adjust
  if (direction === "REMOVE" && !canAdjust) {
    redirect("/inventory?tab=ready-stock&error=forbidden");
  }

  const validTypes: ReadyStockAdjustmentType[] = [
    "OPENING_STOCK",
    "STOCK_ADDITION",
    "STOCK_CORRECTION",
    "DAMAGED_STOCK",
  ];

  if (!validTypes.includes(adjustmentType)) {
    redirect("/inventory?tab=ready-stock&error=invalid_adjustment_type");
  }

  if (direction !== "ADD" && direction !== "REMOVE") {
    redirect("/inventory?tab=ready-stock&error=invalid_direction");
  }

  if (!validAmount(quantityStr, 11, 3) || Number(quantityStr) <= 0) {
    redirect("/inventory?tab=ready-stock&error=invalid_quantity");
  }

  if (!reason || reason.length < 3 || reason.length > 500) {
    redirect("/inventory?tab=ready-stock&error=missing_reason");
  }

  if (reference.length > 100) {
    redirect("/inventory?tab=ready-stock&error=invalid_reference");
  }

  const quantity = Number(quantityStr);
  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/inventory?tab=ready-stock&error=auth_unconfigured");

  const admin = createAdminSupabaseClient();
  const db = admin || supabase;

  // Verify finished product exists and belongs to this business
  const { data: product, error: prodErr } = await db
    .from("products")
    .select("id, name, sku, unit")
    .eq("id", productId)
    .eq("business_id", context.user.business_id)
    .maybeSingle();

  if (prodErr || !product) {
    redirect("/inventory?tab=ready-stock&error=product_not_found");
  }

  // Fetch current inventory record
  const { data: existingInv } = await db
    .from("inventory")
    .select("id, current_stock, reserved_stock, available_stock")
    .eq("business_id", context.user.business_id)
    .eq("item_type", "finished_good")
    .eq("item_id", productId)
    .maybeSingle();

  const currentStock = existingInv ? Number(existingInv.current_stock) || 0 : 0;
  const reservedStock = existingInv ? Number(existingInv.reserved_stock) || 0 : 0;
  const availableStock = existingInv ? Number(existingInv.available_stock) || 0 : 0;

  let newCurrent = currentStock;

  if (direction === "ADD") {
    newCurrent = Number((currentStock + quantity).toFixed(4));
  } else {
    // REMOVE checks:
    // 1. Cannot remove more than usable physical stock
    if (quantity > currentStock) {
      redirect("/inventory?tab=ready-stock&error=removal_exceeds_physical");
    }
    // 2. Cannot reduce physical stock below active reservations for confirmed orders
    if (currentStock - quantity < reservedStock) {
      redirect("/inventory?tab=ready-stock&error=removal_violates_reservation");
    }
    newCurrent = Math.max(0, Number((currentStock - quantity).toFixed(4)));
  }

  // Reserved stock is NEVER altered by a manual adjustment
  const newAvailable = Math.max(0, Number((newCurrent - reservedStock).toFixed(4)));

  // Atomic update or insert
  let inventoryId = existingInv?.id;
  if (existingInv) {
    const { data: updatedRows, error: updateErr } = await db
      .from("inventory")
      .update({
        current_stock: newCurrent,
        available_stock: newAvailable,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingInv.id)
      .eq("business_id", context.user.business_id)
      .select("id, current_stock, available_stock");

    if (updateErr || !updatedRows || updatedRows.length === 0) {
      console.error("Ready stock inventory update error:", updateErr);
      redirect("/inventory?tab=ready-stock&error=stock_entry_failed");
    }
  } else {
    const { data: newInv, error: insertErr } = await db
      .from("inventory")
      .insert({
        business_id: context.user.business_id,
        item_type: "finished_good",
        item_id: productId,
        current_stock: newCurrent,
        reserved_stock: 0,
        available_stock: newAvailable,
      })
      .select("id, current_stock, available_stock")
      .single();

    if (insertErr || !newInv) {
      console.error("Ready stock inventory insert error:", insertErr);
      redirect("/inventory?tab=ready-stock&error=stock_entry_failed");
    }
    inventoryId = newInv.id;
  }

  // Determine transaction type
  const transactionType = direction === "ADD" ? "STOCK_IN" : "STOCK_OUT";
  const notesFormatted = reference
    ? `[${adjustmentType}] ${reason} (Ref: ${reference})`
    : `[${adjustmentType}] ${reason}`;

  // Record inventory transaction
  const { error: txErr } = await db.from("inventory_transactions").insert({
    business_id: context.user.business_id,
    item_type: "finished_good",
    item_id: productId,
    transaction_type: transactionType,
    quantity: quantity,
    reference_type: adjustmentType,
    notes: notesFormatted.slice(0, 500),
    created_by: context.user.id,
  });

  if (txErr) {
    console.error("Ready stock transaction insert error:", txErr);
  }

  // Record audit log
  const { error: auditErr } = await db.from("audit_logs").insert({
    business_id: context.user.business_id,
    user_id: context.user.id,
    action: "FINISHED_GOOD_STOCK_ADJUSTED",
    entity_type: "inventory",
    entity_id: inventoryId,
    old_data: {
      product_id: productId,
      product_name: product.name,
      current_stock: currentStock,
      reserved_stock: reservedStock,
      available_stock: availableStock,
    },
    new_data: {
      product_id: productId,
      product_name: product.name,
      adjustment_type: adjustmentType,
      direction,
      quantity,
      unit: product.unit,
      current_stock: newCurrent,
      reserved_stock: reservedStock,
      available_stock: newAvailable,
      reason,
      reference: reference || null,
    },
  });

  if (auditErr) {
    console.error("Ready stock audit log error:", auditErr);
  }

  revalidatePath("/inventory");
  revalidatePath("/inventory?tab=ready-stock");
  revalidatePath("/inventory/transactions");
  redirect("/inventory?tab=ready-stock&notice=adjustment_recorded");
}

/**
 * Manual Ready Stock Addition Action
 * Allows authorized Admin / Super Admin (or users explicitly granted inventory.add_stock)
 * to manually add finished-goods ready stock without automatic production triggers.
 *
 * Validations & Rules:
 * - Server authorization: strictly enforces inventory.add_stock permission.
 * - Finished product must exist in the current business workspace.
 * - Quantity must be a strictly positive valid number (> 0).
 * - Updates physical stock (current_stock = current_stock + qty).
 * - Recalculates available stock (available_stock = max(0, current_stock - reserved_stock)).
 * - Reason/notes is optional.
 * - Records stock addition in inventory_transactions (item_type = finished_good, transaction_type = STOCK_IN, reference_type = MANUAL_ADD).
 * - Records audit log (action = FINISHED_GOOD_STOCK_ADDED).
 * - Revalidates inventory paths and redirects to /inventory?tab=ready-stock&notice=stock_added.
 */
export async function addReadyStockAction(formData: FormData): Promise<never> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");

  // Server authorization enforcement: Only users with inventory.add_stock can add stock
  if (!hasPermission({ permissions: context.permissions }, "inventory.add_stock")) {
    redirect("/inventory?tab=ready-stock&error=forbidden");
  }

  const productId = String(formData.get("product_id") ?? "").trim();
  const batchNumber = String(formData.get("batch_number") ?? "").trim();
  const quantityStr = String(formData.get("quantity") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  // Validate batch number: Must be non-empty and within 100 characters
  if (!batchNumber) {
    redirect("/inventory?tab=ready-stock&error=missing_batch_number");
  }
  if (batchNumber.length > 100) {
    redirect("/inventory?tab=ready-stock&error=invalid_batch_number");
  }

  // Validate quantity: Must be a valid positive number > 0
  if (!validAmount(quantityStr, 11, 3) || Number(quantityStr) <= 0) {
    redirect("/inventory?tab=ready-stock&error=invalid_quantity");
  }

  const quantity = Number(quantityStr);
  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/inventory?tab=ready-stock&error=auth_unconfigured");

  const admin = createAdminSupabaseClient();
  const db = admin || supabase;

  // Validate finished product exists in this business
  const { data: product, error: prodErr } = await db
    .from("products")
    .select("id, name, sku, unit")
    .eq("id", productId)
    .eq("business_id", context.user.business_id)
    .maybeSingle();

  if (prodErr || !product) {
    redirect("/inventory?tab=ready-stock&error=product_not_found");
  }

  // Fetch existing finished-good inventory record
  const { data: existingInv } = await db
    .from("inventory")
    .select("id, current_stock, reserved_stock, available_stock")
    .eq("business_id", context.user.business_id)
    .eq("item_type", "finished_good")
    .eq("item_id", productId)
    .maybeSingle();

  const currentStock = existingInv ? Number(existingInv.current_stock) || 0 : 0;
  const reservedStock = existingInv ? Number(existingInv.reserved_stock) || 0 : 0;
  const availableStock = existingInv ? Number(existingInv.available_stock) || 0 : 0;

  // Stock calculation:
  // new physical stock = current physical stock + quantity
  const newCurrent = Number((currentStock + quantity).toFixed(4));
  // available ready stock = max(0, physical - reservations)
  const newAvailable = Math.max(0, Number((newCurrent - reservedStock).toFixed(4)));

  let inventoryId = existingInv?.id;
  if (existingInv) {
    const { data: updatedRows, error: updateErr } = await db
      .from("inventory")
      .update({
        current_stock: newCurrent,
        available_stock: newAvailable,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existingInv.id)
      .eq("business_id", context.user.business_id)
      .select("id, current_stock, available_stock");

    if (updateErr || !updatedRows || updatedRows.length === 0) {
      console.error("Ready stock inventory update error:", updateErr);
      redirect("/inventory?tab=ready-stock&error=stock_entry_failed");
    }
  } else {
    const { data: newInv, error: insertErr } = await db
      .from("inventory")
      .insert({
        business_id: context.user.business_id,
        item_type: "finished_good",
        item_id: productId,
        current_stock: newCurrent,
        reserved_stock: 0,
        available_stock: newAvailable,
      })
      .select("id, current_stock, available_stock")
      .single();

    if (insertErr || !newInv) {
      console.error("Ready stock inventory insert error:", insertErr);
      redirect("/inventory?tab=ready-stock&error=stock_entry_failed");
    }
    inventoryId = newInv.id;
  }

  // Record stock addition in existing stock-movement / transaction history
  const trimmedNotes = notes
    ? `[Batch: ${batchNumber}] ${notes}`.slice(0, 500)
    : `Manual Ready Stock Addition (Batch: ${batchNumber})`;
  const { error: txErr } = await db.from("inventory_transactions").insert({
    business_id: context.user.business_id,
    item_type: "finished_good",
    item_id: productId,
    transaction_type: "STOCK_IN",
    quantity: quantity,
    batch_number: batchNumber,
    reference_type: "MANUAL_ADD",
    notes: trimmedNotes,
    created_by: context.user.id,
  });

  if (txErr) {
    console.error("Ready stock transaction insert error:", txErr);
  }

  // Record audit log
  const { error: auditErr } = await db.from("audit_logs").insert({
    business_id: context.user.business_id,
    user_id: context.user.id,
    action: "FINISHED_GOOD_STOCK_ADDED",
    entity_type: "inventory",
    entity_id: inventoryId,
    old_data: {
      product_id: productId,
      product_name: product.name,
      current_stock: currentStock,
      reserved_stock: reservedStock,
      available_stock: availableStock,
    },
    new_data: {
      product_id: productId,
      product_name: product.name,
      batch_number: batchNumber,
      quantity,
      unit: product.unit,
      current_stock: newCurrent,
      reserved_stock: reservedStock,
      available_stock: newAvailable,
      notes: notes || null,
    },
  });

  if (auditErr) {
    console.error("Ready stock audit log error:", auditErr);
  }

  revalidatePath("/inventory");
  revalidatePath("/inventory?tab=ready-stock");
  revalidatePath("/inventory/transactions");
  redirect("/inventory?tab=ready-stock&notice=stock_added");
}

/**
 * Convenience wrapper for simple stock additions
 */
export async function addFinishedGoodStockAction(formData: FormData): Promise<never> {
  return addReadyStockAction(formData);
}

/**
 * Convenience legacy wrapper for absolute stock level adjustment
 */
export async function adjustFinishedGoodStockAction(formData: FormData): Promise<never> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "inventory.adjust")) {
    redirect("/inventory?tab=ready-stock&error=forbidden");
  }

  const productId = String(formData.get("product_id") ?? "");
  const newStockStr = String(formData.get("new_stock") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!validAmount(newStockStr, 11, 3) || !reason || reason.length > 500) {
    redirect("/inventory?tab=ready-stock&error=invalid_adjustment");
  }

  const newStock = Number(newStockStr);
  const supabase = await createServerSupabaseClient();
  if (!supabase) redirect("/inventory?tab=ready-stock&error=auth_unconfigured");

  const { data: existingInv } = await supabase
    .from("inventory")
    .select("current_stock, reserved_stock")
    .eq("business_id", context.user.business_id)
    .eq("item_type", "finished_good")
    .eq("item_id", productId)
    .maybeSingle();

  const currentStock = existingInv ? Number(existingInv.current_stock) || 0 : 0;
  const diff = Number((newStock - currentStock).toFixed(4));

  if (diff === 0) {
    redirect("/inventory?tab=ready-stock&notice=adjustment_recorded");
  }

  const fd = new FormData();
  fd.set("product_id", productId);
  fd.set("adjustment_type", "STOCK_CORRECTION");
  fd.set("direction", diff > 0 ? "ADD" : "REMOVE");
  fd.set("quantity", String(Math.abs(diff)));
  fd.set("reason", reason);

  return recordReadyStockAdjustmentAction(fd);
}
