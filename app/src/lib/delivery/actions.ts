"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { redirect } from "next/navigation";
import { updateOrderDeliveryDatesFromSchedules, scheduleProductionQueue } from "@/lib/production/scheduler";
import { notifyDeliveryEvent } from "@/lib/notifications/actions";
import type {
  DeliveryListItem,
  DeliveryWithDetails,
  DeliveryItem,
  DeliveryStatusHistory,
  CreateDeliveryFormValues,
  PackDeliveryFormValues,
  DispatchDeliveryFormValues,
  InTransitDeliveryFormValues,
  CompleteDeliveryFormValues,
  CancelDeliveryFormValues,
  DeliveryStatus,
  EligibleDeliveryOrder,
} from "@/types/delivery";

// ============================================
// DELIVERY QUERY FUNCTIONS
// ============================================

export async function listDeliveries(
  status?: DeliveryStatus,
  orderId?: string,
  limit = 50,
  offset = 0
): Promise<DeliveryListItem[]> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "delivery.view")) {
    throw new Error("Forbidden: delivery.view");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase.rpc("list_deliveries", {
    p_business_id: context.user.business_id,
    p_status: status || null,
    p_order_id: orderId || null,
    p_limit: limit,
    p_offset: offset,
  });

  if (error) throw error;
  return (data ?? []) as DeliveryListItem[];
}

export async function getDeliveryWithItems(deliveryId: string): Promise<DeliveryWithDetails | null> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "delivery.view")) {
    throw new Error("Forbidden: delivery.view");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase.rpc("get_delivery_with_items", {
    p_business_id: context.user.business_id,
    p_delivery_id: deliveryId,
  });

  if (error) throw error;
  if (!data || data.length === 0) return null;

  const d = data[0];
  return {
    id: d.id,
    business_id: d.business_id,
    order_id: d.order_id,
    delivery_number: d.delivery_number,
    status: d.status as DeliveryStatus,
    expected_delivery_date: d.expected_delivery_date,
    tracking_number: d.tracking_number,
    vehicle: d.vehicle,
    driver: d.driver,
    dispatched_at: d.dispatched_at,
    delivered_at: d.delivered_at,
    proof_document_url: d.proof_document_url,
    notes: d.notes,
    created_at: d.created_at,
    updated_at: d.updated_at,
    order_number: d.order_number,
    customer_name: d.customer_name,
    items: (d.items as DeliveryItem[]) || [],
  };
}

