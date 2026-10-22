"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getAuthContext } from "@/lib/auth/context";
import { hasPermission } from "@/lib/permissions/authorization";
import { redirect } from "next/navigation";
import { enqueueOrderItemsForProduction, scheduleProductionQueue } from "@/lib/production/scheduler";
import {
  checkProductionMaterialAvailability as checkMaterialAvailability,
  startProductionWithInventory,
  completeProductionWithInventory,
} from "@/lib/production/inventory-integration";
import {
  notifyProductionEvent,
  notifyQualityCheckFailed,
  notifyMaterialShortage,
} from "@/lib/notifications/actions";
import type {
  ProductionOrderListItem,
  ProductionQueueItem,
  SchedulingResult,
  ProductionScheduleWithOrder,
  CalendarDay,
  BusinessCalendarFormValues,
  ProductionOrderStatus,
  ProductionOrderPriority,
  ProductionLog,
  QualityCheck,
  ProductionOutput,
  ProductionMaterialConsumption,
  MaterialAvailabilityCheck,
  StartProductionFormValues,
  RecordProgressFormValues,
  QualityCheckFormValues,
  CompleteProductionFormValues,
  DelayProductionFormValues,
  HoldProductionFormValues,
  CancelProductionFormValues,
  QualityCheckStage,
  QualityCheckStatus,
} from "@/types/production";

// ============================================
// CALENDAR FUNCTIONS
// ============================================

export async function getBusinessCalendar(
  startDate: string,
  endDate: string
): Promise<CalendarDay[]> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "production.view")) {
    throw new Error("Forbidden: production.view");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase
    .from("business_calendar")
    .select("*")
    .eq("business_id", context.user.business_id)
    .gte("calendar_date", startDate)
    .lte("calendar_date", endDate)
    .order("calendar_date");

  if (error) throw error;
  return (data ?? []) as CalendarDay[];
}

export async function upsertCalendarDay(
  values: BusinessCalendarFormValues
): Promise<CalendarDay> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "production.create")) {
    throw new Error("Forbidden: production.create");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase
    .from("business_calendar")
    .upsert(
      {
        business_id: context.user.business_id,
        calendar_date: values.calendar_date,
        is_working_day: values.is_working_day,
        note: values.note || null,
      },
      { onConflict: "business_id,calendar_date" }
    )
    .select()
    .single();

  if (error) throw error;

  // Recalculate affected future production schedules and dates
  try {
    await scheduleProductionQueue(supabase, context.user.business_id);
  } catch {
    // Non-fatal
  }

  return data as CalendarDay;
}

export async function bulkUpsertCalendarDays(
  values: BusinessCalendarFormValues[]
): Promise<CalendarDay[]> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "production.create")) {
    throw new Error("Forbidden: production.create");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase
    .from("business_calendar")
    .upsert(
      values.map((v) => ({
        business_id: context.user.business_id,
        calendar_date: v.calendar_date,
        is_working_day: v.is_working_day,
        note: v.note || null,
      })),
      { onConflict: "business_id,calendar_date" }
    )
    .select();

  if (error) throw error;

  // Recalculate affected future production schedules and dates
  try {
    await scheduleProductionQueue(supabase, context.user.business_id);
  } catch {
    // Non-fatal
  }

  return (data ?? []) as CalendarDay[];
}

// ============================================
// PRODUCTION ORDER FUNCTIONS
// ============================================

