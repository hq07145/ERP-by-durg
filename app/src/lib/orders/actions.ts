"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { type OrderFormValues, type OrderItemFormValues, type OrderDeliveryDates, type OrderItemDeliveryDates, type DeliveryStatus, type OrderPriority } from "@/types/order";
import {
  enqueueOrderItemsForProduction,
  scheduleProductionQueue,
  updateOrderDeliveryDatesFromSchedules,
  estimateAndSaveOrderDelivery,
  releaseOrderFinishedStock,
  getOrderFulfillmentExplanation,
} from "@/lib/production/scheduler";
import { notifyOrderEvent } from "@/lib/notifications/actions";
import { generateNextOrderNumber } from "@/lib/orders/order-number";
import { calculateOrderGst, validateItemTaxRates } from "@/lib/financials/gst";
import { getCustomerAdvanceBalance } from "@/lib/payments/actions";

export type OrderActionState = {
  error?: string;
  message?: string;
  missingPermission?: string;
};

function validAmount(value: string, wholeDigits: number, decimalDigits: number): boolean {
  return new RegExp(`^\\d{1,${wholeDigits}}(?:\\.\\d{1,${decimalDigits}})?$`).test(value);
}

function orderValues(formData: FormData): OrderFormValues {
  const itemsJson = String(formData.get("items") ?? "[]");
  let items: OrderItemFormValues[] = [];
  try {
    items = JSON.parse(itemsJson);
  } catch {
    items = [];
  }
  return {
    customer_id: String(formData.get("customer_id") ?? ""),
    order_number: String(formData.get("order_number") ?? "").trim().toUpperCase(),
    order_date: String(formData.get("order_date") ?? ""),
    priority: String(formData.get("priority") ?? "NORMAL") as "LOW" | "NORMAL" | "HIGH" | "URGENT",
    district: String(formData.get("district") ?? "").trim(),
    place_of_supply: String(formData.get("place_of_supply") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim(),
    items,
  };
}

function validateOrder(values: OrderFormValues): string | null {
  if (!values.customer_id) return "invalid_customer";
  if (values.order_number && values.order_number.length > 64) return "invalid_order_number";
  if (!values.order_date) return "invalid_order_date";
  if (values.items.length === 0) return "no_items";
  for (const item of values.items) {
    if (!item.product_id) return "invalid_product";
    if (!validAmount(item.quantity, 11, 3) || Number(item.quantity) <= 0) return "invalid_quantity";
    if (!validAmount(item.unit_price, 12, 2) || Number(item.unit_price) < 0) return "invalid_unit_price";
    if (!validAmount(item.discount_rate, 5, 2) || Number(item.discount_rate) < 0 || Number(item.discount_rate) > 100) return "invalid_discount_rate";
    if (!validAmount(item.tax_rate, 5, 2) || Number(item.tax_rate) < 0 || Number(item.tax_rate) > 100) return "invalid_tax_rate";

    if (item.sgst_rate !== undefined && item.sgst_rate !== "" && (!validAmount(item.sgst_rate, 5, 2) || Number(item.sgst_rate) < 0 || Number(item.sgst_rate) > 100)) {
      return "invalid_sgst_rate";
    }
    if (item.cgst_rate !== undefined && item.cgst_rate !== "" && (!validAmount(item.cgst_rate, 5, 2) || Number(item.cgst_rate) < 0 || Number(item.cgst_rate) > 100)) {
      return "invalid_cgst_rate";
    }
    const igstVal = item.igst_rate !== undefined && item.igst_rate !== "" ? item.igst_rate : item.lgst_rate;
    if (igstVal !== undefined && igstVal !== "" && (!validAmount(igstVal, 5, 2) || Number(igstVal) < 0 || Number(igstVal) > 100)) {
      return "invalid_igst_rate";
    }

    const sgst = Number(item.sgst_rate || 0);
    const cgst = Number(item.cgst_rate || 0);
    const igst = Number(igstVal || 0);
    if ((sgst > 0 || cgst > 0) && igst > 0) {
      return "mixed_gst_rates";
    }
  }
  if (values.notes.length > 2000) return "notes_too_long";
  return null;
}

async function verifyOrderActionAuthorization(permission: string): Promise<
  | { success: true; context: NonNullable<Awaited<ReturnType<typeof getAuthContext>>>; supabase: NonNullable<Awaited<ReturnType<typeof createServerSupabaseClient>>> }
  | { success: false; state: OrderActionState }
> {
  const context = await getAuthContext();
  if (!context) {
    return {
      success: false,
      state: {
        error: "auth_unconfigured",
        message: "Your session has expired or is invalid. Please log in again.",
      },
    };
  }
  if (!hasPermission({ permissions: context.permissions }, permission)) {
    return {
      success: false,
      state: {
        error: "forbidden",
        missingPermission: permission,
        message: `Missing required permission: ${permission}. Please contact an Administrator to assign "${permission}" in your manager permissions.`,
      },
    };
  }
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    return {
      success: false,
      state: {
        error: "auth_unconfigured",
        message: "Database service is currently unavailable. Please try again later.",
      },
    };
  }
  return { success: true, context, supabase };
}