export async function getDeliveryStatusHistory(deliveryId: string): Promise<DeliveryStatusHistory[]> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "delivery.view")) {
    throw new Error("Forbidden: delivery.view");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase
    .from("delivery_status_history")
    .select("*")
    .eq("business_id", context.user.business_id)
    .eq("delivery_id", deliveryId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as DeliveryStatusHistory[];
}

// ============================================
// DELIVERY MUTATION FUNCTIONS
// ============================================

export async function getEligibleOrdersForDelivery(): Promise<EligibleDeliveryOrder[]> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "delivery.create")) {
    throw new Error("Forbidden: delivery.create");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const businessId = context.user.business_id;

  // 1. Fetch confirmed orders that are not fully delivered
  const { data: orders, error: ordersErr } = await supabase
    .from("orders")
    .select(`
      id,
      order_number,
      order_date,
      expected_delivery_date,
      status,
      delivery_status,
      customers(name, company_name)
    `)
    .eq("business_id", businessId)
    .eq("status", "CONFIRMED")
    .neq("delivery_status", "DELIVERED")
    .order("order_date", { ascending: false });

  if (ordersErr || !orders) return [];

  // 2. Fetch existing active deliveries to filter out orders already being delivered
  const { data: activeDeliveries } = await supabase
    .from("deliveries")
    .select("order_id, status")
    .eq("business_id", businessId)
    .neq("status", "CANCELLED");

  const activeOrderIds = new Set((activeDeliveries ?? []).map((d) => d.order_id));

  // 3. For eligible orders, check if all items are production-complete
  const eligibleOrders: EligibleDeliveryOrder[] = [];

  for (const order of orders) {
    if (activeOrderIds.has(order.id)) continue;

    // Fetch order items
    const { data: items } = await supabase
      .from("order_items")
      .select("id, product_id, quantity, products(name, sku, unit)")
      .eq("order_id", order.id)
      .eq("business_id", businessId);

    if (!items || items.length === 0) continue;

    // Fetch production orders
    const { data: pos } = await supabase
      .from("production_orders")
      .select("id, order_item_id, product_id, status, quantity, completed_quantity")
      .eq("order_id", order.id)
      .eq("business_id", businessId);

    // Verify all items are completed
    let allItemsComplete = true;
    for (const item of items) {
      const matchingPOs = (pos ?? []).filter(
        (po) => po.order_item_id === item.id || (!po.order_item_id && po.product_id === item.product_id)
      );

      if (matchingPOs.length === 0) {
        allItemsComplete = false;
        break;
      }

      const allCompleted = matchingPOs.every(
        (po) => po.status === "COMPLETED" || po.status === "READY_FOR_DISPATCH"
      );
      const totalCompleted = matchingPOs.reduce(
        (sum, po) => sum + (Number(po.completed_quantity) || 0),
        0
      );

      if (!allCompleted || totalCompleted < Number(item.quantity)) {
        allItemsComplete = false;
        break;
      }
    }

    if (allItemsComplete) {
      const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers;
      eligibleOrders.push({
        id: order.id,
        order_number: order.order_number,
        customer_name: customer?.name || customer?.company_name || null,
        order_date: order.order_date,
        expected_delivery_date: order.expected_delivery_date,
        items: items.map((it) => {
          const prod = Array.isArray(it.products) ? it.products[0] : it.products;
          return {
            id: it.id,
            product_id: it.product_id,
            product_name: prod?.name || "Product",
            product_sku: prod?.sku || null,
            quantity: Number(it.quantity),
            unit: prod?.unit || "",
          };
        }),
      });
    }
  }

  return eligibleOrders;
}