export async function getProductionQueue(): Promise<ProductionQueueItem[]> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "production.view")) {
    throw new Error("Forbidden: production.view");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  // Query production orders for confirmed orders with full details
  const { data, error } = await supabase
    .from("production_orders")
    .select(
      `
      id, business_id, order_id, order_item_id, product_id, quantity, status, priority,
      scheduled_start_date, scheduled_end_date, actual_start_date, actual_end_date, notes, created_at,
      orders!inner(id, order_number, order_date, priority, expected_delivery_date, status, customers!inner(name, company_name)),
      products!inner(id, name, sku, unit, daily_capacity, production_unit, production_min_days, production_max_days, setup_minutes)
    `
    )
    .eq("business_id", context.user.business_id)
    .neq("status", "CANCELLED")
    .eq("orders.status", "CONFIRMED");

  if (error || !data) {
    // Fallback to RPC if direct query encounters any error
    const { data: rpcData } = await supabase.rpc("get_production_queue", {
      p_business_id: context.user.business_id,
    });
    return (rpcData ?? []) as ProductionQueueItem[];
  }

  // Sort queue strictly by Priority first (URGENT > HIGH > NORMAL > LOW), then FIFO by created_at
  const priorityOrder: Record<string, number> = {
    URGENT: 1,
    HIGH: 2,
    NORMAL: 3,
    LOW: 4,
  };

  const sorted = [...data].sort((a: any, b: any) => {
    const pA = priorityOrder[a.priority] || 3;
    const pB = priorityOrder[b.priority] || 3;
    if (pA !== pB) return pA - pB;
    const tA = new Date(a.created_at).getTime();
    const tB = new Date(b.created_at).getTime();
    if (tA !== tB) return tA - tB;
    return a.id.localeCompare(b.id);
  });

  const todayStr = new Date().toISOString().split("T")[0];

  return sorted.map((po: any, index: number) => {
    const orderData = Array.isArray(po.orders) ? po.orders[0] : po.orders || {};
    const customerData = Array.isArray(orderData.customers) ? orderData.customers[0] : orderData.customers || {};
    const productData = Array.isArray(po.products) ? po.products[0] : po.products || {};

    const notesStr = po.notes || "";
    const isCapacityInsufficient =
      notesStr.toUpperCase().includes("CAPACITY_INSUFFICIENT") ||
      (Number(productData.daily_capacity) > 0 && Number(po.quantity) > Number(productData.daily_capacity));

    const isDelayed =
      po.status === "DELAYED" ||
      (po.scheduled_end_date &&
        po.scheduled_end_date < todayStr &&
        !["COMPLETED", "READY_FOR_DISPATCH", "CANCELLED"].includes(po.status));

    return {
      production_order_id: po.id,
      order_id: po.order_id,
      order_number: orderData.order_number || "UNKNOWN",
      customer_name: customerData.company_name || customerData.name || null,
      product_id: po.product_id,
      product_name: productData.name || "Product",
      product_sku: productData.sku || null,
      product_unit: productData.unit || "unit",
      quantity: Number(po.quantity),
      priority: po.priority as ProductionOrderPriority,
      status: po.status as ProductionOrderStatus,
      scheduled_start_date: po.scheduled_start_date || null,
      scheduled_end_date: po.scheduled_end_date || null,
      order_date: orderData.order_date || po.created_at,
      expected_delivery_date: orderData.expected_delivery_date || null,
      product_daily_capacity: Number(productData.daily_capacity) || 0,
      product_production_unit: productData.production_unit || "unit",
      product_production_min_days: Number(productData.production_min_days) || 1,
      product_production_max_days: Number(productData.production_max_days) || 1,
      product_setup_minutes: Number(productData.setup_minutes) || 0,
      fifo_position: index + 1,
      notes: po.notes || null,
      created_at: po.created_at,
      is_capacity_insufficient: isCapacityInsufficient,
      is_delayed: Boolean(isDelayed),
    };
  });
}