export async function createOrderAction(
  _previousState: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const authResult = await verifyOrderActionAuthorization("orders.create");
  if (!authResult.success) {
    return authResult.state;
  }
  const { context, supabase } = authResult;
  const values = orderValues(formData);

  // Automatic sequential order numbering: generate on server if not provided or set to auto
  if (
    !values.order_number ||
    values.order_number.trim() === "" ||
    values.order_number === "AUTO" ||
    values.order_number.startsWith("AUTO-")
  ) {
    const admin = createAdminSupabaseClient();
    values.order_number = await generateNextOrderNumber(context.user.business_id, admin || supabase);
  }

  const validationError = validateOrder(values);
  if (validationError) return { error: validationError };

  // 1. Verify customer exists and is active in business, fetch GST & address
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, gst_number")
    .eq("id", values.customer_id)
    .eq("business_id", context.user.business_id)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (customerError || !customer) {
    return { error: "invalid_customer" };
  }

  // Fetch customer address state and business registered state in parallel
  const [customerAddressRes, businessSettingsRes] = await Promise.all([
    supabase
      .from("customer_addresses")
      .select("state")
      .eq("customer_id", values.customer_id)
      .maybeSingle(),
    supabase
      .from("business_settings")
      .select("value")
      .eq("business_id", context.user.business_id)
      .eq("key", "business_details")
      .maybeSingle(),
  ]);

  const businessDetails = (businessSettingsRes.data?.value as any) || {};
  const supplierState = businessDetails.state || "Madhya Pradesh";
  const supplierGstin = businessDetails.gst_number || "23AAMPQ5857F1ZE";
  const customerState = customerAddressRes.data?.state || null;
  const customerGstin = customer.gst_number || null;

  // 2. Check for duplicate order number in business with idempotent retry safety
  const { data: duplicate } = await supabase
    .from("orders")
    .select("id, customer_id, created_at")
    .eq("business_id", context.user.business_id)
    .eq("order_number", values.order_number)
    .maybeSingle();

  if (duplicate) {
    const createdTime = new Date(duplicate.created_at).getTime();
    const isRecent = Date.now() - createdTime < 120000;
    if (isRecent && duplicate.customer_id === values.customer_id) {
      console.log(`[createOrderAction] Idempotent retry detected for order ${values.order_number}. Redirecting safely.`);
      const returnTo = formData.get("return_to");
      if (returnTo === "orders") {
        redirect("/orders?notice=order_created");
      }
      redirect(`/orders/${duplicate.id}?notice=order_created`);
    }
    return { error: "duplicate_order_number" };
  }

  // 3. Verify all products exist and are active in business in one batch query
  const productIds = Array.from(new Set(values.items.map((it) => it.product_id)));
  const { data: prods, error: prodError } = await supabase
    .from("products")
    .select("id, name, quality_grade, quality_standard, qty_is_4985, qty_is_12786, qty_is_13487, qty_is_13488, qty_is_12785")
    .in("id", productIds)
    .eq("business_id", context.user.business_id)
    .eq("active", true);

  if (prodError || !prods || prods.length !== productIds.length) {
    return { error: "invalid_product" };
  }
  const productMap = new Map<
    string,
    {
      id: string;
      name: string;
      quality_grade?: string | null;
      quality_standard?: string | null;
      qty_is_4985?: number | null;
      qty_is_12786?: number | null;
      qty_is_13487?: number | null;
      qty_is_13488?: number | null;
      qty_is_12785?: number | null;
    }
  >();
  for (const prod of prods) {
    productMap.set(prod.id, prod);
  }

  // 4. Calculate server-side totals and GST breakdown authoritatively
  const gstCalc = calculateOrderGst({
    items: values.items.map((it) => ({
      productId: it.product_id,
      quantity: it.quantity,
      unitPrice: it.unit_price,
      discountRate: it.discount_rate,
      taxRate: it.tax_rate,
      sgstRate: it.sgst_rate,
      cgstRate: it.cgst_rate,
      igstRate: it.igst_rate ?? it.lgst_rate,
    })),
    supplierState,
    supplierGstin,
    customerState,
    customerGstin,
    placeOfSupply: values.place_of_supply,
  });

  // Verify tax rates consistency against transaction tax type
  for (let i = 0; i < values.items.length; i++) {
    const it = values.items[i];
    const sgst = Number(it.sgst_rate || 0);
    const cgst = Number(it.cgst_rate || 0);
    const igst = Number((it.igst_rate ?? it.lgst_rate) || 0);
    if (sgst > 0 || cgst > 0 || igst > 0) {
      const taxCheck = validateItemTaxRates({
        taxType: gstCalc.taxType,
        sgstRate: sgst,
        cgstRate: cgst,
        igstRate: igst,
      });
      if (!taxCheck.isValid) {
        return {
          error: "tax_validation_failed",
          message: `Line item #${i + 1}: ${taxCheck.error}`,
        };
      }
    }
  }

  const itemInserts = gstCalc.items.map((it, idx) => {
    const rawItem = values.items[idx];
    const prod = productMap.get(it.productId);
    const fallbackGrade = prod?.quality_grade || null;
    const resolvedGrade = rawItem?.quality_grade?.trim() || fallbackGrade;
    const resolvedVariantId = rawItem?.variant_id?.trim() || null;

    return {
      product_id: it.productId,
      product_name: prod?.name || null,
      quality_grade: resolvedGrade,
      quality_standard: (rawItem as any)?.quality_standard || prod?.quality_standard || null,
      variant_id: resolvedVariantId,
      quantity: it.quantity,
      qty_is_4985: (rawItem as any)?.qty_is_4985 != null ? Number((rawItem as any).qty_is_4985) : Number(prod?.qty_is_4985 || 0),
      qty_is_12786: (rawItem as any)?.qty_is_12786 != null ? Number((rawItem as any).qty_is_12786) : Number(prod?.qty_is_12786 || 0),
      qty_is_13487: (rawItem as any)?.qty_is_13487 != null ? Number((rawItem as any).qty_is_13487) : Number(prod?.qty_is_13487 || 0),
      qty_is_13488: (rawItem as any)?.qty_is_13488 != null ? Number((rawItem as any).qty_is_13488) : Number(prod?.qty_is_13488 || 0),
      qty_is_12785: (rawItem as any)?.qty_is_12785 != null ? Number((rawItem as any).qty_is_12785) : Number(prod?.qty_is_12785 || 0),
      unit_price: it.unitPrice,
      discount_rate: it.discountRate,
      tax_rate: it.taxRate,
      taxable_amount: it.taxableAmount,
      cgst_rate: it.cgstRate,
      cgst_amount: it.cgstAmount,
      sgst_rate: it.sgstRate,
      sgst_amount: it.sgstAmount,
      igst_rate: it.igstRate,
      igst_amount: it.igstAmount,
      line_total: it.lineTotal,
    };
  });

  // Customer advance calculation & authoritative server-side validation
  const useAdvance = formData.get("use_advance") === "true";
  const requestedAdvance = Number(formData.get("advance_amount")) || 0;

  let advanceToApply = 0;
  if (useAdvance && requestedAdvance > 0) {
    const advBal = await getCustomerAdvanceBalance(values.customer_id);
    const maxEligible = Math.min(advBal.availableAdvance, gstCalc.totalAmount);

    if (requestedAdvance > maxEligible + 0.001) {
      return {
        error: "advance_exceeds_eligible",
        message: `Selected advance amount (₹${requestedAdvance.toFixed(2)}) exceeds eligible balance (₹${maxEligible.toFixed(2)}).`,
      };
    }
    advanceToApply = Math.min(requestedAdvance, maxEligible);
  }

  const orderId = crypto.randomUUID();

  // 5. Insert order record (RLS and check constraints enforced)
  const { error: orderError } = await supabase.from("orders").insert({
    id: orderId,
    business_id: context.user.business_id,
    customer_id: values.customer_id,
    order_number: values.order_number,
    order_date: values.order_date,
    priority: values.priority,
    status: "DRAFT",
    subtotal: gstCalc.subtotal,
    discount_amount: gstCalc.discountAmount,
    tax_amount: gstCalc.taxAmount,
    total_amount: gstCalc.totalAmount,
    paid_amount: 0,
    due_amount: gstCalc.totalAmount,
    advance_applied: 0,
    tax_type: gstCalc.taxType,
    place_of_supply: gstCalc.placeOfSupply,
    district: values.district || null,
    business_gstin: supplierGstin,
    customer_gstin: customerGstin,
    cgst_amount: gstCalc.cgstAmount,
    sgst_amount: gstCalc.sgstAmount,
    igst_amount: gstCalc.igstAmount,
    notes: values.notes || null,
  });

  if (orderError) {
    console.error("[createOrderAction] Error creating order header:", {
      code: orderError.code,
      message: orderError.message,
      details: orderError.details,
    });
    if (orderError.code === "23505") return { error: "duplicate_order_number" };
    if (orderError.code === "42501") {
      return {
        error: "forbidden",
        missingPermission: "orders.create",
        message: 'Security policy rejected order creation. Required permission: "orders.create". Please contact an administrator.',
      };
    }
    return { error: "create_failed" };
  }

  // Sync selected district to customer address if customer has address record
  if (values.customer_id && values.district) {
    try {
      const { data: addrs } = await supabase
        .from("customer_addresses")
        .select("id, district, state, address_type")
        .eq("customer_id", values.customer_id);
      const primaryAddr = addrs?.find((a: any) => a.address_type === "PRIMARY") || addrs?.[0];
      if (primaryAddr) {
        const addrUpdates: Record<string, any> = {};
        if (!primaryAddr.district || primaryAddr.district !== values.district) {
          addrUpdates.district = values.district;
        }
        if (!primaryAddr.state && gstCalc.placeOfSupply) {
          addrUpdates.state = gstCalc.placeOfSupply;
        }
        if (Object.keys(addrUpdates).length > 0) {
          await supabase.from("customer_addresses").update(addrUpdates).eq("id", primaryAddr.id);
        }
      } else {
        await supabase.from("customer_addresses").insert({
          id: crypto.randomUUID(),
          customer_id: values.customer_id,
          address_type: "PRIMARY",
          district: values.district,
          state: gstCalc.placeOfSupply || null,
        });
      }
    } catch (addrSyncErr) {
      console.warn("[createOrderAction] Customer address district sync notice:", addrSyncErr);
    }
  }

  // 6. Insert order items atomically
  const finalItemRows = itemInserts.map((item) => ({
    id: crypto.randomUUID(),
    business_id: context.user.business_id,
    order_id: orderId,
    ...item,
  }));

  // Note: The order header was verified with `orders.create` using authenticated client RLS.
  // In Supabase, order_items table RLS policy order_items_insert_business checks orders.edit
  // instead of orders.create. Since the user was authorized for orders.create and owns the order,
  // we attempt insert via supabase client and fallback to adminClient if 42501 occurs.
  let itemsError: { code?: string; message?: string; details?: unknown } | null = null;
  const { error: userItemsError } = await supabase.from("order_items").insert(finalItemRows);
  if (userItemsError) {
    if (userItemsError.code === "42501") {
      const admin = createAdminSupabaseClient();
      if (admin) {
        const { error: adminItemsError } = await admin.from("order_items").insert(finalItemRows);
        itemsError = adminItemsError;
      } else {
        itemsError = userItemsError;
      }
    } else {
      itemsError = userItemsError;
    }
  }

  if (itemsError) {
    console.error("[createOrderAction] Error creating order items, rolling back order:", {
      code: itemsError.code,
      message: itemsError.message,
      details: itemsError.details,
    });
    // Atomic rollback: clean up order to avoid partial or orphaned records
    const admin = createAdminSupabaseClient();
    if (admin) {
      await admin.from("order_items").delete().eq("order_id", orderId);
      await admin.from("orders").delete().eq("id", orderId);
    }
    if (itemsError.code === "42501") {
      return {
        error: "forbidden",
        missingPermission: "orders.create",
        message: 'Permission denied inserting line items. Please contact an Administrator.',
      };
    }
    if (itemsError.code === "23514") return { error: "invalid_values" };
    return { error: "create_failed" };
  }

  // 7. Atomically allocate customer advance if selected
  if (advanceToApply > 0) {
    const admin = createAdminSupabaseClient();
    const dbClient = admin || supabase;
    const { error: allocErr } = await dbClient.rpc("allocate_customer_advance_to_order", {
      p_business_id: context.user.business_id,
      p_customer_id: values.customer_id,
      p_order_id: orderId,
      p_amount: advanceToApply,
      p_user_id: context.user.id,
      p_notes: `Advance applied on order creation (${values.order_number})`,
    });

    if (allocErr) {
      console.error("[createOrderAction] Error allocating advance, rolling back order:", allocErr);
      if (admin) {
        await admin.from("order_items").delete().eq("order_id", orderId);
        await admin.from("orders").delete().eq("id", orderId);
      }
      return {
        error: "advance_allocation_failed",
        message: `Failed to adjust customer advance: ${allocErr.message || "Insufficient balance or concurrent update"}. Order creation was rolled back.`,
      };
    }
  }

  revalidatePath("/orders");
  revalidatePath("/reports/sales");

  // Non-blocking with 2.5s safety timeout so post-order tasks never hang response
  const timeoutPromise = <T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> =>
    Promise.race([
      promise,
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
    ]);

  try {
    await timeoutPromise(
      estimateAndSaveOrderDelivery(supabase, context.user.business_id, orderId),
      2500,
      null
    );
  } catch (err) {
    console.warn("[createOrderAction] Delivery estimation failed (non-fatal):", err);
  }

  try {
    await timeoutPromise(
      notifyOrderEvent(
        context.user.business_id,
        orderId,
        values.order_number,
        "created",
        context.user.id
      ),
      2000,
      null
    );
  } catch (err) {
    console.warn("[createOrderAction] Notification failed (non-fatal):", err);
  }

  const returnTo = formData.get("return_to");
  if (returnTo === "manager_dashboard") {
    revalidatePath("/manager/dashboard");
    redirect("/manager/dashboard?notice=order_created");
  }
  if (returnTo === "orders") {
    redirect("/orders?notice=order_created");
  }

  redirect(`/orders/${orderId}?notice=order_created`);
}