export async function createDeliveryFromOrder(
  values: CreateDeliveryFormValues
): Promise<{ delivery_id: string; message: string }> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "delivery.create")) {
    throw new Error("Forbidden: delivery.create");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const businessId = context.user.business_id;

  // 1. Fetch order and verify it's confirmed
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("id, order_number, status, delivery_status")
    .eq("id", values.order_id)
    .eq("business_id", businessId)
    .maybeSingle();

  if (orderErr || !order) {
    throw new Error("Order not found or access denied.");
  }

  if (order.status !== "CONFIRMED") {
    throw new Error(`Cannot create delivery: order must be in CONFIRMED status (current: ${order.status}).`);
  }

  // 2. Fetch all order items
  const { data: orderItems, error: itemsErr } = await supabase
    .from("order_items")
    .select("id, product_id, quantity, products(name, sku)")
    .eq("order_id", values.order_id)
    .eq("business_id", businessId);

  if (itemsErr || !orderItems || orderItems.length === 0) {
    throw new Error("Cannot create delivery: order has no items.");
  }

  // 3. Fetch production orders for this order
  const { data: productionOrders, error: poErr } = await supabase
    .from("production_orders")
    .select("id, order_item_id, product_id, status, quantity, completed_quantity")
    .eq("order_id", values.order_id)
    .eq("business_id", businessId);

  if (poErr) {
    throw new Error(`Failed to check production orders: ${poErr.message}`);
  }

  // Check if every required order item is production-complete (Requirement 1)
  const incompleteItems: string[] = [];

  for (const item of orderItems) {
    const matchingPOs = (productionOrders || []).filter(
      (po) => po.order_item_id === item.id || (!po.order_item_id && po.product_id === item.product_id)
    );

    const prod = Array.isArray(item.products) ? item.products[0] : item.products;
    const prodName = prod?.name || item.product_id;

    if (matchingPOs.length === 0) {
      incompleteItems.push(`${prodName} (no production record found)`);
      continue;
    }

    const allCompleted = matchingPOs.every(
      (po) => po.status === "COMPLETED" || po.status === "READY_FOR_DISPATCH"
    );

    const totalCompletedQty = matchingPOs.reduce(
      (sum, po) => sum + (Number(po.completed_quantity) || 0),
      0
    );

    const requiredQty = Number(item.quantity) || 0;

    if (!allCompleted || totalCompletedQty < requiredQty) {
      const statusSummary = matchingPOs.map((po) => po.status).join(", ");
      incompleteItems.push(`${prodName} (status: ${statusSummary}, completed: ${totalCompletedQty}/${requiredQty})`);
    }
  }

  if (incompleteItems.length > 0) {
    throw new Error(
      `Cannot create delivery: all required order items must be production-complete. Incomplete items: ${incompleteItems.join("; ")}`
    );
  }

  // 4. Prevent duplicate active delivery for this order
  const { data: existingDeliveries } = await supabase
    .from("deliveries")
    .select("id, delivery_number, status")
    .eq("order_id", values.order_id)
    .eq("business_id", businessId)
    .neq("status", "CANCELLED");

  if (existingDeliveries && existingDeliveries.length > 0) {
    const active = existingDeliveries.find((d) => d.status !== "CANCELLED");
    if (active) {
      throw new Error(`An active delivery (${active.delivery_number}, status: ${active.status}) already exists for this order.`);
    }
  }

  // 5. Create delivery via RPC
  const { data, error } = await supabase.rpc("create_delivery_from_order", {
    p_business_id: businessId,
    p_order_id: values.order_id,
    p_delivery_number: values.delivery_number,
    p_notes: values.notes || null,
  });

  if (error) {
    throw new Error(error.message || "Failed to create delivery");
  }

  const deliveryId = data as string;

  // Ensure delivery status is set to READY (since all items are confirmed production-complete)
  await supabase
    .from("deliveries")
    .update({ status: "READY", updated_at: new Date().toISOString() })
    .eq("id", deliveryId)
    .eq("business_id", businessId)
    .eq("status", "NOT_READY");

  // 6. Recalculate order delivery status using existing delivery-date service (Requirement 7)
  try {
    await updateOrderDeliveryDatesFromSchedules(supabase, businessId, values.order_id);
  } catch (err) {
    console.warn("Could not recalculate delivery dates:", err);
  }

  try {
    await notifyDeliveryEvent(businessId, deliveryId, values.order_id, "ready", context.user.id);
  } catch {
    // Non-fatal
  }

  return { delivery_id: deliveryId, message: "Delivery created successfully with status READY" };
}

export async function packDelivery(
  values: PackDeliveryFormValues
): Promise<{ success: boolean; message: string | null }> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "delivery.update")) {
    throw new Error("Forbidden: delivery.update");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const businessId = context.user.business_id;

  const { data: delivery, error: delErr } = await supabase
    .from("deliveries")
    .select("id, status, order_id")
    .eq("id", values.delivery_id)
    .eq("business_id", businessId)
    .maybeSingle();

  if (delErr || !delivery) {
    throw new Error("Delivery not found or access denied.");
  }

  if (delivery.status !== "READY") {
    throw new Error(`Can only pack deliveries in READY status (current: ${delivery.status}).`);
  }

  const { data, error } = await supabase.rpc("pack_delivery", {
    p_business_id: businessId,
    p_delivery_id: values.delivery_id,
    p_notes: values.notes || null,
  });

  if (error) throw new Error(error.message || "Failed to pack delivery");

  return { success: true, message: "Delivery packed successfully" };
}