export async function getProductionOrders(
  status?: ProductionOrderStatus
): Promise<ProductionOrderListItem[]> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "production.view")) {
    throw new Error("Forbidden: production.view");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  let query = supabase
    .from("production_orders")
    .select(
      `
      id, business_id, order_id, order_item_id, product_id, quantity, status, priority,
      scheduled_start_date, scheduled_end_date, created_at,
      orders!inner(order_number, order_date, customers!inner(name, company_name)),
      products!inner(name, sku, unit, daily_capacity, production_unit, production_min_days, production_max_days, setup_minutes)
    `
    )
    .eq("business_id", context.user.business_id)
    .order("created_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query.limit(200);

  if (error) throw error;

  return (data ?? []).map((po) => {
    const orderData = po.orders?.[0] || {};
    const customerData = orderData.customers?.[0] || {};
    const productData = po.products?.[0] || {};

    return {
      id: po.id,
      business_id: po.business_id,
      order_id: po.order_id,
      order_number: orderData.order_number,
      customer_name: customerData.name ?? null,
      product_id: po.product_id,
      product_name: productData.name,
      product_sku: productData.sku,
      product_unit: productData.unit,
      quantity: po.quantity,
      status: po.status as ProductionOrderStatus,
      priority: po.priority as ProductionOrderPriority,
      scheduled_start_date: po.scheduled_start_date,
      scheduled_end_date: po.scheduled_end_date,
      created_at: po.created_at,
    };
  });
}

export async function createProductionOrdersFromOrder(
  orderId: string
): Promise<{ count: number; message: string }> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "production.create")) {
    throw new Error("Forbidden: production.create");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data: order } = await supabase
    .from("orders")
    .select("priority")
    .eq("id", orderId)
    .eq("business_id", context.user.business_id)
    .maybeSingle();

  const result = await enqueueOrderItemsForProduction(
    supabase,
    context.user.business_id,
    orderId,
    order?.priority || "NORMAL",
  );

  return {
    count: result.count,
    message: `Created ${result.count} production orders for ${result.orderNumber}`,
  };
}

export async function cancelProductionOrder(
  productionOrderId: string,
  reason: string
): Promise<void> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "production.cancel")) {
    throw new Error("Forbidden: production.cancel");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { error } = await supabase.rpc("cancel_production_order", {
    p_production_order_id: productionOrderId,
    p_business_id: context.user.business_id,
    p_reason: reason,
  });

  if (error) throw error;

  // Recalculate affected future production schedules and dates
  try {
    await scheduleProductionQueue(supabase, context.user.business_id);
  } catch {
    // Non-fatal
  }
}

export async function updateProductionOrderStatus(
  productionOrderId: string,
  status: ProductionOrderStatus,
  reason?: string
): Promise<void> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "production.edit")) {
    throw new Error("Forbidden: production.edit");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { error } = await supabase.rpc("update_production_order_status", {
    p_business_id: context.user.business_id,
    p_production_order_id: productionOrderId,
    p_status: status,
    p_reason: reason || null,
  });

  if (error) throw error;

  try {
    await scheduleProductionQueue(supabase, context.user.business_id);
  } catch {
    // Non-fatal
  }
}

// ============================================
// SCHEDULING ENGINE
// ============================================

export async function runSchedulingEngine(
  startDate?: string,
  endDate?: string
): Promise<SchedulingResult[]> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "production.schedule")) {
    throw new Error("Forbidden: production.schedule");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const summary = await scheduleProductionQueue(supabase, context.user.business_id, startDate);

  return summary.outcomes.map((o) => ({
    production_order_id: o.production_order_id,
    scheduled_start_date: o.scheduled_start_date,
    scheduled_end_date: o.scheduled_end_date,
    schedules: [],
    success: o.success,
    message: o.message,
  }));
}