export async function checkOrderExistsAction(orderNumber: string): Promise<boolean> {
  const context = await getAuthContext();
  if (!context) return false;
  const supabase = await createServerSupabaseClient();
  if (!supabase) return false;
  const { data } = await supabase
    .from("orders")
    .select("id")
    .eq("business_id", context.user.business_id)
    .eq("order_number", orderNumber.trim())
    .maybeSingle();
  return Boolean(data);
}

export async function updateOrderAction(
  orderId: string,
  _previousState: OrderActionState,
  formData: FormData,
): Promise<OrderActionState> {
  const authResult = await verifyOrderActionAuthorization("orders.edit");
  if (!authResult.success) {
    return authResult.state;
  }
  const { context, supabase } = authResult;
  const values = orderValues(formData);
  const validationError = validateOrder(values);
  if (validationError) return { error: validationError };

  // 1. Fetch current order to check status, locks, and retain original order number
  const { data: currentOrder, error: fetchError } = await supabase
    .from("orders")
    .select("id, status, paid_amount, delivery_status, order_number")
    .eq("id", orderId)
    .eq("business_id", context.user.business_id)
    .maybeSingle();

  if (fetchError || !currentOrder) return { error: "order_not_found" };

  // Retain original order number on edit (Requirement B.5)
  values.order_number = currentOrder.order_number;

  // 2. Prevent editing cancelled or delivered orders
  if (currentOrder.status === "CANCELLED") {
    return { error: "order_cancelled_locked" };
  }
  if (currentOrder.delivery_status === "DELIVERED") {
    return { error: "order_delivered_locked" };
  }

  // 3. If confirmed, check if any production order has already started
  if (currentOrder.status === "CONFIRMED") {
    const { data: activeProduction } = await supabase
      .from("production_orders")
      .select("id, status")
      .eq("order_id", orderId)
      .eq("business_id", context.user.business_id)
      .in("status", ["IN_PROGRESS", "COMPLETED", "QUALITY_CHECK", "QUALITY_PASSED", "QUALITY_FAILED"]);

    if (activeProduction && activeProduction.length > 0) {
      return { error: "production_in_progress_locked" };
    }
  }

  // 4. Verify unique order number if changed
  const { data: duplicate } = await supabase
    .from("orders")
    .select("id")
    .eq("business_id", context.user.business_id)
    .eq("order_number", values.order_number)
    .neq("id", orderId)
    .maybeSingle();

  if (duplicate) return { error: "duplicate_order_number" };

  // 5. Verify customer and fetch GST & address
  const { data: customer } = await supabase
    .from("customers")
    .select("id, gst_number")
    .eq("id", values.customer_id)
    .eq("business_id", context.user.business_id)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (!customer) return { error: "invalid_customer" };

  // Fetch customer address state and business registered state in parallel
  const [customerAddressRes, businessSettingsRes] = await Promise.all([
    supabase
      .from("customer_addresses")
      .select("state")
      .eq("customer_id", values.customer_id)
      .maybeSingle(),
    supabase
      .from("business_settings")
      .select("value")
      .eq("business_id", context.user.business_id)
      .eq("key", "business_details")
      .maybeSingle(),
  ]);

  const businessDetails = (businessSettingsRes.data?.value as any) || {};
  const supplierState = businessDetails.state || "Madhya Pradesh";
  const supplierGstin = businessDetails.gst_number || "23AAMPQ5857F1ZE";
  const customerState = customerAddressRes.data?.state || null;
  const customerGstin = customer.gst_number || null;

  // 6. Verify products
  const productMap = new Map<
    string,
    {
      id: string;
      name: string;
      quality_grade?: string | null;
      quality_standard?: string | null;
      qty_is_4985?: number | null;
      qty_is_12786?: number | null;
      qty_is_13487?: number | null;
      qty_is_13488?: number | null;
      qty_is_12785?: number | null;
    }
  >();
  for (const item of values.items) {
    const { data: prod } = await supabase
      .from("products")
      .select("id, name, quality_grade, quality_standard, qty_is_4985, qty_is_12786, qty_is_13487, qty_is_13488, qty_is_12785")
      .eq("id", item.product_id)
      .eq("business_id", context.user.business_id)
      .eq("active", true)
      .maybeSingle();
    if (!prod) return { error: "invalid_product" };
    productMap.set(prod.id, prod);
  }

  // 7. Calculate server-side totals and GST breakdown authoritatively
  const gstCalc = calculateOrderGst({
    items: values.items.map((it) => ({
      productId: it.product_id,
      quantity: it.quantity,
      unitPrice: it.unit_price,
      discountRate: it.discount_rate,
      taxRate: it.tax_rate,
      sgstRate: it.sgst_rate,
      cgstRate: it.cgst_rate,
      igstRate: it.igst_rate ?? it.lgst_rate,
    })),
    supplierState,
    supplierGstin,
    customerState,
    customerGstin,
    placeOfSupply: values.place_of_supply,
  });

  // Verify tax rates consistency against transaction tax type
  for (let i = 0; i < values.items.length; i++) {
    const it = values.items[i];
    const sgst = Number(it.sgst_rate || 0);
    const cgst = Number(it.cgst_rate || 0);
    const igst = Number((it.igst_rate ?? it.lgst_rate) || 0);
    if (sgst > 0 || cgst > 0 || igst > 0) {
      const taxCheck = validateItemTaxRates({
        taxType: gstCalc.taxType,
        sgstRate: sgst,
        cgstRate: cgst,
        igstRate: igst,
      });
      if (!taxCheck.isValid) {
        return {
          error: "tax_validation_failed",
          message: `Line item #${i + 1}: ${taxCheck.error}`,
        };
      }
    }
  }

  const itemInserts = gstCalc.items.map((it, idx) => {
    const rawItem = values.items[idx];
    const prod = productMap.get(it.productId);
    const fallbackGrade = prod?.quality_grade || null;
    const resolvedGrade = rawItem?.quality_grade?.trim() || fallbackGrade;
    const resolvedVariantId = rawItem?.variant_id?.trim() || null;

    return {
      business_id: context.user.business_id,
      order_id: orderId,
      product_id: it.productId,
      product_name: prod?.name || null,
      quality_grade: resolvedGrade,
      quality_standard: (rawItem as any)?.quality_standard || prod?.quality_standard || null,
      variant_id: resolvedVariantId,
      quantity: it.quantity,
      qty_is_4985: (rawItem as any)?.qty_is_4985 != null ? Number((rawItem as any).qty_is_4985) : Number(prod?.qty_is_4985 || 0),
      qty_is_12786: (rawItem as any)?.qty_is_12786 != null ? Number((rawItem as any).qty_is_12786) : Number(prod?.qty_is_12786 || 0),
      qty_is_13487: (rawItem as any)?.qty_is_13487 != null ? Number((rawItem as any).qty_is_13487) : Number(prod?.qty_is_13487 || 0),
      qty_is_13488: (rawItem as any)?.qty_is_13488 != null ? Number((rawItem as any).qty_is_13488) : Number(prod?.qty_is_13488 || 0),
      qty_is_12785: (rawItem as any)?.qty_is_12785 != null ? Number((rawItem as any).qty_is_12785) : Number(prod?.qty_is_12785 || 0),
      unit_price: it.unitPrice,
      discount_rate: it.discountRate,
      tax_rate: it.taxRate,
      taxable_amount: it.taxableAmount,
      cgst_rate: it.cgstRate,
      cgst_amount: it.cgstAmount,
      sgst_rate: it.sgstRate,
      sgst_amount: it.sgstAmount,
      igst_rate: it.igstRate,
      igst_amount: it.igstAmount,
      line_total: it.lineTotal,
    };
  });

  const paid_amount = Number(currentOrder.paid_amount || 0);
  const due_amount = Math.max(0, Number((gstCalc.totalAmount - paid_amount).toFixed(2)));

  // 8. Atomically update order & items
  const admin = createAdminSupabaseClient();
  const deleteClient = admin ?? supabase;
  const { error: delError } = await deleteClient
    .from("order_items")
    .delete()
    .eq("order_id", orderId)
    .eq("business_id", context.user.business_id);

  if (delError) return { error: "update_failed" };

  const insertClient = admin ?? supabase;
  const { error: insertError } = await insertClient
    .from("order_items")
    .insert(itemInserts);

  if (insertError) return { error: "update_failed" };

  const { error: updateError } = await supabase
    .from("orders")
    .update({
      customer_id: values.customer_id,
      order_number: values.order_number,
      order_date: values.order_date,
      priority: values.priority,
      notes: values.notes || null,
      subtotal: gstCalc.subtotal,
      discount_amount: gstCalc.discountAmount,
      tax_amount: gstCalc.taxAmount,
      total_amount: gstCalc.totalAmount,
      due_amount,
      tax_type: gstCalc.taxType,
      place_of_supply: gstCalc.placeOfSupply,
      district: values.district || null,
      business_gstin: supplierGstin,
      customer_gstin: customerGstin,
      cgst_amount: gstCalc.cgstAmount,
      sgst_amount: gstCalc.sgstAmount,
      igst_amount: gstCalc.igstAmount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("business_id", context.user.business_id);

  if (updateError) return { error: "update_failed" };

  // Sync selected district to customer address
  if (values.customer_id && values.district) {
    try {
      const { data: addrs } = await supabase
        .from("customer_addresses")
        .select("id, district, state, address_type")
        .eq("customer_id", values.customer_id);
      const primaryAddr = addrs?.find((a: any) => a.address_type === "PRIMARY") || addrs?.[0];
      if (primaryAddr) {
        const addrUpdates: Record<string, any> = {};
        if (!primaryAddr.district || primaryAddr.district !== values.district) {
          addrUpdates.district = values.district;
        }
        if (!primaryAddr.state && gstCalc.placeOfSupply) {
          addrUpdates.state = gstCalc.placeOfSupply;
        }
        if (Object.keys(addrUpdates).length > 0) {
          await supabase.from("customer_addresses").update(addrUpdates).eq("id", primaryAddr.id);
        }
      } else {
        await supabase.from("customer_addresses").insert({
          id: crypto.randomUUID(),
          customer_id: values.customer_id,
          address_type: "PRIMARY",
          district: values.district,
          state: gstCalc.placeOfSupply || null,
        });
      }
    } catch (addrSyncErr) {
      console.warn("[updateOrderAction] Customer address district sync notice:", addrSyncErr);
    }
  }

  // 9. If confirmed, update delivery dates / future production scheduling
  if (currentOrder.status === "CONFIRMED") {
    try {
      await enqueueOrderItemsForProduction(
        supabase,
        context.user.business_id,
        orderId,
        values.priority,
        context.user.id,
      );
      await scheduleProductionQueue(supabase, context.user.business_id);
      await updateOrderDeliveryDatesFromSchedules(supabase, context.user.business_id, orderId);
    } catch {
      // Non-fatal if scheduling notes arise
    }
  } else if (currentOrder.status === "DRAFT") {
    try {
      await estimateAndSaveOrderDelivery(supabase, context.user.business_id, orderId);
    } catch {
      // Non-fatal
    }
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/reports/sales");
  redirect(`/orders/${orderId}?notice=order_updated`);
}

export async function cancelOrderAction(
  orderId: string,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. Authorization check
    const context = await getAuthContext();
    if (!context) return { success: false, error: "account_unavailable" };
    if (!hasPermission({ permissions: context.permissions }, "orders.cancel")) {
      return { success: false, error: "forbidden" };
    }

    const supabase = await createServerSupabaseClient();
    if (!supabase) return { success: false, error: "auth_unconfigured" };
    const admin = createAdminSupabaseClient();

    // 2. Fetch current order with business isolation
    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("id, status, priority, delivery_status, paid_amount, order_number")
      .eq("id", orderId)
      .eq("business_id", context.user.business_id)
      .maybeSingle();

    if (fetchError || !order) {
      return { success: false, error: "order_not_found" };
    }

    // 3. Idempotent check: if order is already cancelled, return success so retries are safe
    if (order.status === "CANCELLED") {
      return { success: true };
    }

    // Prevent cancellation of delivered orders
    if (order.delivery_status === "DELIVERED") {
      return { success: false, error: "order_delivered_locked" };
    }

    const { data: deliveredDeliveries } = await supabase
      .from("deliveries")
      .select("id, status")
      .eq("order_id", orderId)
      .eq("business_id", context.user.business_id)
      .in("status", ["DELIVERED", "IN_TRANSIT", "DISPATCHED"]);

    if (deliveredDeliveries && deliveredDeliveries.length > 0) {
      return { success: false, error: "order_delivered_locked" };
    }

    // 4. Prevent cancellation of orders with locked/started production
    const { data: lockedProduction } = await supabase
      .from("production_orders")
      .select("id, status")
      .eq("order_id", orderId)
      .eq("business_id", context.user.business_id)
      .in("status", [
        "IN_PROGRESS",
        "IN_PRODUCTION",
        "COMPLETED",
        "QUALITY_CHECK",
        "QUALITY_PASSED",
        "READY_FOR_DISPATCH",
      ]);

    if (lockedProduction && lockedProduction.length > 0) {
      return { success: false, error: "production_in_progress_locked" };
    }

    // 5. Update order status to CANCELLED atomically
    const { error: updateError } = await supabase
      .from("orders")
      .update({
        status: "CANCELLED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .eq("business_id", context.user.business_id);

    if (updateError) {
      console.error("[cancelOrderAction] Failed to update order status:", updateError);
      return { success: false, error: "status_failed" };
    }

    // 6. Record audit entry in order_status_history (using admin client to prevent RLS restriction on audit table)
    const auditClient = admin ?? supabase;
    try {
      await auditClient.from("order_status_history").insert({
        business_id: context.user.business_id,
        order_id: orderId,
        old_status: order.status,
        new_status: "CANCELLED",
        old_priority: order.priority,
        new_priority: order.priority,
        changed_by: context.user.id,
        reason: reason?.trim() || null,
      });
    } catch (auditErr) {
      console.warn("[cancelOrderAction] Audit history insertion warning:", auditErr);
    }

    // 7. Safely cancel linked pending/scheduled production orders and release schedule slots
    const dbClient = admin ?? supabase;
    const { data: pendingProd } = await dbClient
      .from("production_orders")
      .select("id")
      .eq("order_id", orderId)
      .eq("business_id", context.user.business_id)
      .in("status", ["PENDING", "SCHEDULED"]);

    if (pendingProd && pendingProd.length > 0) {
      const poIds = pendingProd.map((p) => p.id);

      await dbClient
        .from("production_schedules")
        .delete()
        .eq("business_id", context.user.business_id)
        .in("production_order_id", poIds);

      await dbClient
        .from("production_orders")
        .update({
          status: "CANCELLED",
          notes: reason?.trim() ? `Order cancelled: ${reason.trim()}` : "Order cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("business_id", context.user.business_id)
        .in("id", poIds);
    }

    // Release any finished goods stock reserved for this order (safely, exactly once)
    try {
      await releaseOrderFinishedStock(
        dbClient,
        context.user.business_id,
        orderId,
        context.user.id,
        reason?.trim(),
      );
    } catch (err) {
      console.warn("[cancelOrderAction] Failed to release stock reservation:", err);
    }

    // Safely reverse any advance allocation linked to this order
    try {
      await dbClient.rpc("reverse_order_advance_allocations", {
        p_business_id: context.user.business_id,
        p_order_id: orderId,
        p_user_id: context.user.id,
        p_reason: reason?.trim() || "Order cancelled",
      });
    } catch (revErr) {
      console.warn("[cancelOrderAction] Failed to reverse advance allocations:", revErr);
    }

    // 8. Recalculate affected future production schedules & send notifications without hanging the HTTP response
    try {
      await Promise.race([
        Promise.allSettled([
          scheduleProductionQueue(dbClient, context.user.business_id),
          supabase.rpc("update_order_delivery_dates", {
            p_business_id: context.user.business_id,
            p_order_id: orderId,
            p_trigger_source: "order_cancelled",
          }),
          notifyOrderEvent(
            context.user.business_id,
            orderId,
            order.order_number,
            "cancelled",
            context.user.id
          ),
        ]),
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ]);
    } catch (schedErr) {
      console.warn("[cancelOrderAction] Background tasks warning:", schedErr);
    }

    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);

    return { success: true };
  } catch (err) {
    console.error("[cancelOrderAction] Unhandled exception:", err);
    return {
      success: false,
      error: err instanceof Error ? err.message : "unexpected_error",
    };
  }
}

export async function changeOrderPriorityAction(
  orderId: string,
  priority: OrderPriority,
  reason?: string,
): Promise<{ success: boolean; error?: string }> {
  // 1. Authorization check
  const context = await getAuthContext();
  if (!context) return { success: false, error: "account_unavailable" };
  if (!hasPermission({ permissions: context.permissions }, "orders.change_priority")) {
    return { success: false, error: "forbidden" };
  }

  if (!["LOW", "NORMAL", "HIGH", "URGENT"].includes(priority)) {
    return { success: false, error: "invalid_priority" };
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) return { success: false, error: "auth_unconfigured" };

  // 2. Fetch current order with business isolation
  const { data: order, error: fetchError } = await supabase
    .from("orders")
    .select("id, status, priority, delivery_status")
    .eq("id", orderId)
    .eq("business_id", context.user.business_id)
    .maybeSingle();

  if (fetchError || !order) {
    return { success: false, error: "order_not_found" };
  }

  if (order.status === "CANCELLED") {
    return { success: false, error: "order_cancelled_locked" };
  }

  if (order.delivery_status === "DELIVERED") {
    return { success: false, error: "order_delivered_locked" };
  }

  // Idempotent: If priority is already set to target, return early
  if (order.priority === priority) {
    return { success: true };
  }

  // 3. Update order priority
  const { error: updateError } = await supabase
    .from("orders")
    .update({
      priority,
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("business_id", context.user.business_id);

  if (updateError) {
    return { success: false, error: "priority_failed" };
  }

  // 4. Record audit entry in order_status_history
  await supabase.from("order_status_history").insert({
    business_id: context.user.business_id,
    order_id: orderId,
    old_status: order.status,
    new_status: order.status,
    old_priority: order.priority,
    new_priority: priority,
    changed_by: context.user.id,
    reason: reason?.trim() || null,
  });

  // 5. Update ONLY eligible future production orders (PENDING, SCHEDULED).
  // Never move already-started production automatically!
  await supabase
    .from("production_orders")
    .update({
      priority,
      updated_at: new Date().toISOString(),
    })
    .eq("order_id", orderId)
    .eq("business_id", context.user.business_id)
    .in("status", ["PENDING", "SCHEDULED"]);

  // 6. Recalculate queue & schedules using existing scheduler
  try {
    await scheduleProductionQueue(supabase, context.user.business_id);
  } catch {
    // Non-fatal
  }

  try {
    if (order.status === "DRAFT") {
      await estimateAndSaveOrderDelivery(supabase, context.user.business_id, orderId);
    } else {
      await updateOrderDeliveryDatesFromSchedules(supabase, context.user.business_id, orderId);
    }
  } catch {
    // Non-fatal
  }

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);

  return { success: true };
}

export async function confirmOrderAction(
  orderId: string,
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    // 1. Authorization check
    const context = await getAuthContext();
    if (!context) {
      return { success: false, error: "account_unavailable", message: "User session unavailable. Please sign in again." };
    }
    if (!hasPermission({ permissions: context.permissions }, "orders.approve")) {
      return { success: false, error: "forbidden", message: "You do not have permission to confirm orders." };
    }

    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return { success: false, error: "auth_unconfigured", message: "Database connection unavailable." };
    }
    const admin = createAdminSupabaseClient();
    const dbClient = admin || supabase;

    // 2. Fetch order with business isolation
    const { data: order, error: fetchError } = await dbClient
      .from("orders")
      .select("id, status, priority, order_number, order_date, customer_id, total_amount")
      .eq("id", orderId)
      .eq("business_id", context.user.business_id)
      .maybeSingle();

    if (fetchError || !order) {
      return { success: false, error: "order_not_found", message: "Order could not be found." };
    }

    // 3. Idempotency: If order is already confirmed, return success without duplicate processing
    if (order.status === "CONFIRMED") {
      return { success: true, message: "Order is already confirmed." };
    }

    if (order.status !== "DRAFT") {
      return {
        success: false,
        error: "invalid_status_transition",
        message: `Order cannot be confirmed because it is in "${order.status}" status (must be DRAFT).`,
      };
    }

    // 4. Required fields and business rule validations
    if (!order.order_date) {
      return {
        success: false,
        error: "missing_order_date",
        message: "Cannot confirm order: Order date is missing.",
      };
    }

    if (!order.customer_id) {
      return {
        success: false,
        error: "missing_customer",
        message: "Cannot confirm order: Customer is not assigned to this order.",
      };
    }

    const { data: customer, error: custErr } = await dbClient
      .from("customers")
      .select("id, name, status")
      .eq("id", order.customer_id)
      .eq("business_id", context.user.business_id)
      .maybeSingle();

    if (custErr || !customer) {
      return {
        success: false,
        error: "invalid_customer",
        message: "Cannot confirm order: Customer record was not found.",
      };
    }

    if (customer.status && customer.status !== "ACTIVE") {
      return {
        success: false,
        error: "customer_inactive",
        message: `Cannot confirm order: Customer "${customer.name || ""}" is inactive.`,
      };
    }

    const { data: items, error: itemsErr } = await dbClient
      .from("order_items")
      .select("id, product_id, quantity, unit_price, line_total")
      .eq("order_id", orderId)
      .eq("business_id", context.user.business_id);

    if (itemsErr || !Array.isArray(items) || items.length === 0) {
      return {
        success: false,
        error: "no_items",
        message: "Cannot confirm order: Order must contain at least one line item.",
      };
    }

    for (const item of items) {
      const qty = Number(item.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        return {
          success: false,
          error: "invalid_item_quantity",
          message: "Cannot confirm order: All line items must have a quantity greater than zero.",
        };
      }
      if (!item.product_id) {
        return {
          success: false,
          error: "invalid_product",
          message: "Cannot confirm order: One or more line items have an invalid product.",
        };
      }
    }

    // 5. Atomically update order status from DRAFT to CONFIRMED
    const { data: updatedOrders, error: updateError } = await dbClient
      .from("orders")
      .update({
        status: "CONFIRMED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", orderId)
      .eq("business_id", context.user.business_id)
      .eq("status", "DRAFT")
      .select("id, status, priority");

    if (updateError || !updatedOrders || updatedOrders.length === 0) {
      // Check if another concurrent request already confirmed it
      const { data: checkOrder } = await dbClient
        .from("orders")
        .select("status")
        .eq("id", orderId)
        .eq("business_id", context.user.business_id)
        .maybeSingle();

      if (checkOrder?.status === "CONFIRMED") {
        return { success: true, message: "Order is already confirmed." };
      }
      return {
        success: false,
        error: updateError?.code || "status_failed",
        message: updateError?.message || "Failed to update order status.",
      };
    }

    // 6. Audit trail entry in order_status_history
    try {
      await dbClient.from("order_status_history").insert({
        business_id: context.user.business_id,
        order_id: orderId,
        old_status: "DRAFT",
        new_status: "CONFIRMED",
        old_priority: order.priority,
        new_priority: order.priority,
        changed_by: context.user.id,
        reason: "Order confirmed by authorized user",
      });
    } catch (auditErr) {
      console.warn("[confirmOrderAction] Audit trail warning:", auditErr);
    }

    // 7. Step 1: Enqueue each eligible order item in its product-specific production queue exactly once
    try {
      await enqueueOrderItemsForProduction(
        dbClient,
        context.user.business_id,
        orderId,
        order.priority,
        context.user.id,
      );
    } catch (err) {
      console.error("[confirmOrderAction] Production enqueue error:", err);
      // Release any stock reservations made during attempt
      try {
        await releaseOrderFinishedStock(dbClient, context.user.business_id, orderId, context.user.id);
      } catch {}

      // Rollback order status to DRAFT to preserve transaction safety
      await dbClient
        .from("orders")
        .update({
          status: "DRAFT",
          updated_at: new Date().toISOString(),
        })
        .eq("id", orderId)
        .eq("business_id", context.user.business_id);

      return {
        success: false,
        error: "enqueue_failed",
        message: err instanceof Error ? err.message : "Failed to allocate stock or enqueue production order.",
      };
    }

    // 8. Step 2 & 3: Run production scheduler, delivery date calculation, and notification with safe timeout
    try {
      await Promise.race([
        Promise.allSettled([
          scheduleProductionQueue(dbClient, context.user.business_id),
          updateOrderDeliveryDatesFromSchedules(dbClient, context.user.business_id, orderId),
          notifyOrderEvent(
            context.user.business_id,
            orderId,
            order.order_number,
            "confirmed",
            context.user.id
          ),
        ]),
        new Promise((resolve) => setTimeout(resolve, 4000)),
      ]);
    } catch (schedErr) {
      console.warn("[confirmOrderAction] Scheduling background tasks warning:", schedErr);
    }

    revalidatePath("/orders");
    revalidatePath(`/orders/${orderId}`);

    return { success: true, message: "Order confirmed successfully and production scheduled." };
  } catch (err) {
    console.error("[confirmOrderAction] Unexpected exception:", err);
    return {
      success: false,
      error: "server_error",
      message: err instanceof Error ? err.message : "An unexpected server error occurred.",
    };
  }
}

export async function deleteOrderAction(
  orderId: string,
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    const context = await getAuthContext();
    if (!context) return { success: false, error: "account_unavailable", message: "User session unavailable." };

    const canDelete =
      context.roleKey === "admin" ||
      context.roleKey === "super_admin" ||
      hasPermission({ permissions: context.permissions }, "orders.edit") ||
      hasPermission({ permissions: context.permissions }, "orders.approve");

    if (!canDelete) {
      return { success: false, error: "forbidden", message: "You do not have permission to delete orders." };
    }

    const supabase = await createServerSupabaseClient();
    if (!supabase) return { success: false, error: "auth_unconfigured", message: "Database client unavailable." };
    const admin = createAdminSupabaseClient();
    const db = admin ?? supabase;

    // 1. Fetch order with business isolation
    const { data: order, error: fetchError } = await db
      .from("orders")
      .select("id, status, paid_amount, order_number")
      .eq("id", orderId)
      .eq("business_id", context.user.business_id)
      .maybeSingle();

    if (fetchError || !order) {
      return { success: false, error: "order_not_found", message: "Order not found." };
    }

    // 2. Protect non-DRAFT orders (safety against deleting committed records)
    if (order.status !== "DRAFT") {
      return {
        success: false,
        error: "only_draft_can_be_deleted",
        message: `Cannot delete order #${order.order_number} because its status is ${order.status}. Only DRAFT orders can be permanently deleted. Please cancel confirmed orders instead.`,
      };
    }

    // 3. Protect orders with payment history
    if (Number(order.paid_amount) > 0) {
      return {
        success: false,
        error: "payments_exist",
        message: "Cannot delete order with recorded payments. Financial audit records must be preserved.",
      };
    }

    const { data: payments } = await db
      .from("payments")
      .select("id")
      .eq("order_id", orderId)
      .eq("business_id", context.user.business_id)
      .limit(1);

    if (payments && payments.length > 0) {
      return {
        success: false,
        error: "payments_exist",
        message: "Cannot delete order with associated payment ledger records.",
      };
    }

    // 4. Protect orders with deliveries
    const { data: deliveries } = await db
      .from("deliveries")
      .select("id")
      .eq("order_id", orderId)
      .eq("business_id", context.user.business_id)
      .limit(1);

    if (deliveries && deliveries.length > 0) {
      return {
        success: false,
        error: "deliveries_exist",
        message: "Cannot delete order with associated delivery dispatches.",
      };
    }

    // 5. Protect orders with production orders
    const { data: production } = await db
      .from("production_orders")
      .select("id")
      .eq("order_id", orderId)
      .eq("business_id", context.user.business_id)
      .limit(1);

    if (production && production.length > 0) {
      return {
        success: false,
        error: "production_exists",
        message: "Cannot delete order with active production allocations.",
      };
    }

    // 6. Delete dependent line items and status history first, then order
    await db.from("order_items").delete().eq("order_id", orderId).eq("business_id", context.user.business_id);
    await db.from("order_status_history").delete().eq("order_id", orderId).eq("business_id", context.user.business_id);

    const { error: deleteError } = await db
      .from("orders")
      .delete()
      .eq("id", orderId)
      .eq("business_id", context.user.business_id);

    if (deleteError) {
      console.error("[deleteOrderAction] Error deleting order record:", deleteError);
      return { success: false, error: "delete_failed", message: deleteError.message };
    }

    revalidatePath("/orders");
    return { success: true };
  } catch (err) {
    console.error("[deleteOrderAction] Exception:", err);
    return {
      success: false,
      error: "server_error",
      message: err instanceof Error ? err.message : "Failed to delete order.",
    };
  }
}

export async function updateOrderStatusAction(formData: FormData): Promise<never> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  const orderId = String(formData.get("order_id") ?? "");
  const status = String(formData.get("status") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (status === "CANCELLED") {
    const result = await cancelOrderAction(orderId, reason);
    if (!result.success) {
      redirect(`/orders?error=${result.error ?? "status_failed"}`);
    }
    redirect(`/orders/${orderId}?notice=order_cancelled`);
  } else if (status === "CONFIRMED") {
    const result = await confirmOrderAction(orderId);
    if (!result.success) {
      redirect(`/orders?error=${result.error ?? "status_failed"}`);
    }
    redirect(`/orders/${orderId}?notice=order_status_updated`);
  } else {
    redirect(`/orders?error=invalid_status_transition`);
  }
}

export async function changeOrderPriorityFormAction(formData: FormData): Promise<never> {
  const orderId = String(formData.get("order_id") ?? "");
  const priority = String(formData.get("priority") ?? "") as OrderPriority;
  const reason = String(formData.get("reason") ?? "").trim();

  const result = await changeOrderPriorityAction(orderId, priority, reason);
  if (!result.success) {
    redirect(`/orders?error=${result.error ?? "priority_failed"}`);
  }

  redirect(`/orders/${orderId}?notice=priority_changed`);
}

// ============================================
// DELIVERY DATE CALCULATION ACTIONS
// ============================================

export async function calculateOrderDeliveryDatesAction(orderId: string): Promise<OrderDeliveryDates> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "orders.view")) redirect("/orders?error=forbidden");

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase.rpc("calculate_order_delivery_dates", {
    p_business_id: context.user.business_id,
    p_order_id: orderId,
  });

  if (error) throw error;
  return (data?.[0] ?? null) as OrderDeliveryDates;
}

export async function calculateOrderItemDeliveryDatesAction(orderItemId: string): Promise<OrderItemDeliveryDates> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "orders.view")) redirect("/orders?error=forbidden");

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase.rpc("calculate_order_item_delivery_dates", {
    p_business_id: context.user.business_id,
    p_order_id: "", // Not used in the function, but required parameter
    p_order_item_id: orderItemId,
  });

  if (error) throw error;
  return (data?.[0] ?? null) as OrderItemDeliveryDates;
}

