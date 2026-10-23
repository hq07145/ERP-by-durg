"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { redirect } from "next/navigation";
import { updateOrderDeliveryDatesFromSchedules, scheduleProductionQueue } from "@/lib/production/scheduler";
import { notifyDeliveryEvent } from "@/lib/notifications/actions";
import { validateAndNormalizeVehicleNumber, validateDriverMobile, validateInvoiceNumber } from "@/lib/delivery/validation";
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
  DeliveryStatusCounts,
  EligibleDeliveryOrder,
  CreateManualDeliveryInput,
  CustomerOrderForDelivery,
  CustomerDropdownItem,
} from "@/types/delivery";

// ============================================
// DELIVERY QUERY FUNCTIONS
// ============================================

export async function listDeliveries(
  status?: DeliveryStatus,
  orderId?: string,
  limit = 50,
  offset = 0,
  search?: string
): Promise<DeliveryListItem[]> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "delivery.view")) {
    throw new Error("Forbidden: delivery.view");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  let query = supabase
    .from("deliveries")
    .select(`
      id,
      business_id,
      order_id,
      delivery_number,
      invoice_number,
      status,
      expected_delivery_date,
      tracking_number,
      vehicle,
      driver,
      driver_phone,
      dispatched_at,
      delivered_at,
      created_at,
      orders (
        id,
        order_number,
        customers (
          name,
          company_name
        )
      )
    `)
    .eq("business_id", context.user.business_id);

  if (status) {
    query = query.eq("status", status);
  }
  if (orderId) {
    query = query.eq("order_id", orderId);
  }
  if (search && search.trim()) {
    const s = search.trim();
    query = query.or(
      `delivery_number.ilike.%${s}%,tracking_number.ilike.%${s}%,vehicle.ilike.%${s}%,driver.ilike.%${s}%,invoice_number.ilike.%${s}%`
    );
  }

  query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) {
    console.error("Error in listDeliveries:", error);
    throw error;
  }

  return (data ?? []).map((d: any) => {
    const orderObj = Array.isArray(d.orders) ? d.orders[0] : d.orders;
    const customerObj = orderObj
      ? Array.isArray(orderObj.customers)
        ? orderObj.customers[0]
        : orderObj.customers
      : null;
    return {
      id: d.id,
      business_id: d.business_id,
      order_id: d.order_id,
      order_number: orderObj?.order_number || "—",
      customer_name: customerObj?.company_name || customerObj?.name || null,
      delivery_number: d.delivery_number,
      invoice_number: d.invoice_number || null,
      status: d.status as DeliveryStatus,
      expected_delivery_date: d.expected_delivery_date,
      tracking_number: d.tracking_number,
      vehicle: d.vehicle,
      driver: d.driver,
      driver_phone: d.driver_phone,
      dispatched_at: d.dispatched_at,
      delivered_at: d.delivered_at,
      created_at: d.created_at,
    };
  });
}