export async function getProductionSchedule(
  startDate: string,
  endDate: string
): Promise<ProductionScheduleWithOrder[]> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "production.view")) {
    throw new Error("Forbidden: production.view");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data: schedules, error: scheduleError } = await supabase
    .from("production_schedules")
    .select("id, business_id, production_order_id, schedule_date, allocated_quantity, sequence_number, created_at")
    .eq("business_id", context.user.business_id)
    .gte("schedule_date", startDate)
    .lte("schedule_date", endDate)
    .order("schedule_date")
    .order("sequence_number");

  if (scheduleError || !schedules || schedules.length === 0) {
    return [];
  }

  const poIds = [...new Set(schedules.map((s) => s.production_order_id).filter(Boolean))];
  if (poIds.length === 0) return [];

  const { data: pos } = await supabase
    .from("production_orders")
    .select("id, business_id, order_id, product_id, quantity, status, priority, scheduled_start_date, scheduled_end_date, created_at")
    .in("id", poIds);

  const poMap = new Map((pos ?? []).map((p) => [p.id, p]));
  const orderIds = [...new Set((pos ?? []).map((p) => p.order_id).filter(Boolean))];
  const productIds = [...new Set((pos ?? []).map((p) => p.product_id).filter(Boolean))];

  const [{ data: orders }, { data: products }] = await Promise.all([
    orderIds.length > 0
      ? supabase.from("orders").select("id, order_number, customers(name)").in("id", orderIds)
      : { data: [] },
    productIds.length > 0
      ? supabase.from("products").select("id, name, sku, unit").in("id", productIds)
      : { data: [] },
  ]);

  const orderMap = new Map((orders ?? []).map((o: any) => [o.id, o]));
  const productMap = new Map((products ?? []).map((p: any) => [p.id, p]));

  return schedules.map((ps) => {
    const po: any = poMap.get(ps.production_order_id) || {};
    const orderData: any = po.order_id ? orderMap.get(po.order_id) : {};
    const customerData: any = orderData?.customers || {};
    const customerName = Array.isArray(customerData) ? customerData[0]?.name : customerData?.name;
    const productData: any = po.product_id ? productMap.get(po.product_id) : {};

    return {
      id: ps.id,
      business_id: ps.business_id,
      production_order_id: ps.production_order_id,
      schedule_date: ps.schedule_date,
      allocated_quantity: ps.allocated_quantity,
      sequence_number: ps.sequence_number,
      created_at: ps.created_at,
      production_order: {
        id: po.id,
        business_id: po.business_id,
        order_id: po.order_id,
        order_number: orderData?.order_number || null,
        customer_name: customerName ?? null,
        product_id: po.product_id,
        product_name: productData?.name || "Product",
        product_sku: productData?.sku || "",
        product_unit: productData?.unit || "Unit",
        quantity: po.quantity || 0,
        status: (po.status || "PENDING") as ProductionOrderStatus,
        priority: (po.priority || "NORMAL") as ProductionOrderPriority,
        scheduled_start_date: po.scheduled_start_date || null,
        scheduled_end_date: po.scheduled_end_date || null,
        created_at: po.created_at || ps.created_at,
      },
    };
  });
}

export async function getCapacityUtilization(
  startDate: string,
  endDate: string
): Promise<
  Array<{
    date: string;
    available_capacity: number;
    used_capacity: number;
    total_capacity: number;
    is_working_day: boolean;
  }>
> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "production.view")) {
    throw new Error("Forbidden: production.view");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase.rpc("get_capacity_utilization", {
    p_business_id: context.user.business_id,
    p_start_date: startDate,
    p_end_date: endDate,
  });

  if (error) throw error;
  return (data ?? []) as Array<{
    date: string;
    available_capacity: number;
    used_capacity: number;
    total_capacity: number;
    is_working_day: boolean;
  }>;
}

// ============================================
// PRODUCTION TRACKING - MATERIAL AVAILABILITY
// ============================================

export async function checkProductionMaterialAvailability(
  productionOrderId: string
): Promise<MaterialAvailabilityCheck[]> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "production.view")) {
    throw new Error("Forbidden: production.view");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  return await checkMaterialAvailability(supabase, context.user.business_id, productionOrderId);
}

// ============================================
// PRODUCTION TRACKING - STATUS WORKFLOW
// ============================================