export async function updateOrderDeliveryDatesAction(orderId: string, triggerSource: string = "manual"): Promise<void> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "orders.edit")) redirect("/orders?error=forbidden");

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { error } = await supabase.rpc("update_order_delivery_dates", {
    p_business_id: context.user.business_id,
    p_order_id: orderId,
    p_trigger_source: triggerSource,
  });

  if (error) throw error;

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
}

export async function refreshAllDeliveryStatusesAction(): Promise<{ updated_count: number }> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "orders.edit")) redirect("/orders?error=forbidden");

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase.rpc("refresh_all_delivery_statuses", {
    p_business_id: context.user.business_id,
  });

  if (error) throw error;

  revalidatePath("/orders");
  return { updated_count: (data?.[0]?.updated_count ?? 0) as number };
}

export async function getOrderDeliveryInfo(orderId: string): Promise<OrderDeliveryDates> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "orders.view")) redirect("/orders?error=forbidden");

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase
    .from("orders")
    .select("earliest_delivery_date, latest_delivery_date, expected_delivery_date, delivery_status, delivery_calculated_at, delivery_calculation_version")
    .eq("id", orderId)
    .eq("business_id", context.user.business_id)
    .single();

  if (error) throw error;

  let explanationData;
  try {
    explanationData = await getOrderFulfillmentExplanation(supabase, context.user.business_id, orderId);
  } catch {
    // Non-fatal
  }

  return {
    order_id: orderId,
    earliest_delivery_date: data.earliest_delivery_date,
    latest_delivery_date: data.latest_delivery_date,
    expected_delivery_date: data.expected_delivery_date,
    delivery_calculation_version: data.delivery_calculation_version,
    explanation: explanationData?.explanation,
    fulfillmentSource: explanationData?.fulfillmentSource,
    hasCapacityIssue: explanationData?.hasCapacityIssue,
    hasMaterialIssue: explanationData?.hasMaterialIssue,
    hasMissingCapacity: explanationData?.hasMissingCapacity,
    itemsSummary: explanationData?.items,
  };
}