export async function dispatchDelivery(
  values: DispatchDeliveryFormValues
): Promise<{ success: boolean; message: string | null }> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "delivery.dispatch")) {
    throw new Error("Forbidden: delivery.dispatch");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const businessId = context.user.business_id;

  // 1. Fetch delivery details
  const { data: delivery, error: delErr } = await supabase
    .from("deliveries")
    .select("id, delivery_number, status, dispatched_at, order_id")
    .eq("id", values.delivery_id)
    .eq("business_id", businessId)
    .maybeSingle();

  if (delErr || !delivery) {
    throw new Error("Delivery not found or access denied.");
  }

  // Check duplicate dispatch (Requirement 3 & 4)
  if (delivery.dispatched_at || ["DISPATCHED", "IN_TRANSIT", "DELIVERED"].includes(delivery.status)) {
    throw new Error(`Duplicate dispatch prevented: delivery is already ${delivery.status}.`);
  }

  if (delivery.status === "CANCELLED") {
    throw new Error("Cannot dispatch a cancelled delivery.");
  }

  // If status is READY, pack it first so the database RPC allows dispatch
  if (delivery.status === "READY") {
    const { error: packErr } = await supabase.rpc("pack_delivery", {
      p_business_id: businessId,
      p_delivery_id: values.delivery_id,
      p_notes: "Auto-packed before dispatch",
    });
    if (packErr) {
      throw new Error(`Failed to pack delivery prior to dispatch: ${packErr.message}`);
    }
  }

  // 2. Validate delivered / dispatched quantities against warehouse finished goods stock (Requirements 3 & 4)
  const { data: deliveryItems, error: itemsErr } = await supabase
    .from("delivery_items")
    .select("id, product_id, ordered_quantity, delivered_quantity, products(name, sku)")
    .eq("delivery_id", values.delivery_id)
    .eq("business_id", businessId);

  if (itemsErr || !deliveryItems || deliveryItems.length === 0) {
    throw new Error("Delivery has no items to dispatch.");
  }

  // Pre-dispatch reservation analysis per line item
  const reservationAdjustments: Array<{
    productId: string;
    inventoryId: string;
    originalAvailable: number;
    originalReserved: number;
    originalCurrent: number;
    dispatchQty: number;
    reservedPortion: number;
  }> = [];

  for (const item of deliveryItems) {
    const remainingQty = Number(item.ordered_quantity) - Number(item.delivered_quantity);
    if (remainingQty <= 0) continue;

    const prod = Array.isArray(item.products) ? item.products[0] : item.products;
    const prodName = prod?.name || item.product_id;
    const sku = prod?.sku || "N/A";

    // Check finished goods stock in inventory
    const { data: invRow } = await supabase
      .from("inventory")
      .select("id, available_stock, current_stock, reserved_stock")
      .eq("business_id", businessId)
      .eq("item_type", "finished_good")
      .eq("item_id", item.product_id)
      .maybeSingle();

    if (!invRow) {
      throw new Error(`No finished goods inventory recorded for "${prodName}" (${sku}).`);
    }

    const currentStock = Number(invRow.current_stock) || 0;
    const reservedStock = Number(invRow.reserved_stock) || 0;
    const availableStock = Number(invRow.available_stock) || 0;

    // Physical warehouse stock must be sufficient for dispatch
    if (currentStock < remainingQty) {
      throw new Error(
        `Insufficient finished goods warehouse stock for "${prodName}" (${sku}). Physical stock: ${currentStock}, Required: ${remainingQty}.`
      );
    }

    // Calculate active reservation for this specific order
    const { data: orderTxs } = await supabase
      .from("inventory_transactions")
      .select("quantity, reference_type")
      .eq("business_id", businessId)
      .eq("reference_id", delivery.order_id)
      .eq("item_id", item.product_id)
      .eq("item_type", "finished_good");

    let activeOrderReservation = 0;
    (orderTxs ?? []).forEach((tx) => {
      if (tx.reference_type === "ORDER_RESERVATION") {
        activeOrderReservation += Number(tx.quantity) || 0;
      } else if (
        tx.reference_type === "ORDER_DISPATCH_RELEASE" ||
        tx.reference_type === "ORDER_CANCELLATION_RELEASE"
      ) {
        activeOrderReservation -= Number(tx.quantity) || 0;
      }
    });
    activeOrderReservation = Math.max(0, activeOrderReservation);

    const reservedPortion = Math.min(remainingQty, activeOrderReservation);
    const unreservedPortion = remainingQty - reservedPortion;

    // Any unreserved portion must not exceed general available stock
    if (unreservedPortion > availableStock) {
      throw new Error(
        `Insufficient available finished goods stock for unreserved quantity of "${prodName}" (${sku}). Available: ${availableStock}, Unreserved needed: ${unreservedPortion}.`
      );
    }

    reservationAdjustments.push({
      productId: item.product_id,
      inventoryId: invRow.id,
      originalAvailable: availableStock,
      originalReserved: reservedStock,
      originalCurrent: currentStock,
      dispatchQty: remainingQty,
      reservedPortion,
    });
  }

  // 3. Temporarily adjust available_stock for reserved portion so the DB RPC check passes
  const adminClient = createAdminSupabaseClient();
  const clientToUse = adminClient || supabase;

  for (const adj of reservationAdjustments) {
    if (adj.reservedPortion > 0) {
      await clientToUse
        .from("inventory")
        .update({
          available_stock: adj.originalAvailable + adj.reservedPortion,
          updated_at: new Date().toISOString(),
        })
        .eq("id", adj.inventoryId)
        .eq("business_id", businessId);
    }
  }

  // 4. Dispatch via RPC (deducts inventory exactly once at dispatch point, creates transaction, updates dispatched_at)
  let rpcError: Error | null = null;
  try {
    const { error } = await supabase.rpc("dispatch_delivery", {
      p_business_id: businessId,
      p_delivery_id: values.delivery_id,
      p_vehicle: values.vehicle || null,
      p_driver: values.driver || null,
      p_tracking_number: values.tracking_number || null,
      p_notes: values.notes || null,
    });

    if (error) {
      rpcError = new Error(error.message || "Failed to dispatch delivery");
    }
  } catch (err: any) {
    rpcError = err instanceof Error ? err : new Error(String(err));
  }

  // If RPC failed, rollback temporary availability adjustments
  if (rpcError) {
    for (const adj of reservationAdjustments) {
      if (adj.reservedPortion > 0) {
        await clientToUse
          .from("inventory")
          .update({
            available_stock: adj.originalAvailable,
            updated_at: new Date().toISOString(),
          })
          .eq("id", adj.inventoryId)
          .eq("business_id", businessId);
      }
    }
    throw rpcError;
  }

  // 5. Post-dispatch: Release the reservations corresponding to dispatched items
  for (const adj of reservationAdjustments) {
    if (adj.reservedPortion > 0) {
      const newReserved = Math.max(0, adj.originalReserved - adj.reservedPortion);
      const newCurrent = Math.max(0, adj.originalCurrent - adj.dispatchQty);
      const newAvailable = Math.max(0, newCurrent - newReserved);

      await clientToUse
        .from("inventory")
        .update({
          reserved_stock: newReserved,
          available_stock: newAvailable,
          updated_at: new Date().toISOString(),
        })
        .eq("id", adj.inventoryId)
        .eq("business_id", businessId);

      // Record ORDER_DISPATCH_RELEASE transaction
      await clientToUse.from("inventory_transactions").insert({
        business_id: businessId,
        item_type: "finished_good",
        item_id: adj.productId,
        transaction_type: "ADJUSTMENT",
        quantity: adj.reservedPortion,
        reference_type: "ORDER_DISPATCH_RELEASE",
        reference_id: delivery.order_id,
        notes: `Released reservation of ${adj.reservedPortion} units upon delivery ${delivery.delivery_number} dispatch`,
        created_by: context.user.id,
      });
    }
  }

  // 6. Recalculate order delivery status and dates using existing service (Requirement 7)
  try {
    await updateOrderDeliveryDatesFromSchedules(supabase, businessId, delivery.order_id);
    // Recalculate eligible future orders in queue now that this order is dispatched (Requirement A.3 & A.8)
    await scheduleProductionQueue(supabase, businessId);
  } catch (err) {
    console.warn("Could not recalculate delivery dates:", err);
  }

  try {
    await notifyDeliveryEvent(businessId, values.delivery_id, delivery.order_id, "dispatched", context.user.id);
  } catch {
    // Non-fatal
  }

  return { success: true, message: "Delivery dispatched successfully" };
}

