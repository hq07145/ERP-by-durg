import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  MaterialAvailabilityCheck,
  StartProductionFormValues,
  CompleteProductionFormValues,
} from "@/types/production";
import { updateOrderDeliveryDatesFromSchedules } from "@/lib/production/scheduler";

/**
 * Checks raw material availability against the active BOM for a production order.
 * Calculates exact required quantities vs available stock in inventory.
 */
export async function checkProductionMaterialAvailability(
  supabase: SupabaseClient,
  businessId: string,
  productionOrderId: string,
): Promise<MaterialAvailabilityCheck[]> {
  // 1. Fetch production order
  const { data: po, error: poErr } = await supabase
    .from("production_orders")
    .select("id, product_id, quantity, status")
    .eq("id", productionOrderId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (poErr || !po) {
    throw new Error("Production order not found");
  }

  // 2. Fetch active BOM for this product
  const { data: bom } = await supabase
    .from("product_bom")
    .select("id, version")
    .eq("business_id", businessId)
    .eq("product_id", po.product_id)
    .eq("active", true)
    .maybeSingle();

  if (!bom) {
    // No active BOM configured - no raw materials required
    return [];
  }

  // 3. Fetch BOM items with raw material metadata
  const { data: bomItems } = await supabase
    .from("bom_items")
    .select(
      `
      id, raw_material_id, quantity_per_unit,
      raw_materials!inner(id, code, name, unit, current_stock)
    `,
    )
    .eq("business_id", businessId)
    .eq("bom_id", bom.id);

  if (!bomItems || bomItems.length === 0) {
    return [];
  }

  const rawMaterialIds = bomItems.map((b: any) => b.raw_material_id);

  // 4. Fetch current inventory records for these raw materials
  const { data: inventoryRows } = await supabase
    .from("inventory")
    .select("item_id, current_stock, reserved_stock, available_stock")
    .eq("business_id", businessId)
    .eq("item_type", "raw_material")
    .in("item_id", rawMaterialIds);

  const inventoryMap = new Map<string, { current: number; reserved: number; available: number }>();
  (inventoryRows ?? []).forEach((row: any) => {
    inventoryMap.set(row.item_id, {
      current: Number(row.current_stock) || 0,
      reserved: Number(row.reserved_stock) || 0,
      available: Number(row.available_stock) || 0,
    });
  });

  // 5. Fetch any existing planned/reserved consumption for this production order
  const { data: existingConsumptions } = await supabase
    .from("production_material_consumption")
    .select("raw_material_id, planned_quantity, consumed_quantity")
    .eq("business_id", businessId)
    .eq("production_order_id", productionOrderId);

  const consumptionMap = new Map<string, number>();
  (existingConsumptions ?? []).forEach((c: any) => {
    consumptionMap.set(c.raw_material_id, Number(c.planned_quantity) || 0);
  });

  // 6. Build availability check results
  const results: MaterialAvailabilityCheck[] = [];

  for (const item of bomItems) {
    const rm = Array.isArray(item.raw_materials) ? item.raw_materials[0] : item.raw_materials;
    const requiredQty = Number(item.quantity_per_unit) * Number(po.quantity);

    const inv = inventoryMap.get(item.raw_material_id);
    const existingReservation = consumptionMap.get(item.raw_material_id) || 0;

    // Available stock from inventory or raw_materials table fallback
    const baseAvailable = inv ? inv.available : Number(rm.current_stock) || 0;
    // If materials were already reserved for this order, they count towards available
    const effectiveAvailable = baseAvailable + existingReservation;

    const isSufficient = effectiveAvailable >= requiredQty;

    results.push({
      raw_material_id: item.raw_material_id,
      code: rm.code ?? null,
      name: rm.name,
      unit: rm.unit,
      required_quantity: Number(requiredQty.toFixed(4)),
      available_stock: Number(effectiveAvailable.toFixed(4)),
      is_sufficient: isSufficient,
    });
  }

  return results;
}

/**
 * Atomically starts production order and consumes required raw materials.
 * Prevents duplicate consumption, handles reservations, and logs inventory transactions.
 */
export async function startProductionWithInventory(
  supabase: SupabaseClient,
  businessId: string,
  userId: string,
  values: StartProductionFormValues,
): Promise<{ success: boolean; message: string | null; shortages?: MaterialAvailabilityCheck[] }> {
  // 1. Fetch production order
  const { data: po, error: poErr } = await supabase
    .from("production_orders")
    .select("id, status, product_id, quantity, order_id")
    .eq("id", values.production_order_id)
    .eq("business_id", businessId)
    .maybeSingle();

  if (poErr || !po) {
    return { success: false, message: "Production order not found." };
  }

  // Prevent duplicate starts or invalid status transitions
  if (!["SCHEDULED", "PENDING", "MATERIAL_READY"].includes(po.status)) {
    return {
      success: false,
      message: `Cannot start production: Order is currently in status "${po.status}".`,
    };
  }

  // 2. Check material availability before starting
  const availability = await checkProductionMaterialAvailability(
    supabase,
    businessId,
    values.production_order_id,
  );

  const shortages = availability.filter((m) => !m.is_sufficient);
  if (shortages.length > 0) {
    const shortageDetails = shortages
      .map(
        (s) =>
          `${s.name}${s.code ? ` (${s.code})` : ""}: Required ${s.required_quantity} ${s.unit}, Available ${s.available_stock} ${s.unit}`,
      )
      .join("; ");

    return {
      success: false,
      message: `Insufficient material stock: ${shortageDetails}`,
      shortages,
    };
  }

  // 3. Atomically transition status to IN_PRODUCTION (prevents race conditions)
  const { data: updatedPo, error: updateErr } = await supabase
    .from("production_orders")
    .update({
      status: "IN_PRODUCTION",
      actual_start_date: new Date().toISOString().split("T")[0],
      updated_at: new Date().toISOString(),
    })
    .eq("id", values.production_order_id)
    .eq("business_id", businessId)
    .in("status", ["SCHEDULED", "PENDING", "MATERIAL_READY"])
    .select("id, status");

  if (updateErr || !updatedPo || updatedPo.length === 0) {
    return {
      success: false,
      message: "Production order status could not be updated or was already started.",
    };
  }

  // 4. Consume raw materials atomically
  for (const mat of availability) {
    const requiredQty = Number(mat.required_quantity);
    if (requiredQty <= 0) continue;

    // Check if an existing reservation already exists
    const { data: existingCons } = await supabase
      .from("production_material_consumption")
      .select("id, planned_quantity, consumed_quantity")
      .eq("business_id", businessId)
      .eq("production_order_id", values.production_order_id)
      .eq("raw_material_id", mat.raw_material_id)
      .maybeSingle();

    const priorReservation = Number(existingCons?.planned_quantity) || 0;

    // Fetch current inventory record
    const { data: invRow } = await supabase
      .from("inventory")
      .select("id, current_stock, reserved_stock, available_stock")
      .eq("business_id", businessId)
      .eq("item_type", "raw_material")
      .eq("item_id", mat.raw_material_id)
      .maybeSingle();

    if (invRow) {
      const currentStock = Number(invRow.current_stock) || 0;
      const reservedStock = Number(invRow.reserved_stock) || 0;

      // Consume from physical stock and release reservation if one existed
      const newCurrent = Math.max(0, Number((currentStock - requiredQty).toFixed(4)));
      const newReserved = Math.max(0, Number((reservedStock - priorReservation).toFixed(4)));
      const newAvailable = Math.max(0, Number((newCurrent - newReserved).toFixed(4)));

      await supabase
        .from("inventory")
        .update({
          current_stock: newCurrent,
          reserved_stock: newReserved,
          available_stock: newAvailable,
          updated_at: new Date().toISOString(),
        })
        .eq("id", invRow.id)
        .eq("business_id", businessId);
    } else {
      // If no inventory row existed, initialize with 0
      await supabase.from("inventory").insert({
        business_id: businessId,
        item_type: "raw_material",
        item_id: mat.raw_material_id,
        current_stock: 0,
        reserved_stock: 0,
        available_stock: 0,
      });
    }

    // Decrement raw_materials current_stock
    const { data: rmRow } = await supabase
      .from("raw_materials")
      .select("current_stock")
      .eq("id", mat.raw_material_id)
      .eq("business_id", businessId)
      .maybeSingle();

    if (rmRow) {
      const newRmStock = Math.max(0, Number((Number(rmRow.current_stock) - requiredQty).toFixed(4)));
      await supabase
        .from("raw_materials")
        .update({
          current_stock: newRmStock,
          updated_at: new Date().toISOString(),
        })
        .eq("id", mat.raw_material_id)
        .eq("business_id", businessId);
    }

    // Create inventory transaction for raw material consumption
    const { data: invTx } = await supabase
      .from("inventory_transactions")
      .insert({
        business_id: businessId,
        item_type: "raw_material",
        item_id: mat.raw_material_id,
        transaction_type: "STOCK_OUT",
        quantity: requiredQty,
        reference_type: "PRODUCTION_CONSUMPTION",
        reference_id: values.production_order_id,
        notes: `Material consumed for production order ${values.production_order_id}`,
        created_by: userId,
      })
      .select("id")
      .maybeSingle();

    // Upsert production_material_consumption record
    await supabase.from("production_material_consumption").upsert(
      {
        business_id: businessId,
        production_order_id: values.production_order_id,
        raw_material_id: mat.raw_material_id,
        planned_quantity: requiredQty,
        consumed_quantity: requiredQty,
        inventory_transaction_id: invTx?.id || null,
        consumed_at: new Date().toISOString(),
        consumed_by: userId,
      },
      { onConflict: "business_id,production_order_id,raw_material_id" },
    );
  }

  // 5. Insert production status log
  await supabase.from("production_logs").insert({
    business_id: businessId,
    production_order_id: values.production_order_id,
    log_type: "STATUS_CHANGE",
    message: values.notes?.trim()
      ? `Production started: ${values.notes.trim()}`
      : "Production started",
    created_by: userId,
  });

  // 6. Recalculate delivery dates
  try {
    await updateOrderDeliveryDatesFromSchedules(supabase, businessId, po.order_id);
  } catch {
    // Non-fatal
  }

  return { success: true, message: "Production started successfully." };
}

/**
 * Atomically completes production, adds finished goods to inventory,
 * and creates PRODUCTION_OUTPUT transactions.
 */
export async function completeProductionWithInventory(
  supabase: SupabaseClient,
  businessId: string,
  userId: string,
  values: CompleteProductionFormValues,
): Promise<{ success: boolean; message: string | null }> {
  // 1. Fetch production order
  const { data: po, error: poErr } = await supabase
    .from("production_orders")
    .select("id, status, product_id, quantity, order_id")
    .eq("id", values.production_order_id)
    .eq("business_id", businessId)
    .maybeSingle();

  if (poErr || !po) {
    return { success: false, message: "Production order not found." };
  }

  if (!["IN_PRODUCTION", "QUALITY_CHECK"].includes(po.status)) {
    return {
      success: false,
      message: `Cannot complete production from status "${po.status}". Order must be in production or quality check.`,
    };
  }

  const producedQty = Number(values.quantity_produced);
  const rejectedQty = Number(values.quantity_rejected) || 0;

  if (isNaN(producedQty) || producedQty <= 0) {
    return { success: false, message: "Good quantity produced must be greater than zero." };
  }

  if (rejectedQty < 0) {
    return { success: false, message: "Rejected quantity cannot be negative." };
  }

  // 2. Prevent duplicate completion (Requirement 6)
  const { data: existingOutput } = await supabase
    .from("production_output")
    .select("id")
    .eq("business_id", businessId)
    .eq("production_order_id", values.production_order_id)
    .maybeSingle();

  if (existingOutput) {
    return { success: false, message: "Production output has already been recorded for this order." };
  }

  // 3. Insert production_output record
  const { error: outputErr } = await supabase.from("production_output").insert({
    business_id: businessId,
    production_order_id: values.production_order_id,
    product_id: po.product_id,
    quantity_produced: producedQty,
    quantity_rejected: rejectedQty,
    batch_number: values.batch_number?.trim() || null,
    produced_at: new Date().toISOString(),
    created_by: userId,
  });

  if (outputErr) {
    return { success: false, message: "Failed to record production output." };
  }

  // 4. Add finished goods to inventory
  const { data: invRow } = await supabase
    .from("inventory")
    .select("id, current_stock, reserved_stock, available_stock")
    .eq("business_id", businessId)
    .eq("item_type", "finished_good")
    .eq("item_id", po.product_id)
    .maybeSingle();

  if (invRow) {
    const newCurrent = Number(invRow.current_stock) + producedQty;
    const newAvailable = Number(invRow.available_stock) + producedQty;

    await supabase
      .from("inventory")
      .update({
        current_stock: newCurrent,
        available_stock: newAvailable,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invRow.id)
      .eq("business_id", businessId);
  } else {
    await supabase.from("inventory").insert({
      business_id: businessId,
      item_type: "finished_good",
      item_id: po.product_id,
      current_stock: producedQty,
      reserved_stock: 0,
      available_stock: producedQty,
    });
  }

  // 5. Create PRODUCTION_OUTPUT inventory transaction
  const batchText = values.batch_number?.trim() ? ` (Batch: ${values.batch_number.trim()})` : "";
  await supabase.from("inventory_transactions").insert({
    business_id: businessId,
    item_type: "finished_good",
    item_id: po.product_id,
    transaction_type: "STOCK_IN",
    quantity: producedQty,
    batch_number: values.batch_number?.trim() || null,
    reference_type: "PRODUCTION_OUTPUT",
    reference_id: values.production_order_id,
    notes: `Finished goods from production order ${values.production_order_id}${batchText}`,
    created_by: userId,
  });

  // If rejected units exist, record rejection transaction
  if (rejectedQty > 0) {
    await supabase.from("inventory_transactions").insert({
      business_id: businessId,
      item_type: "finished_good",
      item_id: po.product_id,
      transaction_type: "STOCK_OUT",
      quantity: rejectedQty,
      reference_type: "PRODUCTION_REJECTION",
      reference_id: values.production_order_id,
      notes: `Rejected units from production order ${values.production_order_id}`,
      created_by: userId,
    });
  }

  // 6. Transition production order to COMPLETED
  await supabase
    .from("production_orders")
    .update({
      status: "COMPLETED",
      actual_end_date: new Date().toISOString().split("T")[0],
      updated_at: new Date().toISOString(),
    })
    .eq("id", values.production_order_id)
    .eq("business_id", businessId);

  // 7. Insert completion log
  await supabase.from("production_logs").insert({
    business_id: businessId,
    production_order_id: values.production_order_id,
    log_type: "STATUS_CHANGE",
    message: `Production completed: ${producedQty} units produced${rejectedQty > 0 ? `, ${rejectedQty} rejected` : ""}${values.notes?.trim() ? `. ${values.notes.trim()}` : ""}`,
    quantity_completed: producedQty,
    created_by: userId,
  });

  // 8. Recalculate delivery dates
  try {
    await updateOrderDeliveryDatesFromSchedules(supabase, businessId, po.order_id);
  } catch {
    // Non-fatal
  }

  return { success: true, message: "Production completed and finished goods added to inventory." };
}