export async function startProduction(
  values: StartProductionFormValues
): Promise<{ success: boolean; message: string | null; shortages?: MaterialAvailabilityCheck[] }> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "production.start")) {
    throw new Error("Forbidden: production.start");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const result = await startProductionWithInventory(
    supabase,
    context.user.business_id,
    context.user.id,
    values
  );

  if (result.success) {
    try {
      const { data: po } = await supabase
        .from("production_orders")
        .select("order_id")
        .eq("id", values.production_order_id)
        .eq("business_id", context.user.business_id)
        .maybeSingle();

      if (po?.order_id) {
        await notifyProductionEvent(
          context.user.business_id,
          values.production_order_id,
          po.order_id,
          "started",
          context.user.id
        );
      }
    } catch {
      // Non-fatal
    }
  } else if (result.shortages && result.shortages.length > 0) {
    try {
      const { data: po } = await supabase
        .from("production_orders")
        .select("order_id")
        .eq("id", values.production_order_id)
        .eq("business_id", context.user.business_id)
        .maybeSingle();

      if (po?.order_id) {
        await notifyMaterialShortage(
          context.user.business_id,
          values.production_order_id,
          po.order_id,
          result.shortages.map(
            (s) => `${s.name}: need ${s.required_quantity}, available ${s.available_stock}`
          )
        );
      }
    } catch {
      // Non-fatal
    }
  }

  return result;
}

export async function recordProductionProgress(
  values: RecordProgressFormValues
): Promise<{ success: boolean; message: string | null }> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "production.edit")) {
    throw new Error("Forbidden: production.edit");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase.rpc("record_production_progress", {
    p_production_order_id: values.production_order_id,
    p_business_id: context.user.business_id,
    p_user_id: context.user.id,
    p_quantity_completed: values.quantity_completed,
    p_notes: values.notes || null,
  });

  if (error) throw error;
  return data as { success: boolean; message: string | null };
}

export async function recordQualityCheck(
  values: QualityCheckFormValues
): Promise<{ success: boolean; message: string | null }> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "production.quality_check")) {
    throw new Error("Forbidden: production.quality_check");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase.rpc("record_quality_check", {
    p_production_order_id: values.production_order_id,
    p_business_id: context.user.business_id,
    p_user_id: context.user.id,
    p_check_stage: values.check_stage,
    p_status: values.status,
    p_notes: values.notes || null,
  });

  if (error) throw error;
  const res = data as { success: boolean; message: string | null };

  if (res.success && values.status === "FAILED") {
    try {
      const { data: po } = await supabase
        .from("production_orders")
        .select("order_id")
        .eq("id", values.production_order_id)
        .eq("business_id", context.user.business_id)
        .maybeSingle();

      if (po?.order_id) {
        await notifyQualityCheckFailed(
          context.user.business_id,
          values.production_order_id,
          po.order_id,
          values.notes || null,
          context.user.id
        );
      }
    } catch {
      // Non-fatal
    }
  }

  return res;
}

export async function completeProduction(
  values: CompleteProductionFormValues
): Promise<{ success: boolean; message: string | null }> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "production.complete")) {
    throw new Error("Forbidden: production.complete");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const result = await completeProductionWithInventory(
    supabase,
    context.user.business_id,
    context.user.id,
    values
  );

  if (result.success) {
    try {
      const { data: po } = await supabase
        .from("production_orders")
        .select("order_id")
        .eq("id", values.production_order_id)
        .eq("business_id", context.user.business_id)
        .maybeSingle();

      if (po?.order_id) {
        await notifyProductionEvent(
          context.user.business_id,
          values.production_order_id,
          po.order_id,
          "completed",
          context.user.id
        );
      }
    } catch {
      // Non-fatal
    }

    try {
      await scheduleProductionQueue(supabase, context.user.business_id);
    } catch {
      // Non-fatal
    }
  }

  return result;
}

export async function delayProduction(
  values: DelayProductionFormValues
): Promise<{ success: boolean; message: string | null }> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "production.edit")) {
    throw new Error("Forbidden: production.edit");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase.rpc("delay_production", {
    p_production_order_id: values.production_order_id,
    p_business_id: context.user.business_id,
    p_user_id: context.user.id,
    p_new_start_date: values.new_start_date,
    p_reason: values.reason,
  });

  if (error) throw error;
  const res = data as { success: boolean; message: string | null };

  if (res.success) {
    try {
      const { data: po } = await supabase
        .from("production_orders")
        .select("order_id")
        .eq("id", values.production_order_id)
        .eq("business_id", context.user.business_id)
        .maybeSingle();

      if (po?.order_id) {
        await notifyProductionEvent(
          context.user.business_id,
          values.production_order_id,
          po.order_id,
          "delayed",
          context.user.id
        );
      }
    } catch {
      // Non-fatal
    }
  }

  return res;
}