export async function markDeliveryInTransit(
  values: InTransitDeliveryFormValues
): Promise<{ success: boolean; message: string | null }> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "delivery.update")) {
    throw new Error("Forbidden: delivery.update");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const businessId = context.user.business_id;

  const { data: delivery, error: delErr } = await supabase
    .from("deliveries")
    .select("id, status, order_id")
    .eq("id", values.delivery_id)
    .eq("business_id", businessId)
    .maybeSingle();

  if (delErr || !delivery) {
    throw new Error("Delivery not found or access denied.");
  }

  if (delivery.status !== "DISPATCHED") {
    throw new Error(`Can only mark DISPATCHED deliveries as IN_TRANSIT (current: ${delivery.status}).`);
  }

  const { data, error } = await supabase.rpc("mark_delivery_in_transit", {
    p_business_id: businessId,
    p_delivery_id: values.delivery_id,
    p_notes: values.notes || null,
  });

  if (error) throw new Error(error.message || "Failed to mark delivery in transit");

  try {
    await updateOrderDeliveryDatesFromSchedules(supabase, businessId, delivery.order_id);
  } catch (err) {
    console.warn("Could not recalculate delivery dates:", err);
  }

  return { success: true, message: "Delivery marked as in transit" };
}

export async function completeDelivery(
  values: CompleteDeliveryFormValues
): Promise<{ success: boolean; message: string | null }> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "delivery.complete")) {
    throw new Error("Forbidden: delivery.complete");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const businessId = context.user.business_id;

  const { data: delivery, error: delErr } = await supabase
    .from("deliveries")
    .select("id, status, delivered_at, order_id")
    .eq("id", values.delivery_id)
    .eq("business_id", businessId)
    .maybeSingle();

  if (delErr || !delivery) {
    throw new Error("Delivery not found or access denied.");
  }

  if (delivery.delivered_at || delivery.status === "DELIVERED") {
    throw new Error("Duplicate delivery completion prevented: delivery is already marked as DELIVERED.");
  }

  if (!["DISPATCHED", "IN_TRANSIT"].includes(delivery.status)) {
    throw new Error(`Can only complete DISPATCHED or IN_TRANSIT deliveries (current: ${delivery.status}).`);
  }

  const { data, error } = await supabase.rpc("complete_delivery", {
    p_business_id: businessId,
    p_delivery_id: values.delivery_id,
    p_proof_document_url: values.proof_document_url || null,
    p_notes: values.notes || null,
  });

  if (error) throw new Error(error.message || "Failed to complete delivery");

  // Recalculate order delivery status (Requirement 6 & 7)
  try {
    await updateOrderDeliveryDatesFromSchedules(supabase, businessId, delivery.order_id);
  } catch (err) {
    console.warn("Could not recalculate delivery dates:", err);
  }

  try {
    await notifyDeliveryEvent(businessId, values.delivery_id, delivery.order_id, "delivered", context.user.id);
  } catch {
    // Non-fatal
  }

  return { success: true, message: "Delivery completed successfully" };
}