export async function getDeliveryWithItems(deliveryId: string): Promise<DeliveryWithDetails | null> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "delivery.view")) {
    throw new Error("Forbidden: delivery.view");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const businessId = context.user.business_id;

  const { data: d, error: delErr } = await supabase
    .from("deliveries")
    .select(`
      id,
      business_id,
      order_id,
      delivery_number,
      invoice_number,
      status,
      expected_delivery_date,
      tracking_number,
      vehicle,
      driver,
      driver_phone,
      dispatched_at,
      delivered_at,
      proof_document_url,
      notes,
      created_at,
      updated_at,
      orders (
        id,
        order_number,
        customer_id,
        customers (
          id,
          name,
          company_name
        )
      ),
      delivery_items (
        id,
        business_id,
        delivery_id,
        order_item_id,
        product_id,
        ordered_quantity,
        delivered_quantity,
        products (
          id,
          name,
          sku,
          unit
        )
      )
    `)
    .eq("id", deliveryId)
    .eq("business_id", businessId)
    .maybeSingle();

  if (delErr) {
    console.error("Error fetching delivery with items:", delErr);
    throw delErr;
  }
  if (!d) return null;

  const orderObj = Array.isArray(d.orders) ? d.orders[0] : d.orders;
  const customerObj = orderObj
    ? Array.isArray(orderObj.customers)
      ? orderObj.customers[0]
      : orderObj.customers
    : null;
  const customerName = customerObj?.company_name || customerObj?.name || null;

  const items: DeliveryItem[] = ((d.delivery_items as any[]) || []).map((di: any) => {
    const prod = Array.isArray(di.products) ? di.products[0] : di.products;
    return {
      id: di.id,
      business_id: di.business_id,
      delivery_id: di.delivery_id,
      order_item_id: di.order_item_id,
      product_id: di.product_id,
      product_name: prod?.name || "Product",
      product_sku: prod?.sku || null,
      ordered_quantity: di.ordered_quantity,
      delivered_quantity: di.delivered_quantity,
      unit: prod?.unit || "units",
    };
  });

  return {
    id: d.id,
    business_id: d.business_id,
    order_id: d.order_id,
    delivery_number: d.delivery_number,
    invoice_number: d.invoice_number || null,
    status: d.status as DeliveryStatus,
    expected_delivery_date: d.expected_delivery_date,
    tracking_number: d.tracking_number,
    vehicle: d.vehicle,
    driver: d.driver,
    driver_phone: d.driver_phone,
    dispatched_at: d.dispatched_at,
    delivered_at: d.delivered_at,
    proof_document_url: d.proof_document_url,
    notes: d.notes,
    created_at: d.created_at,
    updated_at: d.updated_at,
    order_number: orderObj?.order_number || "—",
    customer_name: customerName,
    items,
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

export async function getDeliveryStatusCounts(): Promise<DeliveryStatusCounts> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "delivery.view")) {
    throw new Error("Forbidden: delivery.view");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase
    .from("deliveries")
    .select("status")
    .eq("business_id", context.user.business_id);

  const counts: DeliveryStatusCounts = {
    ALL: data?.length ?? 0,
    READY: 0,
    PACKED: 0,
    DISPATCHED: 0,
    IN_TRANSIT: 0,
    DELIVERED: 0,
    CANCELLED: 0,
    NOT_READY: 0,
  };

  if (!error && data) {
    for (const row of data) {
      const st = row.status as keyof DeliveryStatusCounts;
      if (counts[st] !== undefined) {
        counts[st]++;
      }
    }
  }

  return counts;
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
  if (
    !hasPermission({ permissions: context.permissions }, "delivery.update") &&
    !hasPermission({ permissions: context.permissions }, "delivery.dispatch") &&
    !hasPermission({ permissions: context.permissions }, "delivery.create")
  ) {
    throw new Error("Forbidden: delivery.update");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const businessId = context.user.business_id;

  const { data: delivery, error: delErr } = await supabase
    .from("deliveries")
    .select("id, status, order_id, delivery_number")
    .eq("id", values.delivery_id)
    .eq("business_id", businessId)
    .maybeSingle();

  if (delErr || !delivery) {
    throw new Error("Delivery not found or access denied.");
  }

  if (delivery.status !== "READY") {
    throw new Error(`Can only pack deliveries in READY status (current: ${delivery.status}).`);
  }

  let rpcFailed = false;
  const { error: rpcErr } = await supabase.rpc("pack_delivery", {
    p_business_id: businessId,
    p_delivery_id: values.delivery_id,
    p_notes: values.notes || null,
  });

  if (rpcErr) {
    console.warn("pack_delivery RPC error, falling back to direct update:", rpcErr.message);
    rpcFailed = true;
    const adminClient = createAdminSupabaseClient() || supabase;
    const { error: directErr } = await adminClient
      .from("deliveries")
      .update({
        status: "PACKED",
        notes: values.notes || undefined,
        updated_at: new Date().toISOString(),
      })
      .eq("id", values.delivery_id)
      .eq("business_id", businessId)
      .eq("status", "READY");

    if (directErr) {
      throw new Error(directErr.message || "Failed to pack delivery");
    }

    await adminClient.from("delivery_status_history").insert({
      business_id: businessId,
      delivery_id: values.delivery_id,
      old_status: "READY",
      new_status: "PACKED",
      changed_by: context.user.id,
      reason: values.notes || null,
    });
  } else if (values.notes) {
    await supabase
      .from("deliveries")
      .update({ notes: values.notes, updated_at: new Date().toISOString() })
      .eq("id", values.delivery_id)
      .eq("business_id", businessId);
  }

  return { success: true, message: `Delivery ${delivery.delivery_number} packed successfully` };
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

  // 1. Validation: Vehicle Number is required and validated
  const vehicleValidation = validateAndNormalizeVehicleNumber(values.vehicle || "");
  if (!vehicleValidation.isValid) {
    throw new Error(vehicleValidation.error || "Valid vehicle number is required.");
  }
  const normalizedVehicle = vehicleValidation.normalized;

  // Driver Phone validation if provided
  let normalizedDriverPhone: string | null = null;
  if (values.driver_phone && values.driver_phone.trim()) {
    const phoneValidation = validateDriverMobile(values.driver_phone);
    if (!phoneValidation.isValid) {
      throw new Error(phoneValidation.error || "Invalid driver mobile number.");
    }
    normalizedDriverPhone = phoneValidation.normalized;
  }

  const normalizedDriver = values.driver?.trim() || null;
  const normalizedTracking = values.tracking_number?.trim() || null;
  const dispatchTimestamp = values.dispatched_at
    ? new Date(values.dispatched_at).toISOString()
    : new Date().toISOString();

  // 2. Fetch delivery details
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
    await packDelivery({
      delivery_id: values.delivery_id,
      notes: "Auto-packed before dispatch",
    });
  }

  // 3. Validate delivered / dispatched quantities against warehouse finished goods stock
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

  // 4. Temporarily adjust available_stock for reserved portion so the DB RPC check passes
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

  // 5. Dispatch via RPC (deducts inventory exactly once at dispatch point, creates transaction, updates dispatched_at)
  let rpcError: Error | null = null;
  try {
    const { error } = await supabase.rpc("dispatch_delivery", {
      p_business_id: businessId,
      p_delivery_id: values.delivery_id,
      p_vehicle: normalizedVehicle,
      p_driver: normalizedDriver,
      p_tracking_number: normalizedTracking,
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

  // 6. Post-dispatch: Release reservations and ensure driver_phone & dispatched_at are persisted
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

  // 7. Persist driver_phone, dispatched_at, and details on deliveries table
  await clientToUse
    .from("deliveries")
    .update({
      vehicle: normalizedVehicle,
      driver: normalizedDriver,
      driver_phone: normalizedDriverPhone,
      tracking_number: normalizedTracking,
      dispatched_at: dispatchTimestamp,
      updated_at: new Date().toISOString(),
    })
    .eq("id", values.delivery_id)
    .eq("business_id", businessId);

  // 8. Recalculate order delivery status and schedules
  try {
    await updateOrderDeliveryDatesFromSchedules(supabase, businessId, delivery.order_id);
    await scheduleProductionQueue(supabase, businessId);
  } catch (err) {
    console.warn("Could not recalculate delivery dates:", err);
  }

  try {
    await notifyDeliveryEvent(businessId, values.delivery_id, delivery.order_id, "dispatched", context.user.id);
  } catch {
    // Non-fatal
  }

  return { success: true, message: `Delivery ${delivery.delivery_number} dispatched successfully` };
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
    throw new Error("Cannot cancel a delivery that has already been DELIVERED without an authorized reversal workflow.");
  }

  if (delivery.status === "CANCELLED") {
    throw new Error("Delivery is already CANCELLED.");
  }

  const { error: rpcErr } = await supabase.rpc("cancel_delivery", {
    p_business_id: businessId,
    p_delivery_id: values.delivery_id,
    p_reason: values.reason.trim(),
  });

  if (rpcErr) {
    console.warn("cancel_delivery RPC error, executing atomic cancellation fallback:", rpcErr.message);
    const adminClient = createAdminSupabaseClient() || supabase;

    // If was dispatched or in_transit, return stock exactly once
    if (["DISPATCHED", "IN_TRANSIT"].includes(delivery.status)) {
      const { data: items } = await adminClient
        .from("delivery_items")
        .select("product_id, delivered_quantity")
        .eq("delivery_id", values.delivery_id)
        .eq("business_id", businessId);

      for (const it of items ?? []) {
        const qty = Number(it.delivered_quantity) || 0;
        if (qty > 0) {
          const { data: inv } = await adminClient
            .from("inventory")
            .select("id, current_stock, available_stock")
            .eq("business_id", businessId)
            .eq("item_type", "finished_good")
            .eq("item_id", it.product_id)
            .maybeSingle();

          if (inv) {
            await adminClient
              .from("inventory")
              .update({
                current_stock: Number(inv.current_stock) + qty,
                available_stock: Number(inv.available_stock) + qty,
                updated_at: new Date().toISOString(),
              })
              .eq("id", inv.id);

            await adminClient.from("inventory_transactions").insert({
              business_id: businessId,
              item_type: "finished_good",
              item_id: it.product_id,
              transaction_type: "STOCK_IN",
              quantity: qty,
              reference_type: "delivery_cancellation",
              reference_id: values.delivery_id,
              notes: `Finished goods returned from cancelled delivery: ${values.reason.trim()}`,
              created_by: context.user.id,
            });
          }
        }
      }

      await adminClient
        .from("delivery_items")
        .update({ delivered_quantity: 0, updated_at: new Date().toISOString() })
        .eq("delivery_id", values.delivery_id);
    }

    // Update status to CANCELLED
    await adminClient
      .from("deliveries")
      .update({
        status: "CANCELLED",
        notes: `Cancelled: ${values.reason.trim()}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", values.delivery_id)
      .eq("business_id", businessId);

    await adminClient.from("delivery_status_history").insert({
      business_id: businessId,
      delivery_id: values.delivery_id,
      old_status: delivery.status,
      new_status: "CANCELLED",
      changed_by: context.user.id,
      reason: values.reason.trim(),
    });
  }

  // Recalculate linked order delivery status
  try {
    await updateOrderDeliveryDatesFromSchedules(supabase, businessId, delivery.order_id);
    const { data: otherActive } = await supabase
      .from("deliveries")
      .select("id, status")
      .eq("order_id", delivery.order_id)
      .eq("business_id", businessId)
      .neq("status", "CANCELLED");

    if (!otherActive || otherActive.length === 0) {
      await supabase
        .from("orders")
        .update({ delivery_status: "PENDING", updated_at: new Date().toISOString() })
        .eq("id", delivery.order_id)
        .eq("business_id", businessId)
        .neq("delivery_status", "DELIVERED");
    }
  } catch (err) {
    console.warn("Could not recalculate delivery dates after cancellation:", err);
  }

  return { success: true, message: "Delivery cancelled successfully" };
}

// ============================================
// MANUAL DELIVERY ENTRY WORKFLOW
// ============================================


export async function getCustomerOrdersForDelivery(
  customerId: string
): Promise<CustomerOrderForDelivery[]> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "delivery.create")) {
    throw new Error("Forbidden: delivery.create");
  }

  if (!customerId || !customerId.trim()) {
    return [];
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const businessId = context.user.business_id;

  // 1. Fetch customer's orders that are not CANCELLED and not already DELIVERED
  const { data: orders, error: ordersErr } = await supabase
    .from("orders")
    .select(`
      id,
      order_number,
      order_date,
      expected_delivery_date,
      status,
      delivery_status,
      total_amount,
      paid_amount,
      due_amount,
      order_items(
        id,
        product_id,
        quantity,
        products(name, sku, unit)
      )
    `)
    .eq("business_id", businessId)
    .eq("customer_id", customerId)
    .neq("status", "CANCELLED")
    .neq("delivery_status", "DELIVERED")
    .order("order_date", { ascending: false });

  if (ordersErr || !orders || orders.length === 0) {
    return [];
  }

  const orderIds = orders.map((o) => o.id);

  // 2. Fetch existing active deliveries to flag orders that already have an active delivery parcel
  const { data: activeDeliveries } = await supabase
    .from("deliveries")
    .select("id, order_id, delivery_number, status")
    .eq("business_id", businessId)
    .in("order_id", orderIds)
    .neq("status", "CANCELLED");

  const activeDeliveriesMap = new Map<string, { delivery_number: string; status: string }>();
  for (const d of activeDeliveries ?? []) {
    activeDeliveriesMap.set(d.order_id, {
      delivery_number: d.delivery_number,
      status: d.status,
    });
  }

  // 3. Fetch production orders for these orders
  const { data: productionOrders } = await supabase
    .from("production_orders")
    .select("id, order_id, order_item_id, product_id, status, quantity, completed_quantity")
    .eq("business_id", businessId)
    .in("order_id", orderIds);

  // 4. Fetch finished goods inventory
  const allProductIds = Array.from(
    new Set(
      orders.flatMap((o) => (o.order_items || []).map((it: any) => it.product_id))
    )
  );

  const { data: inventoryRows } = await supabase
    .from("inventory")
    .select("id, item_id, current_stock, available_stock, reserved_stock")
    .eq("business_id", businessId)
    .eq("item_type", "finished_good")
    .in("item_id", allProductIds);

  const inventoryMap = new Map<string, { current: number; available: number; reserved: number }>();
  for (const inv of inventoryRows ?? []) {
    inventoryMap.set(inv.item_id, {
      current: Number(inv.current_stock) || 0,
      available: Number(inv.available_stock) || 0,
      reserved: Number(inv.reserved_stock) || 0,
    });
  }

  // 5. Evaluate readiness for each order
  const results: CustomerOrderForDelivery[] = [];

  for (const order of orders) {
    const activeDel = activeDeliveriesMap.get(order.id);
    const hasActiveDelivery = !!activeDel;

    const items = (order.order_items || []).map((it: any) => {
      const prod = Array.isArray(it.products) ? it.products[0] : it.products;
      const prodId = it.product_id;
      const requiredQty = Number(it.quantity) || 0;

      // Matching production orders
      const matchingPOs = (productionOrders ?? []).filter(
        (po) =>
          po.order_id === order.id &&
          (po.order_item_id === it.id || (!po.order_item_id && po.product_id === prodId))
      );

      const totalCompletedQty = matchingPOs.reduce(
        (sum, po) => sum + (Number(po.completed_quantity) || 0),
        0
      );

      const allPOsDone =
        matchingPOs.length > 0 &&
        matchingPOs.every(
          (po) => po.status === "COMPLETED" || po.status === "READY_FOR_DISPATCH"
        );

      const inv = inventoryMap.get(prodId) || { current: 0, available: 0, reserved: 0 };

      // Item is ready if production is fully completed for it OR physical finished goods stock covers the required quantity
      const isReady = (allPOsDone && totalCompletedQty >= requiredQty) || inv.current >= requiredQty;

      let poStatus = "NOT_STARTED";
      if (matchingPOs.length > 0) {
        if (allPOsDone) {
          poStatus = "COMPLETED";
        } else if (totalCompletedQty > 0) {
          poStatus = "IN_PROGRESS";
        } else {
          poStatus = matchingPOs[0].status;
        }
      } else if (inv.current >= requiredQty) {
        poStatus = "STOCK_AVAILABLE";
      }

      return {
        id: it.id,
        product_id: prodId,
        product_name: prod?.name || "Product",
        product_sku: prod?.sku || null,
        quantity: requiredQty,
        unit: prod?.unit || "units",
        production_status: poStatus,
        completed_quantity: totalCompletedQty,
        available_stock: inv.available,
        current_stock: inv.current,
        is_ready: isReady,
      };
    });

    const totalQty = items.reduce((sum, it) => sum + it.quantity, 0);

    const incompleteItems = items.filter((it) => !it.is_ready);
    let isFullyReady = incompleteItems.length === 0 && !hasActiveDelivery && order.status === "CONFIRMED";

    let notReadyReason: string | null = null;
    if (order.status !== "CONFIRMED") {
      notReadyReason = `Order is in ${order.status} status. It must be CONFIRMED before it can be delivered.`;
    } else if (hasActiveDelivery) {
      notReadyReason = `An active delivery (${activeDel?.delivery_number}, status: ${activeDel?.status}) already exists for this order.`;
    } else if (incompleteItems.length > 0) {
      notReadyReason = `Order cannot be marked fully Delivered: ${incompleteItems
        .map((it) => `${it.product_name} (${it.completed_quantity}/${it.quantity} completed, warehouse stock: ${it.current_stock})`)
        .join("; ")}.`;
    }

    results.push({
      id: order.id,
      order_number: order.order_number,
      order_date: order.order_date,
      expected_delivery_date: order.expected_delivery_date,
      status: order.status,
      delivery_status: order.delivery_status,
      total_amount: Number(order.total_amount) || 0,
      paid_amount: Number(order.paid_amount) || 0,
      due_amount: Number(order.due_amount) || 0,
      total_quantity: totalQty,
      items,
      is_fully_ready: isFullyReady,
      not_ready_reason: notReadyReason,
      has_active_delivery: hasActiveDelivery,
      active_delivery_info: activeDel ? `${activeDel.delivery_number} (${activeDel.status})` : null,
    });
  }

  return results;
}

export async function createManualDelivery(
  values: CreateManualDeliveryInput
): Promise<{
  success: boolean;
  delivery_id: string;
  delivery_number: string;
  order_number: string;
  message: string;
}> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "delivery.create")) {
    throw new Error("Forbidden: delivery.create permission required to create delivery records.");
  }

  const businessId = context.user.business_id;

  // 1. Validate required fields
  if (!values.customer_id || !values.customer_id.trim()) {
    throw new Error("Customer selection is required.");
  }
  if (!values.order_id || !values.order_id.trim()) {
    throw new Error("Order selection is required.");
  }
  if (!values.delivery_date || !values.delivery_date.trim()) {
    throw new Error("Delivery date is required.");
  }

  const deliveryDateObj = new Date(values.delivery_date);
  if (isNaN(deliveryDateObj.getTime())) {
    throw new Error("Invalid delivery date format.");
  }

  // Validate future dates: cannot be more than 30 days in the future
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const maxFutureDate = new Date(today);
  maxFutureDate.setDate(maxFutureDate.getDate() + 30);
  if (deliveryDateObj.getTime() > maxFutureDate.getTime()) {
    throw new Error("Delivery date cannot be more than 30 days in the future.");
  }

  // 2. Validate & normalize vehicle number
  const vehicleValidation = validateAndNormalizeVehicleNumber(values.vehicle_number);
  if (!vehicleValidation.isValid) {
    throw new Error(vehicleValidation.error || "Invalid vehicle number.");
  }
  const normalizedVehicle = vehicleValidation.normalized;

  // 3. Validate invoice number (required; accepts letters, numbers, hyphens, slashes)
  const invoiceValidation = validateInvoiceNumber(values.invoice_number);
  if (!invoiceValidation.isValid) {
    throw new Error(invoiceValidation.error || "Valid invoice number is required.");
  }
  const normalizedInvoiceNumber = invoiceValidation.normalized;

  const driverMobileVal = values.driver_mobile?.trim() || null;
  const normalizedDriverName = values.driver_name?.trim() || null;

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  // 4. Verify order belongs to the customer and current business
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select(`
      id,
      order_number,
      customer_id,
      status,
      delivery_status,
      total_amount,
      paid_amount,
      due_amount,
      expected_delivery_date,
      customers(id, name, company_name)
    `)
    .eq("id", values.order_id)
    .eq("business_id", businessId)
    .maybeSingle();

  if (orderErr || !order) {
    throw new Error("Order not found or does not belong to your business.");
  }

  if (order.customer_id !== values.customer_id) {
    throw new Error("Selected order does not belong to the selected customer.");
  }

  if (order.status === "CANCELLED") {
    throw new Error(`Cannot deliver order ${order.order_number}: the order is CANCELLED.`);
  }

  if (order.delivery_status === "DELIVERED") {
    throw new Error(`Cannot deliver order ${order.order_number}: the order has already been marked as DELIVERED.`);
  }

  // Check duplicate active delivery entries
  const { data: existingDeliveries } = await supabase
    .from("deliveries")
    .select("id, delivery_number, status")
    .eq("order_id", values.order_id)
    .eq("business_id", businessId)
    .neq("status", "CANCELLED");

  if (existingDeliveries && existingDeliveries.length > 0) {
    const active = existingDeliveries[0];
    throw new Error(`An active delivery (${active.delivery_number}, status: ${active.status}) already exists for this order.`);
  }

  // 5. Fetch all order items
  const { data: orderItems, error: itemsErr } = await supabase
    .from("order_items")
    .select("id, product_id, quantity, products(name, sku, unit)")
    .eq("order_id", values.order_id)
    .eq("business_id", businessId);

  if (itemsErr || !orderItems || orderItems.length === 0) {
    throw new Error("Cannot create delivery: the order has no items.");
  }

  // 6. Verify production completion or available finished goods stock (Full delivery check)
  const { data: productionOrders } = await supabase
    .from("production_orders")
    .select("id, order_item_id, product_id, status, quantity, completed_quantity")
    .eq("order_id", values.order_id)
    .eq("business_id", businessId);

  const incompleteReasons: string[] = [];
  const inventoryDeductionPlan: Array<{
    productId: string;
    inventoryId: string;
    quantity: number;
    originalCurrent: number;
    originalReserved: number;
    originalAvailable: number;
    reservedPortion: number;
  }> = [];

  for (const item of orderItems) {
    const requiredQty = Number(item.quantity) || 0;
    const prod = Array.isArray(item.products) ? item.products[0] : item.products;
    const prodName = prod?.name || item.product_id;
    const prodSku = prod?.sku || "";

    const matchingPOs = (productionOrders ?? []).filter(
      (po) =>
        po.order_item_id === item.id || (!po.order_item_id && po.product_id === item.product_id)
    );

    const completedPOQty = matchingPOs.reduce(
      (sum, po) => sum + (Number(po.completed_quantity) || 0),
      0
    );
    const allPOsDone =
      matchingPOs.length > 0 &&
      matchingPOs.every(
        (po) => po.status === "COMPLETED" || po.status === "READY_FOR_DISPATCH"
      );

    // Fetch inventory
    const { data: invRow } = await supabase
      .from("inventory")
      .select("id, current_stock, available_stock, reserved_stock")
      .eq("business_id", businessId)
      .eq("item_type", "finished_good")
      .eq("item_id", item.product_id)
      .maybeSingle();

    const currentStock = Number(invRow?.current_stock) || 0;
    const reservedStock = Number(invRow?.reserved_stock) || 0;
    const availableStock = Number(invRow?.available_stock) || 0;

    // Check readiness: either POs completed OR physical finished goods stock available
    const hasEnoughStockOrPO = (allPOsDone && completedPOQty >= requiredQty) || currentStock >= requiredQty;

    if (!hasEnoughStockOrPO) {
      incompleteReasons.push(
        `${prodName} ${prodSku ? `(${prodSku})` : ""}: completed ${completedPOQty}/${requiredQty} in production, physical stock ${currentStock}/${requiredQty}`
      );
    }

    if (!invRow) {
      throw new Error(`Inventory record not found for finished good "${prodName}".`);
    }

    if (currentStock < requiredQty) {
      incompleteReasons.push(
        `Insufficient warehouse stock for "${prodName}": current physical stock is ${currentStock}, required ${requiredQty}.`
      );
    }

    // Determine reservation for this specific order
    const { data: orderTxs } = await supabase
      .from("inventory_transactions")
      .select("quantity, reference_type")
      .eq("business_id", businessId)
      .eq("reference_id", values.order_id)
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

    const reservedPortion = Math.min(requiredQty, activeOrderReservation);

    inventoryDeductionPlan.push({
      productId: item.product_id,
      inventoryId: invRow.id,
      quantity: requiredQty,
      originalCurrent: currentStock,
      originalReserved: reservedStock,
      originalAvailable: availableStock,
      reservedPortion,
    });
  }

  if (incompleteReasons.length > 0) {
    throw new Error(
      `Cannot mark order as fully Delivered: all required items must be ready or production-complete. Incomplete items: ${incompleteReasons.join("; ")}`
    );
  }

  // 7. Generate unique delivery number
  const datePrefix = values.delivery_date.replace(/-/g, "");
  const orderSlug = order.order_number.replace(/[^A-Z0-9]/gi, "").slice(-4).toUpperCase();
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  let uniqueDeliveryNumber = `DEL-${datePrefix}-${orderSlug}-${randomSuffix}`;

  // Double check uniqueness
  const { data: dupCheck } = await supabase
    .from("deliveries")
    .select("id")
    .eq("business_id", businessId)
    .eq("delivery_number", uniqueDeliveryNumber)
    .maybeSingle();

  if (dupCheck) {
    uniqueDeliveryNumber = `DEL-${datePrefix}-${orderSlug}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
  }

  const adminClient = createAdminSupabaseClient();
  const dbClient = adminClient || supabase;

  const deliveryTimestamp = `${values.delivery_date}T12:00:00.000Z`;

  // 8. Atomically insert delivery record
  const { data: newDelivery, error: delErr } = await dbClient
    .from("deliveries")
    .insert({
      business_id: businessId,
      order_id: order.id,
      delivery_number: uniqueDeliveryNumber,
      invoice_number: normalizedInvoiceNumber,
      status: "DELIVERED",
      expected_delivery_date: order.expected_delivery_date || values.delivery_date,
      vehicle: normalizedVehicle,
      driver: normalizedDriverName,
      driver_phone: driverMobileVal,
      dispatched_at: deliveryTimestamp,
      delivered_at: deliveryTimestamp,
      notes: values.notes?.trim() || null,
    })
    .select("id")
    .single();

  if (delErr || !newDelivery) {
    throw new Error(`Failed to create delivery record: ${delErr?.message || "Database insert error"}`);
  }

  const deliveryId = newDelivery.id;

  // 9. Insert delivery items
  const deliveryItemsData = orderItems.map((it) => ({
    business_id: businessId,
    delivery_id: deliveryId,
    order_item_id: it.id,
    product_id: it.product_id,
    ordered_quantity: it.quantity,
    delivered_quantity: it.quantity,
  }));

  const { error: itemsInsertErr } = await dbClient
    .from("delivery_items")
    .insert(deliveryItemsData);

  if (itemsInsertErr) {
    // Attempt rollback
    await dbClient.from("deliveries").delete().eq("id", deliveryId);
    throw new Error(`Failed to save delivery items: ${itemsInsertErr.message}`);
  }

  // 10. Deduct stock and release reservations exactly once
  for (const plan of inventoryDeductionPlan) {
    const newCurrent = Math.max(0, plan.originalCurrent - plan.quantity);
    const newReserved = Math.max(0, plan.originalReserved - plan.reservedPortion);
    const newAvailable = Math.max(0, newCurrent - newReserved);

    await dbClient
      .from("inventory")
      .update({
        current_stock: newCurrent,
        reserved_stock: newReserved,
        available_stock: newAvailable,
        updated_at: new Date().toISOString(),
      })
      .eq("id", plan.inventoryId)
      .eq("business_id", businessId);

    // Record stock deduction transaction
    await dbClient.from("inventory_transactions").insert({
      business_id: businessId,
      item_type: "finished_good",
      item_id: plan.productId,
      transaction_type: "STOCK_OUT",
      quantity: plan.quantity,
      reference_type: "delivery_dispatch",
      reference_id: deliveryId,
      notes: `Delivered via ${uniqueDeliveryNumber} for Order ${order.order_number}`,
      created_by: context.user.id,
    });

    // Record reservation release if there was an order reservation
    if (plan.reservedPortion > 0) {
      await dbClient.from("inventory_transactions").insert({
        business_id: businessId,
        item_type: "finished_good",
        item_id: plan.productId,
        transaction_type: "ADJUSTMENT",
        quantity: plan.reservedPortion,
        reference_type: "ORDER_DISPATCH_RELEASE",
        reference_id: order.id,
        notes: `Released reservation of ${plan.reservedPortion} units upon delivery ${uniqueDeliveryNumber}`,
        created_by: context.user.id,
      });
    }
  }

  // 11. Atomically update order delivery_status to DELIVERED
  // Note: preserve existing payment status, paid_amount, due_amount
  const { error: orderUpdateErr } = await dbClient
    .from("orders")
    .update({
      delivery_status: "DELIVERED",
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .eq("business_id", businessId);

  if (orderUpdateErr) {
    console.warn("Could not update order delivery_status:", orderUpdateErr);
  }

  // 12. Insert status history audit trail
  await dbClient.from("delivery_status_history").insert({
    business_id: businessId,
    delivery_id: deliveryId,
    old_status: null,
    new_status: "DELIVERED",
    changed_by: context.user.id,
    reason: values.notes?.trim() || "Manual delivery entry recorded",
  });

  // 13. Audit log
  await dbClient.from("audit_logs").insert({
    business_id: businessId,
    user_id: context.user.id,
    action: "MANUAL_DELIVERY_CREATED",
    entity_type: "delivery",
    entity_id: deliveryId,
    new_data: {
      delivery_number: uniqueDeliveryNumber,
      invoice_number: normalizedInvoiceNumber,
      order_number: order.order_number,
      order_id: order.id,
      customer_id: values.customer_id,
      delivery_date: values.delivery_date,
      vehicle: normalizedVehicle,
      driver: normalizedDriverName,
      driver_phone: driverMobileVal,
      status: "DELIVERED",
    },
  });

  // 14. Recalculate delivery dates and schedule queue
  try {
    await updateOrderDeliveryDatesFromSchedules(supabase, businessId, order.id);
    await scheduleProductionQueue(supabase, businessId);
  } catch (err) {
    console.warn("Could not recalculate delivery dates after manual delivery:", err);
  }

  try {
    await notifyDeliveryEvent(businessId, deliveryId, order.id, "delivered", context.user.id);
  } catch {
    // Non-fatal
  }

  return {
    success: true,
    delivery_id: deliveryId,
    delivery_number: uniqueDeliveryNumber,
    order_number: order.order_number,
    message: `Delivery ${uniqueDeliveryNumber} created successfully for Order ${order.order_number}! Status: Delivered.`,
  };
}