export async function holdProduction(
  values: HoldProductionFormValues
): Promise<{ success: boolean; message: string | null }> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "production.edit")) {
    throw new Error("Forbidden: production.edit");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase.rpc("hold_production", {
    p_production_order_id: values.production_order_id,
    p_business_id: context.user.business_id,
    p_user_id: context.user.id,
    p_reason: values.reason,
  });

  if (error) throw error;
  return data as { success: boolean; message: string | null };
}

export async function resumeProduction(
  productionOrderId: string,
  reason?: string
): Promise<{ success: boolean; message: string | null }> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "production.edit")) {
    throw new Error("Forbidden: production.edit");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase.rpc("resume_production", {
    p_production_order_id: productionOrderId,
    p_business_id: context.user.business_id,
    p_user_id: context.user.id,
    p_reason: reason || null,
  });

  if (error) throw error;
  return data as { success: boolean; message: string | null };
}

export async function cancelProductionWithRelease(
  values: CancelProductionFormValues
): Promise<{ success: boolean; message: string | null }> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "production.cancel")) {
    throw new Error("Forbidden: production.cancel");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase.rpc("cancel_production_with_release", {
    p_production_order_id: values.production_order_id,
    p_business_id: context.user.business_id,
    p_user_id: context.user.id,
    p_reason: values.reason,
  });

  if (error) throw error;

  try {
    await scheduleProductionQueue(supabase, context.user.business_id);
  } catch {
    // Non-fatal
  }

  return data as { success: boolean; message: string | null };
}

export async function markReadyForDispatch(
  productionOrderId: string
): Promise<{ success: boolean; message: string | null }> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "production.dispatch")) {
    throw new Error("Forbidden: production.dispatch");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase.rpc("mark_ready_for_dispatch", {
    p_production_order_id: productionOrderId,
    p_business_id: context.user.business_id,
    p_user_id: context.user.id,
  });

  if (error) throw error;

  try {
    await scheduleProductionQueue(supabase, context.user.business_id);
  } catch {
    // Non-fatal
  }

  return data as { success: boolean; message: string | null };
}

// ============================================
// PRODUCTION TRACKING - LOGS & HISTORY
// ============================================

export async function getProductionLogs(
  productionOrderId: string
): Promise<ProductionLog[]> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "production.view")) {
    throw new Error("Forbidden: production.view");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase
    .from("production_logs")
    .select("*")
    .eq("business_id", context.user.business_id)
    .eq("production_order_id", productionOrderId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ProductionLog[];
}

export async function getQualityChecks(
  productionOrderId: string
): Promise<QualityCheck[]> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "production.view")) {
    throw new Error("Forbidden: production.view");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase
    .from("production_quality_checks")
    .select("*")
    .eq("business_id", context.user.business_id)
    .eq("production_order_id", productionOrderId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as QualityCheck[];
}

export async function getProductionOutput(
  productionOrderId: string
): Promise<ProductionOutput[]> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "production.view")) {
    throw new Error("Forbidden: production.view");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase
    .from("production_outputs")
    .select("*")
    .eq("business_id", context.user.business_id)
    .eq("production_order_id", productionOrderId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ProductionOutput[];
}

export async function getMaterialConsumption(
  productionOrderId: string
): Promise<ProductionMaterialConsumption[]> {
  const context = await getAuthContext();
  if (!context) redirect("/login?error=account_unavailable");
  if (!hasPermission({ permissions: context.permissions }, "production.view")) {
    throw new Error("Forbidden: production.view");
  }

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase client not available");

  const { data, error } = await supabase
    .from("production_material_consumption")
    .select("*")
    .eq("business_id", context.user.business_id)
    .eq("production_order_id", productionOrderId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ProductionMaterialConsumption[];
}