export async function cancelDelivery(
  values: CancelDeliveryFormValues
): Promise<{ success: boolean; message: string | null }> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "delivery.cancel")) {
    throw new Error("Forbidden: delivery.cancel");
  }

  if (!values.reason || !values.reason.trim()) {
    throw new Error("Cancellation reason is required.");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const businessId = context.user.business_id;

  const { data: delivery, error: delErr } = await supabase
    .from("deliveries")
    .select("id, status, order_id")
    .eq("id", values.delivery_id)
    .eq("business_id", businessId)
    .maybeSingle();

  if (delErr || !delivery) {
    throw new Error("Delivery not found or access denied.");
  }

  if (delivery.status === "DELIVERED") {
    throw new Error("Cannot cancel a delivery that has already been DELIVERED.");
  }

  if (delivery.status === "CANCELLED") {
    throw new Error("Delivery is already CANCELLED.");
  }

  const { data, error } = await supabase.rpc("cancel_delivery", {
    p_business_id: businessId,
    p_delivery_id: values.delivery_id,
    p_reason: values.reason.trim(),
  });

  if (error) throw new Error(error.message || "Failed to cancel delivery");

  try {
    await updateOrderDeliveryDatesFromSchedules(supabase, businessId, delivery.order_id);
  } catch (err) {
    console.warn("Could not recalculate delivery dates:", err);
  }

  return { success: true, message: "Delivery cancelled successfully" };
}